import db from './localDb';
import { apiRequest } from './apiClient.js';
import { syncPendingLancamentosBroca } from './lancamentos/infestacaoBrocaService.js';
import { syncPendingLancamentosPerda } from './lancamentos/perdaCanaService.js';
import { syncPendingComplexoMurcha } from './lancamentos/complexoMurchaService.js';

/**
 * syncService.js
 *
 * O que este bloco faz:
 * Escuta mudanças de conectividade (online/offline) e roda um laço
 * verificando `db.syncQueue`. Ele tenta empurrar todas as requisições
 * pendentes para o PostgreSQL. Em caso de sucesso, marca "synced" no registro.
 * Em caso de falha de internet/permissão, ele aumenta "retryCount".
 *
 * Por que ele existe:
 * Para o aplicativo não falhar durante salvamento de formulários caso o usuário caia do 4G.
 * Essa é a camada mágica que resolve tudo por trás.
 */

// Aumenta o tempo do retry
const MAX_RETRIES = 5;

// Variável de controle para evitar múltiplas instâncias de sync rodando ao mesmo tempo.
let isSyncing = false;

// O que este bloco faz: Variável global que acumula quantos documentos foram sincronizados com sucesso em uma única "sessão" de internet antes da fila esvaziar.
// Por que ele existe: Para evitar que o app dispare vários alertas "Sincronização Concluída" (ex: "20", "40", "1500" itens) quando o usuário salva muitos dados (ex: reestimar 2000 talhões de uma vez). O alerta só aparecerá 1 vez com o total real de tudo.
let accumulatedSyncCount = 0;


const sanitizePayload = (payload = {}) => {
    const { syncStatus, ...cleanPayload } = payload || {};
    return cleanPayload;
};

const sendTaskToPostgres = async (task) => {
    const payload = sanitizePayload(task.payload);
    return await apiRequest('/api/postgres/sync/task', {
        method: 'POST',
        body: JSON.stringify({
            type: task.type,
            targetCollection: task.targetCollection,
            documentId: task.documentId,
            companyId: payload.companyId,
            payload
        })
    });
};

const emitLocalDbUpdated = (detail = {}) => {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('local-db-updated', { detail }));
    }
};


const processLancamentosPendentesGlobal = async () => {
    const total = { synced: 0, failed: 0 };
    const runners = [
        ['broca', syncPendingLancamentosBroca],
        ['perda', syncPendingLancamentosPerda],
        ['murcha', syncPendingComplexoMurcha],
    ];

    for (const [nome, runner] of runners) {
        try {
            const result = await runner();
            total.synced += Number(result?.synced || 0);
            total.failed += Number(result?.failed || 0);
        } catch (error) {
            total.failed += 1;
            console.error(`[Sync Global] Falha ao sincronizar apontamentos de ${nome}:`, error);
        }
    }

    if (total.synced > 0 || total.failed > 0) {
        emitLocalDbUpdated({ module: 'lancamentos', source: 'global-sync', ...total });
        console.log(`[Sync Global] Apontamentos sincronizados: ${total.synced}; falhas: ${total.failed}`);
    }

    return total;
};

