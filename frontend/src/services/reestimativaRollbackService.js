import { apiRequest } from './apiClient';

const ENDPOINT = '/api/admin/reestimativas/rollback';

export async function previewReestimativaRollback(payload) {
  return apiRequest(`${ENDPOINT}/preview`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function applyReestimativaRollback(payload) {
  return apiRequest(`${ENDPOINT}/apply`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
