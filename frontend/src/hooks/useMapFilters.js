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
export function useMapFilters(geoJsonData, allEstimates, activeMapModule = "estimativa", idsOcultosSet = new Set(), idsAbertosSet = new Set(), currentCompanyId = null, currentSafra = null, backendFilterOptions = null) {
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

  /**
   * Deriva opções ativas para os "selects" de forma encadeada.
   * Se a 'Fazenda' for escolhida, só as 'Variedades' daquela fazenda entram na lista, etc.
   */
  const [dbTalhoesMap, setDbTalhoesMap] = useState(new Map());
  const [planejamentoMap, setPlanejamentoMap] = useState(new Map());
  const [planningOperacoes, setPlanningOperacoes] = useState([]);
  const [ordensCorteOptions, setOrdensCorteOptions] = useState([]);
  const [ordensCorteTalhoesMap, setOrdensCorteTalhoesMap] = useState(new Map());
  const [ordensCorteFrenteMap, setOrdensCorteFrenteMap] = useState(new Map());

  useEffect(() => {
    if (!filters.ordemCorteId) return;
    const isStillAvailable = ordensCorteOptions.some((opt) => opt.value === filters.ordemCorteId);
    if (!isStillAvailable) {
      setFilters((prev) => ({ ...prev, ordemCorteId: '' }));
      setAppliedFilters((prev) => ({ ...prev, ordemCorteId: '' }));
    }
  }, [ordensCorteOptions, filters.ordemCorteId]);

  // Buscar os talhões do Dexie para cruzar com o SHP
  // Escutamos ativamente usando useLiveQuery (nativamente no Dexie, ou usando setInterval)
  // Como estamos dentro de um hook genérico sem liveQuery injetado,
  // faremos um pooling leve ou dependencia no 'allEstimates' para refetch
  useEffect(() => {
    let isMounted = true;

    const fetchTalhoes = async () => {
      try {
        // Buscar apenas os talhões que de fato pertencem ao activeMapModule ou carregar tudo rápido (offline)
        let talhoesQuery = db.talhoes;
        if (currentCompanyId) {
            talhoesQuery = talhoesQuery.where('companyId').equals(currentCompanyId);
        }
        const talhoes = await talhoesQuery.toArray();
        if (!isMounted) return;

        const talhoesMap = new Map();
        talhoes.forEach(t => {
          const rawCodFaz = t.codFaz !== undefined && t.codFaz !== null ? t.codFaz :
                            t.COD_FAZ !== undefined && t.COD_FAZ !== null ? t.COD_FAZ : '';
          const rawTalhao = t.TALHAO !== undefined && t.TALHAO !== null ? t.TALHAO :
                            t.talhao !== undefined && t.talhao !== null ? t.talhao : '';

          const parsedCodFaz = normalizeId(rawCodFaz);
          const parsedTalhao = normalizeId(rawTalhao);
          talhoesMap.set(`${parsedCodFaz}_${parsedTalhao}`, t);
        });
        setDbTalhoesMap(talhoesMap);

        // Carrega também o planejamento safra.
        // Tenta PostgreSQL primeiro e mantém Dexie como cache offline.
        if (usePostgresReads && currentCompanyId && currentSafra) {
          try {
            const result = await postgresReadService.listAllHarvestPlans({
              companyId: currentCompanyId,
              harvestYear: currentSafra,
              limit: 500,
            });

            const postgresItems = Array.isArray(result?.data) ? result.data : [];
            if (postgresItems.length) {
              await db.planejamentoSafra.bulkPut(postgresItems);
            }
          } catch (error) {
            console.warn('[planejamentoSafra] cache Dexie após falha PostgreSQL:', error?.message || error);
          }
        }

        let planejamentoQuery = db.planejamentoSafra;
        if (currentCompanyId && currentSafra) {
             planejamentoQuery = planejamentoQuery.where('[companyId+safra]').equals([currentCompanyId, currentSafra]);
        }
        const planejamento = await planejamentoQuery.toArray();
        if (isMounted) {
            const planMap = new Map();
            const addPlanAlias = (id, plan) => {
              if (id === undefined || id === null || id === '') return;
              planMap.set(id, plan);
              const text = String(id).trim();
              if (text) planMap.set(text, plan);
              const numeric = Number(text);
              if (Number.isFinite(numeric)) planMap.set(numeric, plan);
            };

            planejamento.forEach(p => {
                if (p.statusPlanejamento !== 'inativo') {
                    addPlanAlias(p.talhaoId, p);
                    addPlanAlias(p.id, p);
                }
            });
            setPlanejamentoMap(planMap);
        }

        if (currentCompanyId && (getAccessToken() || getRefreshToken())) {
          await getProtocolos(currentCompanyId).catch((error) => {
            console.warn('[PlanejamentoTratos] Falha ao hidratar protocolos PostgreSQL. Usando Dexie local.', error?.message || error);
          });
        }

        const protocolos = await db.protocolos.toArray();
        if (isMounted) {
          const protocolosAtivos = protocolos
            .filter((p) => (p.status || 'ATIVO') !== 'INATIVO')
            .map((p) => ({
              value: p.id,
              label: String(p.nome || p.nomeDoProtocolo || p.nome_protocolo || p.id || '').trim(),
              raw: p,
            }))
            .filter((p) => p.label)
            .sort((a, b) => String(a.label || '').localeCompare(String(b.label || ''), 'pt-BR'));
          setPlanningOperacoes(protocolosAtivos);
        }

        let ordens = [];
        if (currentCompanyId && currentSafra) {
          ordens = await db.ordensCorte
            .where('[companyId+safra]')
            .equals([currentCompanyId, currentSafra])
            .toArray();
        } else if (currentCompanyId) {
          ordens = await db.ordensCorte.where('companyId').equals(currentCompanyId).toArray();
        } else {
          ordens = await db.ordensCorte.toArray();
        }

        let vinculos = [];
        if (currentCompanyId && currentSafra) {
          vinculos = await db.ordensCorteTalhoes
            .where('[companyId+safra]')
            .equals([currentCompanyId, currentSafra])
            .toArray();
        } else if (currentCompanyId) {
          vinculos = await db.ordensCorteTalhoes.where('companyId').equals(currentCompanyId).toArray();
        } else {
          vinculos = await db.ordensCorteTalhoes.toArray();
        }

        if (isMounted) {
          const talhoesByOrdem = new Map();
          const frenteByTalhao = new Map();
          const ordemById = new Map();

          ordens.forEach((ordem) => {
            const ordemId = String(ordem?.id || '').trim();
            if (ordemId) ordemById.set(ordemId, ordem);
          });

          const prioridadeStatus = (status) => {
            const normalizado = String(status || '').trim().toUpperCase();
            if (normalizado === 'ABERTA') return 3;
            if (normalizado === 'AGUARDANDO') return 2;
            if (normalizado === 'FINALIZADA') return 1;
            return 0;
          };

          vinculos.forEach((v) => {
            const ordemId = String(v?.ordemCorteId || '').trim();
            const talhaoId = String(v?.talhaoId || '').trim();
            if (!ordemId || !talhaoId) return;
            if (!talhoesByOrdem.has(ordemId)) talhoesByOrdem.set(ordemId, new Set());
            talhoesByOrdem.get(ordemId).add(talhaoId);
            talhoesByOrdem.get(ordemId).add(talhaoId.toUpperCase());

            const ordem = ordemById.get(ordemId) || {};
            const frenteServico = String(v?.frenteServico || ordem?.frenteServico || '').trim();
            if (!frenteServico) return;

            const atual = frenteByTalhao.get(talhaoId);
            const proximaPrioridade = prioridadeStatus(v?.status);
            const prioridadeAtual = atual ? prioridadeStatus(atual.status) : -1;

            if (!atual || proximaPrioridade > prioridadeAtual) {
              frenteByTalhao.set(talhaoId, { frenteServico, status: v?.status || '', ordemCorteId: ordemId });
              frenteByTalhao.set(talhaoId.toUpperCase(), { frenteServico, status: v?.status || '', ordemCorteId: ordemId });
            }
          });

          setOrdensCorteTalhoesMap(talhoesByOrdem);
          setOrdensCorteFrenteMap(frenteByTalhao);

          const nextOrdensOptions = ordens
            .filter((ordem) => {
              const ordemId = String(ordem?.id || '').trim();
              return ordemId && talhoesByOrdem.has(ordemId);
            })
            .map((ordem) => {
              const ordemId = String(ordem?.id || '').trim();
              const codigoBase = String(ordem?.codigo || ordem?.sequencial || ordem?.numeroEmpresa || ordemId).trim();
              const codigo = codigoBase ? `OC ${codigoBase}` : 'OC sem identificação';
              const fazendaLabel = String(ordem?.fazendaNome || ordem?.nome_fazenda || ordem?.fazendaDescricao || '').trim();
              return {
                value: ordemId,
                label: fazendaLabel ? `${codigo} - ${fazendaLabel}` : codigo
              };
            })
            .sort((a, b) => String(a.label || '').localeCompare(String(b.label || ''), 'pt-BR', { numeric: true }));

          setOrdensCorteOptions(nextOrdensOptions);
        }

      } catch (err) {
        console.error("Erro ao carregar talhoes do Dexie para filtros do mapa:", err);
      }
    };

    fetchTalhoes();

    // Listener para quando uma sync de background terminar forçando o refetch dos talhões sem precisar do setInterval pesado
    const handleSyncComplete = () => fetchTalhoes();
    const handleLocalDbUpdated = (e) => {
      if (!e.detail?.module || e.detail.module === 'planejamento_safra') {
        fetchTalhoes();
      }
    };
    window.addEventListener('sync-completed', handleSyncComplete);
    window.addEventListener('local-db-updated', handleLocalDbUpdated);

    return () => {
      isMounted = false;
      window.removeEventListener('sync-completed', handleSyncComplete);
      window.removeEventListener('local-db-updated', handleLocalDbUpdated);
    };
  }, [allEstimates, idsOcultosSet, idsAbertosSet, currentCompanyId, currentSafra]); // Atualiza passivamente baseado em deps do módulo


  const mappedFeatures = useMemo(() => {
    if (!geoJsonData?.features) return [];

    return geoJsonData.features.map((feature) => {
      const p = feature.properties || {};
      const normalizedCorte = normalizeCorte(p.ECORTE);
      const uniqueTalhaoId = getUniqueTalhaoId(feature);
      const isEstimated = Boolean(p._is_estimated);
      const planejamento = planejamentoMap.get(uniqueTalhaoId);

      const rawFundoAgr = p.FUNDO_AGR !== undefined && p.FUNDO_AGR !== null ? p.FUNDO_AGR : '';
      const rawTalhao = p.TALHAO !== undefined && p.TALHAO !== null ? p.TALHAO : '';

      const finalCod = normalizeId(rawFundoAgr);
      const finalTalhao = normalizeId(rawTalhao);
      const compositeKey = `${finalCod}_${finalTalhao}`;

      const dbTalhao = dbTalhoesMap.get(compositeKey) || {};

      const refPlanejada = dbTalhao.REF_PLANEJADA ? String(dbTalhao.REF_PLANEJADA).trim().toUpperCase() :
                           dbTalhao.reforma ? String(dbTalhao.reforma).trim().toUpperCase() : 'N';

      const vencContrato = dbTalhao.VENC_CONTRATO ? String(dbTalhao.VENC_CONTRATO).trim() :
                           dbTalhao.vencimentoContrato ? String(dbTalhao.vencimentoContrato).trim() : '';

      const tipoPropriedade = dbTalhao.TIPO_PROPRIEDADE ? String(dbTalhao.TIPO_PROPRIEDADE).trim().toUpperCase() : 'PROPRIA';

      let frentePlanejamento = p.FRENTE ? String(p.FRENTE).trim() : "";
      if (planejamento && planejamento.frenteColheita) {
        frentePlanejamento = String(planejamento.frenteColheita).trim();
      }
      const frentePlanejamentoNormalizada = normalizeFrenteLabel(frentePlanejamento);
      const frenteColor = planejamento?.fillColor || getPlanejamentoSafraColor(frentePlanejamentoNormalizada || frentePlanejamento);

      const osStatus = p._os_status || "Aguardando";

      const frenteOrdemCorteInfo = ordensCorteFrenteMap.get(String(feature.id || '').trim())
        || ordensCorteFrenteMap.get(String(uniqueTalhaoId || '').trim())
        || null;
      const frenteOrdemCorte = frenteOrdemCorteInfo?.frenteServico || '';

      return {
        ...feature,
        properties: {
          ...feature.properties,
          _normalized_ecorte: normalizedCorte,
          _is_estimated: isEstimated,
          _ref_planejada: refPlanejada,
          _venc_contrato: vencContrato,
          _tipo_propriedade: tipoPropriedade,
          _os_status: osStatus,
          _planejamento: planejamento || null,
          _frente_planejamento: frentePlanejamento,
          _frente_planejamento_normalized: frentePlanejamentoNormalizada,
          _frente_color: frenteColor,
          _frente_ordem_corte: frenteOrdemCorte
        }
      };
    });
  }, [geoJsonData, allEstimates, dbTalhoesMap, planejamentoMap, idsOcultosSet, idsAbertosSet, ordensCorteFrenteMap]);

  const featureMatchesFilters = (feature, activeFilters) => {
    const p = feature.properties || {};
    const fazendaName = getFazendaName(p);

    // Regra principal da produção: cada camada só trabalha com os polígonos que
    // realmente pertencem a ela. Isso evita mostrar no filtro uma fazenda/talhão
    // que existe no shapefile, mas não aparece naquela camada.
    if (activeMapModule === "estimativa") {
      if (p._layer_visible !== true) return false;
    }

    if (["ordemCorte", "planejamentoSafra", "tratosCulturais", "planejamentoTratosCulturais"].includes(activeMapModule)) {
      if (!p._is_estimated) return false;
    }

    if ((activeMapModule === "tratosCulturais" || activeMapModule === "planejamentoTratosCulturais" || activeMapModule === "ordemCorte") && activeFilters.ordemCorteStatus && activeFilters.ordemCorteStatus.length > 0) {
      if (!activeFilters.ordemCorteStatus.includes(p._os_status)) return false;
    }
    if (activeMapModule === "ordemCorte" && activeFilters.ordemCorteId) {
      const talhoesDaOrdem = ordensCorteTalhoesMap.get(activeFilters.ordemCorteId);
      if (!talhoesDaOrdem) return false;

      // Compatibilidade: os vínculos das OCs usam talhaoId do mapa (feature.id) na prática,
      // mas alguns dados antigos podem ter variações. Aceitamos múltiplas chaves candidatas
      // para evitar "sumir tudo" quando o ID não bater em formato.
      const candidateIds = [
        feature?.id,
        p?.id,
        p?.talhaoId,
        p?.TALHAO_ID,
        getUniqueTalhaoId(feature)
      ]
        .map((id) => String(id || '').trim())
        .filter(Boolean)
        .flatMap((id) => [id, id.toUpperCase()]);

      const matchesOrdem = candidateIds.some((id) => talhoesDaOrdem.has(id));
      if (!matchesOrdem) return false;
    }

    if (activeFilters.fazenda && fazendaName !== activeFilters.fazenda) return false;

    if (activeFilters.frente) {
      if (activeMapModule === "planejamentoSafra") {
        if (!p._frente_planejamento_normalized || p._frente_planejamento_normalized !== normalizeFrenteLabel(activeFilters.frente)) return false;
      } else if (activeMapModule === "ordemCorte") {
        const frenteOc = String(p._frente_ordem_corte || '').trim();
        if (!frenteOc || frenteOc !== activeFilters.frente) return false;
      } else if (!p.FRENTE || String(p.FRENTE).trim() !== activeFilters.frente) {
        return false;
      }
    }

    if (activeFilters.variedade && (!p.VARIEDADE || String(p.VARIEDADE).trim() !== activeFilters.variedade)) return false;
    if (activeFilters.corte && (!p.ECORTE || String(p.ECORTE).trim() !== activeFilters.corte)) return false;
    if (activeFilters.talhao && (!p.TALHAO || String(p.TALHAO).trim() !== activeFilters.talhao)) return false;

    if (activeMapModule === "planejamentoSafra") {
      if (activeFilters.statusPlanejamento && activeFilters.statusPlanejamento.length > 0) {
        if (!p._planejamento || !activeFilters.statusPlanejamento.includes(p._planejamento.statusPlanejamento)) return false;
      }
      if (activeFilters.sequenciasPlanejamento && activeFilters.sequenciasPlanejamento.length > 0) {
        if (!p._planejamento || p._planejamento.sequencia === undefined || p._planejamento.sequencia === null || !activeFilters.sequenciasPlanejamento.includes(String(p._planejamento.sequencia))) return false;
      }
    }

    if (activeFilters.tipoPropriedade && activeFilters.tipoPropriedade.length > 0) {
      if (!activeFilters.tipoPropriedade.includes(p._tipo_propriedade)) return false;
    }

    if (activeMapModule === "tratosCulturais" || activeMapModule === "planejamentoTratosCulturais") {
      if (!p._is_estimated) return false;

      const refPlanejada = p._ref_planejada ? String(p._ref_planejada).trim().toUpperCase() : "";
      if (refPlanejada === "S" || refPlanejada === "SIM") return false;

      if (p._venc_contrato) {
        const currentYear = new Date().getFullYear();
        let year = null;
        const parts = p._venc_contrato.split('/');
        if (parts.length === 3) {
          year = parseInt(parts[2], 10);
        } else if (p._venc_contrato.includes('-')) {
          year = parseInt(p._venc_contrato.split('-')[0], 10);
        } else {
          const match = p._venc_contrato.match(/\d{4}/);
          if (match) year = parseInt(match[0], 10);
        }
        if (year !== null && year <= currentYear) return false;
      }
    }

    return true;
  };

  const filterOptions = useMemo(() => {
    const isStatusFilterModule = ["ordemCorte", "tratosCulturais", "planejamentoTratosCulturais"].includes(activeMapModule);
    const isPlanejamentoSafraModule = activeMapModule === "planejamentoSafra";
    const isPlanejamentoTratosModule = activeMapModule === "planejamentoTratosCulturais";
    const isOrdemCorteModule = activeMapModule === "ordemCorte";

    if (!mappedFeatures.length) return {
      frentes: [],
      fazendas: [],
      variedades: [],
      cortes: [],
      talhoes: [],
      tiposPropriedade: [],
      ordensCorteStatus: [],
      statusPlanejamento: [],
      sequenciasPlanejamento: [],
      planningOperacoes: isPlanejamentoTratosModule ? planningOperacoes : [],
      ordensCorte: isOrdemCorteModule ? ordensCorteOptions : []
    };

    const frentesSet = new Set();
    const fazendasSet = new Set();
    const variedadesSet = new Set();
    const cortesSet = new Set();
    const talhoesSet = new Set();
    const tiposPropriedadeSet = new Set();
    const ordensCorteStatusSet = new Set();
    const statusPlanejamentoSet = new Set();
    const sequenciasPlanejamentoSet = new Set();

    // Regra igual ao produção: o filtro só pode listar fazendas/talhões que realmente
    // existem/estão visíveis na camada ativa. Ex.: na Ordem de Corte, somente talhões
    // já estimados entram no mapa e nas opções do filtro.
    const featureBelongsToActiveLayer = (feature) => {
      const p = feature?.properties || {};
      const isEstimated = Boolean(p._is_estimated);

      if (activeMapModule === "estimativa") {
        return p._layer_visible !== false;
      }

      if (["ordemCorte", "planejamentoSafra", "tratosCulturais", "planejamentoTratosCulturais"].includes(activeMapModule)) {
        return isEstimated;
      }

      return true;
    };

    const featuresDaCamadaAtiva = mappedFeatures.filter(featureBelongsToActiveLayer);
    const featuresOnCurrentMap = featuresDaCamadaAtiva.filter(feature => featureMatchesFilters(feature, appliedFilters));
    const featuresForFazendaOptions = featuresDaCamadaAtiva.filter(feature =>
      featureMatchesFilters(feature, { ...appliedFilters, fazenda: "" })
    );

    // Mantém a fazenda atualmente selecionada disponível para troca rápida,
    // mesmo quando os demais filtros reduzirem momentaneamente as opções.
    featuresForFazendaOptions.forEach(f => {
      const p = f.properties || {};
      const fazendaName = getFazendaName(p);
      if (fazendaName) fazendasSet.add(fazendaName);
    });

    featuresOnCurrentMap.forEach(f => {
      const p = f.properties || {};
      const planejamento = planejamentoMap.get(getUniqueTalhaoId(f));

      // Quando no Planejamento Safra, a frente considerada deve ser a do planejamento (se existir)
      let frente = p.FRENTE ? String(p.FRENTE).trim() : "";
      if (activeMapModule === "planejamentoSafra" && planejamento && planejamento.frenteColheita) {
          frente = String(planejamento.frenteColheita).trim();
      }
      if (activeMapModule === "planejamentoSafra") {
          frente = p._frente_planejamento || frente;
      }
      if (activeMapModule === "ordemCorte") {
          frente = String(p._frente_ordem_corte || '').trim();
      }
      const fazendaName = getFazendaName(p);
      const variedade = p.VARIEDADE ? String(p.VARIEDADE).trim() : "";
      const corte = p.ECORTE ? String(p.ECORTE).trim() : "";
      const talhao = p.TALHAO ? String(p.TALHAO).trim() : "";

      const tipoPropriedade = p._tipo_propriedade || "PROPRIA";
      const isEstimated = Boolean(p._is_estimated);
      const osStatus = p._os_status || "Aguardando";
      const isClosed = osStatus === "Fechada";
      const isOpen = osStatus === "Aberta";

      // Filtra de acordo com o módulo ativo para não popular options com itens que não aparecem
      // Na estimativa, quem abriu ordem ou já fechou a ordem desaparece
      if (activeMapModule === "estimativa" && (isClosed || isOpen)) return;
      // Nos tratos culturais e planejamento de tratos, entra tudo que foi estimado (tch > 0 / ordem de corte)
      // Mas exclui restrições de REF_PLANEJADA == "S" ou VENC_CONTRATO <= ano_atual
      if (activeMapModule === "tratosCulturais" || activeMapModule === "planejamentoTratosCulturais") {
        if (!isEstimated) return;

        const refPlanejada = p._ref_planejada ? String(p._ref_planejada).trim().toUpperCase() : 'N';
        if (refPlanejada === "S" || refPlanejada === "SIM") return;

        const vencContrato = p._venc_contrato ? String(p._venc_contrato).trim() : '';

        if (vencContrato) {
            const currentYear = new Date().getFullYear();
            let year = null;
            const parts = vencContrato.split('/');
            if (parts.length === 3) {
                year = parseInt(parts[2], 10);
            } else if (vencContrato.includes('-')) {
                year = parseInt(vencContrato.split('-')[0], 10);
            } else {
                const match = vencContrato.match(/\d{4}/);
                if (match) year = parseInt(match[0], 10);
            }
            if (year !== null && year <= currentYear) return;
        }
      }

    // Na camada Planejamento Safra, só mostrar talhões que estão estimados
    if (activeMapModule === "planejamentoSafra" && !isEstimated) return;

      // -1. Ordem de Serviço Status é o nível mais alto no módulo de Tratos Culturais (e Ordem de Corte).
      if (activeMapModule === "tratosCulturais" || activeMapModule === "planejamentoTratosCulturais" || activeMapModule === "ordemCorte") {
         ordensCorteStatusSet.add(osStatus);
      }

      if (activeMapModule === "planejamentoSafra" && planejamento) {
          if (planejamento.statusPlanejamento) statusPlanejamentoSet.add(planejamento.statusPlanejamento);
          if (planejamento.sequencia !== undefined && planejamento.sequencia !== null && planejamento.sequencia !== "") {
              sequenciasPlanejamentoSet.add(String(planejamento.sequencia));
          }
      }

      const matchesOsStatus = !filters.ordemCorteStatus || filters.ordemCorteStatus.length === 0 || filters.ordemCorteStatus.includes(osStatus);
      const matchesStatusPlanejamento = activeMapModule !== "planejamentoSafra" || !filters.statusPlanejamento || filters.statusPlanejamento.length === 0 || (planejamento && filters.statusPlanejamento.includes(planejamento.statusPlanejamento));
      const matchesSequenciaPlanejamento = activeMapModule !== "planejamentoSafra" || !filters.sequenciasPlanejamento || filters.sequenciasPlanejamento.length === 0 || (planejamento && planejamento.sequencia !== undefined && planejamento.sequencia !== null && filters.sequenciasPlanejamento.includes(String(planejamento.sequencia)));
      const matchesPlanejamento = matchesStatusPlanejamento && matchesSequenciaPlanejamento;

      // 0. Tipo Propriedade é o nível mais alto junto com Fazenda (e OS Status).
      if (tipoPropriedade && matchesOsStatus && matchesPlanejamento) tiposPropriedadeSet.add(tipoPropriedade);

      // 1. A Fazenda é o nível mais alto junto com Tipo Propriedade.
      // Se tivermos um Tipo de Propriedade filtrado, mostramos apenas as Fazendas desse tipo.
      const matchesTipoPropriedade = !filters.tipoPropriedade || filters.tipoPropriedade.length === 0 || filters.tipoPropriedade.includes(tipoPropriedade);
      if (fazendaName && matchesTipoPropriedade && matchesOsStatus && matchesPlanejamento) {
         fazendasSet.add(fazendaName);
      }

      // 2. A Frente de Serviço é o segundo nível. Só mostra frentes que PERTENCEM à fazenda E ao tipo de propriedade.
      const matchesFazenda = !filters.fazenda || filters.fazenda === "all" || fazendaName === filters.fazenda;
      if (frente && matchesTipoPropriedade && matchesFazenda && matchesOsStatus && matchesPlanejamento) {
         frentesSet.add(frente);
      }

      // 3. A Variedade é o terceiro nível. Só mostra variedades que pertencem à frente, fazenda e tipo.
      const matchesFrente = !filters.frente || filters.frente === "all" || frente === filters.frente;
      if (variedade && matchesTipoPropriedade && matchesFazenda && matchesFrente && matchesOsStatus && matchesPlanejamento) {
         variedadesSet.add(variedade);
      }

      // 4. O Corte (Estágio) é o quarto nível.
      const matchesVariedade = !filters.variedade || filters.variedade === "all" || variedade === filters.variedade;
      if (corte && matchesTipoPropriedade && matchesFazenda && matchesFrente && matchesVariedade && matchesOsStatus && matchesPlanejamento) {
         cortesSet.add(corte);
      }

      // 5. O Talhão é o quinto nível.
      const matchesCorte = !filters.corte || filters.corte === "all" || corte === filters.corte;
      if (talhao && matchesTipoPropriedade && matchesFazenda && matchesFrente && matchesVariedade && matchesCorte && matchesOsStatus && matchesPlanejamento) {
         talhoesSet.add(talhao);
      }
    });

    // Ordem de Corte Status padrão sort: Aberta, Aguardando, Fechada
    const statusOrder = { "Aberta": 1, "Aguardando": 2, "Fechada": 3 };
    const sortedStatus = Array.from(ordensCorteStatusSet).sort((a, b) => (statusOrder[a] || 99) - (statusOrder[b] || 99));

    if (activeMapModule === "estimativa" && backendFilterOptions) {
      console.log('[estimativa] using backend filterOptions');
      return {
        frentes: backendFilterOptions.frentes || [],
        fazendas: backendFilterOptions.fazendas || [],
        variedades: backendFilterOptions.variedades || [],
        cortes: backendFilterOptions.cortes || [],
        talhoes: backendFilterOptions.talhoes || [],
        tiposPropriedade: backendFilterOptions.tiposPropriedade || [],
        ordensCorteStatus: [],
        statusPlanejamento: [],
        sequenciasPlanejamento: [],
        planningOperacoes: [],
        ordensCorte: []
      };
    }

    const ordensCorteFiltradas = activeMapModule === 'ordemCorte'
      ? ordensCorteOptions
          .filter((ordem) => {
            const talhoesDaOrdem = ordensCorteTalhoesMap.get(ordem.value);
            if (!talhoesDaOrdem || talhoesDaOrdem.size === 0) return false;

            const filtersSemOrdem = { ...filters, ordemCorteId: '' };

            return mappedFeatures.some((feature) => {
              const p = feature?.properties || {};
              const candidateIds = [
                feature?.id,
                p?.id,
                p?.talhaoId,
                p?.TALHAO_ID,
                getUniqueTalhaoId(feature)
              ]
                .map((id) => String(id || '').trim())
                .filter(Boolean)
                .flatMap((id) => [id, id.toUpperCase()]);

              const pertenceOrdem = candidateIds.some((id) => talhoesDaOrdem.has(id));
              if (!pertenceOrdem) return false;

              return featureMatchesFilters(feature, filtersSemOrdem);
            });
          })
          .sort((a, b) => String(a.label || '').localeCompare(String(b.label || ''), 'pt-BR', { numeric: true }))
      : ordensCorteOptions;

    return {
      frentes: Array.from(frentesSet).sort(naturalSort),
      fazendas: Array.from(fazendasSet).sort(naturalSort),
      variedades: Array.from(variedadesSet).sort(naturalSort),
      cortes: Array.from(cortesSet).sort(naturalSort),
      talhoes: Array.from(talhoesSet).sort(naturalSort),
      tiposPropriedade: Array.from(tiposPropriedadeSet).sort(naturalSort),
      ordensCorteStatus: isStatusFilterModule ? sortedStatus : [],
      statusPlanejamento: isPlanejamentoSafraModule ? Array.from(statusPlanejamentoSet).sort() : [],
      sequenciasPlanejamento: isPlanejamentoSafraModule ? Array.from(sequenciasPlanejamentoSet).sort((a, b) => Number(a) - Number(b)) : [],
      planningOperacoes: isPlanejamentoTratosModule ? planningOperacoes : [],
      ordensCorte: isOrdemCorteModule ? ordensCorteFiltradas : []
    };
  }, [mappedFeatures, appliedFilters, filters, activeMapModule, planningOperacoes, ordensCorteOptions, ordensCorteTalhoesMap, backendFilterOptions]);

  /**
   * Constrói uma nova versão do GeoJSON apenas com as features (polígonos)
   * que passam nos 'appliedFilters'. E também injeta flags lógicas `_is_estimated`.
   */
  // Ocultamos os IDs via visibleGeoJson lá na ponta (no Map), então aqui construimos o base com todos os properties necessários.
  // Para colorir com azul aberto, precisaremos do idsAbertosSet, que não mora aqui, mas como nós passamos o feature.id lá pro Map
  // também podemos injetar a property `_has_open_ordem` lá via Match do mapbox ou injetar aqui. No caso do Mapbox Match (no Map) é mais limpo.

  const enhancedGeoJson = useMemo(() => {
    if (!geoJsonData) return null;

    const filteredFeatures = mappedFeatures.filter(feature => featureMatchesFilters(feature, appliedFilters));

    return {
      ...geoJsonData,
      features: filteredFeatures
    };
  }, [geoJsonData, mappedFeatures, appliedFilters, isOnline]);

  return {
    filtersOpen, setFiltersOpen,
    filters, setFilters,
    appliedFilters, setAppliedFilters,
    filterOptions,
    enhancedGeoJson
  };
}
