import { useState, useMemo, useEffect } from "react";

/**
 * useMapSummary.js
 *
 * O que este bloco faz:
 * Gera os totais dinâmicos de áreas (ha), talhões contados (pendentes e estimados)
 * e o total de toneladas estimadas. E lida com a montagem inteligente da legenda de cores do mapa.
 *
 * Por que ele existe:
 * O componente React precisa de uma "visão de sumário" no canto inferior da tela do mapa.
 * Os cálculos que derivam `summaryData` exigem laços pesados e são reativados toda
 * vez que um filtro é alterado no GeoJson. O Hook customizado isola isso de side-effects confusos.
 *
 * @param {Object} enhancedGeoJson - O geoJson pós-filtragem com os status `_is_estimated`.
 * @param {Array} allEstimates - Os dados correntes salvos no PostgreSQL para buscar a tonelagem.
 * @returns {Object} { summaryData, summaryCollapsed, legendItems, legendCollapsed }
 */
export function useMapSummary(enhancedGeoJson, allEstimates, activeMapModule = "estimativa") {
  const [summaryCollapsed, setSummaryCollapsed] = useState(true);
  const [legendCollapsed, setLegendCollapsed] = useState(true);

  const [summaryData, setSummaryData] = useState({
    talhoes: 0,
    area: 0,
    estimados: 0,
    pendentes: 0,
    toneladas: 0,
    tch: 0,
  });

  const serverSummaryData = enhancedGeoJson?._serverSummaryData || null;
  const serverLegendItems = enhancedGeoJson?._serverLegendItems || null;

  // Prioriza resumo pronto do backend para reduzir loops no frontend.
  useEffect(() => {
    if (serverSummaryData) {
      setSummaryData(serverSummaryData);
      return;
    }

    // Fallback local legado (offline/caches antigos).
    if (!enhancedGeoJson || !enhancedGeoJson.features) return;
    const totalTalhoes = enhancedGeoJson.features.length;
    setSummaryData({
      talhoes: totalTalhoes,
      area: 0,
      estimados: enhancedGeoJson.features.filter((f) => f?.properties?._is_estimated).length,
      pendentes: enhancedGeoJson.features.filter((f) => !f?.properties?._is_estimated).length,
      toneladas: "0,00",
      tch: "0,00",
    });
  }, [enhancedGeoJson, serverSummaryData]);

  const legendItems = useMemo(() => {
    if (Array.isArray(serverLegendItems)) return serverLegendItems.map((i) => [i.color, i.label]);
    return [];
  }, [serverLegendItems]);

  return {
    summaryData,
    summaryCollapsed,
    setSummaryCollapsed,
    legendItems,
    legendCollapsed,
    setLegendCollapsed
  };
}
