import db from '../localDb';
import { enqueueTask } from '../syncService';
import { ORDEM_CORTE_STATUS, ORDEM_CORTE_COLECOES } from './ordemCorteConstants';
import { postgresReadService, usePostgresReads } from '../postgresReadService';
import { updateOrdemCortePostgres, fecharTalhoesOrdemCortePostgres, createOrUpdateOrdemCortePostgres } from './ordemCorteAdminApi';
import { subscribeMapRealtime } from '../mapRealtimeClient';
import { getAccessToken, getRefreshToken } from '../postgresAuthService';

/**
 * ordemCorteRepository.js
 *
 * O que este bloco faz:
 * É a camada de persistência especializada em Ordens de Corte.
 * Realiza as transações puras no banco de dados local (Dexie) e agenda o
 * sincronizador para enviar as transações via PostgreSQL (`enqueueTask`).
 *
 * Por que ele existe:
 * Evitar misturar lógica de UI (react hook/service orquestrador) com "como se
 * salva e lê dados", blindando o negócio caso as chaves ou tabelas mudem.
 */

export const getNextSequencialPorSafra = async (companyId, safra) => {
    // Puxa as ordens da safra. Como precisamos do maior sequencial, faremos uma leitura total.
    const ordens = await db.ordensCorte
        .where('[companyId+safra]')
        .equals([companyId, safra])
        .toArray();

    if (!ordens || ordens.length === 0) return 1;

    // Encontra o max das ordens lidas.
    const maxSeq = Math.max(...ordens.map(o => o.sequencial || 0));
    return maxSeq + 1;
};

export const saveOrdemCorteAndVinculos = async (ordemPayload, vinculosPayload) => {
    // 1. Grava no Dexie
    await db.ordensCorte.put(ordemPayload);
    await db.ordensCorteTalhoes.bulkPut(vinculosPayload);

    // 2. Enfileira o cabeçalho no PostgreSQL
    await enqueueTask('createOrUpdate', ORDEM_CORTE_COLECOES.MESTRE, ordemPayload.id, ordemPayload);

    // 3. Enfileira cada vínculo no PostgreSQL
    for (const v of vinculosPayload) {
        await enqueueTask('createOrUpdate', ORDEM_CORTE_COLECOES.VINCULO, v.id, v);
    }
};

export const saveOrdemCorteOnlineFirst = async (ordemPayload, vinculosPayload) => {
    if (navigator.onLine) {
        return await createOrUpdateOrdemCortePostgres({ ordem: ordemPayload, vinculos: vinculosPayload });
    }

    await saveOrdemCorteAndVinculos(ordemPayload, vinculosPayload);
    return { success: true, source: 'offline-cache', data: { ordem: ordemPayload, vinculos: vinculosPayload } };
};

export const updateOrdemCorte = async (ordemCorteId, novosDados) => {
    const updatedAt = new Date().toISOString();

    if (navigator.onLine) {
        try {
            const result = await updateOrdemCortePostgres(ordemCorteId, novosDados);
            const ordemPostgres = result?.data;

            const ordemLocalAtual = await db.ordensCorte.get(ordemCorteId);
            const ordemAtualizada = {
                ...(ordemLocalAtual || {}),
                ...(ordemPostgres || {}),
                ...novosDados,
                updatedAt: ordemPostgres?.updatedAt || updatedAt,
                syncStatus: 'synced'
            };

            await db.ordensCorte.put(ordemAtualizada);

            const vinculosDaOrdem = await db.ordensCorteTalhoes
                .where('ordemCorteId')
                .equals(ordemCorteId)
                .toArray();

            for (const v of vinculosDaOrdem) {
                const vinculoPayload = {
                    ...v,
                    ...(Object.prototype.hasOwnProperty.call(novosDados, 'status') ? { status: novosDados.status } : {}),
                    ...(Object.prototype.hasOwnProperty.call(novosDados, 'numeroEmpresa') ? { numeroEmpresa: novosDados.numeroEmpresa } : {}),
                    updatedAt,
                    syncStatus: 'synced'
                };
                await db.ordensCorteTalhoes.update(v.id, vinculoPayload);
            }
            return ordemAtualizada;
        } catch (error) {
            console.warn('[OrdemCorte] Falha na API PostgreSQL, usando fila offline:', error);
        }
    }

    const payload = { ...novosDados, updatedAt, syncStatus: 'pending' };
    await db.ordensCorte.update(ordemCorteId, payload);

    const ordemBase = await db.ordensCorte.get(ordemCorteId);
    if (ordemBase) {
        await enqueueTask('createOrUpdate', ORDEM_CORTE_COLECOES.MESTRE, ordemCorteId, ordemBase);

        const vinculosDaOrdem = await db.ordensCorteTalhoes
            .where('ordemCorteId')
            .equals(ordemCorteId)
            .toArray();

        for (const v of vinculosDaOrdem) {
            const vinculoPayload = {
                 ...v,
                 status: ordemBase.status,
                 numeroEmpresa: ordemBase.numeroEmpresa,
                 updatedAt,
                 syncStatus: 'pending'
            };
            await db.ordensCorteTalhoes.update(v.id, vinculoPayload);
            await enqueueTask('createOrUpdate', ORDEM_CORTE_COLECOES.VINCULO, v.id, vinculoPayload);
        }
    }
    return ordemBase;
};

