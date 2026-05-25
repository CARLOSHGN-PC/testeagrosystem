import React, { useState } from "react";
import { motion } from "framer-motion";
import { Leaf, ShieldCheck, BarChart3, CloudSun, User, Lock, ChevronRight } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { loginWithPostgres } from "../../services/postgresAuthService";
import { getOfflineAuth, restoreOfflineSession } from "../../services/sessionService";
import { showError } from "../../utils/alert";
import { palette } from "../../constants/theme";
import PremiumBadge from "../ui/PremiumBadge";
import GlowOrb from "../layout/GlowOrb";
import AnimatedBackground from "../layout/AnimatedBackground";
import { useCompanyConfig } from "../../contexts/ConfigContext";

/**
 * LoginScreen.jsx
 *
 * O que este bloco faz:
 * A primeira tela do sistema. Manipula o input de credenciais e chama
 * a API do PostgreSQL/JWT para autenticar o usuário.
 *
 * Por que ele existe:
 * Separar as telas em componentes lógicos. O `AgroSystemModernUI` apenas decide
 * renderizar esta tela ou a "PostLoginScreen". Aqui ficam todos os states de e-mail e loading de login.
 *
 * O que entra e o que sai:
 * @returns {JSX.Element} A interface gráfica inteira do login com animações Framer Motion.
 */
