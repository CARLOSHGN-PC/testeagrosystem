import { v4 as uuidv4 } from 'uuid';
import db from '../localDb';
import { apiRequest } from '../apiClient';
import { listCadastro } from '../cadastros_mestres/cadastrosPostgresService';

const OFFLINE_STORE = 'lancamentosBroca';

export function isOnline() { return typeof navigator === 'undefined' ? true : navigator.onLine; }
export function toNumber(value) { const n = Number(String(value ?? '').replace(',', '.').trim()); return Number.isFinite(n) ? n : 0; }
export function calculateBroca({ entrenosContados, brocadoBase, brocadoMeio, brocadoTopo, cochonilha }) {
  const totalBrocado = toNumber(brocadoBase) + toNumber(brocadoMeio) + toNumber(brocadoTopo);
  const totalCochonilha = toNumber(cochonilha);
  const entrenos = toNumber(entrenosContados);
  return {
    totalBrocado,
    percentualBrocamento: Number((entrenos > 0 ? (totalBrocado / entrenos) * 100 : 0).toFixed(2)),
    totalCochonilha,
    percentualCochonilha: Number((entrenos > 0 ? (totalCochonilha / entrenos) * 100 : 0).toFixed(2)),
  };
}
function nowIso(){ return new Date().toISOString(); }
function cleanText(value){ return String(value ?? '').trim(); }

export function buildLancamentoBrocaPayload(form, { companyId, session }) {
  const id = form.id || uuidv4();
  const totals = calculateBroca(form);
  return {
    id, uuidLocal: form.uuidLocal || id, companyId, fazendaCodigo: cleanText(form.fazendaCodigo), fazendaNome: cleanText(form.fazendaNome),
    talhao: cleanText(form.talhao), talhaoId: cleanText(form.talhaoId || `${form.fazendaCodigo}_${form.talhao}`),
    variedade: cleanText(form.variedade), dataInspecao: cleanText(form.dataInspecao),
    entrenosContados: toNumber(form.entrenosContados), brocadoBase: toNumber(form.brocadoBase),
    brocadoMeio: toNumber(form.brocadoMeio), brocadoTopo: toNumber(form.brocadoTopo), cochonilha: toNumber(form.cochonilha),
    totalBrocado: totals.totalBrocado, percentualBrocamento: totals.percentualBrocamento,
    totalCochonilha: totals.totalCochonilha, percentualCochonilha: totals.percentualCochonilha,
    status: form.status || 'sincronizado', syncStatus: form.syncStatus || 'synced',
    createdAt: form.createdAt || nowIso(), updatedAt: nowIso(),
    createdBy: session?.user?.uid || session?.user?.id || null, createdByEmail: session?.user?.email || null,
  };
}

async function saveToPostgres(payload) {
  const result = await apiRequest('/api/postgres/sync/task', {
    method: 'POST',
    body: JSON.stringify({ type: 'createOrUpdate', targetCollection: 'lancamentos_broca', documentId: payload.id, payload })
  });
  return { ...payload, ...(result.data || {}), status: 'sincronizado', syncStatus: 'synced', syncedAt: nowIso(), updatedAt: nowIso() };
}
async function saveOffline(payload, errorMessage = null) {
  const offlinePayload = { ...payload, status: errorMessage ? 'erro' : 'pendente', syncStatus: 'pending', lastError: errorMessage, updatedAt: nowIso() };
  await db[OFFLINE_STORE].put(offlinePayload);
  return offlinePayload;
}
export async function saveLancamentoBroca(form, { companyId, session }) {
  if (!companyId) throw new Error('Empresa não identificada para salvar o lançamento.');
  const payload = buildLancamentoBrocaPayload(form, { companyId, session });
  if (!payload.dataInspecao) throw new Error('Informe a data da inspeção.');
  if (!payload.fazendaCodigo) throw new Error('Selecione a fazenda.');
  if (!payload.talhao) throw new Error('Selecione o talhão.');
  if (payload.entrenosContados <= 0) throw new Error('Entrenós contados precisa ser maior que zero.');
  if (isOnline()) {
    try { const saved = await saveToPostgres(payload); await db[OFFLINE_STORE].put(saved); return { mode: 'online', data: saved }; }
    catch (error) { const pending = await saveOffline(payload, error?.message || 'Falha ao salvar online.'); return { mode: 'offline_cache', data: pending }; }
  }
  const pending = await saveOffline(payload);
  return { mode: 'offline', data: pending };
}
export async function syncPendingLancamentosBroca() {
  if (!isOnline()) return { synced: 0, failed: 0 };
  const pendentes = await db[OFFLINE_STORE].where('syncStatus').equals('pending').toArray();
  let synced = 0, failed = 0;
  for (const item of pendentes) {
    try { const saved = await saveToPostgres(item); await db[OFFLINE_STORE].put(saved); synced += 1; }
    catch (error) { await db[OFFLINE_STORE].put({ ...item, status: 'erro', syncStatus: 'pending', lastError: error?.message || 'Erro ao sincronizar.', updatedAt: nowIso() }); failed += 1; }
  }
  return { synced, failed };
}
export async function listLocalLancamentosBroca(companyId, max = 50) {
  if (!companyId) return [];
  const rows = await db[OFFLINE_STORE].where('companyId').equals(companyId).toArray();
  return rows.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).slice(0,max);
}
function normalizeFazenda(f = {}) {
  const codigo = cleanText(f.codFaz || f.COD_FAZ || f.codigo || f.code || f.fazendaCodigo || f.id_fazenda || f.farmCode || f.id);
  const nome = cleanText(f.desFazenda || f.DES_FAZENDA || f.nome || f.name || f.fazendaNome || f.nome_fazenda || f.farmName);
  return { codigo, nome, raw: f };
}

