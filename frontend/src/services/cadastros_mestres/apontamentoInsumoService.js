import db from '../localDb.js';
import { listCadastro, inactivateCadastro } from './cadastrosPostgresService.js';

export const getApontamentosPaginados = async (companyId, pageSize = 50, page = 1, searchTerm = '', dtInicialIso = '', dtFinalIso = '') => {
  try {
    const payload = await listCadastro('input-applications', companyId, { limit: pageSize, page, search: searchTerm, dtInicialIso, dtFinalIso });
    return { data: payload.data || [], lastVisible: page + 1, hasMore: (payload.page * payload.limit) < payload.total };
  } catch (error) {
    console.warn('[Apontamentos Insumo] cache Dexie:', error.message);
    const data = await db.apontamentosInsumo.where('companyId').equals(companyId).toArray();
    return { data, lastVisible: null, hasMore: false };
  }
};

export const getApontamentosInsumo = async (companyId) => {
  try {
    const { data } = await listCadastro('input-applications', companyId, { limit: 1000 });
    return data;
  } catch {
    return await db.apontamentosInsumo.where('companyId').equals(companyId).toArray();
  }
};

export const inactivateApontamentoInsumo = async (id, usuarioId, companyId) => inactivateCadastro('input-applications', id, companyId);

export const subscribeToApontamentosInsumoRealtime = (companyId) => {
  getApontamentosInsumo(companyId).catch(() => {});
  return () => {};
};