const markLocalAsSynced = async (task) => {
    if (task.targetCollection === "estimativas_safra") {
         await db.estimativas.update(task.documentId, { syncStatus: "synced" });
    } else if (task.targetCollection === "ordens_corte") {
         await db.ordensCorte.update(task.documentId, { syncStatus: "synced" });
    } else if (task.targetCollection === "ordens_servico") {
         await db.ordensServico.update(task.documentId, { syncStatus: "synced" });
    } else if (task.targetCollection === "ordens_servico_talhoes") {
         await db.ordensServicoTalhoes.update(task.documentId, { syncStatus: "synced" });
    } else if (task.targetCollection === "ordens_corte_talhoes") {
         await db.ordensCorteTalhoes.update(task.documentId, { syncStatus: "synced" });
    } else if (task.targetCollection === "profissionais") {
         await db.profissionais.update(task.documentId, { syncStatus: "synced" });
    } else if (task.targetCollection === "premissas_modulos") {
         await db.modulos.update(task.documentId, { syncStatus: "synced" });
    } else if (task.targetCollection === "operacoes") {
         await db.operacoes.update(task.documentId, { syncStatus: "synced" });
    } else if (task.targetCollection === "protocolos") {
         await db.protocolos.update(task.documentId, { syncStatus: "synced" });
    } else if (task.targetCollection.includes("/operacoes") && task.targetCollection.startsWith("protocolos/")) {
         await db.protocoloOperacoes.update(task.documentId, { syncStatus: "synced" });
    } else if (task.targetCollection.includes("/itens") && task.targetCollection.startsWith("protocolos/")) {
         await db.protocoloItens.update(task.documentId, { syncStatus: "synced" });
    } else if (task.targetCollection === "produtos") {
         await db.produtos.update(task.documentId, { syncStatus: "synced" });
    } else if (task.targetCollection === "variedades") {
         await db.variedades.update(task.documentId, { syncStatus: "synced" });
    } else if (task.targetCollection === "categorias_produto") {
         await db.categoriasProduto.update(task.documentId, { syncStatus: "synced" });
    } else if (task.targetCollection === "unidades_medida") {
         await db.unidadesMedida.update(task.documentId, { syncStatus: "synced" });
    } else if (task.targetCollection === "insumos") {
         await db.insumos.update(task.documentId, { syncStatus: "synced" });
    } else if (task.targetCollection === "auditoria_logs") {
         await db.auditoriaLogs.update(task.documentId, { syncStatus: "synced" });
    } else if (task.targetCollection === "fazendas") {
         await db.fazendas.update(task.documentId, { syncStatus: "synced" });
    } else if (task.targetCollection.includes("/talhoes") && task.targetCollection.startsWith("fazendas/")) {
         await db.talhoes.update(task.documentId, { syncStatus: "synced" });
    } else if (task.targetCollection === "planejamento_safra") {
         await db.planejamentoSafra.update(task.documentId, { syncStatus: "synced" });
    } else if (task.targetCollection === "planejamento_tratos") {
         await db.planejamentoTratos.update(task.documentId, { syncStatus: "synced" });
    } else if (task.targetCollection === "planejamento_tratos_talhoes") {
         await db.planejamentoTratosTalhoes.update(task.documentId, { syncStatus: "synced" });
    } else if (task.targetCollection === "premissas_colheita") {
         await db.modulos.update(task.documentId, { syncStatus: "synced" });
    } else if (task.targetCollection === "premissas_tratos_vinhaca") {
         await db.modulos.update(task.documentId, { syncStatus: "synced" });
    }
};

