
// Offline-first imports
import db from "./localDb";
import { enqueueTask } from "./syncService";
import { parseDateSafe } from "../utils/date";
import { postgresReadService, usePostgresReads } from "./postgresReadService";

const COLLECTION_ESTIMATIVAS = "estimativas_safra";
const COLLECTION_HISTORICO = "estimativas_safra_historico";

/**
 * estimativa.js (Offline-First Refactor)
 *
 * O que mudou:
 * Antes os metodos read/write batiam direto no PostgreSQL. Se falhasse (sem internet), o app quebrava.
 * Agora, todos escrevem no banco de dados local (`Dexie`) instantaneamente,
 * e a camada de Sincronização (`syncService`) lida com subir pro PostgreSQL.
 */

export const saveEstimate = async (companyId, safra, talhaoId, estimateData) => {
  try {
    const rodadaKey = estimateData.rodada ? String(estimateData.rodada).replace(/ /g, '_') : 'Estimativa';
    const estimateDocId = `${companyId}_${safra.replace('/', '-')}_${rodadaKey}_${talhaoId}`;

    // 1. OBTENDO VERSÃO LOCAL: tenta pegar o antigo pra incrementar a versão
    let version = 1;
    const localEst = await db.estimativas.get(estimateDocId);
    if (localEst) {
      version = (localEst.version || 0) + 1;
    }

    const isoDate = new Date().toISOString();

    const newEstimateData = {
      id: estimateDocId, // Chave primária do Dexie
      companyId,
      safra,
      talhaoId,
      ...estimateData,
      version,
      syncStatus: 'pending', // Indica que não foi pro backend ainda
      updatedAt: isoDate,
    };

    // 2. SALVAMENTO LOCAL IMEDIATO (Sempre funciona, mesmo num mato sem internet)
    await db.estimativas.put(newEstimateData);

    // Cria um ID determinístico para o histórico para evitar duplicação em caso de retry
    const historyDocId = `${estimateDocId}_v${version}`;

    // Salvamento no histórico local
    await db.historico.add({
        id: historyDocId, // Determinístico
        estimateDocId,
        companyId,
        safra,
        talhaoId,
        rodada: estimateData.rodada || "Estimativa",
        version,
        ...estimateData,
        createdAt: isoDate
    });

    // 3. ENFILEIRAR TAREFAS DE SINCRONIZAÇÃO
    // Registra a intenção de sincronização aguardando confirmação local para evitar perda
    // de dados em cenários extremos (ex: disco cheio).

    await enqueueTask('createOrUpdate', COLLECTION_ESTIMATIVAS, estimateDocId, newEstimateData);
    // Usa 'createOrUpdate' com historyDocId determinístico em vez de 'addHistory' para garantir idempotência.
    await enqueueTask('createOrUpdate', COLLECTION_HISTORICO, historyDocId, {
        estimateDocId,
        companyId,
        safra,
        talhaoId,
        rodada: estimateData.rodada || "Estimativa",
        version,
        ...estimateData
    });

    return { success: true, version };
  } catch (error) {
    console.error("Erro fatal ao salvar estimativa localmente:", error);
    throw error;
  }
};

/**
 * Inscreve-se em atualizações em tempo real (sincronização local) para uma safra/empresa.
 * Sempre que outro dispositivo (ex: o celular) atualizar o PostgreSQL, o sincronização local
 * vai baixar as mudanças, injetar no Dexie e chamar o callback, atualizando o mapa na hora.
 */
export const subscribeToEstimatesRealtime = (companyId, safra, onUpdateCallback) => {
    // PostgreSQL Auth/PostgreSQL foi removido da aplicação.
    // As estimativas agora são carregadas pelo PostgreSQL em getAllEstimates()
    // e mantidas localmente no Dexie para o modo offline.
    // Mantemos esta função apenas para preservar a assinatura usada pelos hooks.
    return () => {};
};

/**
 * Retorna todas as estimativas. Puxa APENAS da Base Local (offline first).
 * Removemos o pull em background do PostgreSQL daqui pois o 'subscribeToEstimatesRealtime'
 * já cuida de manter o Dexie perfeitamente sincronizado. Isso evita sobrecarga (aquecimento)
 * com múltiplas requisições GET em paralelo (looping) quando a UI re-renderiza ou internet volta.
 */