export const fecharOrdemCorte = async (ordemCorteId, talhoesSelecionadosIds, usuario) => {
    const closedAt = new Date().toISOString();

    const todosVinculosDaOrdem = await db.ordensCorteTalhoes
        .where('ordemCorteId')
        .equals(ordemCorteId)
        .toArray();

    const idsSelecionados = (talhoesSelecionadosIds || []).map((id) => String(id ?? '').trim()).filter(Boolean);
    const vinculosParaFechar = todosVinculosDaOrdem.filter((v) => idsSelecionados.includes(String(v.talhaoId ?? '').trim()));

    if (vinculosParaFechar.length === 0) {
        return { success: false, source: 'local', message: 'Nenhum vínculo encontrado para fechar.' };
    }

    /**
     * Correção principal do mapa:
     * antes o modo online esperava a API responder para só depois pintar o talhão no Dexie.
     * Em produção isso dava sensação de travamento e obrigava o usuário a atualizar a página.
     * Agora a tela muda primeiro no IndexedDB/useLiveQuery; a API confirma depois.
     */
    for (const v of vinculosParaFechar) {
        await db.ordensCorteTalhoes.update(v.id, {
            status: ORDEM_CORTE_STATUS.FINALIZADA,
            closedAt,
            updatedAt: closedAt,
            syncStatus: navigator.onLine ? 'syncing' : 'pending',
        });
    }

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('local-db-updated', {
            detail: {
                module: ORDEM_CORTE_COLECOES.VINCULO,
                ordemCorteId,
                talhoesIds: idsSelecionados,
                source: 'optimistic-close',
            }
        }));
    }

    const fecharMestreSeCompleto = async (syncStatus = 'pending', dadosExtras = {}) => {
        const vinculosPosUpdate = await db.ordensCorteTalhoes
            .where('ordemCorteId')
            .equals(ordemCorteId)
            .toArray();

        const restantesAbertos = vinculosPosUpdate.filter(v => v.status === ORDEM_CORTE_STATUS.ABERTA);
        if (restantesAbertos.length > 0) return null;

        const novosDadosMestre = {
            status: ORDEM_CORTE_STATUS.FINALIZADA,
            closedAt: dadosExtras.closedAt || closedAt,
            closedBy: dadosExtras.closedBy || usuario || 'Sistema',
            updatedAt: dadosExtras.updatedAt || dadosExtras.closedAt || closedAt,
            syncStatus,
        };

        await db.ordensCorte.update(ordemCorteId, novosDadosMestre);
        return await db.ordensCorte.get(ordemCorteId);
    };

    const ordemMestreLocal = await fecharMestreSeCompleto(navigator.onLine ? 'syncing' : 'pending');

    if (navigator.onLine) {
        try {
            const result = await fecharTalhoesOrdemCortePostgres(ordemCorteId, idsSelecionados);
            const data = result?.data || {};
            const vinculosPostgres = Array.isArray(data.vinculos) ? data.vinculos : [];
            const ordemPostgres = data.ordem || null;

            if (vinculosPostgres.length) {
                await db.ordensCorteTalhoes.bulkPut(vinculosPostgres.map((v) => ({
                    ...v,
                    companyId: v.companyId || ordemPostgres?.companyId,
                    safra: v.safra || ordemPostgres?.safra,
                    ordemCorteId: v.ordemCorteId || ordemCorteId,
                    syncStatus: 'synced',
                })));
            } else {
                for (const v of vinculosParaFechar) {
                    await db.ordensCorteTalhoes.update(v.id, {
                        status: ORDEM_CORTE_STATUS.FINALIZADA,
                        closedAt: data.closedAt || closedAt,
                        updatedAt: data.closedAt || closedAt,
                        syncStatus: 'synced',
                    });
                }
            }

            if (ordemPostgres) {
                await db.ordensCorte.put({
                    ...(await db.ordensCorte.get(ordemCorteId) || {}),
                    ...ordemPostgres,
                    syncStatus: 'synced',
                });
            } else if (data.masterClosed) {
                await db.ordensCorte.update(ordemCorteId, {
                    status: ORDEM_CORTE_STATUS.FINALIZADA,
                    closedAt: data.closedAt || closedAt,
                    closedBy: data.closedBy || usuario || 'Sistema',
                    updatedAt: data.closedAt || closedAt,
                    syncStatus: 'synced',
                });
            } else if (ordemMestreLocal) {
                await db.ordensCorte.update(ordemCorteId, { syncStatus: 'synced' });
            }

            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('local-db-updated', {
                    detail: { module: ORDEM_CORTE_COLECOES.VINCULO, ordemCorteId, source: 'postgres-close-confirmed' }
                }));
            }

            return { success: true, source: 'postgres', ...data };
        } catch (error) {
            console.warn('[OrdemCorte] Falha ao fechar direto no PostgreSQL. Mantendo visual fechado e enviando para fila offline:', error);
        }
    }

    for (const v of vinculosParaFechar) {
        const payloadAtualizado = {
            ...v,
            status: ORDEM_CORTE_STATUS.FINALIZADA,
            closedAt,
            updatedAt: closedAt,
            syncStatus: 'pending'
        };
        await db.ordensCorteTalhoes.put(payloadAtualizado);
        await enqueueTask('createOrUpdate', ORDEM_CORTE_COLECOES.VINCULO, v.id, payloadAtualizado, { forceQueue: true });
    }

    const ordemBase = await fecharMestreSeCompleto('pending');
    if (ordemBase) {
        await enqueueTask('createOrUpdate', ORDEM_CORTE_COLECOES.MESTRE, ordemCorteId, ordemBase, { forceQueue: true });
    }

    return { success: true, source: navigator.onLine ? 'queue-fallback' : 'offline' };
};

