import React, { Suspense, lazy, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { palette } from "../../constants/theme";

// Components Layout
import AnimatedBackground from "../layout/AnimatedBackground";
import GlowOrb from "../layout/GlowOrb";
import TopNavbar from "../layout/TopNavbar";
import SidebarMenu from "../layout/SidebarMenu";
import CompanyConfig from "../CompanyConfig";
import ProtectedModule from "../access/ProtectedModule";
import { getFirstAccessibleModule, hasCompanyContext, hasModuleAccess, hasMapLayerAccess } from "../../utils/accessControl";
import { getModuleFromPath, navigateToModule } from "../../utils/moduleRoutes";

// Módulos em lazy loading: cada tela pesada só entra no bundle quando for aberta pela URL/menu.
const EstimativaMap = lazy(() => import("../../modules/estimativas/EstimativaMap"));
const EstimativaPanels = lazy(() => import("../../modules/estimativas/EstimativaPanels"));
const EstimativaModals = lazy(() => import("../../modules/estimativas/EstimativaModals"));
const CadastroProfissionalPage = lazy(() => import("../../modules/cadastroProfissional/CadastroProfissionalPage"));
const RelatorioEstimativaPage = lazy(() => import("../../modules/relatorioEstimativa/components/RelatorioEstimativaPage"));
const Premissas = lazy(() => import("../../modules/premissas/Premissas"));
const CadastrosMestresModule = lazy(() => import("../../modules/cadastros_mestres/CadastrosMestresModule"));
const GerenciamentoOrdemCortePage = lazy(() => import("../../modules/gerenciamentoOrdemCorte/GerenciamentoOrdemCortePage"));
const GerenciamentoOrdemServicoPage = lazy(() => import("../../modules/gerenciamentoOrdemServico/GerenciamentoOrdemServicoPage"));
const AprovacaoSolicitacoesServicoPage = lazy(() => import("../../modules/aprovacaoSolicitacoes/AprovacaoSolicitacoesServicoPage"));
const CompanyManagementPage = lazy(() => import("../../modules/companyManagement/CompanyManagementPage"));
const UserManagementPage = lazy(() => import("../../modules/userManagement/UserManagementPage"));
const DashboardHubPage = lazy(() => import("../../modules/dashboard/DashboardHubPage"));
const DadosDashboardHubPage = lazy(() => import("../../modules/dadosDashboard/DadosDashboardHubPage"));
const LancamentosHubPage = lazy(() => import("../../modules/lancamentos/LancamentosHubPage"));

// Hooks Customizados (Lógica Isolada)
import { useEstimativasData } from "../../hooks/useEstimativasData";
import { useMapFilters } from "../../hooks/useMapFilters";
import { useMapSummary } from "../../hooks/useMapSummary";
import { useOrdensCorte } from "../../hooks/estimativas/useOrdensCorte";
import { useOrdensServico } from "../../hooks/estimativas/useOrdensServico";
import { usePlanejamentoTratos } from "../../hooks/estimativas/usePlanejamentoTratos";
import { useOrdemCorteMapState } from "../../hooks/estimativas/useOrdemCorteMapState";
import { getUniqueTalhaoId } from "../../utils/geoHelpers";

const safeParsePlanejamento = (value) => {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return null; }
  }
  return null;
};

const normalizeFrentePlanejamento = (value) => String(value ?? '').replace(/\D+/g, '');

const getPlanejamentoSequenceKey = (feature) => {
  const props = feature?.properties || {};
  const plan = safeParsePlanejamento(props._planejamento);
  if (!plan) return '';
  if (plan.sequenciaGrupoId) return `grupo:${plan.sequenciaGrupoId}`;

  const frente = normalizeFrentePlanejamento(plan.frenteColheita || props.FRENTE || props.frenteColheita);
  const safra = String(plan.safra || props.SAFRA || props.safra || '').trim();
  const sequencia = String(plan.sequencia || props.sequencia || '').trim();
  const bloco = String(plan.blocoColheita || plan.bloco || props.BLOCO || '').trim().toUpperCase();
  if (!frente || !safra || !sequencia) return '';
  return `seq:${safra}|${frente}|${sequencia}|${bloco}`;
};

const getFeatureStableId = (feature) => feature?.id ?? feature?.properties?.featureId;

