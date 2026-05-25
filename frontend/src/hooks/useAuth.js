import { useState, useEffect, useCallback } from 'react';
import { clearSession, getStoredSession, persistSession } from '../services/sessionService';
import { clearAuthTokens, loadPostgresSession, logoutPostgres, refreshPostgresSession } from '../services/postgresAuthService';

export function useAuth() {
  const [logged, setLogged] = useState(Boolean(getStoredSession()));
  const [isInitializing, setIsInitializing] = useState(true);
  const [user, setUser] = useState(getStoredSession()?.user || null);
  const [session, setSession] = useState(getStoredSession());

  const applySession = useCallback((sessionPayload) => {
    if (!sessionPayload?.user) return null;

    if (sessionPayload.user.status !== 'ativo') {
      throw new Error('Usuário inativo. Contate o administrador da empresa.');
    }

    if (
      sessionPayload.user.role !== 'super_admin' &&
      sessionPayload.company &&
      sessionPayload.company.status !== 'active'
    ) {
      throw new Error('Empresa inativa. Contate o administrador do sistema.');
    }

    persistSession(sessionPayload);
    setSession(sessionPayload);
    setUser(sessionPayload.user);
    setLogged(true);

    return sessionPayload;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const stored = getStoredSession();

        if (stored) {
          applySession(stored);
        }

        if (navigator.onLine) {
          const freshSession = await loadPostgresSession().catch(async () => {
            return refreshPostgresSession().catch(() => null);
          });

          if (freshSession && !cancelled) {
            applySession(freshSession);
          } else if (!stored && !cancelled) {
            setLogged(false);
            setSession(null);
            setUser(null);
          }
        } else if (!stored && !cancelled) {
          setLogged(false);
          setSession(null);
          setUser(null);
        }
      } catch (error) {
        console.error('[useAuth] erro ao hidratar sessão PostgreSQL:', error);
        const cachedSession = getStoredSession();
        if (cachedSession && !cancelled) {
          // Em produção, queda momentânea da API não deve derrubar o usuário
          // nem matar o uso offline do mapa.
          applySession(cachedSession);
        } else {
          clearSession();
          clearAuthTokens();
          setSession(null);
          setUser(null);
          setLogged(false);
        }
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [applySession]);

  const forceLoginState = async () => {
    const cachedSession = getStoredSession();

    if (!navigator.onLine && cachedSession) {
      applySession(cachedSession);
      setIsInitializing(false);
      return;
    }

    const freshSession = await loadPostgresSession().catch(async (error) => {
      if (cachedSession) return cachedSession;
      throw error;
    });
    if (!freshSession) throw new Error('Sessão não encontrada para concluir o login.');
    applySession(freshSession);
    setIsInitializing(false);
  };

  const refreshSession = async () => {
    const freshSession = await loadPostgresSession().catch(async () => {
      return refreshPostgresSession().catch(() => null);
    });

    if (freshSession) {
      applySession(freshSession);
      return;
    }

    const cachedSession = getStoredSession();
    if (cachedSession) {
      applySession(cachedSession);
    }
  };

  useEffect(() => {
    if (!logged || !navigator.onLine) return undefined;

    let refreshing = false;
    const safeRefresh = async () => {
      if (refreshing || document.visibilityState === 'hidden') return;
      refreshing = true;
      try {
        await refreshSession();
      } catch (error) {
        console.warn('[useAuth] falha ao atualizar sessão em background:', error);
      } finally {
        refreshing = false;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') safeRefresh();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', safeRefresh);
    window.addEventListener('online', safeRefresh);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', safeRefresh);
      window.removeEventListener('online', safeRefresh);
    };
  }, [logged, session?.user?.uid]);

  const handleLogout = async () => {
    await logoutPostgres();
    clearSession();
    clearAuthTokens();
    setSession(null);
    setLogged(false);
    setUser(null);
  };

  return { logged, isInitializing, handleLogout, forceLoginState, user, session, refreshSession };
}
