import db from './localDb';
import { enqueueTask } from './syncService';
import { apiRequest } from './apiClient';

const emitPlanejamentoUpdated = (detail = {}) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('local-db-updated', {
      detail: { module: 'planejamento_safra', ...detail }
    }));
  }
};

const sanitizePostgreSQLIdPart = (value) => {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\/]+/g, '-')
    .trim();
};

const buildPlanejamentoId = (companyId, safra, talhaoId) => {
  return [companyId, safra, talhaoId]
    .map(sanitizePostgreSQLIdPart)
    .join('_');
};

export const previewPlanejamentoServer = async (payload) => {
  const response = await apiRequest('/api/planejamento-safra/preview', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data;
};

export const savePlanejamentoServer = async (payload) => {
  const response = await apiRequest('/api/planejamento-safra/save', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  const savedItems = Array.isArray(response?.data?.savedItems) ? response.data.savedItems : [];
  if (savedItems.length) {
    await db.transaction('rw', db.planejamentoSafra, async () => {
      await db.planejamentoSafra.bulkPut(savedItems.map((item) => ({
        ...item,
        id: item.id || buildPlanejamentoId(item.companyId, item.safra, item.talhaoId),
        syncStatus: 'synced'
      })));
    });
    emitPlanejamentoUpdated({ action: 'bulk-upsert', count: savedItems.length });
  }

  return response.data;
};

export const addTalhaoToPlanejamento = async (payload) => {
  const item = {
    ...payload,
    id: payload.id || buildPlanejamentoId(payload.companyId, payload.safra, payload.talhaoId),
    updatedAt: new Date().toISOString(),
    syncStatus: 'pending'
  };
  await db.planejamentoSafra.put(item);
  emitPlanejamentoUpdated({ action: 'upsert', id: item.id, talhaoId: item.talhaoId });
  await enqueueTask('createOrUpdate', 'planejamento_safra', item.id, item);
  return item;
};

export const updatePlanejamento = async (id, newPayload) => {
  const item = await db.planejamentoSafra.get(id);
  if (!item) throw new Error('Planejamento não encontrado.');
  Object.assign(item, newPayload, { updatedAt: new Date().toISOString(), syncStatus: 'pending' });
  await db.planejamentoSafra.put(item);
  emitPlanejamentoUpdated({ action: 'upsert', id: item.id, talhaoId: item.talhaoId });
  await enqueueTask('createOrUpdate', 'planejamento_safra', item.id, item);
  return item;
};

export const removePlanejamento = async (id) => {
  const item = await db.planejamentoSafra.get(id);
  if (!item) return;

  await db.planejamentoSafra.delete(id);
  emitPlanejamentoUpdated({ action: 'remove', id: item.id, talhaoId: item.talhaoId });

  item.statusPlanejamento = 'inativo';
  item.syncStatus = 'pending';
  await enqueueTask('createOrUpdate', 'planejamento_safra', item.id, item);
};
