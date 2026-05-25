import { v4 as uuidv4 } from 'uuid';
import db from '../localDb';
import { apiRequest } from '../apiClient';
import { isOnline, toNumber, loadFazendas, loadTalhoesByFazenda } from './infestacaoBrocaService';

const OFFLINE_STORE = 'lancamentosPerda';

export { isOnline, toNumber, loadFazendas, loadTalhoesByFazenda };


function normalizeProfissional(p = {}, matriculaBusca = '') {
  const matricula = cleanText(p.matricula || p.registration || p.rawData?.matricula || p.rawData?.registration || matriculaBusca);
  const nome = cleanText(p.nomeCompleto || p.nome || p.name || p.rawData?.nomeCompleto || p.rawData?.nome || p.rawData?.name);
  return { ...p, matricula, nomeCompleto: nome, nome };
}

async function findLocalProfissionalByMatricula(companyId, matricula) {
  const mat = cleanText(matricula);
  if (!mat) return null;
  const all = await db.profissionais.where('companyId').equals(companyId).toArray().catch(() => []);
  return all.map((p) => normalizeProfissional(p, mat)).find((p) => cleanText(p.matricula) === mat) || null;
}

export async function loadOperadorByMatricula(companyId, matricula) {
  const mat = cleanText(matricula);
  if (!companyId || !mat) return null;

  if (isOnline()) {
    try {
      const payload = await apiRequest(`/api/postgres/cadastros/professionals?companyId=${encodeURIComponent(companyId)}&search=${encodeURIComponent(mat)}&limit=50`);
      const profissionais = Array.isArray(payload?.data) ? payload.data : [];
      const match = profissionais
        .map((p) => normalizeProfissional(p, mat))
        .find((p) => cleanText(p.matricula) === mat);
      if (match?.nomeCompleto || match?.nome) {
        await db.profissionais.put({
          ...match,
          id: match.id || match.uuid || `${companyId}_${mat}`,
          companyId,
          matricula: mat,
          nomeCompleto: match.nomeCompleto || match.nome,
          syncStatus: 'synced',
          updatedAt: nowIso(),
        }).catch(() => null);
        return match;
      }
    } catch (error) {
      console.warn('[Apontamentos] Não foi possível buscar operador online. Usando cadastro local.', error);
    }
  }

  return findLocalProfissionalByMatricula(companyId, mat);
}

export function calculatePerda(form = {}) {
  const totalPerda = [
    form.canaInteira,
    form.tolete,
    form.toco,
    form.ponta,
    form.estilhaco,
    form.pedaco,
  ].reduce((sum, value) => sum + toNumber(value), 0);
  const pisoteioMetros = toNumber(form.pisoteioMetros);
  const percentualPisoteio = (pisoteioMetros / 20) * 100;
  const paralelismoEsquerdo = toNumber(form.paralelismoEsquerdo);
  const paralelismoDireito = toNumber(form.paralelismoDireito);
  const temParalelismoEsquerdo = cleanText(form.paralelismoEsquerdo) !== '';
  const temParalelismoDireito = cleanText(form.paralelismoDireito) !== '';
  const divisorParalelismo = Number(temParalelismoEsquerdo) + Number(temParalelismoDireito);
  const mediaParalelismo = divisorParalelismo > 0
    ? (paralelismoEsquerdo + paralelismoDireito) / divisorParalelismo
    : 0;
  return {
    totalPerda: Number(totalPerda.toFixed(2)),
    percentualPisoteio: Number(percentualPisoteio.toFixed(2)),
    percentualParalelismo: Number(mediaParalelismo.toFixed(2)),
    mediaParalelismo: Number(mediaParalelismo.toFixed(2)),
  };
}

function nowIso() { return new Date().toISOString(); }
function cleanText(value) { return String(value ?? '').trim(); }

