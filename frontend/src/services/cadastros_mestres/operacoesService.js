import db from '../localDb.js';
import { v4 as uuidv4 } from 'uuid';
import { listCadastro, saveCadastro, bulkSaveCadastro, inactivateCadastro } from './cadastrosPostgresService.js';

export const getOperacoes = async (companyId) => {
  try {
    const { data } = await listCadastro('operations', companyId, { limit: 1000 });
    return data;
  } catch (error) {
    console.warn('[Operações] cache Dexie:', error.message);
    return await db.operacoes.where('companyId').equals(companyId).toArray();
  }
};

export const saveOperacao = async (operacao, usuarioId, companyId) => {
  const payload = { ...operacao, id: operacao.id || uuidv4(), companyId, status: operacao.status || 'ATIVO', updatedAt: new Date().toISOString(), updatedBy: usuarioId };
  return await saveCadastro('operations', payload);
};

export const inactivateOperacao = async (id, usuarioId, companyId) => inactivateCadastro('operations', id, companyId);

export const saveOperacoesEmMassa = async (operacoesRows, usuarioId, companyId) => {
  const rows = operacoesRows.map((row) => ({ ...row, id: row.id || uuidv4(), companyId, status: row.status || 'ATIVO', updatedAt: new Date().toISOString(), updatedBy: usuarioId }));
  return await bulkSaveCadastro('operations', rows, companyId);
};

export const subscribeToOperacoesRealtime = (companyId) => {
  getOperacoes(companyId).catch(() => {});
  return () => {};
};
