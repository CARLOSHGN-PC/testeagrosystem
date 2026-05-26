import { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../services/localDb';
import { subscribeToOrdensServicoRealtime, subscribeToVinculosServicoRealtime } from '../../services/ordemServico/ordemServicoRepository';
import { corrigirFazendaOrdensServicoAbertas } from '../../services/ordemServico/ordemServicoService';

/**
 * useOrdensServico.js
 *
 * O que este bloco faz:
 * É um Custom React Hook que busca no IndexedDB todas as Ordens de Serviço (Tratos Culturais)
 * pertinentes à Safra e à Empresa selecionada.
 */

export const useOrdensServico = (companyId, safra) => {
    const correcaoExecutadaRef = useRef(new Set());
    // Escuta ao vivo a tabela pivot (Vínculos: OrdemServico -> Talhão)
    const vinculosSafra = useLiveQuery(
        async () => {
            if (!companyId || !safra) return [];
            const dados = await db.ordensServicoTalhoes
                .where('[companyId+safra]')
                .equals([companyId, safra])
                .toArray();
            return dados;
        },
        [companyId, safra]
    );

    // Escuta ao vivo a tabela Cabeçalho (OrdemServico)
    const ordensSafra = useLiveQuery(
        async () => {
            if (!companyId || !safra) return [];
            const dados = await db.ordensServico
                .where('[companyId+safra]')
                .equals([companyId, safra])
                .toArray();
            return dados;
        },
        [companyId, safra]
    );

    useEffect(() => {
        if (!companyId || !safra) return;

        const chaveExecucao = `${companyId}_${safra}`;
        if (!correcaoExecutadaRef.current.has(chaveExecucao)) {
            correcaoExecutadaRef.current.add(chaveExecucao);
            corrigirFazendaOrdensServicoAbertas(companyId, safra).catch((error) => {
                console.warn('[OrdemServico] Falha ao corrigir fazendas em ordens já abertas:', error);
            });
        }

        // Assina as atualizações da Ordem Mestre e dos Vínculos.
        const unsubscribeOrdens = subscribeToOrdensServicoRealtime(companyId, safra, () => {});
        const unsubscribeVinculos = subscribeToVinculosServicoRealtime(companyId, safra, () => {});

        return () => {
            if (unsubscribeOrdens) unsubscribeOrdens();
            if (unsubscribeVinculos) unsubscribeVinculos();
        };
    }, [companyId, safra]);

    return {
        vinculosSafra: vinculosSafra || [],
        ordensSafra: ordensSafra || [],
        isLoading: vinculosSafra === undefined || ordensSafra === undefined
    };
};
