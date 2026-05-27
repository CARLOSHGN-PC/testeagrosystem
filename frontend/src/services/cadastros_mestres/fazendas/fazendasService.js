import db from '../../../services/localDb.js';
import { v4 as uuidv4 } from 'uuid';
import { listCadastro, saveCadastro, bulkSaveCadastro } from '../cadastrosPostgresService.js';

export const getFazendas = async (companyId) => {
  try {
    const { data } = await listCadastro('farms', companyId, { limit: 1000 });
    return data;
  } catch (error) {
    console.warn('[Fazendas] cache Dexie:', error.message);
    return await db.fazendas.where('companyId').equals(companyId).toArray();
  }
};

export const getTalhoesPorFazenda = async (companyId, fazendaId) => {
  try {
    const payload = await listCadastro('fields', companyId, { limit: 1000, farmId: fazendaId });
    const data = payload.data || [];
    if (data.length) return data;
  } catch (error) {
    console.warn('[Talhões] cache Dexie:', error.message);
  }
  return await db.talhoes.where('[companyId+fazendaId]').equals([companyId, fazendaId]).toArray();
};

export const saveFazendaAndTalhoes = async (fazendaData, talhoesDataArray, usuarioId, companyId) => {
  const codFazBase = String(fazendaData.COD_FAZ || fazendaData.codFaz || fazendaData.codigo || fazendaData.code || '').trim();
  const fazendaId = codFazBase || fazendaData.id || uuidv4();
  const payloadFazenda = {
    ...fazendaData,
    id: fazendaId,
    companyId,
    codFaz: codFazBase,
    desFazenda: fazendaData.DES_FAZENDA || fazendaData.desFazenda || fazendaData.nome || fazendaData.name,
    status: fazendaData.status || 'ATIVO',
    syncStatus: 'synced',
    updatedAt: new Date().toISOString(),
    updatedBy: usuarioId,
  };

  const savedFarm = await saveCadastro('farms', payloadFazenda);

  const rows = talhoesDataArray.map((t) => {
    const talhao = String(t.TALHAO || t.talhao || t.talhaoNome || t.code || '').trim();
    const rowId = t.id || `${companyId}_${codFazBase}_${talhao}`;
    return {
      ...t,
      id: rowId,
      companyId,
      COD_FAZ: t.COD_FAZ || codFazBase,
      DES_FAZENDA: t.DES_FAZENDA || fazendaData.DES_FAZENDA || fazendaData.desFazenda,
      fazendaId: savedFarm.postgresId || savedFarm.id || fazendaId,
      farmId: savedFarm.postgresId || savedFarm.id || fazendaId,
      talhao,
      TALHAO: t.TALHAO || talhao,
      status: t.status || 'ATIVO',
      syncStatus: 'synced',
      updatedAt: new Date().toISOString(),
      updatedBy: usuarioId,
    };
  });

  if (rows.length) await bulkSaveCadastro('fields', rows, companyId);

  return savedFarm;
};


export const replaceFazendasAndTalhoes = async (rows, usuarioId, companyId) => {
  const payloadRows = rows.map((row) => {
    const codFaz = String(row.COD_FAZ || row.codFaz || row.codigo || row.code || '').trim();
    const talhao = String(row.TALHAO || row.talhao || row.talhaoNome || '').trim();
    return {
      ...row,
      id: `${companyId}_${codFaz}_${talhao}`,
      companyId,
      codFaz,
      COD_FAZ: codFaz,
      DES_FAZENDA: row.DES_FAZENDA || row.desFazenda || row.nome || row.name || codFaz,
      talhao,
      TALHAO: talhao,
      status: row.status || 'ATIVO',
      syncStatus: 'synced',
      updatedAt: new Date().toISOString(),
      updatedBy: usuarioId,
    };
  });

  const result = await bulkSaveCadastro('fields', payloadRows, companyId, { mode: 'replace' });
  await db.fazendas.where('companyId').equals(companyId).delete().catch(() => {});
  await db.talhoes.where('companyId').equals(companyId).delete().catch(() => {});
  await listCadastro('farms', companyId, { limit: 1000 }).catch(() => {});
  await listCadastro('fields', companyId, { limit: 1000 }).catch(() => {});
  return result;
};

export const updateTalhao = async (companyId, fazendaId, talhaoId, updatedData, usuarioId) => {
  const payload = {
    ...updatedData,
    id: talhaoId,
    companyId,
    fazendaId,
    updatedAt: new Date().toISOString(),
    updatedBy: usuarioId,
  };
  const saved = await saveCadastro('fields', payload);
  await db.talhoes.put(saved).catch(() => {});
  return saved;
};

export const subscribeToFazendasRealtime = (companyId) => {
  getFazendas(companyId).catch(() => {});
  return () => {};
};

export const subscribeToTalhoesRealtime = (companyId) => {
  listCadastro('fields', companyId, { limit: 1000 }).catch(() => {});
  return () => {};
};
