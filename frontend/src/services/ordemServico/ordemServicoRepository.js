import db from '../localDb';
import { enqueueTask } from '../syncService';
import { ORDEM_SERVICO_COLECOES } from './ordemServicoConstants';
import { postgresReadService, usePostgresReads } from '../postgresReadService';

/**
 * ordemServicoRepository.js
 *
 * Camada de persistência para as Ordens de Serviço (Tratos Culturais).
 * Realiza as operações no Dexie (local) e agenda o Sync para o PostgreSQL.
 */

export const saveOrdemServico = async (ordemMestre, talhoesVinculos) => {
    // 1. Salva a Ordem Mestre (Cabeçalho)
    await db.ordensServico.put(ordemMestre);
    await enqueueTask('createOrUpdate', ORDEM_SERVICO_COLECOES.MESTRE, ordemMestre.id, ordemMestre);

    // 2. Salva os Vínculos Individuais (Talhões da Ordem)
    for (const vinculo of talhoesVinculos) {
        await db.ordensServicoTalhoes.put(vinculo);
        await enqueueTask('createOrUpdate', ORDEM_SERVICO_COLECOES.VINCULO, vinculo.id, vinculo);
    }

    return ordemMestre;
};

export const updateOrdemServico = async (ordemServicoId, novosDados) => {
    const updatedAt = new Date().toISOString();
    const payload = { ...novosDados, updatedAt, syncStatus: 'pending' };

    await db.ordensServico.update(ordemServicoId, payload);

    // Recupera o objeto completo para enviar ao Sync
    const ordemBase = await db.ordensServico.get(ordemServicoId);
    if (ordemBase) {
        await enqueueTask('createOrUpdate', ORDEM_SERVICO_COLECOES.MESTRE, ordemServicoId, ordemBase);

        // Se mudou o status, também é interessante replicar para os vínculos dessa ordem.
        const vinculosDaOrdem = await db.ordensServicoTalhoes
            .where('ordemServicoId')
            .equals(ordemServicoId)
            .toArray();

        for (const v of vinculosDaOrdem) {
            const vinculoPayload = {
                 ...v,
                 status: ordemBase.status,
                 updatedAt,
                 syncStatus: 'pending'
            };
            await db.ordensServicoTalhoes.update(v.id, vinculoPayload);
            await enqueueTask('createOrUpdate', ORDEM_SERVICO_COLECOES.VINCULO, v.id, vinculoPayload);
        }
    }
};

export const getVinculosDaSafra = async (companyId, safra) => {
    return await db.ordensServicoTalhoes
        .where('[companyId+safra]')
        .equals([companyId, safra])
        .toArray();
};

/**
 * Sincroniza Ordens de Serviço do PostgreSQL para o Dexie.
 * Mantém mapa/painéis no formato legado: ordensServico + ordensServicoTalhoes.
 */
export const syncOrdensServicoFromPostgres = async (companyId, safra, onUpdateCallback) => {
    if (!companyId || !safra || !usePostgresReads || !navigator.onLine) return;

    try {
        const result = await postgresReadService.listAllServiceOrdersWithLinks({
            companyId,
            limit: 500,
        });

        const pairs = result.data || [];
        const ordens = [];
        const vinculos = [];

        for (const pair of pairs) {
            if (!pair?.ordem) continue;
            if (String(pair.ordem.safra || '') !== String(safra || '')) continue;

            const ordemNormalizada = {
                ...pair.ordem,
                companyId,
                safra,
            };

            const vinculosNormalizados = (pair.vinculos || []).map((v) => ({
                ...v,
                companyId,
                safra,
            }));

            ordens.push(ordemNormalizada);
            vinculos.push(...vinculosNormalizados);
        }

        const [ordensLocais, vinculosLocais] = await Promise.all([
            db.ordensServico.where('[companyId+safra]').equals([companyId, safra]).toArray(),
            db.ordensServicoTalhoes.where('[companyId+safra]').equals([companyId, safra]).toArray(),
        ]);

        const ordensProtegidas = new Map(
            ordensLocais
                .filter((item) => ['pending', 'syncing'].includes(item?.syncStatus))
                .map((item) => [item.id, item])
        );
        const vinculosProtegidos = new Map(
            vinculosLocais
                .filter((item) => ['pending', 'syncing'].includes(item?.syncStatus))
                .map((item) => [item.id, item])
        );

        if (ordens.length > 0) await db.ordensServico.bulkPut(ordens.map((item) => ordensProtegidas.get(item.id) || item));
        if (vinculos.length > 0) await db.ordensServicoTalhoes.bulkPut(vinculos.map((item) => vinculosProtegidos.get(item.id) || item));

        console.info('[OrdemServico] PostgreSQL sincronizado para mapa:', {
            companyId,
            safra,
            ordens: ordens.length,
            vinculos: vinculos.length,
        });

        if (onUpdateCallback) onUpdateCallback({ ordens: ordens.length, vinculos: vinculos.length });
    } catch (error) {
        console.warn('[OrdemServico] Falha ao sincronizar PostgreSQL:', error);
    }
};

/**
 * Compatibilidade com chamadas antigas: agora não assina PostgreSQL.
 * Faz uma sincronização única via PostgreSQL e retorna unsubscribe vazio.
 */
const startOrdensServicoRefreshLoop = (companyId, safra, onUpdateCallback) => {
    let stopped = false;
    let running = false;

    const run = async () => {
        if (stopped || running || !navigator.onLine) return;
        running = true;
        try {
            await syncOrdensServicoFromPostgres(companyId, safra, onUpdateCallback);
        } finally {
            running = false;
        }
    };

    run();
    const intervalId = window.setInterval(run, 5000);
    const onlineHandler = () => run();
    window.addEventListener('online', onlineHandler);

    return () => {
        stopped = true;
        window.clearInterval(intervalId);
        window.removeEventListener('online', onlineHandler);
    };
};

export const subscribeToOrdensServicoRealtime = (companyId, safra, onUpdateCallback) => {
    return startOrdensServicoRefreshLoop(companyId, safra, onUpdateCallback);
};

/**
 * Compatibilidade com chamadas antigas: os vínculos já vêm junto das ordens.
 */
export const subscribeToVinculosServicoRealtime = (companyId, safra, onUpdateCallback) => {
    return startOrdensServicoRefreshLoop(companyId, safra, onUpdateCallback);
};