// Helper de hash real e seguro para armazenar a senha offline sem expô-la em texto claro.
// Utiliza a Web Crypto API nativa do navegador (SHA-256).
const hashPassword = async (password) => {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export default function LoginScreen({ onLoginSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const { logoColor } = useCompanyConfig();

  const handlePostgreSQLLogin = async () => {
    if (!email || !password) {
      showError("Atenção", "Preencha o e-mail e a senha para entrar.");
      return;
    }

    setIsLoading(true);

    const tryOfflineLogin = async () => {
      const cached = getOfflineAuth();
      if (!cached) return false;

      const cachedEmail = String(cached.e || cached.email || cached.sessionSnapshot?.user?.email || '').toLowerCase();
      const inputEmail = email.trim().toLowerCase();
      if (!cachedEmail || cachedEmail !== inputEmail) return false;

      const inputHash = await hashPassword(password);
      if (cached.hash && cached.hash !== inputHash) return false;
      if (!cached.hash && !cached.sessionSnapshot?.user) return false;

      const restored = restoreOfflineSession(cached);
      if (!restored?.user) return false;
      await onLoginSuccess();
      return true;
    };

    // MODO OFFLINE: entra somente se este dispositivo já tiver uma sessão válida salva.
    if (!navigator.onLine) {
      try {
        const ok = await tryOfflineLogin();
        if (ok) return;
      } catch (offlineError) {
        showError('Sessão offline inválida', offlineError.message || 'Não foi possível restaurar a sessão offline.');
        setIsLoading(false);
        return;
      }

      showError("Acesso Negado", "Modo offline: e-mail ou senha incorretos, ou você nunca logou neste dispositivo antes.");
      setIsLoading(false);
      return;
    }

    // MODO ONLINE - autenticação 100% PostgreSQL/JWT.
    try {
      await loginWithPostgres(email.trim(), password);

      const hashedPw = await hashPassword(password);
      const previousAuth = JSON.parse(localStorage.getItem('@AgroSystem:auth') || '{}');
      const payload = JSON.stringify({
        ...previousAuth,
        e: email.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        hash: hashedPw,
        source: 'postgres',
        updatedAt: new Date().toISOString(),
      });
      localStorage.setItem('@AgroSystem:auth', payload);

      await onLoginSuccess();
    } catch (error) {
      console.error(error);

      // Se a máquina está "online" mas sem acesso real ao backend, usa o perfil offline.
      // Isso evita negar acesso no campo quando o Windows/navegador ainda reporta online.
      if (!error?.status) {
        try {
          const ok = await tryOfflineLogin();
          if (ok) return;
        } catch {}
      }

      if (error.status === 401) {
        showError("Acesso Negado", "E-mail ou senha incorretos.");
      } else if (error.status === 403) {
        showError("Acesso Bloqueado", error.message || "Usuário ou empresa inativa.");
      } else {
        showError("Erro no Login", error.message || "Não foi possível conectar ao PostgreSQL.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{
        backgroundImage: "url('./assets/login-bg.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        color: palette.white,
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(135deg, rgba(3,3,3,0.92) 0%, rgba(6,6,6,0.88) 34%, rgba(10,18,28,0.82) 100%)",
        }}
      />

      <AnimatedBackground />
      <GlowOrb className="top-[-60px] right-[-60px]" colorType="theme" size={240} delay={0.2} />
      <GlowOrb className="bottom-[8%] left-[-60px]" colorType="theme" size={320} delay={0.8} />
      <GlowOrb className="top-[28%] left-[36%] bg-slate-400/20" size={220} delay={1.4} />

      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "42px 42px",
          maskImage: "radial-gradient(circle at center, black 42%, transparent 88%)",
        }}
      />

      <div className="relative z-20 min-h-screen grid lg:grid-cols-2">
        <div className="hidden lg:flex flex-col justify-between p-10 xl:p-14 border-r" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="flex items-center gap-3"
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl"
                style={{
                  background: logoColor || palette.gold,
                  color: palette.white,
                }}
              >
                <Leaf className="w-7 h-7" />
              </div>
              <div>
                <div className="text-2xl font-semibold tracking-wide">AgroSystem - Usina Caçu</div>
                <div className="text-sm" style={{ color: palette.text2 }}>
                  Gestão agrícola com experiência premium
                </div>
              </div>
            </motion.div>
          </div>

          <div className="max-w-xl space-y-6">
            <PremiumBadge>Experiência Completa</PremiumBadge>
            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.15 }}
              className="text-5xl xl:text-6xl font-semibold leading-tight"
            >
              Gestão completa com inteligência operacional para máxima eficiência e controle.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.3 }}
              className="text-lg leading-8"
              style={{ color: palette.text2 }}
            >
              Uma interface moderna, com foco em velocidade, clareza de dados, sincronização e produtividade no uso diário.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.45 }}
              className="grid sm:grid-cols-3 gap-4 pt-4"
            >
              {[
                { icon: ShieldCheck, title: "Acesso seguro", desc: "Camada premium" },
                { icon: CloudSun, title: "Ambiente inteligente", desc: "Visual dinâmico" },
                { icon: BarChart3, title: "Dados vivos", desc: "Experiência moderna" },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl p-4 backdrop-blur-md border shadow-xl"
                  style={{
                    background: "rgba(16,18,22,0.52)",
                    borderColor: "rgba(255,255,255,0.08)",
                  }}
                >
                  <item.icon className="w-5 h-5 mb-3" style={{ color: logoColor || palette.gold }} />
                  <div className="font-medium">{item.title}</div>
                  <div className="text-sm mt-1" style={{ color: palette.text2 }}>{item.desc}</div>
                </div>
              ))}
            </motion.div>
          </div>

          <div className="text-sm" style={{ color: "rgba(176,190,197,0.75)" }}>
            UI premium • motion design • login animado
          </div>
        </div>

        <div className="flex items-center justify-center p-4 sm:p-10 w-full min-h-screen lg:min-h-0">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.75 }}
            className="w-full max-w-md rounded-[24px] sm:rounded-[28px] border backdrop-blur-2xl shadow-2xl overflow-hidden relative z-20"
            style={{
              background: "linear-gradient(180deg, rgba(22,24,28,0.78), rgba(18,20,24,0.66))",
              borderColor: "rgba(230,199,107,0.18)",
              boxShadow: "0 20px 80px rgba(0,0,0,0.55)",
            }}
          >
            <div className="p-7 sm:p-8 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
              <div className="flex items-center justify-between mb-6">
                <PremiumBadge>Login</PremiumBadge>
                <Badge className="rounded-full border px-3 py-1" style={{ background: "rgba(27,38,59,0.75)", borderColor: "rgba(255,255,255,0.08)", color: palette.white }}>
                  vNext
                </Badge>
              </div>
              <h2 className="text-3xl font-semibold">Entrar na plataforma</h2>
              <p className="mt-2 text-sm" style={{ color: palette.text2 }}>
                Acesse o ambiente operacional com uma interface fluida, elegante e pronta para uso.
              </p>
            </div>

            <div className="p-7 sm:p-8 space-y-5">
              <div className="space-y-2">
                <label className="text-sm" style={{ color: palette.text2 }}>E-mail</label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2" style={{ color: logoColor || palette.gold }} />
                  <Input type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-11 h-12 rounded-2xl border-0"
                    style={{ background: "rgba(255,255,255,0.06)", color: palette.white }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm" style={{ color: palette.text2 }}>Senha</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2" style={{ color: logoColor || palette.gold }} />
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-11 h-12 rounded-2xl border-0"
                    style={{ background: "rgba(255,255,255,0.06)", color: palette.white }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <button
                  onClick={() => setRemember(!remember)}
                  className="flex items-center gap-2 transition-opacity hover:opacity-90"
                  style={{ color: palette.text2 }}
                >
                  <span className="w-4 h-4 rounded border flex items-center justify-center" style={{ borderColor: remember ? (logoColor || palette.gold) : "rgba(255,255,255,0.2)", background: remember ? `${logoColor}26` : "transparent" }}>
                    {remember ? <div className="w-2 h-2 rounded-full" style={{ background: logoColor || palette.gold }} /> : null}
                  </span>
                  Manter conectado
                </button>
                <button className="hover:underline" style={{ color: logoColor || palette.goldLight }}>
                  Esqueci a senha
                </button>
              </div>

              <Button
                onClick={handlePostgreSQLLogin}
                disabled={isLoading}
                className="w-full h-12 rounded-2xl text-base font-medium transition-all hover:scale-[1.01] disabled:opacity-70 disabled:hover:scale-100"
                style={{ background: logoColor || palette.gold, color: palette.white }}
              >
                {isLoading ? "Conectando..." : (
                  <>
                    Entrar agora
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>

              <div className="grid grid-cols-3 gap-3 pt-2">
                {[
                  { icon: Leaf, label: "Campo" },
                  { icon: CloudSun, label: "Clima" },
                  { icon: ShieldCheck, label: "Seguro" },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl p-3 text-center border"
                    style={{ background: "rgba(16,18,22,0.52)", borderColor: "rgba(255,255,255,0.08)" }}
                  >
                    <item.icon className="w-4 h-4 mx-auto mb-2" style={{ color: logoColor || palette.gold }} />
                    <span className="text-xs" style={{ color: palette.text2 }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
