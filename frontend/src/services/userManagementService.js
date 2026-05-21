import { apiRequest } from './apiClient';

function queryString(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return qs ? `?${qs}` : '';
}

export const userManagementService = {
  list: (params = {}) => apiRequest(`/api/admin/users${queryString(params)}`),
  create: (data) => apiRequest('/api/admin/users', { method: 'POST', body: JSON.stringify(data) }),
  update: (uid, data) => apiRequest(`/api/admin/users/${uid}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleStatus: (uid, status) => apiRequest(`/api/admin/users/${uid}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  resetPassword: (uidOrEmail, payload = {}) => apiRequest(`/api/admin/users/${encodeURIComponent(uidOrEmail)}/reset-password`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
};
