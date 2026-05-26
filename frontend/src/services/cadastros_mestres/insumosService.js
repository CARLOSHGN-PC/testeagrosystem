import db from '../localDb.js';
import { v4 as uuidv4 } from 'uuid';
import { listCadastro, saveCadastro, bulkSaveCadastro, inactivateCadastro } from './cadastrosPostgresService.js';

export const getInsumos = async (companyId) => {
  try {
    const { data } = await listCadastro('inputs', companyId, { limit: 1000 });
    return data;
  } catch (error) {
    console.warn('[Insumos] cache Dexie:', error.message);
    return await db.insumos.where('companyId').equals(companyId).toArray();
  }
};

export const saveInsumo = async (insumo, usuarioId, companyId) => {
  const payload = { ...insumo, id: insumo.id || uuidv4(), companyId, status: insumo.status || 'ATIVO', updatedAt: new Date().toISOString(), updatedBy: usuarioId };
  return await saveCadastro('inputs', payload);
};

export const inactivateInsumo = async (id, usuarioId, companyId) => inactivateCadastro('inputs', id, companyId);

export const saveInsumosEmMassa = async (insumosRows, usuarioId, companyId, onProgress = null) => {
  const rows = insumosRows.map((row, index) => {
    if (onProgress && index % 100 === 0) onProgress(index, insumosRows.length);
    return { ...row, id: row.id || uuidv4(), companyId, status: row.status || 'ATIVO', updatedAt: new Date().toISOString(), updatedBy: usuarioId };
  });
  const result = await bulkSaveCadastro('inputs', rows, companyId);
  if (onProgress) onProgress(rows.length, rows.length);
  return result;
};

export const subscribeToInsumosRealtime = (companyId) => {
  getInsumos(companyId).catch(() => {});
  return () => {};
};
