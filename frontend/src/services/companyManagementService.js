import { apiRequest } from './apiClient';
import { postgresReadService, usePostgresReads } from './postgresReadService';

function queryString(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return qs ? `?${qs}` : '';
}

export const companyManagementService = {
  list: (params = {}) => usePostgresReads
    ? postgresReadService.listCompanies(params)
    : apiRequest(`/api/admin/companies${queryString(params)}`),
  create: (data) => apiRequest('/api/admin/companies', { method: 'POST', body: JSON.stringify(data) }),
  update: (companyId, data) => apiRequest(`/api/admin/companies/${companyId}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleStatus: (companyId, status) => apiRequest(`/api/admin/companies/${companyId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
};
