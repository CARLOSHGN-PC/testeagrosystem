import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { palette } from "../../constants/theme";
import { showConfirm } from "../../utils/alert";
import { parseDateSafe } from "../../utils/date";
import { isReadOnlyUser } from "../../utils/accessControl";

/**
 * EstimativaModals.jsx
 *
 * O que este bloco faz:
 * Contém a renderização dos 3 modais principais do sistema: Nova Estimativa (Formulário),
 * Histórico de Estimativa, e Filtros de Mapa.
 *
 * Por que ele existe:
 * Remover mais de 300 linhas de JSX flutuante de dentro da raiz. Os modais
 * só são renderizados via "AnimatePresence" quando as flags booleanas correspondentes estão ativas.
 *
 * O que entra e o que sai:
 * @param {Object} props - Todas os states e setters necessários para gerenciar o formulário e filtros.
 * @returns {JSX.Element} Conjunto de AnimatePresence condicional para os 3 modais.
 */
export default function EstimativaModals({
  // Modal states
  estimateOpen, setEstimateOpen,
  historyOpen, setHistoryOpen,
  filtersOpen, setFiltersOpen,

  // Data props
  currentSafra, currentRodada, allEstimates, scope, setScope,
  selectedTalhao, selectedTalhoes,
  enhancedGeoJson, geoJsonData,
  formEstimativa, setFormEstimativa,
  isSaving, submitEstimate,
  estimateHistory,
  filters, setFilters,
  setAppliedFilters, filterOptions,
  updateFormAreaFromScope, // Função de recalculo de área atrelada ao Escopo
  activeMapModule,
  session = null
}) {

  const readOnlyMode = isReadOnlyUser(session);

  // Regras de filtros por camada copiadas do comportamento do projeto de produção.
  // Isso impede que uma opção carregada pelo PostgreSQL/Dexie apareça no modal de uma camada errada.
  const showStatusFilter = ["ordemCorte", "tratosCulturais", "planejamentoTratosCulturais"].includes(activeMapModule);
  const showOrdemCorteFilter = activeMapModule === "ordemCorte";
  const showSequenciaPlanejamentoFilter = activeMapModule === "planejamentoSafra";
  const showPlanningProtocoloFilter = activeMapModule === "planejamentoTratosCulturais";

  // Shell para padronizar o fundo preto semi-transparente
  const modalShell = (children) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/55 backdrop-blur-sm">
      {children}
    </div>
  );

  // Efeito isolado para recalcular a area sempre que o escopo mudar.
  useEffect(() => {
    if (estimateOpen && updateFormAreaFromScope) {
      updateFormAreaFromScope(selectedTalhao, selectedTalhoes, enhancedGeoJson);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, selectedTalhao, selectedTalhoes, estimateOpen]);

  // Regra de Negócio de Segurança:
  // Verifica o status de estimativa no escopo atual.
  // Retorna um objeto indicando se TODOS estão estimados (para bloquear o botão)
  // ou se ALGUNS estão estimados (para apenas mostrar o aviso).
  const estimationStatus = React.useMemo(() => {
    if (!estimateOpen) return { allEstimated: false, someEstimated: false, estimatedCount: 0, totalCount: 0 };

    // Obter todos os IDs de talhão que estão englobados no `scope` atual
    const scopeTalhoesIds = [];

    if (scope === "talhao" && selectedTalhao) {
      scopeTalhoesIds.push(selectedTalhao.properties.featureId);
    } else if (scope === "selecionados" && selectedTalhoes.length > 0) {
      scopeTalhoesIds.push(...selectedTalhoes);
    } else if (scope === "filtro" && enhancedGeoJson) {
      enhancedGeoJson.features.forEach(f => scopeTalhoesIds.push(f.properties.featureId));
    } else if (scope === "fazenda" && geoJsonData) {
      let refFazenda = "", refFundo = "";
      if (selectedTalhao?.properties) {
        refFazenda = selectedTalhao.properties.FAZENDA || "";
        refFundo = selectedTalhao.properties.FUNDO_AGR || "";
      } else if (selectedTalhoes.length > 0) {
        const first = geoJsonData.features.find(f => f.id === selectedTalhoes[0]);
        if (first?.properties) {
          refFazenda = first.properties.FAZENDA || "";
          refFundo = first.properties.FUNDO_AGR || "";
        }
      }

      geoJsonData.features.forEach(feat => {
        if (!refFazenda || (feat.properties.FAZENDA === refFazenda && feat.properties.FUNDO_AGR === refFundo)) {
          scopeTalhoesIds.push(feat.properties.featureId);
        }
      });
    }

    if (scopeTalhoesIds.length === 0) {
      return { allEstimated: false, someEstimated: false, estimatedCount: 0, totalCount: 0 };
    }

    // Compara se os talhões neste escopo já existem no `allEstimates`
    const estimatedTalhaoIds = new Set(allEstimates.map(e => e.talhaoId));
    let estimatedCount = 0;

    for (const featureId of scopeTalhoesIds) {
      // Procura a feature no mapa completo
      const feat = geoJsonData?.features?.find(f => f.properties.featureId === featureId);
      if (feat) {
        const p = feat.properties;
        const f_agr = p.FUNDO_AGR ? String(p.FUNDO_AGR).trim() : "N-A";
        const faz = p.FAZENDA ? String(p.FAZENDA).trim() : "N-A";
        const talhao = p.TALHAO ? String(p.TALHAO).trim() : `mock_${feat.id}`;
        const uniqueIndex = p.featureId !== undefined ? p.featureId : feat.id;

        const rawId = `${f_agr}_${faz}_${talhao}_SEQ${uniqueIndex}`;
        const finalUniqueId = rawId.replace(/\//g, '-').replace(/ /g, '_').toUpperCase();

        if (estimatedTalhaoIds.has(finalUniqueId)) {
          estimatedCount++;
        }
      }
    }

    return {
      allEstimated: estimatedCount === scopeTalhoesIds.length,
      someEstimated: estimatedCount > 0 && estimatedCount < scopeTalhoesIds.length,
      estimatedCount,
      totalCount: scopeTalhoesIds.length
    };
  }, [estimateOpen, scope, selectedTalhao, selectedTalhoes, enhancedGeoJson, geoJsonData, allEstimates]);

  const handleSaveWrapper = async () => {
    if (estimationStatus.allEstimated) return; // Segurança extra
    await submitEstimate(selectedTalhoes, selectedTalhao, enhancedGeoJson);

    // Clear selection automatically after successfully saving (as requested by user)
    // using window to avoid needing props drill or directly use the callback from the parent.
    // However, looking at the args above, `props` was destructured. Let's fix this properly.
    if (typeof props !== 'undefined' && typeof props?.setSelectedTalhao === 'function') {
      props.setSelectedTalhao(null);
    }
    if (typeof props !== 'undefined' && typeof props?.setSelectedTalhoes === 'function') {
      props.setSelectedTalhoes([]);
    }
  };

  return (
    <>
      {/* 1. Modal: Formulário de Nova Estimativa */}
      <AnimatePresence>
        {estimateOpen && modalShell(
          <motion.div initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} className="w-full max-w-[920px] max-h-[90vh] flex flex-col rounded-[26px] overflow-hidden border shadow-[0_10px_30px_rgba(0,0,0,0.28)]" style={{ background: "#111a2d", borderColor: "rgba(255,255,255,0.12)" }}>
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b shrink-0" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
              <div>
                <h2 className="text-[22px] font-semibold">Nova estimativa</h2>
                <p className="text-sm mt-1" style={{ color: palette.text2 }}>Revise o escopo da estimativa e confirme os dados antes de salvar.</p>
              </div>
              <button className="rounded-xl border px-3 py-2 transition-colors hover:bg-white/10" style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)" }} onClick={() => setEstimateOpen(false)}>✕</button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  ["Fundo agrícola / Fazenda", scope === "talhao" ? ((selectedTalhao?.properties?.FUNDO_AGR && selectedTalhao?.properties?.FAZENDA) ? `${selectedTalhao.properties.FUNDO_AGR} - ${selectedTalhao.properties.FAZENDA}` : selectedTalhao?.properties?.FAZENDA || selectedTalhao?.properties?.FUNDO_AGR || "N/A") : (scope === "selecionados" && selectedTalhoes.length > 0 ? ((enhancedGeoJson.features.find(f => f.id === selectedTalhoes[0])?.properties?.FUNDO_AGR && enhancedGeoJson.features.find(f => f.id === selectedTalhoes[0])?.properties?.FAZENDA) ? `${enhancedGeoJson.features.find(f => f.id === selectedTalhoes[0]).properties.FUNDO_AGR} - ${enhancedGeoJson.features.find(f => f.id === selectedTalhoes[0]).properties.FAZENDA}` : "Múltiplos/Variados") : "Várias")],
                  ["Talhão", scope === "talhao" ? (selectedTalhao?.properties?.TALHAO || "N/A") : (scope === "selecionados" ? `${selectedTalhoes.length} selecionados` : "Múltiplos")],
                  ["Variedade", scope === "talhao" ? (selectedTalhao?.properties?.VARIEDADE || "N/A") : "Várias"],
                  ["Corte / Estágio", scope === "talhao" ? (selectedTalhao?.properties?.ECORTE || "N/A") : "Vários"]
                ].map(([k, v]) => (
                  <div key={k} className="rounded-2xl border p-3" style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.12)" }}>
                    <div className="text-xs" style={{ color: palette.text2 }}>{k}</div>
                    <div className="mt-1 font-semibold truncate" title={v}>{v}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div className="flex flex-col gap-2">
                  <label className="text-xs" style={{ color: palette.text2 }}>Safra</label>
                  <input readOnly value={currentSafra} className="rounded-2xl border px-4 py-3 outline-none opacity-60" style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.12)", color: palette.white }} />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs" style={{ color: palette.text2 }}>Data da estimativa</label>
                  <input readOnly value={new Date().toISOString().split('T')[0]} className="rounded-2xl border px-4 py-3 outline-none opacity-60" style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.12)", color: palette.white }} />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs" style={{ color: palette.text2 }}>Área (ha)</label>
                  <input value={formEstimativa.area} onChange={(e) => setFormEstimativa({...formEstimativa, area: e.target.value})} className="rounded-2xl border px-4 py-3 outline-none focus:border-yellow-500 transition-colors" style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.12)", color: palette.white }} />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs" style={{ color: palette.text2 }}>TCH estimado</label>
                  <input value={formEstimativa.tch} onChange={(e) => setFormEstimativa({...formEstimativa, tch: e.target.value})} className="rounded-2xl border px-4 py-3 outline-none focus:border-yellow-500 transition-colors" style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.12)", color: palette.white }} />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs" style={{ color: palette.text2 }}>Toneladas estimadas</label>
                  <input readOnly value={formEstimativa.toneladas} className="rounded-2xl border px-4 py-3 outline-none opacity-80" style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.12)", color: palette.white }} />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs" style={{ color: palette.text2 }}>Responsável</label>
                  <input readOnly value="Carlos" className="rounded-2xl border px-4 py-3 outline-none opacity-60" style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.12)", color: palette.white }} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  ["talhao", "Talhão atual", "Grava apenas no talhão selecionado."],
                  ["selecionados", "Selecionados", "Usa a seleção múltipla do mapa."],
                  ["filtro", "Filtro atual", "Aplica a todos os talhões no filtro atual."],
                  ["fazenda", "Fazenda inteira", (() => {
                     let fazName = "Aplica a todos os talhões desta fazenda.";
                     if (selectedTalhao && selectedTalhao.properties?.FAZENDA) {
                        fazName = `Aplica aos talhões da fazenda ${selectedTalhao.properties.FAZENDA}.`;
                     } else if (selectedTalhoes.length > 0) {
                        const first = enhancedGeoJson?.features?.find(f => f.id === selectedTalhoes[0]);
                        if (first && first.properties?.FAZENDA) {
                           fazName = `Aplica aos talhões da fazenda ${first.properties.FAZENDA}.`;
                        }
                     }
                     return fazName;
                  })()]
                ].map(([key, title, sub]) => (
                  <button
                    key={key}
                    onClick={async () => {
                      if (key === "fazenda" || key === "filtro") {
                        const confirmResult = await showConfirm(
                          "Aplicar em massa",
                          `Tem certeza que deseja aplicar a estimativa para a ${title}? Essa ação impactará vários talhões.`
                        );
                        if (!confirmResult.isConfirmed) return;
                      }
                      setScope(key);
                    }}
                    className="text-left rounded-[18px] border p-3 transition-colors hover:bg-white/5"
                    style={{ background: "rgba(255,255,255,0.05)", borderColor: scope === key ? "rgba(245,158,11,0.7)" : "rgba(255,255,255,0.12)", boxShadow: scope === key ? "inset 0 0 0 1px rgba(245,158,11,0.25)" : "none" }}
                  >
                    <div className="font-semibold text-sm">{title}</div>
                    <div className="text-xs mt-1" style={{ color: palette.text2 }}>{sub}</div>
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs" style={{ color: palette.text2 }}>Observação</label>
                <textarea placeholder="Ao salvar, cada reestimativa gera uma nova versão por safra sem apagar o histórico anterior." className="rounded-2xl border px-4 py-3 min-h-[110px] outline-none focus:border-yellow-500 transition-colors" style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.12)", color: palette.white }} />
              </div>

              {estimationStatus.allEstimated && (
                <div className="rounded-2xl border p-4 text-sm font-medium text-red-400 bg-red-400/10" style={{ borderColor: "rgba(248,113,113,0.2)" }}>
                   Atenção: Todos os talhões desta seleção já possuem estimativa salva na rodada "{currentRodada}".
                   Para alterar ou estimar novamente, crie uma nova reestimativa no painel principal.
                </div>
              )}
              {estimationStatus.someEstimated && (
                <div className="rounded-2xl border p-4 text-sm font-medium text-yellow-400 bg-yellow-400/10" style={{ borderColor: "rgba(250,204,21,0.2)" }}>
                   Atenção: {estimationStatus.estimatedCount} de {estimationStatus.totalCount} talhões já estão estimados. Ao salvar, os já estimados serão ignorados.
                </div>
              )}
              {readOnlyMode && (
                <div className="rounded-2xl border p-4 text-sm font-medium text-yellow-100 bg-yellow-400/10" style={{ borderColor: "rgba(250,204,21,0.25)" }}>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t shrink-0" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
              <button className="rounded-xl border px-4 py-3 hover:bg-white/10 transition-colors" style={{ borderColor: "rgba(255,255,255,0.12)", background: "transparent" }} onClick={() => setEstimateOpen(false)}>Cancelar</button>
              <button disabled={readOnlyMode || isSaving || estimationStatus.allEstimated} className="rounded-xl px-4 py-3 transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed" style={{ background: "linear-gradient(135deg, #f59e0b, #f97316)", color: "white" }} onClick={readOnlyMode ? undefined : handleSaveWrapper}>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Modal: Histórico */}
      <AnimatePresence>
        {historyOpen && modalShell(
          <motion.div initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} className="w-full max-w-[620px] max-h-[90vh] flex flex-col rounded-[26px] overflow-hidden border shadow-[0_10px_30px_rgba(0,0,0,0.28)]" style={{ background: "#111a2d", borderColor: "rgba(255,255,255,0.12)" }}>
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b shrink-0" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
              <div>
                <h2 className="text-[22px] font-semibold">Histórico de Estimativas</h2>
                <p className="text-sm mt-1" style={{ color: palette.text2 }}>Safra {currentSafra}</p>
              </div>
              <button className="rounded-xl border px-3 py-2 transition-colors hover:bg-white/10" style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)" }} onClick={() => setHistoryOpen(false)}>✕</button>
            </div>
            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              {estimateHistory.length === 0 ? (
                <div className="text-center py-8 text-sm" style={{ color: palette.text2 }}>Nenhum histórico encontrado para esta safra.</div>
              ) : (
                estimateHistory.map((item, idx) => (
                  <div key={idx} className="rounded-2xl border p-4 hover:bg-white/5 transition-colors relative overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)" }}>
                    {item.rodada && (
                       <div className="absolute top-0 right-0 px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-bl-xl" style={{ background: "rgba(212,175,55,0.15)", color: palette.gold }}>
                         {item.rodada}
                       </div>
                    )}
                    <div className="flex justify-between items-center mb-2 mt-1">
                      <div className="font-semibold text-[15px] flex items-center gap-2">
                         Versão {item.version}
                      </div>
                      <div className="text-xs" style={{ color: palette.text2 }}>
                         {parseDateSafe(item.updatedAt)?.toLocaleString('pt-BR') || "Data indisponível"}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                      <div><span style={{ color: palette.text2 }}>Área:</span> {item.area} ha</div>
                      <div><span style={{ color: palette.text2 }}>TCH:</span> {item.tch}</div>
                      <div><span style={{ color: palette.text2 }}>Toneladas:</span> {item.toneladas}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Modal: Filtros */}
      <AnimatePresence>
        {filtersOpen && modalShell(
          <motion.div initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} className="w-full max-w-[620px] max-h-[90vh] flex flex-col rounded-[26px] overflow-hidden border shadow-[0_10px_30px_rgba(0,0,0,0.28)]" style={{ background: "#111a2d", borderColor: "rgba(255,255,255,0.12)" }}>
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b shrink-0" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
              <div>
                <h2 className="text-[22px] font-semibold">Filtros do mapa</h2>
                <p className="text-sm mt-1" style={{ color: palette.text2 }}>Selecione o fundo agrícola/fazenda, variedade, corte e talhão que deseja visualizar.</p>
              </div>
              <button className="rounded-xl border px-3 py-2 transition-colors hover:bg-white/10" style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)" }} onClick={() => setFiltersOpen(false)}>✕</button>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 overflow-y-auto flex-1 custom-scrollbar">

              {showStatusFilter && filterOptions.ordensCorteStatus?.length > 0 && (
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: palette.text2 }}>Status da Ordem (Múltipla Seleção)</label>
                  <div className="flex flex-wrap gap-2">
                      {filterOptions.ordensCorteStatus.map(status => {
                        const isSelected = filters.ordemCorteStatus?.includes(status);
                        // Cores personalizadas para o status (opcional, ou pode usar padrão dourado)
                        let statusColor = palette.gold;
                        if (status === "Fechada") statusColor = "#22c55e";
                        else if (status === "Aberta") statusColor = "#eab308";
                        else if (status === "Aguardando") statusColor = "#ef4444";

                        return (
                          <label
                            key={status}
                            className="flex items-center gap-2 cursor-pointer rounded-xl border px-3 py-2 transition-colors select-none"
                            style={{
                              background: isSelected ? `${statusColor}1A` : "rgba(255,255,255,0.05)", // 1A é ~10% opacidade em Hex
                              borderColor: isSelected ? statusColor : "rgba(255,255,255,0.12)",
                            }}
                          >
                            <input
                              type="checkbox"
                              className="hidden"
                              checked={isSelected}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                const current = filters.ordemCorteStatus || [];
                                const next = checked ? [...current, status] : current.filter(s => s !== status);
                                setFilters({ ...filters, ordemCorteStatus: next, frente: "", fazenda: "", variedade: "", corte: "", talhao: "", tipoPropriedade: [] });
                              }}
                            />
                            <div className="w-4 h-4 rounded border flex items-center justify-center transition-colors" style={{ borderColor: isSelected ? statusColor : "rgba(255,255,255,0.3)", background: isSelected ? statusColor : "transparent" }}>
                              {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                            </div>
                            <span className="text-sm font-medium" style={{ color: isSelected ? palette.white : palette.text2 }}>{status}</span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2 sm:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: palette.text2 }}>Tipo de Propriedade (Múltipla Seleção)</label>
                <div className="flex flex-wrap gap-2">
                  {filterOptions.tiposPropriedade?.length === 0 ? (
                    <div className="text-xs opacity-60">Nenhum tipo de propriedade encontrado nos dados atuais.</div>
                  ) : (
                    filterOptions.tiposPropriedade?.map(tipo => {
                      const isSelected = filters.tipoPropriedade?.includes(tipo);
                      return (
                        <label
                          key={tipo}
                          className="flex items-center gap-2 cursor-pointer rounded-xl border px-3 py-2 transition-colors select-none"
                          style={{
                            background: isSelected ? "rgba(245,158,11,0.1)" : "rgba(255,255,255,0.05)",
                            borderColor: isSelected ? palette.gold : "rgba(255,255,255,0.12)",
                          }}
                        >
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={isSelected}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              const current = filters.tipoPropriedade || [];
                              const next = checked ? [...current, tipo] : current.filter(t => t !== tipo);
                              setFilters({ ...filters, tipoPropriedade: next, frente: "", fazenda: "", variedade: "", corte: "", talhao: "" });
                            }}
                          />
                          <div className="w-4 h-4 rounded border flex items-center justify-center transition-colors" style={{ borderColor: isSelected ? palette.gold : "rgba(255,255,255,0.3)", background: isSelected ? palette.gold : "transparent" }}>
                            {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                          </div>
                          <span className="text-sm font-medium" style={{ color: isSelected ? palette.white : palette.text2 }}>{tipo}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs" style={{ color: palette.text2 }}>Fundo agrícola / Fazenda</label>
                <div className="relative">
                  <select
                    value={filters.fazenda}
                    onChange={(e) => setFilters({...filters, fazenda: e.target.value, ordemCorteId: "", frente: "", variedade: "", corte: "", talhao: ""})}
                    className="w-full rounded-2xl border px-4 py-3 outline-none appearance-none focus:border-yellow-500 transition-colors"
                    style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.12)", color: palette.white }}
                  >
                    <option value="" style={{ color: "black" }}>Todas as Fazendas</option>
                    {filterOptions.fazendas.map(f => <option key={f} value={f} style={{ color: "black" }}>{f}</option>)}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: palette.text2 }} />
                </div>
              </div>

              {showOrdemCorteFilter && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs" style={{ color: palette.text2 }}>Ordem de Corte</label>
                  <div className="relative">
                    <select
                      value={filters.ordemCorteId || ""}
                      onChange={(e) => setFilters({ ...filters, ordemCorteId: e.target.value })}
                      className="w-full rounded-2xl border px-4 py-3 outline-none appearance-none focus:border-yellow-500 transition-colors"
                      style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.12)", color: palette.white }}
                    >
                      <option value="" style={{ color: "black" }}>
                        {(filterOptions.ordensCorte || []).length > 0
                          ? "Todas as Ordens de Corte"
                          : "Nenhuma ordem de corte disponível para esta safra"}
                      </option>
                      {(filterOptions.ordensCorte || []).map((ordem) => (
                        <option key={ordem.value} value={ordem.value} style={{ color: "black" }}>
                          {ordem.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: palette.text2 }} />
                  </div>
                </div>
              )}

              {showSequenciaPlanejamentoFilter && filterOptions.sequenciasPlanejamento?.length > 0 && (
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: palette.text2 }}>Sequência (Planejamento Safra)</label>
                  <div className="flex flex-wrap gap-2">
                    {filterOptions.sequenciasPlanejamento.map(seq => {
                      const isSelected = filters.sequenciasPlanejamento?.includes(seq);
                      return (
                        <label
                          key={seq}
                          className="flex items-center gap-2 cursor-pointer rounded-xl border px-3 py-2 transition-colors select-none"
                          style={{
                            background: isSelected ? "rgba(245,158,11,0.1)" : "rgba(255,255,255,0.05)",
                            borderColor: isSelected ? palette.gold : "rgba(255,255,255,0.12)",
                          }}
                        >
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={isSelected}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              const current = filters.sequenciasPlanejamento || [];
                              const next = checked ? [...current, seq] : current.filter(s => s !== seq);
                              setFilters({ ...filters, sequenciasPlanejamento: next, frente: "", fazenda: "", variedade: "", corte: "", talhao: "" });
                            }}
                          />
                          <div className="w-4 h-4 rounded border flex items-center justify-center transition-colors" style={{ borderColor: isSelected ? palette.gold : "rgba(255,255,255,0.3)", background: isSelected ? palette.gold : "transparent" }}>
                            {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                          </div>
                          <span className="text-sm font-medium" style={{ color: isSelected ? palette.white : palette.text2 }}>{seq}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <label className="text-xs" style={{ color: palette.text2 }}>Frente de Serviço</label>
                <div className="relative">
                  <select
                    value={filters.frente}
                    onChange={(e) => setFilters({...filters, frente: e.target.value, ordemCorteId: "", variedade: "", corte: "", talhao: ""})}
                    className="w-full rounded-2xl border px-4 py-3 outline-none appearance-none focus:border-yellow-500 transition-colors"
                    style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.12)", color: palette.white }}
                  >
                    <option value="" style={{ color: "black" }}>Todas as Frentes</option>
                    {filterOptions.frentes?.map(f => <option key={f} value={f} style={{ color: "black" }}>{f}</option>)}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: palette.text2 }} />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs" style={{ color: palette.text2 }}>Variedade</label>
                <div className="relative">
                  <select
                    value={filters.variedade}
                    onChange={(e) => setFilters({...filters, variedade: e.target.value, corte: "", talhao: ""})}
                    className="w-full rounded-2xl border px-4 py-3 outline-none appearance-none focus:border-yellow-500 transition-colors"
                    style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.12)", color: palette.white }}
                  >
                    <option value="" style={{ color: "black" }}>Todas as Variedades</option>
                    {filterOptions.variedades.map(v => <option key={v} value={v} style={{ color: "black" }}>{v}</option>)}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: palette.text2 }} />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs" style={{ color: palette.text2 }}>Corte / Estágio</label>
                <div className="relative">
                  <select
                    value={filters.corte}
                    onChange={(e) => setFilters({...filters, corte: e.target.value, talhao: ""})}
                    className="w-full rounded-2xl border px-4 py-3 outline-none appearance-none focus:border-yellow-500 transition-colors"
                    style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.12)", color: palette.white }}
                  >
                    <option value="" style={{ color: "black" }}>Todos os Cortes</option>
                    {filterOptions.cortes.map(c => <option key={c} value={c} style={{ color: "black" }}>{c}</option>)}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: palette.text2 }} />
                </div>
              </div>


              {showPlanningProtocoloFilter && (
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <label className="text-xs" style={{ color: palette.text2 }}>Protocolo do Planejamento</label>
                  <div className="relative">
                    <select
                      value={filters.planningOperacao || ""}
                      onChange={(e) => setFilters({ ...filters, planningOperacao: e.target.value })}
                      className="w-full rounded-2xl border px-4 py-3 outline-none appearance-none focus:border-yellow-500 transition-colors"
                      style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.12)", color: palette.white }}
                    >
                      <option value="" style={{ color: "black" }}>Selecione o Protocolo</option>
                      {(filterOptions.planningOperacoes || []).map(op => <option key={op.value} value={op.value} style={{ color: "black" }}>{op.label}</option>)}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: palette.text2 }} />
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <label className="text-xs" style={{ color: palette.text2 }}>Talhão</label>
                <div className="relative">
                  <select
                    value={filters.talhao}
                    onChange={(e) => setFilters({...filters, talhao: e.target.value})}
                    className="w-full rounded-2xl border px-4 py-3 outline-none appearance-none focus:border-yellow-500 transition-colors"
                    style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.12)", color: palette.white }}
                  >
                    <option value="" style={{ color: "black" }}>Todos os Talhões</option>
                    {filterOptions.talhoes.map(t => <option key={t} value={t} style={{ color: "black" }}>{t}</option>)}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: palette.text2 }} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t shrink-0" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
              <button className="rounded-xl border px-4 py-3 hover:bg-white/10 transition-colors" style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)" }} onClick={() => {
                setFilters({ordemCorteStatus: [], ordemCorteId: '', statusPlanejamento: [], sequenciasPlanejamento: [], frente: '', fazenda: '', variedade: '', corte: '', talhao: '', tipoPropriedade: [], planningOperacao: ''});
                setAppliedFilters({ordemCorteStatus: [], ordemCorteId: '', statusPlanejamento: [], sequenciasPlanejamento: [], frente: '', fazenda: '', variedade: '', corte: '', talhao: '', tipoPropriedade: [], planningOperacao: ''});
                setFiltersOpen(false);
              }}>Limpar</button>
              <button className="rounded-xl px-4 py-3 transition-transform hover:scale-[1.02]" style={{ background: `linear-gradient(135deg, ${palette.gold} 0%, ${palette.goldLight} 100%)`, color: palette.bg }} onClick={() => {
                const nextFilters = {
                  ordemCorteStatus: Array.isArray(filters.ordemCorteStatus) ? [...filters.ordemCorteStatus] : [],
                  ordemCorteId: filters.ordemCorteId || "",
                  statusPlanejamento: Array.isArray(filters.statusPlanejamento) ? [...filters.statusPlanejamento] : [],
                  sequenciasPlanejamento: Array.isArray(filters.sequenciasPlanejamento) ? [...filters.sequenciasPlanejamento] : [],
                  frente: filters.frente || "",
                  fazenda: filters.fazenda || "",
                  variedade: filters.variedade || "",
                  corte: filters.corte || "",
                  talhao: filters.talhao || "",
                  tipoPropriedade: Array.isArray(filters.tipoPropriedade) ? [...filters.tipoPropriedade] : [],
                  planningOperacao: filters.planningOperacao || ""
                };

                console.log("[filters][apply]", nextFilters);

                setAppliedFilters(nextFilters);
                setFiltersOpen(false);
              }}>Aplicar filtros</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
