import React from "react";
import { createPortal } from "react-dom";
import { Leaf, Menu, Bell, User, CloudOff, CloudUpload, CheckCircle2, Building2, Settings, Lock, LogOut } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useLiveQuery } from "dexie-react-hooks";
import { palette } from "../../constants/theme";
import db from "../../services/localDb";
import { showSuccess } from "../../utils/alert";
import { markAllAsRead, clearAllNotifications } from "../../services/notificationService";
import { useCompanyConfig } from "../../contexts/ConfigContext";
import { changePasswordService } from "../../services/changePasswordService";

/**
 * TopNavbar.jsx
 *
 * O que este bloco faz:
 * O cabeçalho fixo superior. Mostra o logo, o botão de abrir o menu lateral e
 * os menus suspensos de Notificação e Perfil.
 *
 * Por que ele existe:
 * Separar a renderização da Toolbar superior evita sujar o componente
 * principal e torna as lógicas de dropdown e z-indexes mais fáceis de prever.
 *
 * @param {Function} setMenuOpen - Função que alterna a barra lateral (Sidebar).
 * @param {boolean} notificationsOpen - Controle do estado do popover de notificação.
 * @param {Function} setNotificationsOpen - Setter de notificação.
 * @param {boolean} profileOpen - Controle de estado do popover de perfil.
 * @param {Function} setProfileOpen - Setter do perfil.
 * @param {Array} notifications - Lista mock de notificações.
 * @param {Function} onLogout - Callback executado no click de Sair do perfil.
 */
