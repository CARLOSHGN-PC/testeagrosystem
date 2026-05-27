import { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../services/localDb';
import { subscribeToOrdensRealtime } from '../../services/ordemCorte/ordemCorteRepository';
import { corrigirFazendaSolicitacoesOrdemCorte } from '../../services/ordemCorte/ordemCorteService';

/**
 * useOrdensCorte.js
 *
 * O que este bloco faz:
 * É um Custom React Hook (useLiveQuery) que busca passivamente no IndexedDB
 * todos os Vínculos e Ordens de Corte pertinentes à Safra e à Empresa selecionada.
 * Atualiza o DOM e React States em Tempo Real assim que um save ocorre (mesmo offline).
 *
 * Por que ele existe:
 * Separar a busca e gestão do estado dos componentes Visuais (Panels, Maps),
 * tornando o fluxo do Map e SidePanel puramente dependentes da "Memória de Longo Prazo".
 */

export const useOrdensCorte = (companyId, safra) => {
    const correcaoExecutadaRef = useRef(new Set());
    // Escuta ao vivo a tabela pivot (Vínculos: OrdemCorte -> Talhão) para mapear
    // quais Talhões pertencem a qual status e código.
    // Usamos stringify/parse para forçar atualização profunda no React se precisar
    const vinculosSafra = useLiveQuery(
        async () => {
            if (!companyId || !safra) return [];
            const dados = await db.ordensCorteTalhoes
                .where('[companyId+safra]')
                .equals([companyId, safra])
                .toArray();
            return dados;
        },
        [companyId, safra]
    );

    // Escuta ao vivo a tabela Cabeçalho (OrdemCorte) caso precisemos de atributos globais (openedAt, etc).
    const ordensSafra = useLiveQuery(
        async () => {
            if (!companyId || !safra) return [];
            const dados = await db.ordensCorte
                .where('[companyId+safra]')
                .equals([companyId, safra])
                .toArray();
            return dados;
        },
        [companyId, safra]
    );

    // O que este bloco faz: Inicializa os listeners do sincronização PostgreSQL/Dexie para manter o Dexie perfeitamente atualizado.
    // Por que ele existe: Permite que mudanças feitas por outros aparelhos (como abrir ou fechar uma ordem)
    // sejam puxadas do servidor e mostradas em tempo real no nosso mapa via o hook useLiveQuery acima.
    useEffect(() => {
        if (!companyId || !safra) return;

        const chaveExecucao = `${companyId}_${safra}`;
        if (!correcaoExecutadaRef.current.has(chaveExecucao)) {
            correcaoExecutadaRef.current.add(chaveExecucao);
            corrigirFazendaSolicitacoesOrdemCorte(companyId, safra).catch((error) => {
                console.warn('[OrdemCorte] Falha na correção automática de fazenda:', error);
            });
        }

        // Mantém o Dexie atualizado automaticamente para refletir alterações feitas
        // por outros usuários/dispositivos sem precisar atualizar a página.
        const unsubscribe = subscribeToOrdensRealtime(companyId, safra, () => {});

        return () => {
            if (typeof unsubscribe === 'function') unsubscribe();
        };
    }, [companyId, safra]);

    return {
        vinculosSafra: vinculosSafra || [],
        ordensSafra: ordensSafra || [],
        // Só é loading real se as queries não tiverem retornado nada na primeira execução
        isLoading: vinculosSafra === undefined || ordensSafra === undefined
    };
};
