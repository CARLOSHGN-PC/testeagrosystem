import db from '../localDb.js';
import { v4 as uuidv4 } from 'uuid';
import { listCadastro, saveCadastro, bulkSaveCadastro, inactivateCadastro } from './cadastrosPostgresService.js';

export const getVariedades = async (companyId) => {
  try {
    const { data } = await listCadastro('varieties', companyId, { limit: 1000 });
    return data;
  } catch (error) {
    console.warn('[Variedades] cache Dexie:', error.message);
    return await db.variedades.where('companyId').equals(companyId).toArray();
  }
};

export const saveVariedade = async (variedade, usuarioId, companyId) => {
  const payload = {
    ...variedade,
    id: variedade.id || uuidv4(),
    companyId,
    status: variedade.status || 'ATIVO',
    updatedAt: new Date().toISOString(),
    updatedBy: usuarioId,
  };
  return await saveCadastro('varieties', payload);
};

export const inactivateVariedade = async (id, usuarioId, companyId) => {
  return await inactivateCadastro('varieties', id, companyId);
};

export const saveVariedadesEmMassa = async (variedadesRows, usuarioId, companyId) => {
  const rows = variedadesRows.map((row) => ({
    ...row,
    id: row.id || uuidv4(),
    companyId,
    status: row.status || 'ATIVO',
    updatedAt: new Date().toISOString(),
    updatedBy: usuarioId,
  }));
  return await bulkSaveCadastro('varieties', rows, companyId);
};

export const subscribeToVariedadesRealtime = (companyId) => {
  getVariedades(companyId).catch(() => {});
  return () => {};
};