export default function TopNavbar({
  setMenuOpen,
  notificationsOpen,
  setNotificationsOpen,
  profileOpen,
  setProfileOpen,
  session,
  onLogout
}) {
  const [isOffline, setIsOffline] = React.useState(!navigator.onLine);
  const [pendingCount, setPendingCount] = React.useState(0);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = React.useState(false);
  const [passwordForm, setPasswordForm] = React.useState({
    senhaAtual: '',
    novaSenha: '',
    confirmarNovaSenha: ''
  });
  const [passwordError, setPasswordError] = React.useState('');
  const [isSubmittingPassword, setIsSubmittingPassword] = React.useState(false);
  const { logoColor } = useCompanyConfig();
  const currentUserName = session?.user?.nome || 'Usuário';
  const currentRole = session?.user?.role || 'Usuário';
  const currentCompanyName = session?.company?.name || session?.user?.companyName || session?.user?.companyId || 'Empresa não informada';
  const appVersion = typeof __APP_BUILD_VERSION__ !== 'undefined' ? __APP_BUILD_VERSION__ : 'dev';
  const roleLabel = String(currentRole).replaceAll('_', ' ');

  const validatePasswordForm = React.useCallback(() => {
    if (!passwordForm.senhaAtual || !passwordForm.novaSenha || !passwordForm.confirmarNovaSenha) {
      return 'Preencha todos os campos.';
    }

    if (passwordForm.novaSenha.length < 6) {
      return 'A nova senha deve conter no mínimo 6 caracteres.';
    }

    if (passwordForm.novaSenha !== passwordForm.confirmarNovaSenha) {
      return 'A confirmação da nova senha não confere.';
    }

    return '';
  }, [passwordForm]);

  const closeChangePasswordModal = React.useCallback(() => {
    setIsChangePasswordOpen(false);
    setPasswordError('');
    setPasswordForm({ senhaAtual: '', novaSenha: '', confirmarNovaSenha: '' });
  }, []);

  const handleChangePassword = React.useCallback(async () => {
    const validationError = validatePasswordForm();
    if (validationError) {
      setPasswordError(validationError);
      return;
    }

    setIsSubmittingPassword(true);
    setPasswordError('');

    try {
      await changePasswordService({
        senhaAtual: passwordForm.senhaAtual,
        novaSenha: passwordForm.novaSenha
      });
      closeChangePasswordModal();
      showSuccess('Senha atualizada', 'Sua senha foi alterada com sucesso.');
    } catch (error) {
      setPasswordError(error.message || 'Não foi possível alterar a senha.');
    } finally {
      setIsSubmittingPassword(false);
    }
  }, [passwordForm, validatePasswordForm, closeChangePasswordModal]);

  // Monitora o estado da conexão e exibe toast de conclusão quando houver sync finalizado
  React.useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    const handleSyncCompleted = (e) => {
      setIsSyncing(false);
      if (e.detail && e.detail.count > 0) {
        showSuccess(
          "Sincronização Concluída",
          `${e.detail.count} estimativa(s) enviada(s) para a nuvem com sucesso!`
        );
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('sync-completed', handleSyncCompleted);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('sync-completed', handleSyncCompleted);
    };
  }, []);

  // Carrega as notificações do Dexie local DB via hook reativo
  const notifications = useLiveQuery(
    () => db.notifications.orderBy('createdAt').reverse().toArray(),
    []
  ) || [];

  // Contador em tempo real das notificações não lidas para o badge
  const unreadCount = notifications.filter(n => n.isRead === 0).length;

  // Função para marcar como lida e fechar o menu ao mesmo tempo, ou apenas abrir
  const toggleNotifications = () => {
    if (!notificationsOpen) {
      // Ao abrir, se houver não lidas, marca todas como lidas
      if (unreadCount > 0) {
         markAllAsRead();
      }
      setNotificationsOpen(true);
      setProfileOpen(false);
    } else {
      setNotificationsOpen(false);
    }
  };

  // Hook no banco Dexie para mostrar a fila pendente ao vivo no ícone de nuvem
  React.useEffect(() => {
    const updatePendingCount = async () => {
      try {
        const count = await db.syncQueue.where('status').equals('pending').count();
        setPendingCount(count);
        // Se temos internet mas ainda há pendentes diminuindo, consideramos estar sincronizando
        if (!isOffline && count > 0) {
            setIsSyncing(true);
        } else if (count === 0) {
            setIsSyncing(false);
        }
      } catch (err) {
        console.error("Erro ao ler fila de sync para o badge", err);
      }
    };

    // Lê inicial
    updatePendingCount();

    // Podemos ouvir um evento que nós mesmos emitimos no app quando enfileiramos ou tentar ler num intervalo
    // No caso como Dexie LiveQuery é um pouco mais chato de usar sem hooks nativos, faremos um poll a cada 3s caso offline
    // Ou quando o app interage com o window
    const interval = setInterval(updatePendingCount, 2500);

    return () => clearInterval(interval);
  }, [isOffline]);

  return (
    <div className="sticky top-0 z-30 h-16 border-b flex items-center justify-between px-3 sm:px-6" style={{ background: "rgba(10,10,10,0.82)", borderColor: "rgba(255,255,255,0.08)", backdropFilter: "blur(18px)" }}>
      {/* Esquerda: Botão Sanduíche */}
      <div className="flex items-center gap-3 sm:gap-4">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl flex items-center justify-center transition-colors hover:bg-white/5"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: palette.white }}
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Centro: Logo e Status de Conexão/Sincronização */}
      <div className="flex flex-col items-center absolute left-1/2 transform -translate-x-1/2">
        <div className="flex items-center gap-2 sm:gap-3 text-white font-semibold text-lg sm:text-xl">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl sm:rounded-2xl flex items-center justify-center" style={{ background: `rgba(${parseInt(logoColor.slice(1,3),16)},${parseInt(logoColor.slice(3,5),16)},${parseInt(logoColor.slice(5,7),16)},0.14)`, color: logoColor }}>
            <Leaf className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <span className="hidden sm:inline">{`AgroSystem - ${currentCompanyName}`}</span>
        </div>

        {/* Indicadores dinâmicos de Rede/Sync */}
        {isOffline ? (
          <div className="flex items-center gap-1.5 mt-0.5 text-orange-400">
            <CloudOff className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span className="text-[10px] sm:text-xs font-medium">
              Offline {pendingCount > 0 ? `(${pendingCount} pendentes)` : ''}
            </span>
          </div>
        ) : isSyncing && pendingCount > 0 ? (
          <div className="flex items-center gap-1.5 mt-0.5 text-blue-400 animate-pulse">
            <CloudUpload className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span className="text-[10px] sm:text-xs font-medium">
              Sincronizando {pendingCount}...
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 mt-0.5 text-green-400 opacity-70">
            <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span className="text-[10px] sm:text-xs font-medium">
              Sincronizado
            </span>
          </div>
        )}
      </div>

      {/* Direita: Notificações e Perfil */}
      <div className="flex items-center gap-2 sm:gap-3 relative">
        <div className="relative">
          <button
            onClick={toggleNotifications}
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-colors hover:bg-white/5"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: palette.white }}
          >
            <Bell className="w-5 h-5" />
          </button>

          {unreadCount > 0 && (
             <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "#ef4444", color: "white" }}>
                {unreadCount > 9 ? '9+' : unreadCount}
             </span>
          )}

          <AnimatePresence>
            {notificationsOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="fixed top-16 right-0 w-full sm:absolute sm:right-0 sm:mt-3 sm:w-[360px] sm:max-w-[360px] sm:rounded-3xl border-b sm:border overflow-hidden shadow-2xl z-40 flex flex-col"
                style={{ background: "rgba(14,16,20,0.96)", borderColor: "rgba(255,255,255,0.08)", maxHeight: "calc(100dvh - 4rem)" }}
              >
                <div className="px-4 py-3 border-b flex items-center justify-between shrink-0" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                  <div className="font-semibold text-lg">Histórico do Sistema</div>
                  {notifications.length > 0 && (
                     <button onClick={clearAllNotifications} className="text-xs text-red-400 hover:text-red-300 transition-colors">
                       Limpar tudo
                     </button>
                  )}
                </div>
                <div className="p-3 space-y-2 overflow-y-auto flex-1">
                  {notifications.length === 0 ? (
                    <div className="text-center py-8 text-sm" style={{ color: palette.text2 }}>
                      Nenhuma notificação encontrada no sistema.
                    </div>
                  ) : (
                    notifications.map((item) => (
                      <div key={item.id} className="rounded-2xl border p-3" style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.06)" }}>
                        <div className="flex items-center justify-between mb-1">
                           <div className={`font-semibold text-sm ${item.type === 'error' ? 'text-red-400' : item.type === 'success' ? 'text-green-400' : 'text-white'}`}>
                             {item.title}
                           </div>
                           <div className="text-[10px]" style={{ color: palette.text2 }}>
                             {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                           </div>
                        </div>
                        <div className="text-sm" style={{ color: palette.text2 }}>{item.text}</div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative">
          <button
            onClick={() => {
              setProfileOpen((v) => !v);
              setNotificationsOpen(false);
            }}
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-colors hover:bg-white/5"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: palette.white }}
          >
            <User className="w-5 h-5" />
          </button>
          <AnimatePresence>
            {profileOpen && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="absolute right-0 mt-3 w-[260px] rounded-3xl border overflow-hidden shadow-2xl z-40" style={{ background: "rgba(14,16,20,0.96)", borderColor: "rgba(255,255,255,0.08)" }}>
                <div className="p-4 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                  <div className="font-semibold" style={{ fontWeight: 650 }}>{currentUserName}</div>
                  <div className="text-sm mt-1" style={{ color: "rgba(176,190,197,0.85)" }}>{roleLabel} • Operações Agrícolas</div>
                  <div className="text-xs mt-1.5 flex items-center gap-1.5" style={{ color: "#22c55e" }}>
                    <Building2 className="w-4 h-4" />
                    <span>{currentCompanyName}</span>
                  </div>
                </div>
                <div className="px-4 pt-3 pb-1">
                  <div className="rounded-2xl border px-3 py-2 text-[11px] flex items-center justify-between gap-3" style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.06)", color: "rgba(176,190,197,0.9)" }}>
                    <span>Versão do sistema</span>
                    <span className="font-medium text-white/90">{appVersion}</span>
                  </div>
                </div>
                <div className="p-3 space-y-2">
                  <button
                    className="w-full text-left rounded-2xl px-3 py-3 transition-colors flex items-center gap-2.5 hover:bg-white/[0.05]"
                    style={{ background: "rgba(255,255,255,0.04)" }}
                  >
                    <User className="w-4 h-4" />
                    <span>Meu perfil</span>
                  </button>
                  <button
                    className="w-full text-left rounded-2xl px-3 py-3 transition-colors flex items-center gap-2.5 hover:bg-white/[0.05]"
                    style={{ background: "rgba(255,255,255,0.04)" }}
                  >
                    <Settings className="w-4 h-4" />
                    <span>Configurações</span>
                  </button>
                  <button
                    className="w-full text-left rounded-2xl px-3 py-3 transition-colors flex items-center gap-2.5 hover:bg-white/[0.05]"
                    style={{ background: "rgba(255,255,255,0.04)" }}
                    onClick={() => {
                      setProfileOpen(false);
                      setIsChangePasswordOpen(true);
                    }}
                  >
                    <Lock className="w-4 h-4" />
                    <span>Trocar senha</span>
                  </button>
                  <button
                    className="w-full text-left rounded-2xl px-3 py-3 transition-colors text-red-400 flex items-center gap-2.5 hover:bg-white/[0.05]"
                    style={{ background: "rgba(255,255,255,0.04)" }}
                    onClick={onLogout}
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sair</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isChangePasswordOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
              onClick={closeChangePasswordModal}
            >
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-[560px] max-h-[90vh] rounded-3xl border shadow-2xl overflow-hidden flex flex-col"
                style={{ background: "rgba(14,16,20,0.96)", borderColor: "rgba(255,255,255,0.08)" }}
              >
                <div className="px-5 py-4 border-b shrink-0" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                  <h3 className="font-semibold text-lg text-white">Trocar senha</h3>
                </div>
                <div className="p-5 space-y-4 overflow-y-auto min-h-0">
                  <div className="space-y-1.5">
                    <label className="text-xs text-white/80">Senha atual</label>
                    <input
                      type="password"
                      value={passwordForm.senhaAtual}
                      onChange={(e) => setPasswordForm((prev) => ({ ...prev, senhaAtual: e.target.value }))}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-white/20"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-white/80">Nova senha</label>
                    <input
                      type="password"
                      value={passwordForm.novaSenha}
                      onChange={(e) => setPasswordForm((prev) => ({ ...prev, novaSenha: e.target.value }))}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-white/20"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-white/80">Confirmar nova senha</label>
                    <input
                      type="password"
                      value={passwordForm.confirmarNovaSenha}
                      onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmarNovaSenha: e.target.value }))}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-white/20"
                    />
                  </div>
                  {passwordError ? (
                    <div className="text-xs text-red-400">{passwordError}</div>
                  ) : null}
                </div>
                <div className="px-5 py-4 border-t flex items-center justify-end gap-2.5 shrink-0" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                  <button
                    className="rounded-xl px-4 py-2.5 text-sm text-white border border-white/10 hover:bg-white/5 transition-colors"
                    onClick={closeChangePasswordModal}
                    disabled={isSubmittingPassword}
                  >
                    Cancelar
                  </button>
                  <button
                    className="rounded-xl px-4 py-2.5 text-sm font-medium text-white bg-green-500/85 hover:bg-green-500 transition-colors disabled:opacity-70"
                    onClick={handleChangePassword}
                    disabled={isSubmittingPassword}
                  >
                    {isSubmittingPassword ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