export const getVinculosDaSafra = async (companyId, safra) => {
    return await db.ordensCorteTalhoes
        .where('[companyId+safra]')
        .equals([companyId, safra])
        .toArray();
};

/**
 * Sincroniza Ordens de Corte do PostgreSQL para o Dexie.
 * Mantém o mapa/painéis funcionando no mesmo formato legado, mas sem listener PostgreSQL.
 */
export const syncOrdensCorteFromPostgres = async (companyId, safra, onUpdateCallback) => {
    if (!companyId || !safra || !usePostgresReads || !navigator.onLine) return;

    try {
        let ordens = [];
        let vinculos = [];

        try {
            // Caminho novo: backend entrega o estado da camada pronto e cacheado.
            // Só chama API protegida quando existe token; sem token, usa fallback local/paginado
            // para não gerar 401 em loop ao abrir o mapa.
            if (!(getAccessToken() || getRefreshToken())) {
                throw new Error('Sessão PostgreSQL ainda não hidratada. Usando fallback Dexie/paginado.');
            }
            const stateResult = await postgresReadService.listMapCutOrderState({ companyId, safra });
            const state = stateResult?.data?.[0] || {};
            ordens = (state.ordens || []).map((item) => ({ ...item, companyId, safra }));
            vinculos = (state.vinculos || []).map((item) => ({ ...item, companyId, safra }));
        } catch (stateError) {
            console.warn('[OrdemCorte] Estado cacheado do mapa indisponível, usando fallback paginado:', stateError);
            const result = await postgresReadService.listAllCutOrdersWithLinks({
                companyId,
                limit: 500,
            });

            const pairs = result.data || [];
            for (const pair of pairs) {
                if (!pair?.ordem) continue;
                if (String(pair.ordem.safra || '') !== String(safra || '')) continue;
                const ordemNormalizada = { ...pair.ordem, companyId, safra };
                const vinculosNormalizados = (pair.vinculos || []).map((v) => ({ ...v, companyId, safra }));
                ordens.push(ordemNormalizada);
                vinculos.push(...vinculosNormalizados);
            }
        }

        // Atualização segura para offline/realtime:
        // não apagamos registros locais pendentes/syncing, pois isso fazia o mapa perder
        // fechamentos feitos offline ou ainda não confirmados pelo PostgreSQL.
        const [ordensLocais, vinculosLocais] = await Promise.all([
            db.ordensCorte.where('[companyId+safra]').equals([companyId, safra]).toArray(),
            db.ordensCorteTalhoes.where('[companyId+safra]').equals([companyId, safra]).toArray(),
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

        if (ordens.length > 0) {
            await db.ordensCorte.bulkPut(ordens.map((item) => ordensProtegidas.get(item.id) || item));
        }

        if (vinculos.length > 0) {
            await db.ordensCorteTalhoes.bulkPut(vinculos.map((item) => vinculosProtegidos.get(item.id) || item));
        }

        console.info('[OrdemCorte] PostgreSQL sincronizado para mapa:', { companyId, safra, ordens: ordens.length, vinculos: vinculos.length });

        if (onUpdateCallback) onUpdateCallback({ ordens: ordens.length, vinculos: vinculos.length });
    } catch (error) {
        console.warn('[OrdemCorte] Falha ao sincronizar PostgreSQL:', error);
    }
};

/**
 * Compatibilidade com chamadas antigas: agora não assina PostgreSQL.
 * Faz uma sincronização única via PostgreSQL e retorna unsubscribe vazio.
 */
const startOrdensCorteRealtime = (companyId, safra, onUpdateCallback) => {
    let stopped = false;
    let running = false;
    let debounceTimer = null;

    const run = async () => {
        if (stopped || running || !navigator.onLine) return;
        running = true;
        try {
            await syncOrdensCorteFromPostgres(companyId, safra, onUpdateCallback);
        } finally {
            running = false;
        }
    };

    const scheduleRun = () => {
        if (stopped) return;
        window.clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(run, 500);
    };

    // Carga inicial única. Depois disso, só atualiza quando o backend avisar via SSE.
    run();

    const unsubscribeRealtime = subscribeMapRealtime({
        companyId,
        safra,
        onMapUpdate: (event) => {
            if (event?.type === 'ordem-corte-updated') scheduleRun();
        },
    });

    const onlineHandler = () => scheduleRun();
    window.addEventListener('online', onlineHandler);

    return () => {
        stopped = true;
        window.clearTimeout(debounceTimer);
        window.removeEventListener('online', onlineHandler);
        if (typeof unsubscribeRealtime === 'function') unsubscribeRealtime();
    };
};

/**
 * Compatibilidade com chamadas antigas: mantém o Dexie atualizado por SSE.
 * Sem polling a cada 5s para não travar o mapa.
 */
export const subscribeToOrdensRealtime = (companyId, safra, onUpdateCallback) => {
    return startOrdensCorteRealtime(companyId, safra, onUpdateCallback);
};

/**
 * Compatibilidade com chamadas antigas: os vínculos já vêm na mesma sincronização das ordens.
 */
export const subscribeToVinculosRealtime = (companyId, safra, onUpdateCallback) => {
    return startOrdensCorteRealtime(companyId, safra, onUpdateCallback);
};
