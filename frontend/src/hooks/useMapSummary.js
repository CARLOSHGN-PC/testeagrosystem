import { useState, useMemo, useEffect } from "react";
import { buildPlanejamentoLegendItems } from "../utils/planejamentoSafraColors";

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
export function useMapSummary(enhancedGeoJson, allEstimates, activeMapModule = "estimativa", backendSummary = null) {
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

  // Calcula itens dinâmicos do summary (Área, Toneladas, Qtd., TCH)
  useEffect(() => {
    if (!enhancedGeoJson || !enhancedGeoJson.features) return;

    if (activeMapModule === "estimativa" && backendSummary) {
      console.log('[estimativa] using backend summary');
      setSummaryData(backendSummary);
      return;
    }

    let totalArea = 0;
    let estimadosCount = 0;
    let pendentesCount = 0;
    let totalToneladas = 0;
    const totalTalhoes = enhancedGeoJson.features.length;

    enhancedGeoJson.features.forEach(f => {
      const p = f.properties || {};
      const area = Number(String(p.AREA || 0).replace('.', '').replace(',', '.'));
      if (!isNaN(area)) totalArea += area;

      if (p._is_estimated) estimadosCount++;
      else pendentesCount++;
    });

    setSummaryData({
      talhoes: totalTalhoes,
      area: totalArea,
      estimados: estimadosCount,
      pendentes: pendentesCount,
      toneladas: totalToneladas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      tch: totalArea > 0 ? (totalToneladas / totalArea).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0,00",
    });
  }, [enhancedGeoJson, allEstimates, activeMapModule, backendSummary]);

  // Calcula legenda com base no que está na tela.
  const legendItems = useMemo(() => {
    if (!enhancedGeoJson || !enhancedGeoJson.features) return [];

    if (activeMapModule === "planejamentoSafra") {
      return buildPlanejamentoLegendItems(enhancedGeoJson.features);
    }

    const colors = {
      "1º corte": "#ff2d6f",
      "2º corte": "#5ad15a",
      "3º corte": "#f5e11c",
      "4º corte": "#4a7dff",
      "5º corte": "#f58231",
      "6º corte": "#a43cf0",
      "7º corte": "#42d4f4",
      "8º corte": "#e642f4",
      "9º corte": "#c4f35a",
      "10º corte": "#f4a3c1",
      "11º corte": "#6bc5c5",
      "Sem estágio": "#d1d5db"
    };

    const presentStages = new Set();
    enhancedGeoJson.features.forEach(f => {
      const p = f.properties || {};
      if (p._layer_visible === false) return;

      const stage = p._is_estimated
        ? p._normalized_ecorte
        : "Sem estágio";

      if (stage) presentStages.add(stage);
    });

    const items = [];
    Array.from(presentStages).forEach(stage => {
      items.push([colors[stage] || "#d1d5db", stage]);
    });

    const naturalSortLegend = (a, b) => a[1].localeCompare(b[1], undefined, { numeric: true, sensitivity: 'base' });
    return items.sort(naturalSortLegend);
  }, [enhancedGeoJson, activeMapModule]);

  return {
    summaryData,
    summaryCollapsed,
    setSummaryCollapsed,
    legendItems,
    legendCollapsed,
    setLegendCollapsed
  };
}
