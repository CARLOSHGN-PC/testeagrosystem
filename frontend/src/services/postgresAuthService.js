import { clearSession, persistSession } from './sessionService';

const rawConfiguredBaseUrl =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_BACKEND_URL ||
  '';

function normalizeApiBaseUrl(value) {
  const clean = String(value || '').trim().replace(/\/+$/, '');
  if (!clean) return '';
  return clean.replace(/\/api$/i, '');
}

const configuredBaseUrl = normalizeApiBaseUrl(rawConfiguredBaseUrl);
const isLocal = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
const useAdminApi = String(import.meta.env.VITE_USE_ADMIN_API || '').toLowerCase() === 'true';
const BASE_URL = isLocal
  ? (configuredBaseUrl && configuredBaseUrl.includes('localhost') ? configuredBaseUrl : 'http://localhost:3000')
  : (configuredBaseUrl || (useAdminApi ? 'https://agro-system-hrbb.onrender.com' : ''));

export const AUTH_TOKEN_KEY = '@AgroSystem:postgresAccessToken';
export const REFRESH_TOKEN_KEY = '@AgroSystem:postgresRefreshToken';

export function getAccessToken() {
  return (
    localStorage.getItem(AUTH_TOKEN_KEY) ||
    localStorage.getItem('@AgroSystem:accessToken') ||
    localStorage.getItem('accessToken') ||
    ''
  );
}

export function getRefreshToken() {
  return (
    localStorage.getItem(REFRESH_TOKEN_KEY) ||
    localStorage.getItem('@AgroSystem:refreshToken') ||
    localStorage.getItem('refreshToken') ||
    ''
  );
}

export function persistTokens({ accessToken, refreshToken }) {
  if (accessToken) {
    localStorage.setItem(AUTH_TOKEN_KEY, accessToken);
    // aliases usados por chamadas legadas e para evitar corrida entre login e bootstrap
    localStorage.setItem('@AgroSystem:accessToken', accessToken);
    localStorage.setItem('accessToken', accessToken);
  }

  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    localStorage.setItem('@AgroSystem:refreshToken', refreshToken);
    localStorage.setItem('refreshToken', refreshToken);
  }
}

export function clearAuthTokens() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem('@AgroSystem:accessToken');
  localStorage.removeItem('@AgroSystem:refreshToken');
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    const error = new Error(payload.message || payload.error || 'Erro na autenticação.');
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export async function loginWithPostgres(email, password) {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const payload = await parseResponse(response);

  persistTokens(payload);

  if (payload.session) {
    persistSession(payload.session);
  }

  return payload;
}

export async function loadPostgresSession() {
  const accessToken = getAccessToken();

  if (!accessToken) return null;

  const response = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = await parseResponse(response);

  if (payload.session) {
    persistSession(payload.session);
  }

  return payload.session || null;
}

export async function refreshPostgresSession() {
  const refreshToken = getRefreshToken();

  if (!refreshToken) return null;

  const response = await fetch(`${BASE_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  let payload;
  try {
    payload = await parseResponse(response);
  } catch (error) {
    clearAuthTokens();
    throw error;
  }

  persistTokens(payload);

  if (payload.session) {
    persistSession(payload.session);
  }

  return payload.session || null;
}

export async function getValidAccessToken() {
  const token = getAccessToken();
  if (token) return token;

  await refreshPostgresSession().catch(() => null);
  return getAccessToken();
}

export async function logoutPostgres() {
  try {
    const token = getAccessToken();
    await fetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {}

  clearAuthTokens();
  // Logout remove apenas a sessão ativa e tokens.
  // O perfil offline fica salvo para permitir login no campo sem internet
  // depois que o usuário já logou online neste dispositivo.
  clearSession({ clearOfflineAuth: false });
}
