import { useMemo } from 'react';
import { selecionarIdsAbertosDaSafra, selecionarIdsAguardandoDaSafra, selecionarIdsOcultosDaSafra, selecionarIdsAguardandoAnalistaDaSafra, selecionarIdsAguardandoAprovacaoDaSafra } from '../../modules/estimativas/utils/ordemCorteSelectors';

/**
 * useOrdemCorteMapState.js
 *
 * O que este bloco faz:
 * É um React Hook que intercepta os arrays massivos de OrdemCorteTalhoes que vem do
 * banco de dados (por via do `useOrdensCorte`) e mastiga eles num formato legível pelo
 * Mapbox. Por exemplo, descobre "Quem fica invisível?" ou "Quem fica #3b82f6?".
 *
 * Por que ele existe:
 * Separar a Regra de Negócio de "Ocultação e Pintura" do gigantesco arquivo EstimativaMap.jsx.
 * Assim o Mapbox só pergunta pra esse Hook: "Ei, me dá as cores do talhão X e se ele aparece."
 */

export const useOrdemCorteMapState = (todosVinculosSafra) => {
    // Calculamos com memoização (useMemo) pra não travar o framerate do navegador,
    // já que o Mapa renderiza 60 frames por segundo e o array `todosVinculosSafra`
    // pode ter milhares de links no futuro.

    // Gera Set com Ids dos talhões que possuem Ordem Aberta
    const idsAbertosSet = useMemo(() => {
        return new Set(selecionarIdsAbertosDaSafra(todosVinculosSafra));
    }, [todosVinculosSafra]);

    // Gera Set com Ids dos talhões que possuem Ordem Aguardando
    const idsAguardandoSet = useMemo(() => {
        return new Set(selecionarIdsAguardandoDaSafra(todosVinculosSafra));
    }, [todosVinculosSafra]);

    const idsAguardandoAnalistaSet = useMemo(() => {
        return new Set(selecionarIdsAguardandoAnalistaDaSafra(todosVinculosSafra));
    }, [todosVinculosSafra]);

    const idsAguardandoAprovacaoSet = useMemo(() => {
        return new Set(selecionarIdsAguardandoAprovacaoDaSafra(todosVinculosSafra));
    }, [todosVinculosSafra]);

    // Gera Set com Ids dos talhões que possuem Ordem Fechada
    const idsOcultosSet = useMemo(() => {
        return new Set(selecionarIdsOcultosDaSafra(todosVinculosSafra));
    }, [todosVinculosSafra]);

    // Função utilitária que avisa se ele tem que pular do GeoJSON filter do mapa
    const isTalhaoOculto = (talhaoId) => {
        return idsOcultosSet.has(talhaoId);
    };

    return {
        idsAbertosSet,
        idsAguardandoSet,
        idsAguardandoAnalistaSet,
        idsAguardandoAprovacaoSet,
        idsOcultosSet,
        isTalhaoOculto
    };
};