// Executa e desocupa a fila inteira.
export const processQueue = async () => {
    // Se não houver internet base ou já estiver rodando, abortamos para não duplicar requisições.
    if (!navigator.onLine || isSyncing) {
        if (!navigator.onLine) console.log("Offline, pulando fila...");
        return;
    }

    isSyncing = true;
    try {
        // Pega somente tarefas que estão 'pending' e ordene pelas mais velhas primeiro.
        const pendingTasks = await db.syncQueue
            .where('status')
            .equals('pending')
            .sortBy('createdAt');

        // Além da fila genérica, os módulos de apontamento guardam pendências nas próprias tabelas Dexie.
        // Rodamos aqui para a sincronização ser GLOBAL quando a internet voltar, sem precisar abrir módulo por módulo.
        const apontamentosResult = await processLancamentosPendentesGlobal();
        if (apontamentosResult.synced > 0) {
            accumulatedSyncCount += apontamentosResult.synced;
        }

        if (pendingTasks.length === 0) return;

        console.log(`Iniciando sincronização de ${pendingTasks.length} tarefas.`);

        /**
         * NOVO BLOCO (Sincronização em Lotes)
         * O que este bloco faz:
         * Processa as requisições em lotes (chunks) em vez de jogar todas as promises
         * de uma vez só no PostgreSQL. Define um tamanho de lote (batchSize) e um delay entre lotes.
         *
         * Por que ele existe:
         * O Promise.all maciço de antes travava o navegador e derrubava a conexão com o PostgreSQL
         * ao tentar enviar centenas/milhares de documentos simultâneos durante estimativas em massa.
         * Lotes evitam timeout na fila e uso abusivo de CPU e banda.
         */
        const batchSize = 20; // Define quantos documentos processaremos por vez no PostgreSQL para evitar limite de concorrência.
        const chunkDelay = 500; // Define o tempo em milissegundos para dar "respiro" entre os lotes de execução.

        // Loop iterativo que percorre a fila total fatiando-a de `batchSize` em `batchSize`.
        for (let i = 0; i < pendingTasks.length; i += batchSize) {
            // Pega o "pedaço" atual da fila com base no índice atual 'i' até 'i + batchSize'.
            const currentChunk = pendingTasks.slice(i, i + batchSize);

            // Console de monitoramento: O que este bloco faz: informa o lote atual no console para logar o andamento.
            // Por que ele existe: Útil para o desenvolvedor auditar e observar quantas tarefas já foram processadas sem o devtools travar.
            console.log(`Processando lote de ${i} até ${i + currentChunk.length} de um total de ${pendingTasks.length}`);

            // Executa apenas o lote atual em paralelo, aguardando que TODAS as promises desse lote finalizem antes de continuar o loop.
            // Por que ele existe: Manter alguma concorrência é mais veloz que enviar sequencial, mas limitamos essa concorrência ao `batchSize`.
            await Promise.all(currentChunk.map(async (task) => {
                // O que este bloco faz: Verifica se a tarefa já atingiu o limite de retentativas.
                // Por que ele existe: Evita ficar em um loop infinito que sempre falha e tranca a fila por dados malformados.
                if (task.retryCount >= MAX_RETRIES) {
                    await db.syncQueue.update(task.id, { status: 'error', errorMessage: 'Max retries reached' });
                    return; // Retorna cedo e ignora essa tarefa.
                }

                try {
                    // Envia a tarefa para a API PostgreSQL. PostgreSQL não é mais usado para dados.
                    const result = await sendTaskToPostgres(task);
                    if (result?.success === false) {
                        throw new Error(result?.message || 'Falha ao sincronizar com PostgreSQL.');
                    }

                    if (task.type === 'createOrUpdate') {
                        await markLocalAsSynced(task);
                    }
                    emitLocalDbUpdated({ module: task.targetCollection, documentId: task.documentId, source: 'queue' });
                    // O que este bloco faz: Remove a tarefa da fila de sincronização do banco local.
                    // Por que ele existe: Se chegamos até aqui, a tarefa concluiu sem erros no servidor, então ela deve sumir da memória do celular.
                    await db.syncQueue.delete(task.id);

                    // O que este bloco faz: Incrementa o contador de sincronizações bem sucedidas da sessão atual em 1 toda vez que algo for limpo da fila com sucesso.
                    // Por que ele existe: Permite acumular o total real (ex: 2000 talhões) para mostrar em uma única notificação no final em vez de disparar várias a cada lote que acaba.
                    accumulatedSyncCount++;

                } catch (error) {
                    // O que este bloco faz: Captura qualquer falha que o PostgreSQL retornar para essa promise individual.
                    // Por que ele existe: Para não quebrar o `Promise.all` dos outros itens do lote (se 1 falha, não deve matar o resto em um erro genérico).
                    console.error("Erro durante push da task", task.id, error);

                    // Pega a mensagem de erro literal para salvar e registrar.
                    const errorMsg = error.message || "Erro genérico";

                    // O que este bloco faz: Incrementa o número de tentativas e atualiza no Dexie.
                    // Por que ele existe: Na próxima vez que a internet piscar, a função sabe que já tentou X vezes e aborta no limite configurado.
                    await db.syncQueue.update(task.id, {
                        retryCount: task.retryCount + 1,
                        errorMessage: errorMsg
                    });
                }
            }));

            // O que este bloco faz: Introduz uma pausa artificial se ainda houver mais lotes para rodar.
            // Por que ele existe: Permite que o EventLoop do navegador respire e os WebSockets não enfileirem tantas mensagens pendentes de ACK simultaneamente.
            if (i + batchSize < pendingTasks.length) {
                await new Promise(resolve => setTimeout(resolve, chunkDelay));
            }
        }

        console.log("Lote(s) de sincronização finalizado(s).");
    } catch (err) {
        console.error("Erro critico processando fila:", err);
    } finally {
        // O que este bloco faz: Libera o lock de sincronização para permitir novas execuções.
        // Por que ele existe: Garante que, independentemente de sucesso ou falha, o processo possa ser rodado novamente.
        isSyncing = false;

        // O que este bloco faz: Verifica no banco de dados local se, durante o tempo que estivemos sincronizando
        // o lote anterior (que pode demorar devido aos delays e chunks), novas tarefas foram adicionadas na fila
        // com status 'pending'.
        // Por que ele existe: Resolve o bug onde a interface de usuário (ex: TopNavbar) ficava travada em "Sincronizando..."
        // infinitamente.
        try {
            const remainingTasksCount = await db.syncQueue.where('status').equals('pending').count();
            if (remainingTasksCount > 0) {
                console.log(`Há ${remainingTasksCount} tarefas adicionadas durante a sincronização. Reprocessando a fila...`);
                // O que este bloco faz: Chama o processQueue recursivamente/novamente se houverem pendências.
                // Por que ele existe: Para limpar a fila completamente em uma única "sessão" de internet antes de desligar a UI de sync e sem disparar notificação prematura.
                processQueue();
            } else {
                // O que este bloco faz: Emite o evento final 'sync-completed' apenas quando ABSOLUTAMENTE toda a fila acabou e SOMENTE se dados foram de fato sincronizados.
                // Por que ele existe: Impede que o TopNavbar dispare 10 alertas de sucesso seguidos para o usuário ao salvar muitos dados em rajada (reestimar 2000 áreas).
                // O alerta só aparece uma vez e com a quantidade total certa (`accumulatedSyncCount`), não o tamanho do lote ou iteração final.
                if (accumulatedSyncCount > 0) {
                    console.log(`Fila de sincronização zerada por completo. Emitindo evento final com total acumulado: ${accumulatedSyncCount}`);
                    window.dispatchEvent(new CustomEvent('sync-completed', { detail: { count: accumulatedSyncCount } }));

                    // O que este bloco faz: Zera o contador de acumulação após exibir a notificação.
                    // Por que ele existe: Para a próxima vez que a internet cair ou o usuário for salvar algo, a contagem recomece do zero em vez de somar ad infinitum.
                    accumulatedSyncCount = 0;
                }
            }
        } catch (checkErr) {
            console.error("Erro ao verificar pendências remanescentes no finally:", checkErr);
        }
    }
};

