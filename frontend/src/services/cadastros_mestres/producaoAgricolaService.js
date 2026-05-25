import db from '../localDb.js';
import { v4 as uuidv4 } from 'uuid';
import { listCadastro, saveCadastro, bulkSaveCadastro, inactivateCadastro } from './cadastrosPostgresService.js';

export const getProducoesPaginadas = async (companyId, pageSize = 50, page = 1, searchTerm = '', dtInicialIso = '', dtFinalIso = '') => {
  try {
    const payload = await listCadastro('production', companyId, { limit: pageSize, page, search: searchTerm, dtInicialIso, dtFinalIso });
    return { data: payload.data || [], lastVisible: page + 1, hasMore: (payload.page * payload.limit) < payload.total };
  } catch (error) {
    console.warn('[Produção Agrícola] cache Dexie:', error.message);
    const data = await db.producaoAgricola.where('companyId').equals(companyId).toArray();
    return { data, lastVisible: null, hasMore: false };
  }
};

export const getProducoes = async (companyId) => {
  try {
    const { data } = await listCadastro('production', companyId, { limit: 1000 });
    return data;
  } catch {
    return await db.producaoAgricola.where('companyId').equals(companyId).toArray();
  }
};

export const saveProducao = async (producao, usuarioId, companyId) => {
  const payload = { ...producao, id: producao.id || uuidv4(), companyId, status: producao.status || 'ATIVO', updatedAt: new Date().toISOString(), updatedBy: usuarioId };
  return await saveCadastro('production', payload);
};

export const inactivateProducao = async (id, usuarioId, companyId) => inactivateCadastro('production', id, companyId);

export const saveProducaoEmMassa = async (rows, usuarioId, companyId, onProgress = null) => {
  const payload = rows.map((row, index) => {
    if (onProgress && index % 100 === 0) onProgress(index, rows.length);
    return { ...row, id: row.id || uuidv4(), companyId, status: row.status || 'ATIVO', updatedAt: new Date().toISOString(), updatedBy: usuarioId };
  });
  const result = await bulkSaveCadastro('production', payload, companyId);
  if (onProgress) onProgress(payload.length, payload.length);
  return result;
};

export const subscribeToProducaoAgricolaRealtime = (companyId) => {
  getProducoes(companyId).catch(() => {});
  return () => {};
};
