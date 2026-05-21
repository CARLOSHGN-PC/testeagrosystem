import db from '../localDb';
import { fetchWithOffline } from './baseDataService';
import { apiRequest } from '../apiClient';

function normalizeFarm(row = {}) {
  const raw = row.rawData || {};
  return {
    ...raw,
    ...row,
    id: row.id,
    companyId: raw.companyId || row.companyId || row.companyCode,
    codFaz: raw.codFaz || raw.codigo || row.code,
    codigo: raw.codigo || raw.codFaz || row.code,
    desFazenda: raw.desFazenda || raw.nome || row.name,
    nome: raw.nome || raw.desFazenda || row.name,
    source: 'postgres',
  };
}

export const fazendaService = {
  getByCompany(companyId) {
    return fetchWithOffline({
      companyId,
      cacheStore: db.fazendas,
      request: async () => {
        const qs = new URLSearchParams({ companyId, limit: '5000' }).toString();
        const result = await apiRequest(`/api/postgres/agro/farms?${qs}`);
        return (result.data || []).map(normalizeFarm);
      }
    });
  }
};