export function buildLancamentoPerdaPayload(form, { companyId, session }) {
  const id = form.id || uuidv4();
  const totals = calculatePerda(form);
  return {
    id,
    uuidLocal: form.uuidLocal || id,
    companyId,
    data: cleanText(form.data),
    fazendaCodigo: cleanText(form.fazendaCodigo),
    fazendaNome: cleanText(form.fazendaNome),
    talhao: cleanText(form.talhao),
    talhaoId: cleanText(form.talhaoId || `${form.fazendaCodigo}_${form.talhao}`),
    variedade: cleanText(form.variedade),
    frenteServico: cleanText(form.frenteServico),
    turno: cleanText(form.turno),
    frotaEquipamento: cleanText(form.frotaEquipamento),
    matriculaOperador: cleanText(form.matriculaOperador),
    nomeOperador: cleanText(form.nomeOperador),
    canaInteira: toNumber(form.canaInteira),
    tolete: toNumber(form.tolete),
    toco: toNumber(form.toco),
    ponta: toNumber(form.ponta),
    estilhaco: toNumber(form.estilhaco),
    pedaco: toNumber(form.pedaco),
    pisoteioMetros: toNumber(form.pisoteioMetros),
    percentualPisoteio: totals.percentualPisoteio,
    paralelismoEsquerdo: toNumber(form.paralelismoEsquerdo),
    paralelismoDireito: toNumber(form.paralelismoDireito),
    percentualParalelismo: totals.percentualParalelismo,
    totalPerda: totals.totalPerda,
    status: form.status || 'sincronizado',
    syncStatus: form.syncStatus || 'synced',
    createdAt: form.createdAt || nowIso(),
    updatedAt: nowIso(),
    createdBy: session?.user?.uid || session?.user?.id || null,
    createdByEmail: session?.user?.email || null,
  };
}

async function saveToPostgres(payload) {
  const result = await apiRequest('/api/postgres/sync/task', {
    method: 'POST',
    body: JSON.stringify({
      type: 'createOrUpdate',
      targetCollection: 'lancamentos_perda',
      documentId: payload.id,
      payload,
    }),
  });
  return { ...payload, ...(result.data || {}), status: 'sincronizado', syncStatus: 'synced', syncedAt: nowIso(), updatedAt: nowIso() };
}

async function saveOffline(payload, errorMessage = null) {
  const offlinePayload = {
    ...payload,
    status: errorMessage ? 'erro' : 'pendente',
    syncStatus: 'pending',
    lastError: errorMessage,
    updatedAt: nowIso(),
  };
  await db[OFFLINE_STORE].put(offlinePayload);
  return offlinePayload;
}

export async function saveLancamentoPerda(form, { companyId, session }) {
  if (!companyId) throw new Error('Empresa não identificada para salvar o lançamento.');
  const payload = buildLancamentoPerdaPayload(form, { companyId, session });
  if (!payload.data) throw new Error('Informe a data.');
  if (!payload.fazendaCodigo) throw new Error('Selecione a fazenda.');
  if (!payload.talhao) throw new Error('Selecione o talhão.');
  if (!payload.frenteServico) throw new Error('Informe a frente de serviço.');
  if (!payload.turno) throw new Error('Informe o turno.');
  if (!payload.frotaEquipamento) throw new Error('Informe a frota do equipamento.');
  if (!payload.matriculaOperador) throw new Error('Informe a matrícula do operador.');

  if (isOnline()) {
    try {
      const saved = await saveToPostgres(payload);
      await db[OFFLINE_STORE].put(saved);
      return { mode: 'online', data: saved };
    } catch (error) {
      const pending = await saveOffline(payload, error?.message || 'Falha ao salvar online.');
      return { mode: 'offline_cache', data: pending };
    }
  }
  const pending = await saveOffline(payload);
  return { mode: 'offline', data: pending };
}

export async function syncPendingLancamentosPerda() {
  if (!isOnline()) return { synced: 0, failed: 0 };
  const pendentes = await db[OFFLINE_STORE].where('syncStatus').equals('pending').toArray();
  let synced = 0;
  let failed = 0;
  for (const item of pendentes) {
    try {
      const saved = await saveToPostgres(item);
      await db[OFFLINE_STORE].put(saved);
      synced += 1;
    } catch (error) {
      await db[OFFLINE_STORE].put({ ...item, status: 'erro', syncStatus: 'pending', lastError: error?.message || 'Erro ao sincronizar.', updatedAt: nowIso() });
      failed += 1;
    }
  }
  return { synced, failed };
}

export async function listLocalLancamentosPerda(companyId, max = 50) {
  if (!companyId) return [];
  const rows = await db[OFFLINE_STORE].where('companyId').equals(companyId).toArray();
  return rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, max);
}
