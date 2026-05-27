import { apiRequest } from '../apiClient';

export async function fetchOrdensCortePaginadas({
  companyId,
  safra,
  status = 'aberto',
  search = '',
  date = '',
  page = 1,
  limit = 20,
} = {}) {
  const params = new URLSearchParams();

  if (companyId) params.set('companyId', companyId);
  if (safra) params.set('safra', safra);
  if (status) params.set('status', status);
  if (search) params.set('search', search);
  if (date) params.set('date', date);
  params.set('page', String(page || 1));
  params.set('limit', String(limit || 20));

  const query = params.toString();
  return apiRequest(`/api/ordens-corte${query ? `?${query}` : ''}`);
}


export async function updateOrdemCortePostgres(ordemId, dados = {}) {
  if (!ordemId) throw new Error('ID da ordem de corte é obrigatório.');
  return apiRequest(`/api/ordens-corte/${encodeURIComponent(ordemId)}`, {
    method: 'PATCH',
    body: JSON.stringify(dados),
  });
}


export async function fecharTalhoesOrdemCortePostgres(ordemId, talhoesIds = []) {
  if (!ordemId) throw new Error('ID da ordem de corte é obrigatório.');
  return apiRequest(`/api/ordens-corte/${encodeURIComponent(ordemId)}/fechar-talhoes`, {
    method: 'POST',
    body: JSON.stringify({ talhoesIds }),
  });
}
