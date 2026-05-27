import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Map, { Source, Layer, Marker } from "react-map-gl";
import { palette } from "../../constants/theme";
import "mapbox-gl/dist/mapbox-gl.css";
import * as turf from "@turf/turf";
import { ORDEM_CORTE_CORES } from "../../services/ordemCorte/ordemCorteConstants";

const MAPBOX_TOKEN = "pk.eyJ1IjoiY2FybG9zaGduIiwiYSI6ImNtZDk0bXVxeTA0MTcyam9sb2h1dDhxaG8ifQ.uf0av4a0WQ9sxM1RcFYT2w";
const TRATOS_CORES = {
  FECHADA_EXECUTADA: "#8b5cf6",
  ABERTA_LIBERADA: "#3b82f6",
  AGUARDANDO: "#eab308",
  PENDENTE_ANALISTA: "#f97316"
};


const MEASURE_LINE_SOURCE_ID = "ordem-corte-measure-line";
const MEASURE_POINTS_SOURCE_ID = "ordem-corte-measure-points";

const formatMeasureDistance = (distanceKm) => {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return "0 m";
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`;
  return `${distanceKm.toFixed(2).replace(".", ",")} km`;
};

const buildMeasureGeoJson = (points) => ({
  type: "FeatureCollection",
  features: points.length >= 2
    ? [{
        type: "Feature",
        geometry: { type: "LineString", coordinates: points },
        properties: {}
      }]
    : []
});

const buildMeasurePointGeoJson = (points) => ({
  type: "FeatureCollection",
  features: points.map((coordinates, index) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates },
    properties: { ordem: index + 1 }
  }))
});

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
  selectedFazendaFilter = "",
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
  const [measureActive, setMeasureActive] = useState(false);
  const [measurePoints, setMeasurePoints] = useState([]);

  // Deixa a interação do modal/botões mais fluida quando um GeoJSON grande chega do filtro.
  // O Mapbox continua recebendo o dado, mas em baixa prioridade para não travar o React.
  const deferredEnhancedGeoJson = useDeferredValue(enhancedGeoJson);

  // Memoizamos os polígonos e evitamos clonar tudo em módulos que não precisam.
  // A cor do planejamento já vem pré-calculada em `_frente_color`; o mapa apenas lê a property.
  const visibleGeoJson = useMemo(() => {
    if (!deferredEnhancedGeoJson) return null;
    const sourceFeatures = deferredEnhancedGeoJson.features || [];

    const filteredFeatures = sourceFeatures.filter((feature) => {
      const p = feature.properties || {};
      const isEstimated = Boolean(p._is_estimated);

      if (activeMapModule === "estimativa") {
        return p._layer_visible !== false;
      }

      if (activeMapModule === "planejamentoSafra") return isEstimated;
      if (activeMapModule === "ordemCorte") return p._layer_visible !== false;
      if (activeMapModule === "tratosCulturais" || activeMapModule === "planejamentoTratosCulturais") return isEstimated;
      return true;
    });

    const styledFeatures = filteredFeatures.map((feature) => {
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

      if (activeMapModule === "ordemCorte") return feature;

      return feature;
    });

    return {
      ...deferredEnhancedGeoJson,
      features: styledFeatures
    };
  }, [deferredEnhancedGeoJson, activeMapModule]);

  useEffect(() => {
    if (activeMapModule !== "ordemCorte" || !visibleGeoJson?.features) return;
    console.log('[ordemCorte][front] sample features', visibleGeoJson.features.slice(0, 20).map((f) => ({
      fazenda: f.properties?.FAZENDA,
      talhao: f.properties?.TALHAO,
      _ordem_status: f.properties?._ordem_status,
      _map_fill_color: f.properties?._map_fill_color,
      _map_fill_opacity: f.properties?._map_fill_opacity,
      _layer_visible: f.properties?._layer_visible
    })));
  }, [activeMapModule, visibleGeoJson]);

  useEffect(() => {
    if (activeMapModule !== "ordemCorte") return;
    console.log('[ordemCorte][front] paint expression active');
  }, [activeMapModule]);

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

    const isOffline = typeof navigator !== "undefined" ? !navigator.onLine : false;
    const backendMapView = visibleGeoJson?._serverMapView || null;
    const backendBounds = backendMapView?.bounds;

    let targetBounds = null;
    let recommendedZoom = 15;

    if (Array.isArray(backendBounds) && backendBounds.length === 2) {
      targetBounds = backendBounds;
      recommendedZoom = backendMapView?.recommendedZoom || 15;
      if (!isOffline) console.log('[estimativa] using backend mapView');
      console.log("[map] applying mapView", { source: isOffline ? "offline-cache" : "backend", mapView: backendMapView });
    } else if (isOffline) {
      const localBounds = computeFallbackBbox(visibleGeoJson?.features || []);
      if (Array.isArray(localBounds) && localBounds.length === 4) {
        const [minLng, minLat, maxLng, maxLat] = localBounds.map(Number);
        if ([minLng, minLat, maxLng, maxLat].every(Number.isFinite)) {
          targetBounds = [[minLng, minLat], [maxLng, maxLat]];
        }
      }
    }

    if (!targetBounds) return;

    const [sw, ne] = targetBounds;
    const [minLng, minLat] = sw || [];
    const [maxLng, maxLat] = ne || [];
    if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return;

    const bboxString = `${minLng},${minLat},${maxLng},${maxLat}|${recommendedZoom}`;
    if (bboxString === previousGeoJsonBbox.current) return;
    previousGeoJsonBbox.current = bboxString;

    if ((backendMapView?.visibleFeaturesCount === 1) || (minLng === maxLng && minLat === maxLat)) {
      mapRef.current.flyTo({
        center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2],
        zoom: recommendedZoom,
        duration: 800,
        essential: true
      });
      return;
    }

    mapRef.current.fitBounds(
      [[minLng, minLat], [maxLng, maxLat]],
      { padding: 60, maxZoom: recommendedZoom || 15, duration: 800 }
    );
  }, [visibleGeoJson?._serverMapView, visibleGeoJson?.features, mapRef, mapLoaded]);

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

  const isMeasureAvailable = activeMapModule === "ordemCorte";

  const measureLineGeoJson = useMemo(() => buildMeasureGeoJson(measurePoints), [measurePoints]);
  const measurePointGeoJson = useMemo(() => buildMeasurePointGeoJson(measurePoints), [measurePoints]);

  const measureDistanceKm = useMemo(() => {
    if (measurePoints.length < 2) return 0;
    return turf.length(turf.lineString(measurePoints), { units: "kilometers" });
  }, [measurePoints]);

  const handleToggleMeasure = useCallback(() => {
    if (!isMeasureAvailable) return;
    setMeasureActive((current) => !current);
  }, [isMeasureAvailable]);

  const handleClearMeasure = useCallback(() => {
    setMeasurePoints([]);
  }, []);

  const handleFinishMeasure = useCallback(() => {
    setMeasureActive(false);
  }, []);

  const handleMapClick = useCallback((event) => {
    if (measureActive && isMeasureAvailable) {
      event?.originalEvent?.preventDefault?.();
      event?.originalEvent?.stopPropagation?.();
      const lngLat = event?.lngLat;
      if (lngLat) {
        setMeasurePoints((current) => [...current, [lngLat.lng, lngLat.lat]]);
      }
      return;
    }
    onMapClick?.(event);
  }, [isMeasureAvailable, measureActive, onMapClick]);

  useEffect(() => {
    if (!isMeasureAvailable) {
      setMeasureActive(false);
      setMeasurePoints([]);
    }
  }, [isMeasureAvailable]);

  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map) return;
    map.getCanvas().style.cursor = measureActive && isMeasureAvailable ? "crosshair" : "";
    return () => {
      if (map?.getCanvas) map.getCanvas().style.cursor = "";
    };
  }, [isMeasureAvailable, mapLoaded, mapRef, measureActive]);

  return (
    <div className="absolute inset-0 w-full h-full" style={{ filter: "saturate(0.95) contrast(1.02) brightness(0.88)" }}>
      {isMeasureAvailable && (
        <button
          type="button"
          onClick={handleToggleMeasure}
          className={`absolute left-5 bottom-[150px] z-30 flex h-12 w-12 items-center justify-center rounded-full border border-white/20 text-xl shadow-2xl backdrop-blur-md transition ${measureActive ? "bg-emerald-500 text-white ring-2 ring-white/70" : "bg-slate-950/80 text-white hover:bg-slate-800/90"}`}
          title={measureActive ? "Desativar régua" : "Ativar régua de medição"}
          aria-label={measureActive ? "Desativar régua" : "Ativar régua de medição"}
        >
          📏
        </button>
      )}

      {isMeasureAvailable && (measureActive || measurePoints.length > 0) && (
        <div className="absolute right-4 top-4 z-20 flex max-w-[260px] flex-col gap-2 rounded-2xl border border-white/20 bg-black/70 p-3 text-white shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-bold">Régua de medição</span>
            <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${measureActive ? "bg-emerald-500 text-white" : "bg-white/10 text-white/80"}`}>
              {measureActive ? "Ativa" : "Finalizada"}
            </span>
          </div>

          {measureActive && (
            <p className="text-xs leading-snug text-white/80">
              Clique no mapa para marcar os pontos da medição.
            </p>
          )}

          <div className="rounded-xl bg-white/10 p-2 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="text-white/70">Metros</span>
              <strong>{Math.round(measureDistanceKm * 1000).toLocaleString("pt-BR")} m</strong>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <span className="text-white/70">Quilômetros</span>
              <strong className="text-base">{formatMeasureDistance(measureDistanceKm)}</strong>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleClearMeasure}
              disabled={measurePoints.length === 0}
              className="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={handleFinishMeasure}
              disabled={!measureActive}
              className="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Finalizar
            </button>
          </div>
        </div>
      )}

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
        onClick={handleMapClick}
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

        {isMeasureAvailable && (
          <>
            <Source id={MEASURE_LINE_SOURCE_ID} type="geojson" data={measureLineGeoJson}>
              <Layer
                id="ordem-corte-measure-line-layer"
                type="line"
                paint={{
                  "line-color": "#ffffff",
                  "line-width": 4,
                  "line-opacity": 0.95,
                  "line-dasharray": [1.5, 1]
                }}
              />
            </Source>
            <Source id={MEASURE_POINTS_SOURCE_ID} type="geojson" data={measurePointGeoJson}>
              <Layer
                id="ordem-corte-measure-points-layer"
                type="circle"
                paint={{
                  "circle-radius": 6,
                  "circle-color": "#22c55e",
                  "circle-stroke-color": "#ffffff",
                  "circle-stroke-width": 2
                }}
              />
            </Source>
            {measurePoints.length > 0 && (
              <Marker
                longitude={measurePoints[measurePoints.length - 1][0]}
                latitude={measurePoints[measurePoints.length - 1][1]}
                anchor="bottom"
                offset={[0, -12]}
              >
                <div className="rounded-full border border-white/30 bg-black/80 px-3 py-1 text-xs font-bold text-white shadow-lg">
                  {formatMeasureDistance(measureDistanceKm)}
                </div>
              </Marker>
            )}
          </>
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
                  ["==", activeMapModule, "ordemCorte"],
                  ["coalesce", ["get", "_map_fill_color"], "rgba(0,0,0,0)"],

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

                  ["get", "_map_fill_color"]
                ],
                "fill-opacity-transition": { "duration": 0 },
                "fill-color-transition": { "duration": 0 },
                "fill-opacity": [
                  "case",
                  ["boolean", ["feature-state", "selected"], false],
                  1.0,
                  ["boolean", ["feature-state", "hover"], false],
                  0.95,
                  ["get", "_map_fill_opacity"]
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
                  ["get", "_map_stroke_color"]
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
                  6,
                  ["get", "_map_line_width"]
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
