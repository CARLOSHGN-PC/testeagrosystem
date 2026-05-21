import React, { useDeferredValue, useEffect, useRef, useState } from "react";
import Map, { Source, Layer, Marker } from "react-map-gl";
import { palette } from "../../constants/theme";
import "mapbox-gl/dist/mapbox-gl.css";
import { useMemo } from "react";
import { ORDEM_CORTE_CORES } from "../../services/ordemCorte/ordemCorteConstants";

const MAPBOX_TOKEN = "pk.eyJ1IjoiY2FybG9zaGduIiwiYSI6ImNtZDk0bXVxeTA0MTcyam9sb2h1dDhxaG8ifQ.uf0av4a0WQ9sxM1RcFYT2w";
const TRATOS_CORES = {
  FECHADA_EXECUTADA: "#8b5cf6",
  ABERTA_LIBERADA: "#3b82f6",
  AGUARDANDO: "#eab308",
  PENDENTE_ANALISTA: "#f97316"
};

/**
 * EstimativaMap.jsx
 *
 * O que este bloco faz:
 * O container principal de renderização do WebGL Map via Mapbox. Configura o source,
 * as camadas (`layers`) de preenchimento, contorno e as labels, aplicando lógicas
 * de hover, seleção e colorização do GeoJSON de acordo com o `feature-state`.
 *
 * Por que ele existe:
 * Separar as configurações densas do mapbox (`mapStyle`, controle de estado dos polígonos,
 * cores calculadas em tempo real e handlers do click). Isso permite que ele seja inserido
 * limpo no container do módulo.
 *
 * O que entra e o que sai:
 * @param {Object} mapRef - Referência do componente pra chamar `fitBounds`.
 * @param {Object} enhancedGeoJson - Os polígonos filtrados a serem desenhados.
 * @param {Function} onMapClick - Listener que gerencia a seleção/deseleção de talhões.
 * @param {Function} setHoveredTalhao - Atualiza qual ID de feature o mouse está pairando.
 * @param {boolean} showLabels - Flag se deve desenhar as strings de nomes dos talhões.
 * @param {number|null} hoveredTalhao - ID da feature atual em hover.
 * @param {boolean} isMultiSelectMode - Define se o usuário clica em múltiplos (no estado atual, sempre true).
 * @param {Array} selectedTalhoes - Os ids que o react-map-gl precisa renderizar como ativos.
 * @param {Object} selectedTalhao - A info do ultimo talhão unico.
 * @returns {JSX.Element} Instância do mapbox `<Map>`.
 */
