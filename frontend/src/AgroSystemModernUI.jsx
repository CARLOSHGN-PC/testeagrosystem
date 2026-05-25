import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Leaf } from "lucide-react";
import { palette } from "./constants/theme";

// Autenticação e Lógica
import { useAuth } from "./hooks/useAuth";
import { runAuthBootstrap } from "./services/bootstrapService";

// Telas principais
import LoginScreen from "./components/auth/LoginScreen";
import PostLoginScreen from "./components/layout/PostLoginScreen";
import { ConfigProvider } from "./contexts/ConfigContext";

/**
 * AgroSystemModernUI.jsx
 *
 * O que este bloco faz:
 * É o componente Raiz (Root) da aplicação. Decide qual é a tela principal
 * baseada estritamente no estado de autenticação retornado pelo PostgreSQL.
 *
 * Por que ele existe:
 * Na refatoração arquitetural, esse arquivo foi limpado. Ele era um "God Object" que
 * possuía Modais, Mapa, Forms, CSS Flutuante e Listeners. Agora atua apenas como
 * orquestrador global de Rotas (Auth vs. Logged In).
 *
 * O que entra e o que sai:
 * @returns {JSX.Element} O wrapper de contexto da Animação contendo a tela pertinente.
 */
export default function AgroSystemModernUI() {
  // Inicializamos o listener do Auth PostgreSQL/JWT de maneira isolada num Custom Hook.
  const { logged, isInitializing, handleLogout, forceLoginState, session } = useAuth();

  const currentCompanyId = session?.user?.companyId || null;

  // useEffect deve ser declarado sempre antes de qualquer return (regra de Hooks do React)
  React.useEffect(() => {
    if (logged && currentCompanyId && !isInitializing) {
       // Run background bootstrap silently
       runAuthBootstrap(currentCompanyId).catch(e => console.error("Auth bootstrap failed:", e));
    }
  }, [logged, currentCompanyId, isInitializing]);

  // Exibição do "Splash Screen" animado enquanto aguardamos o resolvedor de sessão
  // do PostgreSQL garantir se existe um token salvo na memória do navegador.
  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: palette.bg, color: palette.gold }}>
        <div className="animate-pulse flex flex-col items-center gap-4">
          <Leaf className="w-12 h-12" />
          <div className="text-xl font-semibold">AgroSystem</div>
        </div>
      </div>
    );
  }

  // Com a inicialização pronta, usamos o AnimatePresence para fazer a transição Crossfade
  // entre o Login e o Dashboard (PostLoginScreen) sem hard refresh.
  return (
    <AnimatePresence mode="wait">
      {logged ? (
        <motion.div key="success" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <ConfigProvider currentCompanyId={currentCompanyId}>
            <PostLoginScreen onLogout={handleLogout} session={session} />
          </ConfigProvider>
        </motion.div>
      ) : (
        <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <ConfigProvider currentCompanyId={currentCompanyId}>
            <LoginScreen onLoginSuccess={forceLoginState} />
          </ConfigProvider>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
