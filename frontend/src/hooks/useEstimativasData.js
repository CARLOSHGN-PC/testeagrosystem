import React, { useState, useEffect } from "react";
import { fetchLatestGeoJson } from "../services/storage";
import { saveEstimate, getEstimate, getEstimateHistory, getAllEstimates, subscribeToEstimatesRealtime } from "../services/estimativa";
import { subscribeToTalhoesRealtime } from "../services/cadastros_mestres/fazendas/fazendasService";
import { showError, showSuccess } from "../utils/alert";
import { parseBrazilianFloat } from "../utils/formatters";
import { getFazendaName, getUniqueTalhaoId } from "../utils/geoHelpers";

/**
 * useEstimativasData.js
 *
 * O que este bloco faz:
 * Hook global que gerencia todo o ciclo de vida dos dados pesados do módulo
 * "Estimativa Safra". Carrega o shapefile, carrega do PostgreSQL os relatórios de talhões,
 * submete novas requisições de salvar/reestimar e trata a gestão de estado do formulário de estimativa.
 *
 * Por que ele existe:
 * Funções longas com chamadas assíncronas ao PostgreSQL poluíam severamente a renderização da UI no componente raiz.
 * Ter essa camada puramente de "Data Fetching e Manipulation" cria uma arquitetura baseada em MVC
 * (Sendo este o Controller/Model).
 *
 * O que entra e o que sai:
 * @param {string} currentCompanyId - O ID da empresa do tenant logado.
 * @param {string} currentSafra - A string da safra atual em contexto (ex: "2026/2027").
 * @param {Function} setActiveModule - Roteador global para ir pra tela de config se o mapa não existir.
 */