const EstimativaMap = React.memo(function EstimativaMap({
  mapRef,
  enhancedGeoJson,
  onMapClick,
  setHoveredTalhao,
  showLabels,
  hoveredTalhao,
  isMultiSelectMode,
  selectedTalhoes,
  selectedTalhao,
  idsAbertosSet = new Set(),
  idsOcultosSet = new Set(),
  activeMapModule = "estimativa",
  showTratosComoOrdemCorte = false
}) {
  const previousGeoJsonBbox = useRef("");
  const centeredOnUserRef = useRef(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [userLocation, setUserLocation] = useState(null);

  // Deixa a interação do modal/botões mais fluida quando um GeoJSON grande chega do filtro.
  // O Mapbox continua recebendo o dado, mas em baixa prioridade para não travar o React.
  const deferredEnhancedGeoJson = useDeferredValue(enhancedGeoJson);

  // Memoizamos os polígonos e evitamos clonar tudo em módulos que não precisam.
  // A cor do planejamento já vem pré-calculada em `_frente_color`; o mapa apenas lê a property.
  const visibleGeoJson = useMemo(() => {
    if (!deferredEnhancedGeoJson) return null;
    const sourceFeatures = deferredEnhancedGeoJson.features || [];

    const styledFeatures = sourceFeatures.map((feature) => {
      const p = feature.properties || {};

      if (activeMapModule === "planejamentoSafra") {
        return {
          ...feature,
          properties: {
            ...p,
            _map_fill_color: p._planejamento ? (p._frente_color || "#808080") : "rgba(0,0,0,0.2)"
          }
        };
      }

      if (activeMapModule === "ordemCorte") {
        const isClosed = p._is_closed_ordem;
        const color = isClosed
          ? ORDEM_CORTE_CORES.FECHADA
          : p._has_open_ordem
            ? ORDEM_CORTE_CORES.ABERTA
            : p._is_aguardando_ordem
              ? ORDEM_CORTE_CORES.AGUARDANDO
              : p._is_estimated
                ? "rgba(0,0,0,0)"
                : "transparent";
        return {
          ...feature,
          properties: {
            ...p,
            _is_closed_ordem: isClosed,
            _map_fill_color: color
          }
        };
      }

      return feature;
    });

    return {
      ...deferredEnhancedGeoJson,
      features: styledFeatures
    };
  }, [deferredEnhancedGeoJson, activeMapModule]);

  // O backend agora calcula o bbox da camada/filtro.
  // O frontend apenas executa o fitBounds no Mapbox, sem varrer todos os polígonos
  // com turf.bbox no navegador. Isso reduz CPU/memória e evita travar em camadas grandes.
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;

    const computeFallbackBbox = (features = []) => {
      let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
      const visit = (coords) => {
        if (!Array.isArray(coords)) return;
        if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
          minLng = Math.min(minLng, coords[0]);
          minLat = Math.min(minLat, coords[1]);
          maxLng = Math.max(maxLng, coords[0]);
          maxLat = Math.max(maxLat, coords[1]);
          return;
        }
        coords.forEach(visit);
      };
      features.forEach((f) => visit(f?.geometry?.coordinates));
      if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return null;
      return [minLng, minLat, maxLng, maxLat];
    };

    const bbox = visibleGeoJson?._serverBbox || visibleGeoJson?.bbox || computeFallbackBbox(visibleGeoJson?.features || []);
    if (!Array.isArray(bbox) || bbox.length !== 4) return;

    const [minLng, minLat, maxLng, maxLat] = bbox.map(Number);
    if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return;
    if (minLng === maxLng && minLat === maxLat) return;

    const bboxString = `${minLng},${minLat},${maxLng},${maxLat}`;
    if (bboxString !== previousGeoJsonBbox.current) {
      previousGeoJsonBbox.current = bboxString;
      mapRef.current.fitBounds(
        [[minLng, minLat], [maxLng, maxLat]],
        { padding: 40, duration: 1000 }
      );
    }
  }, [visibleGeoJson?._serverBbox, visibleGeoJson?.bbox, visibleGeoJson?.features, mapRef, mapLoaded]);

  // Geolocalização automática pelo navegador: ao abrir o mapa o app já solicita
  // permissão de localização, acompanha a posição em tempo real e NÃO mostra o botão
  // nativo do Mapbox nem a mancha/círculo de precisão.
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !navigator.geolocation) return;

    let watchId = null;
    let cancelled = false;

    const applyPosition = (position) => {
      if (cancelled) return;
      const { latitude, longitude } = position.coords;
      const nextLocation = [longitude, latitude];
      setUserLocation(nextLocation);

      // A geolocalização só centraliza automaticamente se ainda não houver
      // nenhum bbox de talhões/fazenda aplicado. Assim, ao filtrar uma fazenda,
      // o zoom do filtro não é sobrescrito pela posição do usuário.
      if (!centeredOnUserRef.current && !previousGeoJsonBbox.current && mapRef.current) {
        centeredOnUserRef.current = true;
        mapRef.current.flyTo({
          center: nextLocation,
          zoom: 18,
          duration: 1200,
          essential: true
        });
      }
    };

    navigator.geolocation.getCurrentPosition(
      applyPosition,
      (error) => console.warn("Não foi possível obter a localização atual:", error),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 30000 }
    );

    watchId = navigator.geolocation.watchPosition(
      applyPosition,
      (error) => console.warn("Não foi possível acompanhar a localização:", error),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 30000 }
    );

    return () => {
      cancelled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [mapLoaded, mapRef]);

  const lastHoveredRef = useRef(null);
  const lastSelectedRef = useRef([]);
  const lastClosedStateRef = useRef(new Set());

  // Atualiza status fechado por feature-state, sem reconstruir/clonar GeoJSON inteiro
  // a cada fechamento de talhão. Isso reduz travadas no módulo de mapas.
  useEffect(() => {
    if (!mapRef.current || activeMapModule !== 'ordemCorte') return;
    const map = mapRef.current.getMap();
    if (!map.getSource('talhoes')) return;

    const previous = lastClosedStateRef.current;
    previous.forEach((id) => {
      if (!idsOcultosSet.has(id)) {
        map.setFeatureState({ source: 'talhoes', id }, { closed: false });
      }
    });

    idsOcultosSet.forEach((id) => {
      if (!previous.has(id)) {
        map.setFeatureState({ source: 'talhoes', id }, { closed: true });
      }
    });

    lastClosedStateRef.current = new Set(idsOcultosSet);
  }, [idsOcultosSet, activeMapModule, mapLoaded]);

  // Atualiza manualmente os 'featureStates' no Mapbox nativo para lidar com hover visual
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current.getMap();
    if (!map.getSource('talhoes')) return;

    if (lastHoveredRef.current !== null && lastHoveredRef.current !== hoveredTalhao) {
        map.setFeatureState({ source: 'talhoes', id: lastHoveredRef.current }, { hover: false });
    }

    if (hoveredTalhao !== null && lastHoveredRef.current !== hoveredTalhao) {
        map.setFeatureState({ source: 'talhoes', id: hoveredTalhao }, { hover: true });
    }

    lastHoveredRef.current = hoveredTalhao;
  }, [hoveredTalhao]);

  // Atualiza manualmente os 'featureStates' no Mapbox nativo para lidar com select visual
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current.getMap();
    if (!map.getSource('talhoes')) return;

    // Reset previous selected
    lastSelectedRef.current.forEach(id => {
        map.setFeatureState({ source: 'talhoes', id }, { selected: false });
    });

    const newSelected = [];
    if (isMultiSelectMode) {
      selectedTalhoes.forEach(id => {
        map.setFeatureState({ source: 'talhoes', id }, { selected: true });
        newSelected.push(id);
      });
    } else if (selectedTalhao && selectedTalhao.id !== undefined) {
      map.setFeatureState({ source: 'talhoes', id: selectedTalhao.id }, { selected: true });
      newSelected.push(selectedTalhao.id);
    }

    lastSelectedRef.current = newSelected;
  }, [selectedTalhao, selectedTalhoes, isMultiSelectMode]);

  return (
    <div className="absolute inset-0 w-full h-full" style={{ filter: "saturate(0.95) contrast(1.02) brightness(0.88)" }}>
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{
          longitude: -49.35,
          latitude: -18.25,
          zoom: 8.4
        }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/satellite-v9"
        attributionControl={false}
        onClick={onMapClick}
        onLoad={() => setMapLoaded(true)}
        interactiveLayerIds={['talhoes-fill']}
        onMouseMove={(e) => {
          if (e.features && e.features.length > 0) {
            setHoveredTalhao(e.features[0].id);
          } else {
            setHoveredTalhao(null);
          }
        }}
        onMouseLeave={() => setHoveredTalhao(null)}
      >
        {userLocation && (
          <Marker longitude={userLocation[0]} latitude={userLocation[1]} anchor="center">
            <div
              aria-label="Sua localização atual"
              className="relative flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-sky-400 shadow-[0_0_0_2px_rgba(56,189,248,0.55)]"
            >
              <span className="h-2 w-2 rounded-full bg-white" />
            </div>
          </Marker>
        )}

        {visibleGeoJson && (
          <Source id="talhoes" type="geojson" data={visibleGeoJson}>
            <Layer
              id="talhoes-fill"
              type="fill"
              paint={{
                "fill-color": [
                  "case",
                  ["boolean", ["feature-state", "selected"], false],
                  "#ffbf00", // Bright yellow marking color for selected talhoes
                  ["boolean", ["feature-state", "hover"], false],
                  palette.goldLight,
                  // Caminho rápido: quando o backend/source já entrega a cor pronta,
                  // o Mapbox só lê a property e evita recalcular regra grande no React.
                  ["all", ["has", "_map_fill_color"], ["!=", ["get", "_map_fill_color"], ""]],
                  ["get", "_map_fill_color"],
                  // Fechamento local/realtime sem recriar GeoJSON inteiro.
                  ["all", ["==", activeMapModule, "ordemCorte"], ["boolean", ["feature-state", "closed"], false]],
                  ORDEM_CORTE_CORES.FECHADA,
                  // Regras de Cor para o Módulo de Ordem de Corte:
                  // 1. Vermelho = Fechado
                  ["all", ["==", activeMapModule, "ordemCorte"], ["boolean", ["get", "_is_closed_ordem"], false]],
                  ORDEM_CORTE_CORES.FECHADA,

                  // 2. Verde = Aberta (Já tem número da empresa informado)
                  ["all", ["==", activeMapModule, "ordemCorte"], ["boolean", ["get", "_has_open_ordem"], false]],
                  ORDEM_CORTE_CORES.ABERTA,

                  // 3. Amarelo = Pendente (Aguardando - abriu a ordem mas ainda não tem número da empresa)
                  ["all", ["==", activeMapModule, "ordemCorte"], ["boolean", ["get", "_is_aguardando_ordem"], false]],
                  ORDEM_CORTE_CORES.AGUARDANDO,

                  // 4. Transparente = Estimado (Ainda não abriu nenhuma ordem)
                  ["all", ["==", activeMapModule, "ordemCorte"], ["boolean", ["get", "_is_estimated"], true]],
                  "rgba(0,0,0,0)",

                  // Tratos Culturais (modo visual usando STATUS da Ordem de Corte)
                  ["all", ["==", activeMapModule, "tratosCulturais"], showTratosComoOrdemCorte, ["boolean", ["get", "_is_closed_ordem"], false]],
                  ORDEM_CORTE_CORES.FECHADA,

                  ["all", ["==", activeMapModule, "tratosCulturais"], showTratosComoOrdemCorte, ["boolean", ["get", "_has_open_ordem"], false]],
                  ORDEM_CORTE_CORES.ABERTA,

                  ["all", ["==", activeMapModule, "tratosCulturais"], showTratosComoOrdemCorte, ["boolean", ["get", "_is_aguardando_ordem"], false]],
                  ORDEM_CORTE_CORES.AGUARDANDO,

                  // Regras para os outros Módulos (Tratos Culturais = Verde p/ Liberado)
                  // (modo visual desligado mantém comportamento atual)
                  ["all", ["match", activeMapModule, ["tratosCulturais", "planejamentoTratosCulturais"], true, false], ["!", showTratosComoOrdemCorte], ["boolean", ["get", "_is_closed_os"], false]],
                  TRATOS_CORES.FECHADA_EXECUTADA, // Roxo (Executada/Fechada)

                  // Tratos Culturais (Azul = Aberta/Liberada)
                  ["all", ["match", activeMapModule, ["tratosCulturais", "planejamentoTratosCulturais"], true, false], ["!", showTratosComoOrdemCorte], ["boolean", ["get", "_has_open_os"], false]],
                  TRATOS_CORES.ABERTA_LIBERADA,

                  // Tratos Culturais (Amarelo = Aguardando Analista / Rascunho)
                  ["all", ["match", activeMapModule, ["tratosCulturais", "planejamentoTratosCulturais"], true, false], ["!", showTratosComoOrdemCorte], ["boolean", ["get", "_is_aguardando_analista_os"], false]],
                  TRATOS_CORES.PENDENTE_ANALISTA,

                  // Tratos Culturais (Amarelo = Aguardando Aprovação / Budget)
                  ["all", ["match", activeMapModule, ["tratosCulturais", "planejamentoTratosCulturais"], true, false], ["!", showTratosComoOrdemCorte], ["boolean", ["get", "_is_aguardando_aprovacao_os"], false]],
                  TRATOS_CORES.AGUARDANDO,

                  ["all", ["match", activeMapModule, ["tratosCulturais", "planejamentoTratosCulturais"], true, false], ["boolean", ["get", "_is_estimated"], true]],
                  "rgba(0,0,0,0)",

                  // Planejamento Safra (cor dinâmica por frente)
                  ["all", ["==", activeMapModule, "planejamentoSafra"], ["!=", ["get", "_planejamento"], null]],
                  ["coalesce", ["get", "_frente_color"], "#808080"],

                  ["all", ["==", activeMapModule, "planejamentoSafra"], ["==", ["get", "_planejamento"], null]],
                  "rgba(0,0,0,0.2)", // Cinza translúcido para os que não estão no planejamento mas estão estimados

                  // Padrão de Corte se estiver estimado (Apenas cai aqui se for "estimativa" ou "ordemCorte")
                  ["boolean", ["get", "_is_estimated"], false],
                  [
                    "match",
                    ["get", "_normalized_ecorte"],
                    "1º corte", "#ff0000",
                    "2º corte", "#00ff00",
                    "3º corte", "#ffe600",
                    "4º corte", "#01206e",
                    "5º corte", "#ff6a00",
                    "6º corte", "#9500ff",
                    "7º corte", "#00d0ff",
                    "8º corte", "#ea00ff",
                    "9º corte", "#b3ff00",
                    "10º corte", "#ff005d",
                    "11º corte", "#00ffff",
                    "#6e6e6e" // Default fallback color
                  ],
                  "transparent" // Polígonos sem estimativa continuam invisíveis
                ],
                "fill-opacity-transition": { "duration": 0 },
                "fill-color-transition": { "duration": 0 },
                "fill-opacity": [
                  "case",
                  ["boolean", ["feature-state", "selected"], false],
                  1.0,
                  ["boolean", ["feature-state", "hover"], false],
                  0.95,
                  ["boolean", ["get", "_is_estimated"], false],
                  0.85,
                  0
                ]
              }}
            />
            <Layer
              id="talhoes-outline"
              type="line"
              paint={{
                "line-color": [
                  "case",
                  ["boolean", ["feature-state", "selected"], false],
                  "#000000",
                  palette.white
                ],
                "line-opacity": [
                  "case",
                  ["boolean", ["feature-state", "selected"], false],
                  1.0,
                  0.5
                ],
                "line-opacity-transition": { "duration": 0 },
                "line-color-transition": { "duration": 0 },
                "line-width-transition": { "duration": 0 },
                "line-width": [
                  "case",
                  ["boolean", ["feature-state", "selected"], false],
                  6, // Highlight thickness
                  1.5
                ]
              }}
            />
            {showLabels && (
              <Layer
                id="talhoes-labels"
                type="symbol"
                minzoom={13} // OTIMIZAÇÃO: Mostra apenas quando tiver zoom adequado para não fritar CPU e não poluir
                layout={{
                  "text-field": [
                    "case",
                    ["==", activeMapModule, "planejamentoSafra"],
                    [
                      "concat",
                      ["get", "FUNDO_AGR"],
                      "\n",
                      ["get", "TALHAO"],
                      [
                        "case",
                        ["has", "sequencia", ["get", "_planejamento"]],
                        ["concat", "\nSEQ: ", ["to-string", ["get", "sequencia", ["get", "_planejamento"]]]],
                        ""
                      ]
                    ],
                    [
                      "concat",
                      ["get", "FUNDO_AGR"],
                      "\n",
                      ["get", "TALHAO"]
                    ]
                  ],
                  "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
                  "text-size": 12,
                  "text-anchor": "center",
                  "text-allow-overlap": false
                }}
                paint={{
                  "text-color": "#ffffff",
                  "text-halo-color": "#000000",
                  "text-halo-width": 1.5
                }}
              />
            )}
          </Source>
        )}
      </Map>
    </div>
  );
});

export default EstimativaMap;
