import { apiRequest } from './apiClient';

export async function changePasswordService({ senhaAtual, novaSenha }) {
  const response = await apiRequest('/api/user/change-password', {
    method: 'POST',
    body: JSON.stringify({ senhaAtual, novaSenha })
  });

  return response?.data || response;
}

