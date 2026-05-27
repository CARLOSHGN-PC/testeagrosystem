import apiClient from '../apiClient';
export const dashboardService = {
  getResumo: (companyId, safra) => apiClient.get('/api/dashboard/resumo', { params: { companyId, safra } }),
  getGraficos: (companyId, safra) => apiClient.get('/api/dashboard/graficos', { params: { companyId, safra } }),
  getMapProjection: (companyId, safra) => apiClient.get('/api/map/projection', { params: { companyId, safra } })
};
