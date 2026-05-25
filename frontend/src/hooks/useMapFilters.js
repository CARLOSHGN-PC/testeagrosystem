import { useState, useMemo, useEffect } from "react";
import db from "../services/localDb";
import { getFazendaName, getUniqueTalhaoId } from "../utils/geoHelpers";
import { normalizeCorte, naturalSort } from "../utils/formatters";
import { getPlanejamentoSafraColor, normalizeFrenteLabel } from "../utils/planejamentoSafraColors";
import { postgresReadService, usePostgresReads } from "../services/postgresReadService";
import { getProtocolos } from "../services/premissas/tratos_culturais/tratosCulturaisService";
import { getAccessToken, getRefreshToken } from "../services/postgresAuthService";

/**
 * Helper interno para normalizar os IDs de fazenda e talhão para comparação robusta.
 * Remove espaços, zeros à esquerda, sufixos ".0" comuns em planilhas Excel, e converte para maiúsculo.
 */
function normalizeId(id) {
  if (id === undefined || id === null) return '';
  let str = String(id).trim();
  str = str.replace(/\.0+$/, ''); // remove .0 or .00 at the end (e.g. 4002.0 -> 4002)
  str = str.replace(/^0+/, ''); // remove leading zeros (e.g. 04002 -> 4002)
  str = str.replace(/\s+/g, ''); // remove internal spaces (e.g. 12 B -> 12B)
  return str.toUpperCase();
}

function addIdVariant(set, value) {
  if (value === undefined || value === null || value === '') return;
  const text = String(value).trim();
  if (!text) return;
  set.add(text);
  set.add(text.toUpperCase());
  set.add(normalizeId(text));
}

function buildEstimateIdSet(estimates = []) {
  const set = new Set();
  estimates.forEach((est) => {
    if (!est) return;
    const raw = est.rawData || est.raw || {};
    [
      est.talhaoId,
      est.fieldId,
      est.fieldCode,
      est.id,
      est.documentId,
      raw.talhaoId,
      raw.fieldId,
      raw.fieldCode,
      raw.TALHAO_ID,
      raw.CD_TALHAO,
      raw.COD_TALHAO,
      raw.TALHAO,
      raw.id,
      raw.featureId,
    ].forEach((value) => addIdVariant(set, value));

    const fundo = raw.FUNDO_AGR ?? raw.fundoAgricola ?? raw.fundo_agricola ?? raw.fazendaCodigo ?? raw.fazenda;
    const fazenda = raw.FAZENDA ?? raw.fazendaNome ?? raw.nome_fazenda ?? raw.fazenda;
    const talhao = raw.TALHAO ?? raw.talhaoId ?? raw.fieldId ?? raw.fieldCode ?? raw.TALHAO_ID ?? raw.CD_TALHAO ?? raw.COD_TALHAO;
    const seq = raw.featureId ?? raw.SEQ ?? raw.sequencia;

    if (fundo && talhao) addIdVariant(set, `${fundo}_${talhao}`);
    if (fazenda && talhao) addIdVariant(set, `${fazenda}_${talhao}`);
    if (fundo && fazenda && talhao && seq !== undefined && seq !== null && seq !== '') {
      addIdVariant(set, `${fundo}_${fazenda}_${talhao}_SEQ${seq}`.replace(/\//g, '-').replace(/ /g, '_').toUpperCase());
    }
  });
  return set;
}

function featureHasEstimate(feature, estimatedIds) {
  if (!feature || !estimatedIds) return false;
  const p = feature.properties || {};
  const candidates = [
    getUniqueTalhaoId(feature),
    feature.id,
    p.id,
    p.talhaoId,
    p.TALHAO_ID,
    p.CD_TALHAO,
    p.COD_TALHAO,
    p.TALHAO,
    p.featureId,
    p.FUNDO_AGR !== undefined && p.TALHAO !== undefined ? `${p.FUNDO_AGR}_${p.TALHAO}` : null,
    p.FAZENDA !== undefined && p.TALHAO !== undefined ? `${p.FAZENDA}_${p.TALHAO}` : null,
  ];
  return candidates.some((value) => {
    if (value === undefined || value === null || value === '') return false;
    const text = String(value).trim();
    return estimatedIds.has(text) || estimatedIds.has(text.toUpperCase()) || estimatedIds.has(normalizeId(text));
  });
}

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