function normalizeTalhao(t = {}, fazendaCodigo = '') {
  const talhao = cleanText(t.talhao || t.TALHAO || t.codTalhao || t.code || t.name || t.talhaoNome || t.idTalhao);
  const id = cleanText(t.id || t.postgresId || t.fieldId || `${fazendaCodigo}_${talhao}`);
  const variedade = cleanText(
    t.variedade || t.VARIEDADE || t.desVariedade || t.nomeVariedade || t.variedadeCana ||
    t.varietyName || t.variety?.name || t.variety?.code
  );
  const codFaz = cleanText(t.codFaz || t.COD_FAZ || t.fazendaCodigo || t.fazendaId || t.farmId || t.farm?.code || t.farmCode);
  return { id, talhao, variedade, codFaz, raw: t };
}

export async function loadFazendas(companyId) {
  if (!companyId) return [];

  if (isOnline()) {
    try {
      const remote = await listCadastro('farms', companyId, { limit: 1000 });
      const rows = (remote?.data || []).map(normalizeFazenda).filter((f) => f.codigo);
      if (rows.length) return rows.sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
    } catch (error) {
      console.warn('[Apontamentos] Não foi possível buscar fazendas no cadastro online. Usando cache offline.', error);
    }
  }

  let local = await db.fazendas.where('companyId').equals(companyId).toArray().catch(() => []);
  if (!local.length && db.producaoAgricola) {
    const producoes = await db.producaoAgricola.where('companyId').equals(companyId).toArray().catch(() => []);
    const map = new Map();
    producoes.forEach((p) => {
      const row = normalizeFazenda(p);
      if (row.codigo && !map.has(row.codigo)) map.set(row.codigo, row);
    });
    local = Array.from(map.values());
  }

  return local.map(normalizeFazenda).filter((f) => f.codigo).sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
}

export async function loadTalhoesByFazenda(companyId, fazendaCodigo) {
  if (!companyId || !fazendaCodigo) return [];
  const cod = cleanText(fazendaCodigo);

  if (isOnline()) {
    try {
      const remote = await listCadastro('fields', companyId, { farmId: cod, limit: 5000 });
      let rows = (remote?.data || []).map((t) => normalizeTalhao(t, cod)).filter((t) => t.talhao);
      if (!rows.length) {
        const allRemote = await listCadastro('fields', companyId, { limit: 5000 });
        rows = (allRemote?.data || []).map((t) => normalizeTalhao(t, cod)).filter((t) => t.talhao && cleanText(t.codFaz) === cod);
      }
      if (rows.length) return rows.sort((a, b) => a.talhao.localeCompare(b.talhao, 'pt-BR', { numeric: true }));
    } catch (error) {
      console.warn('[Apontamentos] Não foi possível buscar talhões no cadastro online. Usando cache offline.', error);
    }
  }

  let all = await db.talhoes.where('companyId').equals(companyId).toArray().catch(() => []);
  if (!all.length && db.producaoAgricola) all = await db.producaoAgricola.where('companyId').equals(companyId).toArray().catch(() => []);

  return all.map((t) => normalizeTalhao(t, cod))
    .filter((t) => t.talhao && (!t.codFaz || t.codFaz === cod))
    .sort((a, b) => a.talhao.localeCompare(b.talhao, 'pt-BR', { numeric: true }));
}
export async function loadRecentRemoteLancamentosBroca(companyId, max = 25) {
  return listLocalLancamentosBroca(companyId, max);
}
