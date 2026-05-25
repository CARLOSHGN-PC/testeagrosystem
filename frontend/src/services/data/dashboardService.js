import { apiRequest } from '../apiClient';
import db from '../localDb';

export const dashboardService = {
  async getResumo(companyId) {
    if (!companyId) return null;
    if (!navigator.onLine) return db.modulos.get(`dashboard-resumo:${companyId}`);
    const data = await apiRequest(`/api/dashboard/resumo?companyId=${companyId}`);
    await db.modulos.put({ id: `dashboard-resumo:${companyId}`, companyId, ...data, updatedAt: Date.now() });
    return data;
  },
  async getGraficos(companyId) {
    if (!companyId) return null;
    if (!navigator.onLine) return db.modulos.get(`dashboard-graficos:${companyId}`);
    const data = await apiRequest(`/api/dashboard/graficos?companyId=${companyId}`);
    await db.modulos.put({ id: `dashboard-graficos:${companyId}`, companyId, ...data, updatedAt: Date.now() });
    return data;
  }
};