/**
 * PostLoginScreen.jsx
 *
 * O que este bloco faz:
 * Orquestra todo o ambiente "logado" da plataforma.
 * Conecta a barra superior (Navbar), a barra lateral (SidebarMenu) e decide qual
 * módulo renderizar no centro (Estimativa Safra vs Configuração).
 *
 * Por que ele existe:
 * Aqui fazemos a "cola" (Binding) entre o Model (useEstimativasData, etc) e a View (EstimativaMap, etc).
 * Ele injeta os "estados lógicos" nos "componentes visuais puramente declarativos".
 *
 * O que entra e o que sai:
 * @param {Function} onLogout - Handler de saída passado pelo componente Root.
 * @returns {JSX.Element} Todo o layout envolto da Dashboard.
 */
export default function PostLoginScreen({ onLogout, session }) {
  // === ESTADOS ESTRUTURAIS DA UI GLOBAL ===
  const [activeModule, setActiveModule] = useState(() => getModuleFromPath(getFirstAccessibleModule(session) || 'userManagement')); // "estimativa" | "premissas" | etc
  const [activeMapModule, setActiveMapModule] = useState("estimativa"); // "estimativa" | "tratosCulturais"
  const allowedMapModules = React.useMemo(() => ({
    estimativa: hasMapLayerAccess(session, 'estimativa'),
    planejamentoSafra: hasMapLayerAccess(session, 'planejamentoSafra'),
    ordemCorte: hasMapLayerAccess(session, 'ordemCorte'),
    tratosCulturais: hasMapLayerAccess(session, 'tratosCulturais'),
    planejamentoTratosCulturais: hasMapLayerAccess(session, 'tratosCulturais')
  }), [session]);
  const hasAnyMapLayerAccess = React.useMemo(() => Object.values(allowedMapModules).some(Boolean), [allowedMapModules]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [showTratosComoOrdemCorte, setShowTratosComoOrdemCorte] = useState(false);

  // Mocks de dados globais
  const currentCompanyId = session?.user?.companyId;
  const currentSafra = "2026/2027";
  const notificationsMock = [
    { title: "Estimativa pendente", text: "Talhão 103 está sem estimativa para a safra atual." },
    { title: "Sincronização concluída", text: "Última atualização enviada com sucesso." },
  ];

  const isMapWorkspaceActive = activeModule === "estimativa" || activeModule === "configuracao" || activeModule === "aprovacaoSolicitacoesServico";
  const mapCompanyId = isMapWorkspaceActive ? currentCompanyId : null;

  React.useEffect(() => {
    const handlePopState = () => {
      const fallback = getFirstAccessibleModule(session) || 'userManagement';
      const next = getModuleFromPath(fallback);
      setActiveModule((prev) => (prev === next ? prev : next));
    };
    window.addEventListener('popstate', handlePopState);
    handlePopState();
    return () => window.removeEventListener('popstate', handlePopState);
  }, [session]);

  React.useEffect(() => {
    if (!activeModule) return;
    navigateToModule(activeModule, { replace: true });
  }, [activeModule]);

  // === ESTADOS DO MAPA DE SELEÇÃO ===
  const mapRef = useRef(null);
  const [selectedTalhao, setSelectedTalhao] = useState(null);
  const [selectedTalhoes, setSelectedTalhoes] = useState([]);
  const [hoveredTalhao, setHoveredTalhao] = useState(null);
  const isMultiSelectMode = true; // Por enquanto fixo como true na especificação

  // === HOOKS LÓGICOS DE NEGÓCIO ===
  // 4. Gerencia as Ordens de Corte
  const ordensState = useOrdensCorte(mapCompanyId, currentSafra);
  const ordensMapState = useOrdemCorteMapState(ordensState.vinculosSafra);

  const ordensServicoState = useOrdensServico(mapCompanyId, currentSafra);
  const ordensServicoMapState = useOrdemCorteMapState(ordensServicoState.vinculosSafra); // Reuse the same logic for statuses (ABERTA, AGUARDANDO, FECHADA)
  const planejamentoTratosState = usePlanejamentoTratos(mapCompanyId, currentSafra);
  const planejamentoTratosMapState = useOrdemCorteMapState(planejamentoTratosState.vinculosSafra);

  // 1. Gerencia dados do PostgreSQL (Carregamento e Salvamento)
  const estData = useEstimativasData(currentCompanyId, currentSafra, setActiveModule, isMapWorkspaceActive);

  // 2. Gerencia a Filtragem do GeoJSON baseando-se nos inputs
  // Agora passamos o activeMapModule e os idsOcultos para filtrar as opções disponíveis dinamicamente
  const mapStatusStateForActiveLayer = (activeMapModule === 'tratosCulturais')
    ? ordensServicoMapState
    : (activeMapModule === 'planejamentoTratosCulturais')
      ? planejamentoTratosMapState
      : ordensMapState;

  const mapFilters = useMapFilters(
    estData.geoJsonData,
    estData.allEstimates,
    activeMapModule,
    mapStatusStateForActiveLayer.idsOcultosSet,
    mapStatusStateForActiveLayer.idsAbertosSet,
    mapCompanyId,
    currentSafra
  );

  const lastMapFilterSignatureRef = React.useRef('');

  React.useEffect(() => {
    if (!isMapWorkspaceActive || !estData.reloadMapWithFilters) return;

    const compactFilters = Object.fromEntries(
      Object.entries(mapFilters.appliedFilters || {}).filter(([, value]) => {
        if (value === undefined || value === null || value === '' || value === 'all') return false;
        return !(Array.isArray(value) && value.length === 0);
      })
    );

    const filterSignature = JSON.stringify({
      filters: compactFilters,
      activeMapModule,
      safra: currentSafra
    });

    // Trocar somente a camada do mapa não pode recarregar/substituir o GeoJSON base.
    // A pintura das camadas deve acontecer em cima da base já carregada; quando a
    // recarga remota roda a cada troca de camada, o mapa pisca e pode voltar vazio
    // caso o backend ainda não consiga projetar `_is_estimated` para todos os IDs.
    if (lastMapFilterSignatureRef.current === filterSignature) return;
    lastMapFilterSignatureRef.current = filterSignature;

    estData.reloadMapWithFilters({
      filters: compactFilters,
      activeMapModule,
    });
  }, [isMapWorkspaceActive, mapFilters.appliedFilters, activeMapModule, currentSafra, estData.reloadMapWithFilters]);

  const normalizeMapId = (value) => String(value ?? '').trim().replace(/\.0+$/, '').replace(/\s+/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

  const getMapIdVariants = (feature) => {
    const p = feature?.properties || {};
    const values = [
      feature?.id,
      p.id,
      p.featureId,
      p.talhaoId,
      p.fieldId,
      p.fieldCode,
      p.TALHAO_ID,
      p.CD_TALHAO,
      p.COD_TALHAO,
      p.TALHAO,
      p._unique_talhao_id,
      getUniqueTalhaoId(feature),
      p.FUNDO_AGR !== undefined && p.TALHAO !== undefined ? `${p.FUNDO_AGR}_${p.TALHAO}` : null,
      p.FAZENDA !== undefined && p.TALHAO !== undefined ? `${p.FAZENDA}_${p.TALHAO}` : null,
    ];

    const variants = [];
    values.forEach((value) => {
      if (value === undefined || value === null || value === '') return;
      const text = String(value).trim();
      if (!text) return;
      variants.push(value, text, text.toUpperCase(), normalizeMapId(text));
      const numeric = Number(text);
      if (Number.isFinite(numeric)) variants.push(numeric);
    });
    return Array.from(new Set(variants.filter((value) => value !== undefined && value !== null && value !== '')));
  };

  const hasMapFeatureId = (set, feature) => {
    if (!set) return false;
    return getMapIdVariants(feature).some((id) => {
      if (set.has(id)) return true;
      const numeric = Number(id);
      return Number.isFinite(numeric) && set.has(numeric);
    });
  };

  // 5. Injeta a flag visual _has_open_ordem e _is_aguardando_ordem no GeoJSON sem quebrar o hook useMapFilters
  const mapboxGeoJson = React.useMemo(() => {
     if (!mapFilters.enhancedGeoJson) return null;
     if (mapFilters.enhancedGeoJson?._serverMeta?.source === 'backend' || mapFilters.enhancedGeoJson?._serverSummaryData) return mapFilters.enhancedGeoJson;
     return {
        ...mapFilters.enhancedGeoJson,
        features: mapFilters.enhancedGeoJson.features.map(f => ({
            ...f,
            properties: {
                ...f.properties,
                // Ordem de Corte Properties
                _has_open_ordem: Boolean(f.properties?._has_open_ordem) || hasMapFeatureId(ordensMapState.idsAbertosSet, f),
                _is_aguardando_ordem: Boolean(f.properties?._is_aguardando_ordem) || hasMapFeatureId(ordensMapState.idsAguardandoSet, f),
                _is_closed_ordem: Boolean(f.properties?._is_closed_ordem) || hasMapFeatureId(ordensMapState.idsOcultosSet, f),

                // Ordem de Serviço Properties
                _has_open_os: Boolean(f.properties?._has_open_os) || hasMapFeatureId(activeMapModule === 'planejamentoTratosCulturais' ? planejamentoTratosMapState.idsAbertosSet : ordensServicoMapState.idsAbertosSet, f),
                _is_aguardando_os: Boolean(f.properties?._is_aguardando_os) || hasMapFeatureId(activeMapModule === 'planejamentoTratosCulturais' ? planejamentoTratosMapState.idsAguardandoSet : ordensServicoMapState.idsAguardandoSet, f), // Compatibilidade se necessário
                _is_aguardando_analista_os: Boolean(f.properties?._is_aguardando_analista_os) || hasMapFeatureId(activeMapModule === 'planejamentoTratosCulturais' ? planejamentoTratosMapState.idsAguardandoAnalistaSet : ordensServicoMapState.idsAguardandoAnalistaSet, f),
                _is_aguardando_aprovacao_os: Boolean(f.properties?._is_aguardando_aprovacao_os) || hasMapFeatureId(activeMapModule === 'planejamentoTratosCulturais' ? planejamentoTratosMapState.idsAguardandoAprovacaoSet : ordensServicoMapState.idsAguardandoAprovacaoSet, f),
                _is_closed_os: Boolean(f.properties?._is_closed_os) || hasMapFeatureId(activeMapModule === 'planejamentoTratosCulturais' ? planejamentoTratosMapState.idsOcultosSet : ordensServicoMapState.idsOcultosSet, f),
            }
        }))
     };
  }, [
    mapFilters.enhancedGeoJson,
    ordensMapState.idsAbertosSet, ordensMapState.idsAguardandoSet, ordensMapState.idsOcultosSet,
    ordensServicoMapState.idsAbertosSet, ordensServicoMapState.idsAguardandoSet, ordensServicoMapState.idsAguardandoAnalistaSet, ordensServicoMapState.idsAguardandoAprovacaoSet, ordensServicoMapState.idsOcultosSet,
    planejamentoTratosMapState.idsAbertosSet, planejamentoTratosMapState.idsAguardandoSet, planejamentoTratosMapState.idsAguardandoAnalistaSet, planejamentoTratosMapState.idsAguardandoAprovacaoSet, planejamentoTratosMapState.idsOcultosSet,
    activeMapModule
  ]);

  // 3. Gerencia o painel de Resumo e a Legenda baseando-se no que está ativo (agora com as propriedades injetadas como visible)
  const hasBackendReadyGeoJson = (geojson) => {
    const features = geojson?.features || [];
    return features.some((feature) => {
      const props = feature?.properties || {};
      return props._map_source === "backend" && (props._map_fill_color || props._color);
    });
  };

  const mapboxGeoJsonVisivelOnly = React.useMemo(() => {
    if (!mapboxGeoJson) return null;
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (isOnline && hasBackendReadyGeoJson(mapboxGeoJson)) return mapboxGeoJson;

    return {
      ...mapboxGeoJson,
      features: mapboxGeoJson.features.filter(f => {
        const isEstimated = f.properties?._is_estimated;
        if (activeMapModule === "estimativa") {
            return !f.properties._is_closed_ordem && !f.properties._has_open_ordem && !f.properties._is_aguardando_ordem;
        } else if (activeMapModule === "planejamentoSafra" || activeMapModule === "ordemCorte" || activeMapModule === "tratosCulturais" || activeMapModule === "planejamentoTratosCulturais") {
            return isEstimated;
        }
        return true;
      })
    };
  }, [mapboxGeoJson, activeMapModule]);

  const mapSummary = useMapSummary(mapboxGeoJsonVisivelOnly, estData.allEstimates, activeMapModule);

  // Removemos mock de notificações
  // const notificationsMock = [...]

  React.useEffect(() => {
    const nextModule = getFirstAccessibleModule(session) || 'userManagement';
    if (!activeModule) {
      setActiveModule(nextModule);
      return;
    }

    const moduleMap = {
      estimativa: 'mapas',
      premissas: 'premissas',
      cadastros_mestres: 'cadastros_mestres',
      cadastroProfissional: 'cadastro_profissional',
      relatorioEstimativa: 'relatorio_estimativa',
      gerenciamentoOrdemCorte: 'gerenciamento_ordem_corte',
      gerenciamentoOrdemServico: 'gerenciamento_ordem_servico',
      aprovacaoSolicitacoesServico: 'aprovacao_solicitacoes_servico',
      configuracao: 'configuracao_empresa',
      userManagement: 'gerenciamento_usuarios',
      companyManagement: 'gerenciamento_empresas',
      dashboards: 'dashboards',
      dadosDashboard: 'dados_dashboard'
    };

    const permissionKey = moduleMap[activeModule];
    if (!permissionKey) return;

    if (!hasModuleAccess(session, permissionKey)) {
      setActiveModule(nextModule);
      return;
    }

    if (!hasCompanyContext(session) && !['userManagement', 'companyManagement'].includes(activeModule)) {
      setActiveModule(nextModule);
    }
  }, [session, activeModule]);

  /**
   * Handler de Clique no Mapa.
   * Aciona a inclusão/exclusão de IDs de talhões do vetor `selectedTalhoes`
   * e chama o loading da estimativa salva para eles via PostgreSQL.
   */
  React.useEffect(() => {
    const firstAllowedMapModule = Object.entries(allowedMapModules).find(([, allowed]) => allowed)?.[0] || null;
    if (firstAllowedMapModule && !allowedMapModules[activeMapModule]) {
      setActiveMapModule(firstAllowedMapModule);
    }
  }, [activeMapModule, allowedMapModules]);

  React.useEffect(() => {
    if (activeMapModule !== "tratosCulturais") {
      setShowTratosComoOrdemCorte(false);
    }
  }, [activeMapModule]);

  const onMapClick = (e) => {
    const feature = e.features && e.features[0];
    if (feature && feature.properties) {
      const featureId = feature.properties.featureId ?? feature.id;
      const allFeatures = mapFilters.enhancedGeoJson?.features || [];
      const clickedFullFeature = allFeatures.find(f => getFeatureStableId(f) === featureId) || feature;

      // Planejamento Safra: ao clicar em qualquer talhão que já pertence a uma sequência,
      // seleciona automaticamente todos os talhões daquela mesma frente/sequência/grupo.
      if (activeMapModule === "planejamentoSafra") {
        const sequenceKey = getPlanejamentoSequenceKey(clickedFullFeature);
        if (sequenceKey) {
          const groupIds = allFeatures
            .filter(f => getPlanejamentoSequenceKey(f) === sequenceKey)
            .map(getFeatureStableId)
            .filter(id => id !== undefined && id !== null);

          if (groupIds.length > 1) {
            setSelectedTalhoes(groupIds);
            setSelectedTalhao(clickedFullFeature);
            estData.loadEstimateData(clickedFullFeature);
            setHoveredTalhao(null);
            return;
          }
        }
      }

      setSelectedTalhoes(prev => {
        const newSelection = prev.includes(featureId) ? prev.filter(id => id !== featureId) : [...prev, featureId];

        // Se após clicar, a seleção tiver apenas 1 item, carregue seus dados de estimativa
        if (newSelection.length === 1) {
          const singleFeature = allFeatures.find(f => getFeatureStableId(f) === newSelection[0]);
          if (singleFeature) {
            setSelectedTalhao(singleFeature);
            estData.loadEstimateData(singleFeature);
          }
        } else if (newSelection.length === 0) {
          setSelectedTalhao(null);
        } else {
          // Quando houver mais de um selecionado, exibimos informações do último clicado apenas no contexto do form
          setSelectedTalhao(clickedFullFeature);
          estData.loadEstimateData(clickedFullFeature);
        }

        return newSelection;
      });
      setHoveredTalhao(null);
    } else {
      // Clicou fora de qualquer feature: limpa tudo
      setSelectedTalhoes([]);
      setSelectedTalhao(null);
    }
  };

  return (
    <div
      className="h-screen relative overflow-hidden flex flex-col"
      style={{
        // 100dvh garante altura real, safe-area-inset-bottom evita o map ficar atrás da barrinha de gesto de iPhones e Androids
        height: "100dvh",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        background: `linear-gradient(160deg, ${palette.bg2} 0%, ${palette.tech} 60%, ${palette.tech2} 100%)`,
        color: palette.white
      }}
    >
      <AnimatedBackground />
      <GlowOrb className="top-[-70px] right-[-70px] bg-yellow-300/20" size={260} delay={0.2} />
      <GlowOrb className="bottom-[8%] left-[-60px] bg-blue-500/20" size={300} delay={0.8} />

      {/* --- MENU LATERAL ESQUERDO --- */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/45"
              onClick={() => setMenuOpen(false)}
            />
            <motion.div
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: "spring", stiffness: 260, damping: 28 }}
              className="fixed inset-y-0 left-0 z-50 w-[285px] shadow-2xl"
            >
              <SidebarMenu activeModule={activeModule} setActiveModule={setActiveModule} setMenuOpen={setMenuOpen} session={session} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* --- MODAIS PRINCIPAIS DA ESTIMATIVA SAFRA --- */}
      {activeModule === "estimativa" && (
        <Suspense fallback={null}>
        <EstimativaModals
          estimateOpen={estData.estimateOpen} setEstimateOpen={estData.setEstimateOpen}
          historyOpen={estData.historyOpen} setHistoryOpen={estData.setHistoryOpen}
          filtersOpen={mapFilters.filtersOpen} setFiltersOpen={mapFilters.setFiltersOpen}

          currentSafra={currentSafra}
          currentRodada={estData.currentRodada}
          allEstimates={estData.allEstimates}

          scope={estData.scope} setScope={estData.setScope}
          selectedTalhao={selectedTalhao} selectedTalhoes={selectedTalhoes}
          setSelectedTalhao={setSelectedTalhao} setSelectedTalhoes={setSelectedTalhoes}
          enhancedGeoJson={mapFilters.enhancedGeoJson} geoJsonData={estData.geoJsonData}

          formEstimativa={estData.formEstimativa} setFormEstimativa={estData.setFormEstimativa}
          isSaving={estData.isSaving} submitEstimate={estData.submitEstimate}
          estimateHistory={estData.estimateHistory}

          filters={mapFilters.filters} setFilters={mapFilters.setFilters}
          setAppliedFilters={mapFilters.setAppliedFilters} filterOptions={mapFilters.filterOptions}
          updateFormAreaFromScope={estData.updateFormAreaFromScope}
          activeMapModule={activeMapModule}
          session={session}
        />
        </Suspense>
      )}

      {/* --- CORPO DA PÁGINA (NAVBAR + CONTEÚDO) --- */}
      <div className="relative z-10 h-full flex flex-col">
        <TopNavbar
          setMenuOpen={setMenuOpen}
          notificationsOpen={notificationsOpen}
          setNotificationsOpen={setNotificationsOpen}
          profileOpen={profileOpen}
          setProfileOpen={setProfileOpen}
          session={session}
          onLogout={onLogout}
        />

        <div className="relative flex-1 overflow-hidden">
          <Suspense fallback={null}>
          {activeModule === "cadastroProfissional" ? (
            <ProtectedModule session={session} moduleKey="cadastro_profissional" fallback={<div className="p-6 text-white">Acesso negado ao módulo.</div>}>
            <div className="absolute inset-0 z-10 overflow-hidden bg-black/20">
              <CadastroProfissionalPage companyId={currentCompanyId} />
            </div>
            </ProtectedModule>
          ) : activeModule === "relatorioEstimativa" ? (
            <ProtectedModule session={session} moduleKey="relatorio_estimativa" fallback={<div className="p-6 text-white">Acesso negado ao módulo.</div>}>
            <div className="absolute inset-0 z-10 overflow-auto bg-black/20">
              <RelatorioEstimativaPage />
            </div>
            </ProtectedModule>
          ) : activeModule === "gerenciamentoOrdemCorte" ? (
            <ProtectedModule session={session} moduleKey="gerenciamento_ordem_corte" fallback={<div className="p-6 text-white">Acesso negado ao módulo.</div>}>
            <div className="absolute inset-0 w-full h-full bg-[#f8fafc] overflow-y-auto">
              <GerenciamentoOrdemCortePage
                 companyId={currentCompanyId}
                 safra={currentSafra}
                 setActiveModule={setActiveModule}
              />
            </div>
            </ProtectedModule>
          ) : activeModule === "gerenciamentoOrdemServico" ? (
            <ProtectedModule session={session} moduleKey="gerenciamento_ordem_servico" fallback={<div className="p-6 text-white">Acesso negado ao módulo.</div>}>
            <div className="absolute inset-0 w-full h-full bg-[#f8fafc] overflow-y-auto">
              <GerenciamentoOrdemServicoPage
                 companyId={currentCompanyId}
                 safra={currentSafra}
                 setActiveModule={setActiveModule}
              />
            </div>
            </ProtectedModule>
          ) : activeModule === "aprovacaoSolicitacoesServico" ? (
            <ProtectedModule session={session} moduleKey="aprovacao_solicitacoes_servico" fallback={<div className="p-6 text-white">Acesso negado ao módulo.</div>}>
            <div className="absolute inset-0 w-full h-full bg-[#f8fafc] overflow-y-auto">
              <AprovacaoSolicitacoesServicoPage
                 companyId={currentCompanyId}
                 safra={currentSafra}
                 session={session}
                filterOptions={mapFilters.filterOptions}
                appliedFilters={mapFilters.appliedFilters}
              />
            </div>
            </ProtectedModule>
          ) : activeModule === "estimativa" ? (
            <ProtectedModule session={session} moduleKey="mapas" fallback={<div className="p-6 text-white">Acesso negado ao módulo.</div>}>
            {hasAnyMapLayerAccess ? (
            <>
              {/* O componente de renderização pura do WebGL via Mapbox */}
              <EstimativaMap
                mapRef={mapRef}
                enhancedGeoJson={mapboxGeoJson}
                onMapClick={onMapClick}
                setHoveredTalhao={setHoveredTalhao}
                showLabels={showLabels}
                hoveredTalhao={hoveredTalhao}
                isMultiSelectMode={isMultiSelectMode}
                selectedTalhoes={selectedTalhoes}
                selectedTalhao={selectedTalhao}
                idsAbertosSet={activeMapModule === 'planejamentoTratosCulturais' ? planejamentoTratosMapState.idsAbertosSet : ((activeMapModule === 'tratosCulturais') ? ordensServicoMapState.idsAbertosSet : ordensMapState.idsAbertosSet)}
                idsOcultosSet={activeMapModule === 'planejamentoTratosCulturais' ? planejamentoTratosMapState.idsOcultosSet : ((activeMapModule === 'tratosCulturais') ? ordensServicoMapState.idsOcultosSet : ordensMapState.idsOcultosSet)}
                activeMapModule={activeMapModule}
                showTratosComoOrdemCorte={showTratosComoOrdemCorte}
              />

              <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(180deg, rgba(5,5,5,0.14), rgba(5,5,5,0.08) 20%, rgba(5,5,5,0.18) 100%)" }} />

              {/* Os painéis flutuantes em cima do mapa (Título, Legend, Talhões selecionados) */}
              <EstimativaPanels
                idsOcultosSet={(activeMapModule === 'tratosCulturais' || activeMapModule === 'planejamentoTratosCulturais') ? ordensServicoMapState.idsOcultosSet : ordensMapState.idsOcultosSet}
                activeMapModule={activeMapModule}
                setActiveMapModule={setActiveMapModule}
                currentRodada={estData.currentRodada}
                setCurrentRodada={estData.setCurrentRodada}
                availableRodadas={estData.availableRodadas}
                createNewRodada={() => estData.createNewRodada(ordensMapState.idsAbertosSet)}
                nextRodadaName={estData.nextRodadaName}
                setFiltersOpen={mapFilters.setFiltersOpen}
                selectedTalhoes={selectedTalhoes}
                selectedTalhao={selectedTalhao}
                setSelectedTalhoes={setSelectedTalhoes}
                setSelectedTalhao={setSelectedTalhao}
                enhancedGeoJson={mapFilters.enhancedGeoJson}
                isLoadingEstimate={estData.isLoadingEstimate}
                currentEstimate={estData.currentEstimate}
                setScope={estData.setScope}
                setEstimateOpen={estData.setEstimateOpen}
                openHistory={estData.openHistory}

                legendCollapsed={mapSummary.legendCollapsed}
                setLegendCollapsed={mapSummary.setLegendCollapsed}
                showLabels={showLabels}
                setShowLabels={setShowLabels}
                legendItems={mapSummary.legendItems}

                summaryCollapsed={mapSummary.summaryCollapsed}
                setSummaryCollapsed={mapSummary.setSummaryCollapsed}
                summaryData={mapSummary.summaryData}

                vinculosSafra={activeMapModule === 'planejamentoTratosCulturais' ? planejamentoTratosState.vinculosSafra : ((activeMapModule === 'tratosCulturais') ? ordensServicoState.vinculosSafra : ordensState.vinculosSafra)}
                ordensSafra={activeMapModule === 'planejamentoTratosCulturais' ? [] : ((activeMapModule === 'tratosCulturais') ? ordensServicoState.ordensSafra : ordensState.ordensSafra)}
                companyId={currentCompanyId}
                safra={currentSafra}
                allowedMapModules={allowedMapModules}
                session={session}
                filterOptions={mapFilters.filterOptions}
                filters={mapFilters.filters}
                appliedFilters={mapFilters.appliedFilters}
                showTratosComoOrdemCorte={showTratosComoOrdemCorte}
                setShowTratosComoOrdemCorte={setShowTratosComoOrdemCorte}
              />
            </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 px-6">
                <div className="max-w-xl rounded-2xl border border-white/10 bg-slate-900/80 px-6 py-8 text-center text-white shadow-2xl backdrop-blur">
                  <div className="text-xl font-semibold">Sem acesso às camadas do mapa</div>
                  <p className="mt-3 text-sm text-slate-300">
                    O módulo Mapa está ativo, mas sua conta não possui permissão para nenhuma camada disponível.
                    Solicite ao administrador a liberação de Estimativa Safra, Planejamento Safra, Ordem de Corte ou Tratos Culturais.
                  </p>
                </div>
              </div>
            )}
            </ProtectedModule>
          ) : activeModule === "premissas" ? (
            <ProtectedModule session={session} moduleKey="premissas" fallback={<div className="p-6 text-white">Acesso negado ao módulo.</div>}>
            <div className="absolute inset-0 z-10 overflow-auto bg-black/20 pb-16">
              <Premissas companyId={currentCompanyId} session={session} />
            </div>
            </ProtectedModule>
          ) : activeModule === "cadastros_mestres" ? (
            <ProtectedModule session={session} moduleKey="cadastros_mestres" fallback={<div className="p-6 text-white">Acesso negado ao módulo.</div>}>
            <div className="absolute inset-0 z-10 overflow-auto bg-black/20 pb-16">
              <CadastrosMestresModule />
            </div>
            </ProtectedModule>
          ) : activeModule === "configuracao" ? (
            <ProtectedModule session={session} moduleKey="configuracao_empresa" fallback={<div className="p-6 text-white">Acesso negado ao módulo.</div>}>
            <div className="absolute inset-0 z-10 overflow-hidden bg-black/20">
              <CompanyConfig
                currentCompanyId={currentCompanyId}
                currentSafra={currentSafra}
                geoJsonData={estData.geoJsonData}
                allEstimates={estData.allEstimates}
                refetchEstimates={estData.refetchEstimates}
                onUploadSuccess={(data) => {
                estData.setGeoJsonData(data);
                setActiveModule("estimativa");
              }} />
            </div>
            </ProtectedModule>

) : activeModule === "dashboards" ? (
  <ProtectedModule session={session} moduleKey="dashboards" fallback={<div className="p-6 text-white">Acesso negado ao módulo.</div>}>
    <div className="absolute inset-0 z-10 overflow-auto bg-black/20">
      <DashboardHubPage companyId={currentCompanyId} session={session} />
    </div>
  </ProtectedModule>
          ) : activeModule === "dadosDashboard" ? (
  <ProtectedModule session={session} moduleKey="dados_dashboard" fallback={<div className="p-6 text-white">Acesso negado ao módulo.</div>}>
    <div className="absolute inset-0 z-10 overflow-auto bg-black/20">
      <DadosDashboardHubPage companyId={currentCompanyId} session={session} />
    </div>
  </ProtectedModule>
          ) : activeModule === "lancamentos" ? (
  <ProtectedModule session={session} moduleKey="lancamentos" fallback={<div className="p-6 text-white">Acesso negado ao módulo.</div>}>
    <div className="absolute inset-0 z-10 overflow-auto bg-black/20">
      <LancamentosHubPage companyId={currentCompanyId} session={session} />
    </div>
  </ProtectedModule>
          ) : activeModule === "companyManagement" ? (
            <ProtectedModule session={session} moduleKey="gerenciamento_empresas" fallback={<div className="p-6 text-white">Acesso negado ao módulo.</div>}>
              <div className="absolute inset-0 z-10 overflow-hidden bg-black/20">
                <CompanyManagementPage />
              </div>
            </ProtectedModule>
          ) : activeModule === "userManagement" ? (
            <ProtectedModule session={session} moduleKey="gerenciamento_usuarios" fallback={<div className="p-6 text-white">Acesso negado ao módulo.</div>}>
              <div className="absolute inset-0 z-10 overflow-hidden bg-black/20">
                <UserManagementPage session={session} />
              </div>
            </ProtectedModule>
          ) : null}
          </Suspense>
        </div>
      </div>
    </div>
  );
}
