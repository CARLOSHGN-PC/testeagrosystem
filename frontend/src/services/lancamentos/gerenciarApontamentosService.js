import db from '../localDb';
import { apiRequest } from '../apiClient';
import { isOnline, buildLancamentoBrocaPayload, calculateBroca } from './infestacaoBrocaService';
import { buildLancamentoPerdaPayload, calculatePerda } from './perdaCanaService';
import { buildComplexoMurchaPayload, calculateComplexoMurcha } from './complexoMurchaService';

function clean(value) { return String(value ?? '').trim(); }
function toQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && clean(value) !== '' && value !== 'todos') search.set(key, value);
  });
  return search.toString();
}


function toDateText(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function matchesLocalFilters(item, filtros = {}) {
  const statusRegistro = item.statusRegistro || item.status_registro || 'ativo';
  if (filtros.statusRegistro && filtros.statusRegistro !== 'todos' && statusRegistro !== filtros.statusRegistro) return false;
  if (filtros.fazenda && clean(item.fazendaCodigo) !== clean(filtros.fazenda)) return false;
  if (filtros.talhao && clean(item.talhao) !== clean(filtros.talhao)) return false;
  const data = toDateText(item.dataInspecao || item.data || item.dataAvaliacao || item.createdAt || item.updatedAt);
  if (filtros.dataInicial && data && data < filtros.dataInicial) return false;
  if (filtros.dataFinal && data && data > filtros.dataFinal) return false;
  return true;
}

function normalizeLocal(item, tipo) {
  return {
    ...item,
    tipo,
    statusRegistro: item.statusRegistro || 'ativo',
    origem: item.syncStatus === 'pending' ? 'offline' : 'local',
  };
}

export async function listarApontamentosGerenciamento(companyId, filtros = {}) {
  if (!companyId) return [];
  let remoteRows = [];
  if (isOnline()) {
    const qs = toQuery({ companyId, ...filtros, limit: filtros.limit || 300 });
    const res = await apiRequest(`/api/postgres/agro/apontamentos?${qs}`);
    remoteRows = Array.isArray(res?.data) ? res.data.map((r) => ({ ...r, origem: 'banco' })) : [];
  }

  const includeBroca = !filtros.tipo || filtros.tipo === 'todos' || filtros.tipo === 'broca';
  const includePerda = !filtros.tipo || filtros.tipo === 'todos' || filtros.tipo === 'perda';
  const includeMurcha = !filtros.tipo || filtros.tipo === 'todos' || filtros.tipo === 'murcha';
  const locais = [];
  if (includeBroca) {
    const rows = await db.lancamentosBroca.where('companyId').equals(companyId).toArray().catch(() => []);
    locais.push(...rows.filter((r) => (r.syncStatus === 'pending' || r.status === 'pendente' || r.status === 'erro') && matchesLocalFilters(r, filtros)).map((r) => normalizeLocal(r, 'broca')));
  }
  if (includePerda) {
    const rows = await db.lancamentosPerda.where('companyId').equals(companyId).toArray().catch(() => []);
    locais.push(...rows.filter((r) => (r.syncStatus === 'pending' || r.status === 'pendente' || r.status === 'erro') && matchesLocalFilters(r, filtros)).map((r) => normalizeLocal(r, 'perda')));
  }
  if (includeMurcha) {
    const rows = await db.lancamentosComplexoMurcha.where('companyId').equals(companyId).toArray().catch(() => []);
    locais.push(...rows.filter((r) => matchesLocalFilters(r, filtros)).map((r) => normalizeLocal(r, 'murcha')));
  }

  const map = new Map();
  [...remoteRows, ...locais].forEach((row) => map.set(`${row.tipo}_${row.id || row.uuidLocal}`, row));
  return Array.from(map.values()).sort((a, b) => String(b.dataInspecao || b.data || b.dataAvaliacao || b.updatedAt || '').localeCompare(String(a.dataInspecao || a.data || a.dataAvaliacao || a.updatedAt || '')));
}

export function recalcularApontamento(tipo, form) {
  if (tipo === 'broca') return calculateBroca(form);
  if (tipo === 'murcha') return calculateComplexoMurcha(form);
  return calculatePerda(form);
}

export async function salvarEdicaoApontamento(tipo, form, { companyId, session }) {
  if (!isOnline() && form.syncStatus !== 'pending') {
    throw new Error('Edição de lançamento já sincronizado precisa de internet para atualizar o banco.');
  }
  const payload = tipo === 'broca'
    ? buildLancamentoBrocaPayload(form, { companyId, session })
    : tipo === 'murcha'
      ? buildComplexoMurchaPayload(form, { companyId, session })
      : buildLancamentoPerdaPayload(form, { companyId, session });
  const store = tipo === 'broca' ? 'lancamentosBroca' : tipo === 'murcha' ? 'lancamentosComplexoMurcha' : 'lancamentosPerda';

  if (form.syncStatus === 'pending' || !isOnline()) {
    const pendingPayload = { ...payload, syncStatus: 'pending', status: 'pendente', updatedAt: new Date().toISOString() };
    await db[store].put(pendingPayload);
    return { mode: 'local', data: pendingPayload };
  }

  await apiRequest(`/api/postgres/agro/apontamentos/${tipo}/${encodeURIComponent(payload.id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  const synced = { ...payload, syncStatus: 'synced', status: 'sincronizado', updatedAt: new Date().toISOString() };
  await db[store].put(synced).catch(() => null);
  return { mode: 'online', data: synced };
}

export async function cancelarApontamento(tipo, item, { companyId, motivo }) {
  if (!isOnline()) throw new Error('Cancelamento precisa de internet para atualizar o banco com segurança.');
  await apiRequest(`/api/postgres/agro/apontamentos/${tipo}/${encodeURIComponent(item.id)}/cancelar`, {
    method: 'PATCH',
    body: JSON.stringify({ companyId, motivo }),
  });
  const store = tipo === 'broca' ? 'lancamentosBroca' : tipo === 'murcha' ? 'lancamentosComplexoMurcha' : 'lancamentosPerda';
  await db[store].put({ ...item, statusRegistro: 'cancelado', motivoCancelamento: motivo, updatedAt: new Date().toISOString() }).catch(() => null);
  return { success: true };
}
