import { v4 as uuidv4 } from 'uuid';
import db from '../localDb';
import { apiRequest } from '../apiClient';
import { isOnline, toNumber, loadFazendas, loadTalhoesByFazenda } from './infestacaoBrocaService';

const OFFLINE_STORE = 'lancamentosComplexoMurcha';

export { isOnline, toNumber, loadFazendas, loadTalhoesByFazenda };

function nowIso() { return new Date().toISOString(); }
function cleanText(value) { return String(value ?? '').trim(); }

export function calculateComplexoMurcha(form = {}) {
  // Nº de Colmos 3m é informativo/base de vistoria e NÃO entra na soma nem trava o cálculo da doença.
  // Como a avaliação é feita em base 100, a % de murcha é o próprio total das ocorrências.
  const totalComplexo = ['cigarrinha', 'colletotrichum', 'plectocyta', 'estria']
    .reduce((sum, key) => sum + toNumber(form[key]), 0);
  return {
    totalComplexo: Math.round(totalComplexo),
    percentualMurcha: Math.round(totalComplexo),
  };
}

export function buildComplexoMurchaPayload(form, { companyId, session }) {
  const id = form.id || uuidv4();
  const totals = calculateComplexoMurcha(form);
  return {
    id,
    uuidLocal: form.uuidLocal || id,
    companyId,
    dataAvaliacao: cleanText(form.dataAvaliacao),
    fazendaCodigo: cleanText(form.fazendaCodigo),
    fazendaNome: cleanText(form.fazendaNome),
    talhao: cleanText(form.talhao),
    talhaoId: cleanText(form.talhaoId || `${form.fazendaCodigo}_${form.talhao}`),
    variedade: cleanText(form.variedade),
    cigarrinha: toNumber(form.cigarrinha),
    colletotrichum: toNumber(form.colletotrichum),
    plectocyta: toNumber(form.plectocyta),
    estria: toNumber(form.estria),
    numeroColmos3m: toNumber(form.numeroColmos3m),
    totalComplexo: totals.totalComplexo,
    percentualMurcha: totals.percentualMurcha,
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
      targetCollection: 'lancamentos_complexo_murcha',
      documentId: payload.id,
      payload,
    }),
  });
  return { ...payload, ...(result.data || {}), status: 'sincronizado', syncStatus: 'synced', syncedAt: nowIso(), updatedAt: nowIso() };
}

async function saveOffline(payload, errorMessage = null) {
  const offlinePayload = { ...payload, status: errorMessage ? 'erro' : 'pendente', syncStatus: 'pending', lastError: errorMessage, updatedAt: nowIso() };
  await db[OFFLINE_STORE].put(offlinePayload);
  return offlinePayload;
}

export async function saveComplexoMurcha(form, { companyId, session }) {
  if (!companyId) throw new Error('Empresa não identificada para salvar o lançamento.');
  const payload = buildComplexoMurchaPayload(form, { companyId, session });
  if (!payload.dataAvaliacao) throw new Error('Informe a data da avaliação.');
  if (!payload.fazendaCodigo) throw new Error('Selecione a fazenda.');
  if (!payload.talhao) throw new Error('Selecione o talhão.');
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

export async function syncPendingComplexoMurcha() {
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

export async function listLocalComplexoMurcha(companyId, max = 50) {
  if (!companyId) return [];
  const rows = await db[OFFLINE_STORE].where('companyId').equals(companyId).toArray();
  return rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, max);
}
