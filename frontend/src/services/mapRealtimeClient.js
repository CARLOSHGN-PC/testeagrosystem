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

function getApiBaseUrl() {
  const configuredBaseUrl = normalizeApiBaseUrl(rawConfiguredBaseUrl);
  const isLocal = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const useAdminApi = String(import.meta.env.VITE_USE_ADMIN_API || '').toLowerCase() === 'true';
  if (isLocal) {
    return configuredBaseUrl && configuredBaseUrl.includes('localhost') ? configuredBaseUrl : 'http://localhost:3000';
  }
  return configuredBaseUrl || (useAdminApi ? 'https://agro-system-hrbb.onrender.com' : '');
}

export function subscribeMapRealtime({ companyId, safra, onMapUpdate } = {}) {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {};
  }

  const params = new URLSearchParams();
  if (companyId) params.set('companyId', companyId);
  if (safra) params.set('safra', safra);

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/realtime/maps/events?${params.toString()}`;
  const source = new EventSource(url, { withCredentials: true });

  const handler = (event) => {
    try {
      const payload = JSON.parse(event.data || '{}');
      if (typeof onMapUpdate === 'function') onMapUpdate(payload);
    } catch (error) {
      console.warn('[MapaRealtime] Evento inválido:', error);
    }
  };

  source.addEventListener('map-update', handler);
  source.onerror = () => {
    // O EventSource reconecta sozinho. Não usamos polling pesado como fallback aqui
    // para não travar o mapa em produção.
  };

  return () => {
    source.removeEventListener('map-update', handler);
    source.close();
  };
}
