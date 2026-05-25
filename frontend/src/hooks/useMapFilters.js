import { useState, useMemo, useEffect } from "react";

/**
 * useMapFilters.js
 *
 * [MIGRAÇÃO FUTURA - MAP PROJECTION LAYER]
 * O cruzamento e filtragem de atributos complexos feitos neste arquivo (e através
 * do useEstimativasData) gera carga e cruzamentos na memória, que causam problemas.
 * Uma store de Projeção Consolidada foi adicionada (`db.mapProjection`) e gerada
 * via `mapProjectionService.js`.
 * O PRÓXIMO PASSO será que o `enhancedGeoJson` consuma os atributos diretamente da
 * `db.mapProjection` de forma O(1) com uma query rápida do Dexie, eliminando o
 * rebuild de Maps/Sets repetitivo dentro deste hook e do `useEstimativasData`.
 *
 * O que este bloco faz:
 * Gerencia os filtros atuais, deriva as opções de dropdown com base no mapa (GeoJSON),
 * aplica esses filtros retornando um `enhancedGeoJson` que contém metadados
 * e apenas os features compatíveis, e lida com o estado UI do modal de filtro.
 *
 * Por que ele existe:
 * O cálculo de quais features estão ativas e as dependências em cascata dos
 * dropdowns (ex: mudar a fazenda muda as variedades disponíveis) é uma das partes
 * mais complexas do sistema e precisa rodar rápido (via `useMemo`) sem
 * poluir os eventos visuais.
 *
 * @param {Object} geoJsonData - O objeto GeoJSON cru vindo do Storage de mapas.
 * @param {Array} allEstimates - O array de estimativas atuais vindas do PostgreSQL.
 * @returns {Object} Estado, opções calculadas, setters e métodos de manipulação de filtro.
 */
export function useMapFilters(geoJsonData, activeMapModule = "estimativa", filterOptionsData = null) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;

  // Default values based on context
  const defaultStatusFilters = (activeMapModule === "tratosCulturais" || activeMapModule === "planejamentoTratosCulturais") ? ["Aberta", "Fechada", "Executada"] : [];

  // O estado 'filters' armazena o estado "draft" dentro do modal.
  const [filters, setFilters] = useState({
    ordemCorteStatus: defaultStatusFilters, // Novo filtro master (usado para Tratos Culturais / OS)
    ordemCorteId: "",
    statusPlanejamento: [], // Filtro para Planejamento Safra
    sequenciasPlanejamento: [], // Novo filtro por sequencia no Planejamento Safra
    frente: "",
    fazenda: "",
    variedade: "",
    corte: "",
    talhao: "",
    tipoPropriedade: [],
    planningOperacao: ""
  });

  // O 'appliedFilters' é o estado que realmente ativa a mudança na view do mapa.
  const [appliedFilters, setAppliedFilters] = useState({
    ordemCorteStatus: defaultStatusFilters,
    ordemCorteId: "",
    statusPlanejamento: [],
    sequenciasPlanejamento: [], // Novo filtro por sequencia no Planejamento Safra
    frente: "",
    fazenda: "",
    variedade: "",
    corte: "",
    talhao: "",
    tipoPropriedade: [],
    planningOperacao: ""
  });

  // Re-apply default filters dynamically if module changes
  useEffect(() => {
    const newDefault = (activeMapModule === "tratosCulturais" || activeMapModule === "planejamentoTratosCulturais") ? ["Aberta", "Fechada", "Executada"] : [];
    setFilters(prev => ({ ...prev, ordemCorteStatus: newDefault, planningOperacao: activeMapModule === 'planejamentoTratosCulturais' ? prev.planningOperacao || '' : '' }));
    setAppliedFilters(prev => ({ ...prev, ordemCorteStatus: newDefault, planningOperacao: activeMapModule === 'planejamentoTratosCulturais' ? prev.planningOperacao || '' : '' }));
  }, [activeMapModule]);

  const filterOptions = useMemo(() => {
      return filterOptionsData || {
          frentes: [], fazendas: [], variedades: [], cortes: [], talhoes: [],
          tiposPropriedade: [], ordensCorteStatus: [], statusPlanejamento: [],
          sequenciasPlanejamento: [], planningOperacoes: [], ordensCorte: []
      };
  }, [filterOptionsData]);

  const enhancedGeoJson = useMemo(() => {
    if (!geoJsonData) return null;

    return {
      ...geoJsonData,
      features: geoJsonData.features || []
    };
  }, [geoJsonData, isOnline]);

  return {
    filtersOpen, setFiltersOpen,
    filters, setFilters,
    appliedFilters, setAppliedFilters,
    filterOptions,
    enhancedGeoJson
  };
}