export function useEstimativasData(currentCompanyId, currentSafra, setActiveModule, enabled = true) {
  // Configuração e Dados
  const [geoJsonData, setGeoJsonData] = useState(null);
  const [allEstimates, setAllEstimates] = useState([]);
  const [currentRodada, setCurrentRodada] = useState("Estimativa");
  const [availableRodadas, setAvailableRodadas] = useState(["Estimativa"]);
  const [backendSummary, setBackendSummary] = useState(null);
  const [backendFilterOptions, setBackendFilterOptions] = useState(null);
  const [backendMapView, setBackendMapView] = useState(null);

  // Referência mutável para a currentRodada, usada para evitar stale closures (ex: no listener do sincronização local)
  const currentRodadaRef = React.useRef(currentRodada);
  useEffect(() => {
    currentRodadaRef.current = currentRodada;
  }, [currentRodada]);

  // Modais de histórico e Form de Salvamento
  const [currentEstimate, setCurrentEstimate] = useState(null);
  const [estimateHistory, setEstimateHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [estimateOpen, setEstimateOpen] = useState(false);

  const [formEstimativa, setFormEstimativa] = useState({ area: "", tch: "", toneladas: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingEstimate, setIsLoadingEstimate] = useState(false);

  // Escopo de estimativa: pode ser 1 talhão, todos selecionados, ou a fazenda inteira
  const [scope, setScope] = useState("talhao");

  const isHandlingMapUpdateRef = React.useRef(false);
  const lastMapSignatureRef = React.useRef(null);

  useEffect(() => {
    if (enabled) return;
    setGeoJsonData(null);
    setAllEstimates([]);
    setCurrentEstimate(null);
    setEstimateHistory([]);
    setEstimateOpen(false);
    setHistoryOpen(false);
    setBackendSummary(null);
    setBackendFilterOptions(null);
    setBackendMapView(null);
  }, [enabled]);

  const enrichGeoJsonFeatures = React.useCallback((data) => {
    if (!data?.features) return null;
    return {
      ...data,
      features: data.features.map((f, i) => ({
        ...f,
        id: f?.id ?? f?.properties?.featureId ?? f?.properties?.id ?? f?.properties?.talhaoId ?? i,
        properties: {
          ...f.properties,
          featureId: f?.properties?.featureId ?? f?.id ?? f?.properties?.id ?? f?.properties?.talhaoId ?? i
        }
      }))
    };
  }, []);

  const buildMapSignature = React.useCallback((data) => {
    if (!data?.features) return null;
    return JSON.stringify({
      count: data.features.length,
      first: data.features[0]?.properties?.featureId ?? data.features[0]?.properties?.CD_TALHAO ?? null,
      last: data.features[data.features.length - 1]?.properties?.featureId ?? data.features[data.features.length - 1]?.properties?.CD_TALHAO ?? null,
    });
  }, []);

  /**
   * Dispara o pull de tudo que precisamos ao montar a aplicação:
   * 1. O ultimo GeoJson convertido do Storage.
   * 2. Todas as estimativas do PostgreSQL atreladas àquela safra.
   */
  useEffect(() => {
    if (!enabled || !currentCompanyId) return;
    // Inscreve-se nas atualizações de talhões em background para alimentar o Dexie
    // Isso é vital para que os módulos no mapa (ex: Tratos Culturais) consigam
    // cruzar os dados de REF_PLANEJADA ou VENC_CONTRATO offline via IndexedDB.
    const unsubscribeTalhoes = subscribeToTalhoesRealtime(currentCompanyId);
    return () => unsubscribeTalhoes();
  }, [currentCompanyId, enabled]);

  const loadInitialData = async () => {
    if (!enabled || !currentCompanyId || !currentSafra) return;
    // Busca dados localmente primeiro para ser offline-first e instantâneo
    const [resMap, resEstAll] = await Promise.all([
      fetchLatestGeoJson(currentCompanyId, null, { suppressUpdateEvent: true }),
      getAllEstimates(currentCompanyId, currentSafra, null)
    ]);

    if (resMap.error && resMap.source !== 'local_fallback') {
      showError("Erro ao carregar mapa", resMap.error);
    } else if (resMap.data && resMap.data.features) {
      try {
        const parsedGeoJson = enrichGeoJsonFeatures({
          ...resMap.data,
          _serverMapView: resMap.mapView || resMap.data?._serverMapView || null
        });
        setGeoJsonData(parsedGeoJson);
        setBackendSummary(resMap.summary || resMap.data?.summary || null);
        setBackendFilterOptions(resMap.filterOptions || resMap.data?.filterOptions || null);
        setBackendMapView(resMap.mapView || resMap.data?._serverMapView || null);
        lastMapSignatureRef.current = buildMapSignature(parsedGeoJson);
      } catch (err) {
        console.error("Erro ao parsear features do mapa:", err);
        showError("Erro no Mapa", "Ocorreu um erro ao processar o arquivo de mapa baixado. O cache será limpo. Recarregue a página.");
      }
    } else {
      setActiveModule("configuracao");
    }

    if (resEstAll.success) {
       const allData = resEstAll.data;

       const distinctRodadas = new Set(["Estimativa"]);
       allData.forEach(e => {
         if (e.rodada) {
             // Mantém compatibilidade com o legado convertendo "Rodada 1" -> "Estimativa" e "Rodada X" -> "Reestimativa X-1" visualmente se necessário, mas melhor forçar a string pura do banco.
             distinctRodadas.add(e.rodada);
         }
       });

       const arrRodadas = Array.from(distinctRodadas).sort((a, b) => {
         // Garante que "Estimativa" venha sempre primeiro
         if (a === "Estimativa") return -1;
         if (b === "Estimativa") return 1;

         // Se tiver "Rodada 1" no banco antigo, trata como primário também para ordenação
         if (a === "Rodada 1") return -1;
         if (b === "Rodada 1") return 1;

         // Ordena "Reestimativa 1", "Reestimativa 2" por número natural
         return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
       });

       setAvailableRodadas(arrRodadas);

       const highestRodada = arrRodadas[arrRodadas.length - 1];
       setCurrentRodada(highestRodada);

       const filtered = allData.filter(e => {
         const r = e.rodada || "Estimativa";
         // Se o banco tá sujo com "Rodada 1" e estamos filtrando "Estimativa", mapeamos
         if (highestRodada === "Estimativa" && r === "Rodada 1") return true;
         return r === highestRodada;
       });
       setAllEstimates(filtered);
    }
  };

  useEffect(() => {
    if (!enabled || !currentCompanyId || !currentSafra) return;
    loadInitialData();

    // Inscreve no PostgreSQL para ouvir atualizações em tempo real (cross-device sync).
    // Se o usuário salvar no celular, o PostgreSQL será atualizado, o snapshot avisará,
    // o Dexie será atualizado em background e o `refetchEstimates` será chamado, repintando o mapa!
    const unsubscribeRealtime = subscribeToEstimatesRealtime(currentCompanyId, currentSafra, () => {
        // Quando o sincronização local for disparado, usamos a rodada atual lida pela Referência (currentRodadaRef),
        // em vez da variável do state que foi "presa" no closure no momento de montagem do componente.
        refetchEstimatesByRef();
    });

    const handleMapUpdate = async (e) => {
        if (e.detail?.companyId !== currentCompanyId) return;
        if (isHandlingMapUpdateRef.current) return;

        try {
            isHandlingMapUpdateRef.current = true;
            console.log("Novo mapa detectado! Recarregando da memória local...");
            const { data } = await fetchLatestGeoJson(currentCompanyId, null, { suppressUpdateEvent: true });
            if (!data?.features?.length) return;

            const parsedGeoJson = enrichGeoJsonFeatures({
              ...data,
              _serverMapView: data?._serverMapView || null
            });
            const nextSignature = buildMapSignature(parsedGeoJson);

            if (nextSignature && nextSignature === lastMapSignatureRef.current) {
              return;
            }

            lastMapSignatureRef.current = nextSignature;
            setGeoJsonData(parsedGeoJson);
            setBackendSummary(data?.summary || null);
            setBackendFilterOptions(data?.filterOptions || null);
            setBackendMapView(data?._serverMapView || null);
            showSuccess("Mapa Atualizado", "Um novo shapefile foi identificado e atualizado automaticamente na sua tela!");
        } finally {
            isHandlingMapUpdateRef.current = false;
        }
    };

    window.addEventListener('map-updated', handleMapUpdate);

    return () => {
        if (unsubscribeRealtime) unsubscribeRealtime();
        window.removeEventListener('map-updated', handleMapUpdate);
    };
  }, [currentCompanyId, currentSafra, enrichGeoJsonFeatures, buildMapSignature, enabled]);


  // Listener para o evento global de sincronização completa
  useEffect(() => {
    const handleSyncCompleted = (e) => {
      // Quando a sincronização via background finaliza com sucesso:
      // O refetch global do mapa (allEstimates) não precisa mais ser
      // chamado aqui porque a camada do `sincronização local` do PostgreSQL já atualizará o Dexie
      // e chamará o refetch sozinho de forma reativa, impedindo o loop.
      // E para o histórico, evitamos disparar funções indefinidas.
      if (e.detail && e.detail.count > 0) {
        // Como o app já assina atualizações, não precisamos forçar fetch de histórico
        // ao reconectar internet para evitar refetch loops.
      }
    };
    window.addEventListener('sync-completed', handleSyncCompleted);
    return () => window.removeEventListener('sync-completed', handleSyncCompleted);
  }, []);

  // Efeito isolado para quando a `currentRodada` mudar. Ele esvazia a tela e busca as estimativas novas.
  useEffect(() => {
    if (!geoJsonData || !currentCompanyId || !currentSafra || !currentRodada) return; // Se mapa não existe, não faz fetch da troca de rodada

    const fetchNovaRodada = async () => {
      const res = await getAllEstimates(currentCompanyId, currentSafra, currentRodada);
      if (res.success) {
        setAllEstimates(res.data);
      }
    };
    fetchNovaRodada();
  }, [currentRodada, geoJsonData, currentCompanyId, currentSafra]);

  /**
   * Recarrega manualmente a lista de estimativas global da rodada atual após algo ser salvo.
   */
  const refetchEstimates = async () => {
    if (!enabled || !currentCompanyId || !currentSafra) return;
    const res = await getAllEstimates(currentCompanyId, currentSafra, currentRodada);
    if (res.success) setAllEstimates(res.data);
  };

  /**
   * Recarrega manualmente usando a referência da rodada atual.
   * Por que ela existe: Evita o "Stale Closure Bug" no callback de eventos como sincronização local
   * que fariam a UI voltar acidentalmente para a primeira rodada "Estimativa".
   */
  const refetchEstimatesByRef = async () => {
    if (!enabled || !currentCompanyId || !currentSafra) return;
    const res = await getAllEstimates(currentCompanyId, currentSafra, currentRodadaRef.current);
    if (res.success) setAllEstimates(res.data);
  };

  /**
   * Obtém dinamicamente o nome que a próxima rodada deverá ter.
   */
  const nextRodadaName = `Reestimativa ${availableRodadas.length}`;

  /**
   * Cria uma nova rodada baseada no estado de rodadas disponíveis, e já seta ela como ativa,
   * limpando automaticamente o visual do mapa. Adicionalmente, se houver talhões com
   * Ordem de Corte ABERTA na rodada atual, eles são migrados automaticamente para a nova.
   *
   * @param {Set<string>} idsAbertosSet Set com os IDs dos talhões que possuem ordem de corte aberta.
   */
  const createNewRodada = async (idsAbertosSet) => {
    const newName = nextRodadaName;
    setAvailableRodadas(prev => [...prev, newName]);
    setCurrentRodada(newName);

    // O que este bloco faz: Procura todos os talhões da rodada antiga que possuem
    // Ordem de Corte ABERTA e os duplica (salva) automaticamente para a nova rodada.
    // Por que ele existe: Para cumprir a regra de negócio onde talhões que já estão
    // sendo colhidos não precisam (nem podem) ser reestimados e devem "nascer" pintados na nova rodada.
    // NOTA: idsAbertosSet armazena os IDs numéricos (feature.id) do Mapbox. allEstimates usa string (talhaoId).
    // Precisamos cruzar pelo GeoJsonData para descobrir o talhaoId de cada ID aberto.
    if (idsAbertosSet && idsAbertosSet.size > 0 && allEstimates.length > 0 && geoJsonData) {
      // 1. Encontra quais "talhaoId" (string) estão abertos, mapeando a partir das features do geojson
      const talhoesIdsAbertosString = new Set();
      geoJsonData.features.forEach(f => {
        if (idsAbertosSet.has(f.id)) {
          talhoesIdsAbertosString.add(getUniqueTalhaoId(f));
        }
      });

      // 2. Filtra as estimativas que correspondem a esses talhões abertos
      const talhoesToMigrate = allEstimates.filter(est => talhoesIdsAbertosString.has(est.talhaoId));

      if (talhoesToMigrate.length > 0) {
        setIsSaving(true);
        try {
          await Promise.all(talhoesToMigrate.map(async (est) => {
             // Cria uma cópia da estimativa antiga, alterando apenas a rodada
             const payload = {
                fundo_agricola: est.fundo_agricola || "N/A",
                fazenda: est.fazenda || "N/A",
                variedade: est.variedade || "N/A",
                area: est.area,
                tch: est.tch,
                toneladas: est.toneladas,
                responsavel: est.responsavel || "Sistema",
                rodada: newName
             };
             await saveEstimate(currentCompanyId, currentSafra, est.talhaoId, payload);
          }));
          showSuccess("Rodada Criada!", `${talhoesToMigrate.length} talhões com Ordem de Corte Aberta foram migrados automaticamente para a ${newName}.`);
        } catch (error) {
          console.error("Erro ao migrar talhões abertos para a nova rodada:", error);
          showError("Aviso", "A nova rodada foi criada, mas houve um erro ao migrar os talhões com Ordem de Corte.");
        } finally {
          setIsSaving(false);
          // Atualiza a tela para buscar a nova rodada e seus novos talhões migrados
          const res = await getAllEstimates(currentCompanyId, currentSafra, newName);
          if (res.success) setAllEstimates(res.data);
        }
      }
    }
  };

  /**
   * Carrega os dados persistidos de um Talhão para preencher a UI do Form.
   */
  const loadEstimateData = async (feature) => {
    if (!feature || !feature.properties) return;
    setIsLoadingEstimate(true);
    setCurrentEstimate(null);
    setEstimateHistory([]);

    const uniqueTalhaoId = getUniqueTalhaoId(feature);

    setFormEstimativa({
      area: feature.properties.AREA ? String(feature.properties.AREA) : "",
      tch: "",
      toneladas: ""
    });

    try {
      // Quando preenche o modal, verifica se já existe estimate pra _esta_ rodada.
      // Se não, o form aparece vazio. Mas se quiser a ultima versão como preenchimento,
      // ele apenas puxará da atual que está sendo visualizada.
      const res = await getEstimate(currentCompanyId, currentSafra, uniqueTalhaoId, currentRodada);
      if (res.success && res.data) {
        setCurrentEstimate(res.data);
        setFormEstimativa({
          area: res.data.area || feature.properties.AREA || "",
          tch: res.data.tch || "",
          toneladas: res.data.toneladas || ""
        });
      }
    } catch (err) {
      console.error("Failed to load estimate", err);
    } finally {
      setIsLoadingEstimate(false);
    }
  };

  /**
   * Carrega o painel histórico do talhão atualmente selecionado.
   */
  const openHistory = async (selectedTalhao) => {
    if (!selectedTalhao) return;
    setHistoryOpen(true);
    const uniqueTalhaoId = getUniqueTalhaoId(selectedTalhao);
    // O histórico a gente puxa de TODAS AS RODADAS da safra para a pessoa ter o controle geral no modal
    const res = await getEstimateHistory(currentCompanyId, currentSafra, uniqueTalhaoId, null);
    if (res.success) {
      setEstimateHistory(res.data);
    }
  };

  /**
   * Função pesada de submissão do formulário. Faz o upload das estimativas para o PostgreSQL.
   * Lida com o processamento de múltiplos talhões simultaneamente via Promise.all
   */
  const submitEstimate = async (selectedTalhoes, selectedTalhao, enhancedGeoJson) => {
    if (!formEstimativa.tch || parseBrazilianFloat(formEstimativa.tch) <= 0) {
      showError("Atenção", "O TCH (Toneladas de Cana por Hectare) é obrigatório e deve ser maior que zero.");
      return { success: false };
    }

    setIsSaving(true);
    let successCount = 0;

    try {
      const talhoesToSaveRaw = [];
      if (scope === "talhao" && selectedTalhao) {
        talhoesToSaveRaw.push(selectedTalhao);
      } else if (scope === "selecionados" && selectedTalhoes.length > 0) {
        selectedTalhoes.forEach(id => {
          const feat = enhancedGeoJson.features.find(f => f.id === id);
          if (feat) talhoesToSaveRaw.push(feat);
        });
      } else if (scope === "filtro" && enhancedGeoJson) {
        talhoesToSaveRaw.push(...enhancedGeoJson.features);
      } else if (scope === "fazenda" && geoJsonData) {
        let referenceFazenda = "";
        let referenceFundo = "";
        if (selectedTalhao && selectedTalhao.properties) {
          referenceFazenda = selectedTalhao.properties.FAZENDA || "";
          referenceFundo = selectedTalhao.properties.FUNDO_AGR || "";
        } else if (selectedTalhoes.length > 0) {
          const firstSelected = geoJsonData.features.find(f => f.id === selectedTalhoes[0]);
          if (firstSelected && firstSelected.properties) {
            referenceFazenda = firstSelected.properties.FAZENDA || "";
            referenceFundo = firstSelected.properties.FUNDO_AGR || "";
          }
        }

        if (referenceFazenda) {
          const farmFeatures = geoJsonData.features.filter(feat => {
             const featFaz = feat.properties.FAZENDA || "";
             const featFundo = feat.properties.FUNDO_AGR || "";
             return featFaz === referenceFazenda && featFundo === referenceFundo;
          });
          talhoesToSaveRaw.push(...farmFeatures);
        } else {
          talhoesToSaveRaw.push(...geoJsonData.features);
        }
      }

      // Pre-process: Filter out ones that are already estimated so we skip them
      const estimatedTalhaoIds = new Set(allEstimates.map(e => e.talhaoId));
      const talhoesToSave = talhoesToSaveRaw.filter(feat => {
        const p = feat.properties;
        const f_agr = p.FUNDO_AGR ? String(p.FUNDO_AGR).trim() : "N-A";
        const faz = p.FAZENDA ? String(p.FAZENDA).trim() : "N-A";
        const talhao = p.TALHAO ? String(p.TALHAO).trim() : `mock_${feat.id}`;
        const uniqueIndex = p.featureId !== undefined ? p.featureId : feat.id;

        const rawId = `${f_agr}_${faz}_${talhao}_SEQ${uniqueIndex}`;
        const finalUniqueId = rawId.replace(/\//g, '-').replace(/ /g, '_').toUpperCase();
        return !estimatedTalhaoIds.has(finalUniqueId);
      });

      if (talhoesToSave.length === 0) {
        showError("Atenção", "Todos os talhões selecionados já possuem estimativa salva.");
        setIsSaving(false);
        return { success: false };
      }

      // Batch saving
      await Promise.all(talhoesToSave.map(async (feat) => {
        const uniqueTalhaoId = getUniqueTalhaoId(feat);
        let areaToSave;
        let toneladasToSave;

        if (talhoesToSave.length === 1) {
          // Edição limpa do form (1 pra 1)
          areaToSave = formEstimativa.area;
          toneladasToSave = formEstimativa.toneladas;
        } else {
          // Múltiplos calculam usando a área unitária
          const indvArea = parseBrazilianFloat(feat.properties.AREA);
          const tchToUse = parseBrazilianFloat(formEstimativa.tch);
          const indvToneladas = indvArea * tchToUse;

          areaToSave = indvArea.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          toneladasToSave = indvToneladas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        const payload = {
          fundo_agricola: feat.properties.FUNDO_AGR || "N/A",
          fazenda: feat.properties.FAZENDA || "N/A",
          variedade: feat.properties.VARIEDADE || "N/A",
          area: areaToSave,
          tch: formEstimativa.tch,
          toneladas: toneladasToSave,
          responsavel: "Carlos", // Mock user name
          rodada: currentRodada
        };

        // Agora isso retorna sucesso imediatamente, gravando localmente no Dexie!
        const res = await saveEstimate(currentCompanyId, currentSafra, uniqueTalhaoId, payload);
        if (res.success) successCount++;
      }));

      // Adicionamos uma verificação visual do modo offline
      if (!navigator.onLine) {
         showSuccess("Offline: Salvo localmente!", `A estimativa de ${successCount} talhões foi guardada e será sincronizada assim que você tiver internet.`);
      } else {
         showSuccess("Sucesso!", `Estimativa salva com sucesso para ${successCount} talhões!`);
      }

      setEstimateOpen(false);
      // AWAIT the refetch so that the state updates before we finish, ensuring React re-renders.
      await refetchEstimates();

      return { success: true, scope: scope };
    } catch (err) {
      if (err.message && (err.message.includes("permission") || err.message.includes("Missing or insufficient permissions"))) {
        showError("Acesso Negado", "Erro de permissão no PostgreSQL. As regras de PostgreSQL bloqueiam o acesso.");
      } else {
        showError("Erro", "Erro ao salvar estimativa: " + err.message);
      }
      return { success: false };
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Efeito dependente que calcula as Toneladas em tempo real sempre que TCH ou a Área mudar no form.
   */
  useEffect(() => {
    const area = parseBrazilianFloat(formEstimativa.area);
    const tch = parseBrazilianFloat(formEstimativa.tch);

    if (area > 0 && tch > 0) {
      const toneladasVal = area * tch;
      const toneladasFormatted = toneladasVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (formEstimativa.toneladas !== toneladasFormatted) {
        setFormEstimativa(prev => ({ ...prev, toneladas: toneladasFormatted }));
      }
    } else if (formEstimativa.toneladas !== "") {
      setFormEstimativa(prev => ({ ...prev, toneladas: "" }));
    }
  }, [formEstimativa.area, formEstimativa.tch]);

  /**
   * Efeito dependente para recalcular a Área total caso o usuário troque o Escopo (Scope) de edição.
   */
  const reloadMapWithFilters = React.useCallback(async ({ filters = null, activeMapModule = 'estimativa' } = {}) => {
    if (!enabled || !currentCompanyId || !currentSafra) return;
    console.log('[map] enviando activeMapModule', activeMapModule);
    console.log('[ordemCorte] module recebido', activeMapModule);
    const appliedFilters = filters || {};
    const resMap = await fetchLatestGeoJson(currentCompanyId, null, {
      suppressUpdateEvent: true,
      filters: appliedFilters,
      activeMapModule,
      safra: currentSafra,
      forceRemote: true,
    });

    if (resMap?.data?.features) {
      const parsedGeoJson = enrichGeoJsonFeatures(resMap.data);
      const nextCount = Array.isArray(parsedGeoJson.features) ? parsedGeoJson.features.length : 0;
      const currentCount = Array.isArray(geoJsonData?.features) ? geoJsonData.features.length : 0;

      // Proteção contra a piscada/sumiço: resposta vazia ou filtrada demais do
      // backend não deve apagar o mapa que já está em tela. Isso mantém as
      // demais camadas funcionando em cima da base local até chegar uma resposta válida.
      if (currentCount > 0 && nextCount === 0) {
        console.warn('[reloadMapWithFilters] resposta vazia ignorada para preservar o mapa atual.');
        return;
      }

      setGeoJsonData(parsedGeoJson);
      lastMapSignatureRef.current = buildMapSignature(parsedGeoJson);
    }
  }, [enabled, currentCompanyId, currentSafra, geoJsonData, enrichGeoJsonFeatures, buildMapSignature]);

  const updateFormAreaFromScope = (selectedTalhao, selectedTalhoes, enhancedGeoJson) => {
    if (!estimateOpen) return;
    let totalArea = 0;

    if (scope === "talhao" && selectedTalhao) {
      totalArea = parseBrazilianFloat(selectedTalhao.properties?.AREA);
    } else if (scope === "selecionados") {
      selectedTalhoes.forEach(id => {
        const feat = enhancedGeoJson?.features?.find(f => f.id === id);
        if (feat) totalArea += parseBrazilianFloat(feat.properties?.AREA);
      });
    } else if (scope === "filtro" && enhancedGeoJson) {
      enhancedGeoJson.features.forEach(feat => {
        totalArea += parseBrazilianFloat(feat.properties?.AREA);
      });
    } else if (scope === "fazenda" && geoJsonData) {
      let referenceFazenda = "";
      let referenceFundo = "";
      if (selectedTalhao && selectedTalhao.properties) {
        referenceFazenda = selectedTalhao.properties.FAZENDA || "";
        referenceFundo = selectedTalhao.properties.FUNDO_AGR || "";
      } else if (selectedTalhoes.length > 0) {
        const firstSelected = geoJsonData.features.find(f => f.id === selectedTalhoes[0]);
        if (firstSelected && firstSelected.properties) {
          referenceFazenda = firstSelected.properties.FAZENDA || "";
          referenceFundo = firstSelected.properties.FUNDO_AGR || "";
        }
      }
      geoJsonData.features.forEach(feat => {
        const featFaz = feat.properties.FAZENDA || "";
        const featFundo = feat.properties.FUNDO_AGR || "";
        if (referenceFazenda) {
           if (featFaz === referenceFazenda && featFundo === referenceFundo) {
              totalArea += parseBrazilianFloat(feat.properties?.AREA);
           }
        } else {
           totalArea += parseBrazilianFloat(feat.properties?.AREA);
        }
      });
    }

    setFormEstimativa(prev => ({ ...prev, area: totalArea ? totalArea.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "" }));
  };

  return {
    geoJsonData,
    setGeoJsonData,
    currentRodada,
    setCurrentRodada,
    availableRodadas,
    createNewRodada,
    backendSummary,
    backendFilterOptions,
    backendMapView,
    nextRodadaName,
    allEstimates,
    refetchEstimates,
    currentEstimate,
    estimateHistory,
    historyOpen,
    setHistoryOpen,
    estimateOpen,
    setEstimateOpen,
    formEstimativa,
    setFormEstimativa,
    isSaving,
    isLoadingEstimate,
    scope,
    setScope,
    loadEstimateData,
    openHistory,
    submitEstimate,
    updateFormAreaFromScope,
    reloadMapWithFilters
  };
}
