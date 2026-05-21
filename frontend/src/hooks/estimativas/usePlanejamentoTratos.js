import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../services/localDb';
import { postgresReadService, usePostgresReads } from '../../services/postgresReadService';

let lastSyncKey = '';
let lastSyncAt = 0;

async function syncPlanejamentoTratosFromPostgres(companyId, safra) {
  if (!usePostgresReads || !companyId || !safra) return;

  const key = `${companyId}::${safra}`;
  const now = Date.now();

  // Evita chamada repetida do LiveQuery durante o mesmo ciclo de render.
  if (lastSyncKey === key && now - lastSyncAt < 15000) return;
  lastSyncKey = key;
  lastSyncAt = now;

  try {
    const result = await postgresReadService.listAllPlanningTreatments({
      companyId,
      harvestYear: safra,
      limit: 500,
    });

    const pairs = Array.isArray(result?.data) ? result.data : [];
    if (!pairs.length) return;

    const mestres = [];
    const vinculos = [];

    for (const pair of pairs) {
      if (pair?.mestre) mestres.push(pair.mestre);
      if (Array.isArray(pair?.vinculos)) vinculos.push(...pair.vinculos);
    }

    await db.transaction('rw', db.planejamentoTratos, db.planejamentoTratosTalhoes, async () => {
      if (mestres.length) await db.planejamentoTratos.bulkPut(mestres);
      if (vinculos.length) await db.planejamentoTratosTalhoes.bulkPut(vinculos);
    });
  } catch (error) {
    console.warn('[planejamentoTratos] cache Dexie após falha PostgreSQL:', error?.message || error);
  }
}

export const usePlanejamentoTratos = (companyId, safra) => {
  const vinculosSafra = useLiveQuery(
    async () => {
      if (!companyId || !safra) return [];

      await syncPlanejamentoTratosFromPostgres(companyId, safra);

      return db.planejamentoTratosTalhoes
        .where('[companyId+safra]')
        .equals([companyId, safra])
        .toArray();
    },
    [companyId, safra]
  );

  const planejamentosSafra = useLiveQuery(
    async () => {
      if (!companyId || !safra) return [];
      return db.planejamentoTratos
        .where('[companyId+safra]')
        .equals([companyId, safra])
        .toArray();
    },
    [companyId, safra, vinculosSafra?.length]
  );

  return {
    vinculosSafra: vinculosSafra || [],
    planejamentosSafra: planejamentosSafra || [],
    isLoading: vinculosSafra === undefined || planejamentosSafra === undefined
  };
};
