import { createDisabledModules, normalizeEnabledModules } from '../constants/accessModules';

export const SESSION_STORAGE_KEY = '@AgroSystem:session';
export const OFFLINE_AUTH_KEY = '@AgroSystem:auth';

export function getStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function persistSession(session) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));

  const previousAuth = JSON.parse(localStorage.getItem(OFFLINE_AUTH_KEY) || '{}');
  localStorage.setItem(
    OFFLINE_AUTH_KEY,
    JSON.stringify({
      ...previousAuth,
      uid: session.user.uid,
      email: String(session.user.email || previousAuth.email || previousAuth.e || '').toLowerCase(),
      e: String(previousAuth.e || session.user.email || '').toLowerCase(),
      companyId: session.user.companyId || null,
      role: session.user.role,
      status: session.user.status,
      readOnly: session.user.readOnly === true,
      enabledModules: normalizeEnabledModules(session.company?.enabledModules || {}),
      permissions: session.user.permissions || createDisabledModules(),
      sessionSnapshot: session,
      updatedAt: new Date().toISOString(),
      source: 'postgres',
    })
  );
}

export function getOfflineAuth() {
  try {
    const raw = localStorage.getItem(OFFLINE_AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function restoreOfflineSession(authPayload = null) {
  const offlineAuth = authPayload || getOfflineAuth();
  const session = offlineAuth?.sessionSnapshot || null;
  if (!session?.user) return null;
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function clearSession(options = {}) {
  const { clearOfflineAuth = false } = options || {};
  localStorage.removeItem(SESSION_STORAGE_KEY);
  if (clearOfflineAuth) localStorage.removeItem(OFFLINE_AUTH_KEY);
}

export async function loadSessionByUid() {
  const { loadPostgresSession } = await import('./postgresAuthService');
  const session = await loadPostgresSession();
  if (!session) throw new Error('Sessão PostgreSQL não encontrada.');
  return session;
}
