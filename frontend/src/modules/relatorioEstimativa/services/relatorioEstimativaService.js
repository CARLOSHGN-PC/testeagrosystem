import { getAccessToken, refreshPostgresSession } from '../../../services/postgresAuthService';

const configuredBaseUrl =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  '';
const isLocal = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
const BASE_URL = isLocal
  ? (configuredBaseUrl && configuredBaseUrl.includes('localhost') ? configuredBaseUrl : 'http://localhost:3000')
  : configuredBaseUrl;

async function getJwtToken() {
  let token = getAccessToken();
  if (token) return token;
  await refreshPostgresSession().catch(() => null);
  return getAccessToken() || '';
}

/**
 * Exporta relatório de estimativa usando autenticação PostgreSQL/JWT.
 * Auth PostgreSQL/JWT foi removido deste fluxo.
 */
export const exportarRelatorioEstimativa = async (payload) => {
  try {
    const token = await getJwtToken();
    const endpoint = payload.formatoSaida === 'PDF'
      ? `${BASE_URL}/api/relatorios/estimativa/exportar/pdf`
      : `${BASE_URL}/api/relatorios/estimativa/exportar/excel`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      let errorMsg = 'Erro ao processar relatório no servidor.';
      try {
        const errorData = await response.json();
        errorMsg = errorData.error || errorData.message || JSON.stringify(errorData.details) || errorMsg;
      } catch {}
      throw new Error(errorMsg);
    }

    const blob = await response.blob();
    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = `relatorio_estimativa_${new Date().getTime()}`;

    if (contentDisposition && contentDisposition.includes('filename=')) {
      filename = contentDisposition.split('filename=')[1].replace(/"/g, '');
    } else {
      filename += payload.formatoSaida === 'PDF' ? '.pdf' : '.xlsx';
    }

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    return true;
  } catch (error) {
    console.error('Falha no RelatorioEstimativaService:', error);
    throw error;
  }
};