export const getAllEstimates = async (companyId, safra, rodada = null) => {
  try {
    const readLocalEstimates = async () => {
      if (rodada) {
        return db.estimativas
          .where('[companyId+safra+rodada]')
          .equals([companyId, safra, rodada])
          .toArray();
      }

      return db.estimativas
        .where('[companyId+safra]')
        .equals([companyId, safra])
        .toArray();
    };

    if (usePostgresReads && navigator.onLine) {
      try {
        const postgresResult = await postgresReadService.listAllEstimates({
          companyId,
          harvestYear: safra,
          ...(rodada ? { round: rodada } : {}),
          limit: 500,
        });

        const postgresData = postgresResult.data || [];

        if (postgresData.length > 0) {
          await db.estimativas.bulkPut(postgresData);
        }

        // Mantém estimativas criadas offline/pending no navegador, porque elas ainda
        // podem não existir no PostgreSQL até a sincronização/migração incremental.
        const localData = await readLocalEstimates();
        const pendingLocal = localData.filter((item) => item.syncStatus === 'pending');

        const mergedMap = new Map();
        postgresData.forEach((item) => mergedMap.set(item.id, item));
        pendingLocal.forEach((item) => mergedMap.set(item.id, item));

        return {
          success: true,
          source: 'postgres',
          total: postgresResult.total ?? mergedMap.size,
          data: Array.from(mergedMap.values()),
        };
      } catch (postgresError) {
        console.warn('Falha ao carregar estimativas do PostgreSQL. Usando cache local/PostgreSQL.', postgresError);
      }
    }

    const localData = await readLocalEstimates();

    // Retorna imediatamente a cópia local.
    // Qualquer nova estimativa salva por outro dispositivo chegará via sincronização local.
    return { success: true, source: 'local', data: localData };

  } catch (error) {
    console.error("Error getting all estimates:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Puxa os detalhes da estimativa de 1 talhão para abrir no Formulário.
 * Lê do localDb, com uma checagem rápida no PostgreSQL caso nada seja encontrado.
 */
export const getEstimate = async (companyId, safra, talhaoId, rodada = "Estimativa") => {
  try {
    const rodadaKey = String(rodada).replace(/ /g, '_');
    const estimateDocId = `${companyId}_${safra.replace('/', '-')}_${rodadaKey}_${talhaoId}`;

    // Primeiro tenta pelo ID legado usado no Dexie/PostgreSQL antigo.
    const localById = await db.estimativas.get(estimateDocId);
    if (localById) {
        return { success: true, data: localById };
    }

    // Depois tenta pelo índice composto. No PostgreSQL o ID real é outro,
    // então a busca correta precisa ser por empresa + safra + rodada + talhão.
    const localByFields = await db.estimativas
      .where('[companyId+safra+rodada]')
      .equals([companyId, safra, rodada])
      .filter((item) => String(item.talhaoId || '').toUpperCase() === String(talhaoId || '').toUpperCase())
      .first();

    if (localByFields) {
      return { success: true, data: localByFields };
    }

    // Fallback online: busca no PostgreSQL, nunca em serviço legado.
    if (usePostgresReads && navigator.onLine) {
      const postgresResult = await postgresReadService.listAllEstimates({
        companyId,
        harvestYear: safra,
        round: rodada,
        limit: 500,
      });

      const postgresData = postgresResult.data || [];
      if (postgresData.length > 0) {
        await db.estimativas.bulkPut(postgresData);
      }

      const found = postgresData.find((item) =>
        String(item.talhaoId || '').toUpperCase() === String(talhaoId || '').toUpperCase()
      );

      if (found) {
        return { success: true, data: found };
      }
    }

    return { success: true, data: null };
  } catch (error) {
    console.error("Error getting estimate:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Traz o histórico do Talhão. Localmente + PostgreSQL.
 */
export const getEstimateHistory = async (companyId, safra, talhaoId, rodada = null) => {
  try {
    let localHistory = [];
    if (rodada) {
         localHistory = await db.historico
            .where('[companyId+safra+talhaoId+rodada]')
            .equals([companyId, safra, talhaoId, rodada])
            .toArray();
    } else {
        localHistory = await db.historico
            .where('[companyId+safra+talhaoId]')
            .equals([companyId, safra, talhaoId])
            .toArray();
    }

    // Histórico remoto via PostgreSQL removido. A leitura fica no Dexie/PostgreSQL.

    // Reorganiza decrescente
    localHistory.sort((a, b) => b.version - a.version);

    return { success: true, data: localHistory };
  } catch (error) {
    console.error("Error getting estimate history:", error);
    return { success: false, error: error.message };
  }
};
