import { getAccessToken, getRefreshToken, persistTokens, clearAuthTokens } from './postgresAuthService';

const rawConfiguredBaseUrl =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_BACKEND_URL ||
  '';

function normalizeApiBaseUrl(value) {
  const clean = String(value || '').trim().replace(/\/+$/, '');
  if (!clean) return '';

  // As chamadas do sistema já usam caminhos iniciando com /api.
  // Se o .env vier com /api no final, removemos para evitar /api/api/...
  return clean.replace(/\/api$/i, '');
}

const configuredBaseUrl = normalizeApiBaseUrl(rawConfiguredBaseUrl);
const isLocal = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
const useAdminApi = String(import.meta.env.VITE_USE_ADMIN_API || '').toLowerCase() === 'true';
const BASE_URL = isLocal
  ? (configuredBaseUrl && configuredBaseUrl.includes('localhost') ? configuredBaseUrl : 'http://localhost:3000')
  : (configuredBaseUrl || (useAdminApi ? 'https://agro-system-hrbb.onrender.com' : ''));

function getStoredTokenFallback() {
  try {
    return (
      getAccessToken() ||
      localStorage.getItem('@AgroSystem:postgresAccessToken') ||
      localStorage.getItem('@AgroSystem:accessToken') ||
      localStorage.getItem('accessToken') ||
      null
    );
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveAccessToken() {
  let token = getStoredTokenFallback();
  if (token) return token;

  // Logo após o login, alguns módulos disparam requisições no mesmo ciclo de render.
  // Aguarda um instante para o token ser persistido antes de chamar APIs protegidas.
  await sleep(300);
  token = getStoredTokenFallback();
  if (token) return token;

  // Última tentativa: se houver refresh token, tenta reidratar a sessão/token.
  const refreshed = await refreshAccessToken().catch(() => null);
  return refreshed || getStoredTokenFallback();
}

async function getAuthHeaders() {
  const token = await resolveAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

function buildNetworkError(message) {
  return new Error(`${message} Verifique se a API administrativa está disponível.`);
}

let refreshPromise = null;

async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return null;

    const response = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload.success === false) {
      clearAuthTokens();
      return null;
    }

    persistTokens(payload);

    if (payload.session) {
      localStorage.setItem('@AgroSystem:session', JSON.stringify(payload.session));
    }

    return payload.accessToken || null;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function apiRequest(path, options = {}) {
  const doRequest = async () => {
    const headers = await getAuthHeaders();
    try {
      return await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: {
          ...headers,
          ...(options.headers || {})
        }
      });
    } catch (error) {
      throw buildNetworkError('Não foi possível conectar ao backend administrativo.');
    }
  };

  let response = await doRequest();

  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      response = await doRequest();
    }
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(payload.message || payload.error || 'Erro ao processar requisição.');
    err.status = response.status;
    err.payload = payload;
    throw err;
  }

  return payload;
}

export async function apiDownloadBlob(path, options = {}) {
  const doRequest = async () => {
    const headers = await getAuthHeaders();
    const { headers: customHeaders = {}, ...restOptions } = options;
    delete headers['Content-Type'];
    try {
      return await fetch(`${BASE_URL}${path}`, {
        ...restOptions,
        headers: {
          ...headers,
          ...customHeaders
        }
      });
    } catch (error) {
      throw buildNetworkError('Não foi possível conectar ao backend administrativo.');
    }
  };

  let response = await doRequest();

  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) response = await doRequest();
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const err = new Error(payload.message || payload.error || 'Erro ao baixar arquivo.');
    err.status = response.status;
    err.payload = payload;
    throw err;
  }

  return await response.blob();
}