/**
 * Registers an operation in the local Dexie database to be executed in the background
 * when the connection is restored.
 */
export const enqueueTask = async (type, targetCollection, documentId, payload, options = {}) => {
    const forceQueue = Boolean(options?.forceQueue);

    // Se estiver online, tenta mandar direto para a API PostgreSQL sem deixar pendente no Dexie.
    // Quando forceQueue=true, mantemos a alteração apenas na fila local para evitar nova tentativa imediata
    // depois de uma falha já detectada pela operação principal do mapa.
    if (navigator.onLine && !forceQueue) {
        try {
            const task = { type, targetCollection, documentId, payload };
            const result = await sendTaskToPostgres(task);
            if (result?.success === false) {
                throw new Error(result?.message || 'Falha ao sincronizar com PostgreSQL.');
            }

            if (type === 'createOrUpdate') {
                payload.syncStatus = 'synced';
                await markLocalAsSynced({ targetCollection, documentId });
                emitLocalDbUpdated({ module: targetCollection, documentId, source: 'direct' });
            }
            return;
        } catch (error) {
            console.warn('Envio direto para PostgreSQL falhou. Salvando na fila offline...', error);
        }
    }

    // If it's an update for the same document, we remove the old pending task
    // to avoid filling the queue with obsolete updates and overwriting data.
    if (type === 'createOrUpdate' && documentId) {
        const existingTasks = await db.syncQueue
            .where('[type+documentId]') // Requires an index
            .equals([type, documentId])
            .toArray();

        /**
         * What this block does:
         * Collects IDs of all pending tasks for the same document.
         *
         * Why it exists:
         * To optimize performance by deleting everything in a single bulkDelete command,
         * reducing the number of IndexedDB transactions.
         */
        const idsToDelete = existingTasks
            .filter(t => t.status === 'pending')
            .map(t => t.id);

        if (idsToDelete.length > 0) {
            await db.syncQueue.bulkDelete(idsToDelete);
        }
    }

    await db.syncQueue.add({
        type, // e.g., 'createOrUpdate' or 'addHistory'
        targetCollection, // e.g., 'estimativas_safra'
        documentId, // String of the primary key or null if it's add()
        payload, // The form's own JSON
        status: 'pending',
        retryCount: 0,
        createdAt: new Date().toISOString()
    });

    // Since we already tried online before and it failed (or we are offline), no use in calling processQueue now.
};

// Global Listeners: When the network returns (browser event), we automatically reprocess!
if (typeof window !== "undefined") {
    window.addEventListener('online', () => {
        console.log("Internet restored! Reprocessing pending tasks.");
        processQueue();
    });

    // Initial attempt at app load (startup), in case it was
    // closed while offline and reopened while online.
    setTimeout(() => {
        if (navigator.onLine) {
            processQueue();
        }
    }, 2000); // small delay to ensure sessão PostgreSQL/JWT estar persistida
}

