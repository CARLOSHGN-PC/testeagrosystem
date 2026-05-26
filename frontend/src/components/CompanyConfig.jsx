import React, { useEffect, useMemo, useRef, useState } from "react";
import { UploadCloud, CheckCircle2, AlertCircle, File, Loader2, Map, FileSpreadsheet, Palette, DatabaseZap, RotateCcw, ShieldAlert } from "lucide-react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { getUniqueTalhaoId } from "../utils/geoHelpers";
import { parseBrazilianFloat } from "../utils/formatters";
import { importShapefile, validateShapefileSet } from "../services/shpImport";
import db from "../services/localDb";
import { useCompanyConfig } from "../contexts/ConfigContext";
import { showError, showSuccess } from "../utils/alert";
import { useAuth } from "../hooks/useAuth";
import { apiRequest } from "../services/apiClient";
import { previewReestimativaRollback, applyReestimativaRollback } from "../services/reestimativaRollbackService";
import { getValidAccessToken } from "../services/postgresAuthService";

const chunkArray = (array, chunkSize) => {
  if (!Array.isArray(array) || chunkSize <= 0) return [];
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
};

export default function CompanyConfig({ onUploadSuccess, currentCompanyId, currentSafra, geoJsonData, allEstimates, refetchEstimates }) {
  const { user } = useAuth();
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState("idle"); // idle, processing, success, error
  const [errorMessage, setErrorMessage] = useState("");
  const fileInputRef = useRef(null);
  const fileInputRefEst = useRef(null);
  const [estFile, setEstFile] = useState(null);
  const [estStatus, setEstStatus] = useState("idle");
  const [estErrorMessage, setEstErrorMessage] = useState("");
  const [estProgress, setEstProgress] = useState({ current: 0, total: 0, percent: 0 });
  const { logoColor, setLogoColor } = useCompanyConfig();
  const [localColor, setLocalColor] = useState(logoColor || "#55AB52");
  const [colorStatus, setColorStatus] = useState("idle");
  const [migrationStatus, setMigrationStatus] = useState("idle");
  const [verifyShpStatus, setVerifyShpStatus] = useState("idle");
  const [fixOcFazendaStatus, setFixOcFazendaStatus] = useState("idle");
  const [rollbackStatus, setRollbackStatus] = useState("idle");
  const [rollbackResult, setRollbackResult] = useState(null);
  const [rollbackForm, setRollbackForm] = useState({
    companyId: currentCompanyId || "",
    harvestYear: currentSafra || "",
    from: "",
    to: "",
    round: "",
    includeAllRounds: false,
    confirmText: "",
  });


  const resolvedCompanyId = useMemo(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('@AgroSystem:auth') || 'null');
      return stored?.companyId || currentCompanyId || user?.companyId || '';
    } catch {
      return currentCompanyId || user?.companyId || '';
    }
  }, [currentCompanyId, user?.companyId]);

  useEffect(() => {
    setRollbackForm((prev) => ({
      ...prev,
      companyId: prev.companyId || resolvedCompanyId || currentCompanyId || "",
      harvestYear: prev.harvestYear || currentSafra || "",
    }));
  }, [resolvedCompanyId, currentCompanyId, currentSafra]);

  const isSuperAdminUser = useMemo(() => {
    const role = String(user?.role || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const email = String(user?.email || '').toLowerCase();
    return role.includes('superadmin') || email === 'carlosnascimento@usinacacu.com.br';
  }, [user?.role, user?.email]);

  const updateRollbackForm = (field, value) => {
    setRollbackForm((prev) => ({ ...prev, [field]: value }));
  };

  const buildRollbackPayload = () => ({
    companyId: rollbackForm.companyId || resolvedCompanyId,
    harvestYear: rollbackForm.harvestYear || currentSafra,
    from: rollbackForm.from,
    to: rollbackForm.to || undefined,
    round: rollbackForm.round?.trim() || undefined,
    includeAllRounds: rollbackForm.includeAllRounds === true,
  });

  const handlePreviewRollback = async () => {
    setRollbackStatus("previewing");
    setRollbackResult(null);
    try {
      const result = await previewReestimativaRollback(buildRollbackPayload());
      setRollbackResult(result);
      setRollbackStatus("previewed");
      if ((result?.total || 0) === 0) {
        showSuccess("Simulação concluída", "Nenhuma reestimativa encontrada com esses filtros.");
      } else {
        showSuccess("Simulação concluída", `${result.total} registro(s) encontrados para possível reversão.`);
      }
    } catch (err) {
      console.error(err);
      setRollbackStatus("error");
      showError("Falha na simulação", err.message || "Erro ao simular reversão.");
    }
  };

  const handleApplyRollback = async () => {
    if (String(rollbackForm.confirmText || '').trim().toUpperCase() !== 'REVERTER') {
      showError("Confirmação obrigatória", "Digite REVERTER no campo de confirmação antes de executar.");
      return;
    }

    const ok = window.confirm("ATENÇÃO: isso vai remover do banco as reestimativas encontradas nesses filtros. Confirma executar a reversão?");
    if (!ok) return;

    setRollbackStatus("applying");
    try {
      const result = await applyReestimativaRollback({
        ...buildRollbackPayload(),
        confirmText: rollbackForm.confirmText,
      });
      setRollbackResult(result);
      setRollbackStatus("applied");
      showSuccess("Reversão executada", result.message || "Reestimativa revertida com sucesso.");
      if (typeof refetchEstimates === 'function') {
        await refetchEstimates();
      }
    } catch (err) {
      console.error(err);
      setRollbackStatus("error");
      showError("Falha na reversão", err.message || "Erro ao executar reversão.");
    }
  };

  const handleSaveColor = async () => {
    setColorStatus("processing");
    try {
      if (!resolvedCompanyId) {
        throw new Error("Empresa não identificada para salvar a cor.");
      }

      const response = await apiRequest(`/api/postgres/companies/${encodeURIComponent(resolvedCompanyId)}/config`, {
        method: "PATCH",
        body: JSON.stringify({ logoColor: localColor })
      });

      const savedColor = response?.data?.logoColor || localColor;
      setLogoColor(savedColor);
      setLocalColor(savedColor);
      setColorStatus("success");
      setTimeout(() => setColorStatus("idle"), 3000);
    } catch (err) {
      console.error(err);
      setColorStatus("error");
      setErrorMessage(err.message || "Erro ao salvar configuração da empresa.");
      setTimeout(() => setColorStatus("idle"), 3000);
    }
  };

  const palette = {
    bg: "#050505",
    bg2: "#0A0A0A",
    tech: "#0D1B2A",
    tech2: "#1B263B",
    gold: "#D4AF37",
    goldLight: "#E6C76B",
    white: "#FFFFFF",
    text2: "#B0BEC5",
  };

  const handleFileChange = (e) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
      setStatus("idle");
      setErrorMessage("");
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      setFiles(Array.from(e.dataTransfer.files));
      setStatus("idle");
      setErrorMessage("");
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setStatus("processing");
    setErrorMessage("");

    try {
      validateShapefileSet(files);

      if (!resolvedCompanyId) {
        throw new Error("companyId não encontrado na sessão atual.");
      }
      const result = await importShapefile(files, resolvedCompanyId);
      if (result.success) {
        setStatus("success");
        if (onUploadSuccess) {
          onUploadSuccess(result.geoJson);
        }
      } else {
        setStatus("error");
        setErrorMessage(result.error);
      }
    } catch (err) {
      setStatus("error");
      setErrorMessage(err.message || "Erro durante o processamento do shapefile.");
    }
  };


  const handleEstFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setEstFile(e.target.files[0]);
      setEstStatus("idle");
      setEstErrorMessage("");
      setEstProgress({ current: 0, total: 0, percent: 0 });
    }
  };

  const removeEstFile = () => {
    setEstFile(null);
    setEstStatus("idle");
    setEstErrorMessage("");
    setEstProgress({ current: 0, total: 0, percent: 0 });
  };

  const handleEstUpload = async () => {
    if (!estFile) return;
    if (!geoJsonData || !geoJsonData.features || geoJsonData.features.length === 0) {
      setEstStatus("error");
      setEstErrorMessage("Nenhum mapa (Shapefile) encontrado. Importe o mapa primeiro para poder cruzar as áreas.");
      return;
    }

    setEstStatus("processing");
    setEstErrorMessage("");

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: "array" });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

          if (json.length === 0) {
            throw new Error("A planilha está vazia.");
          }

          // Encontra os nomes das colunas de forma flexível (ignorando case)
          const firstRow = json[0];
          const keys = Object.keys(firstRow);

          let fundoCol = keys.find(k => k.toLowerCase().includes("fundo"));
          let talhaoCol = keys.find(k => k.toLowerCase().includes("talh"));
          let tchCol = keys.find(k => k.toLowerCase().includes("tch"));

          if (!fundoCol || !talhaoCol || !tchCol) {
            throw new Error("A planilha deve conter as colunas: FUNDO_AGRICOLA, TALHAO e TCH.");
          }

          const missingLines = [];
          const linesToSave = [];
          const estimatedTalhaoIds = new Set((allEstimates || []).map(est => est.talhaoId));

          for (let i = 0; i < json.length; i++) {
            const row = json[i];
            const fundo = String(row[fundoCol] || "").trim().toUpperCase();
            const talhao = String(row[talhaoCol] || "").trim().toUpperCase();
            const tchStr = String(row[tchCol] || "").trim();
            const tch = parseBrazilianFloat(tchStr);

            if (!fundo || !talhao || isNaN(tch) || tch <= 0) continue;

            // Encontrar no geoJsonData
            let foundFeatures = geoJsonData.features.filter(f => {
              const fAgr = String(f.properties?.FUNDO_AGR || "").trim().toUpperCase();
              const fTalhao = String(f.properties?.TALHAO || "").trim().toUpperCase();
              // Como pode haver variações de nome de fundo (ex: "FUNDO 1" vs "FUNDO_1"), fazemos um include simples ou match exato
              return fAgr === fundo && fTalhao === talhao;
            });

            // Fallback de busca mais relaxada se não encontrar exato
            if (foundFeatures.length === 0) {
               foundFeatures = geoJsonData.features.filter(f => {
                  const fAgr = String(f.properties?.FUNDO_AGR || "").trim().toUpperCase();
                  const fTalhao = String(f.properties?.TALHAO || "").trim().toUpperCase();
                  // Tenta achar com replaces de espaço
                  return fAgr.replace(/\s+/g, '') === fundo.replace(/\s+/g, '') &&
                         fTalhao.replace(/^0+/, '') === talhao.replace(/^0+/, '');
               });
            }

            if (foundFeatures.length > 0) {
              // Pegamos a primeira feature correspondente. Em caso de multipoligonos, o usuário
              // pode ter que consolidar. Mas vamos associar a todas as parts do talhão se houver mais de uma
              for (const feat of foundFeatures) {
                const uniqueTalhaoId = getUniqueTalhaoId(feat);

                // Ignorar se já existe estimativa salva pra esse talhão nesta rodada (Estimativa)
                if (estimatedTalhaoIds.has(uniqueTalhaoId)) continue;

                const area = parseBrazilianFloat(feat.properties?.AREA || "0");
                const toneladas = area * tch;

                linesToSave.push({
                   uniqueTalhaoId,
                   payload: {
                      fundo_agricola: feat.properties?.FUNDO_AGR || fundo,
                      fazenda: feat.properties?.FAZENDA || "N/A",
                      variedade: feat.properties?.VARIEDADE || "N/A",
                      area: area.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                      tch: tchStr,
                      toneladas: toneladas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                      responsavel: "Importação",
                      rodada: "Estimativa"
                   }
                });
              }
            } else {
              // Não encontrou no shapefile
              missingLines.push({
                "Linha Planilha": i + 2,
                "Fundo Agricola": fundo,
                "Talhao": talhao,
                "TCH": tchStr,
                "Motivo": "Talhão não encontrado no mapa (Shapefile)"
              });
            }
          }

          // Salvar as estimativas encontradas em LOTES para não travar o navegador
          let savedCount = 0;
          if (linesToSave.length > 0) {
            const CHUNK_SIZE = 500;
            const MAX_PARALLEL = 3;
            const chunks = chunkArray(linesToSave, CHUNK_SIZE);
            const totalChunks = chunks.length;
            const failedChunks = [];
            const configuredApiUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || "";
            const isLocalHost = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);
            const apiUrl = configuredApiUrl || (isLocalHost ? "" : "https://agro-system-hrbb.onrender.com");

            setEstProgress({ current: 0, total: linesToSave.length, percent: 0 });

            const uploadChunk = async (chunk, chunkIndex) => {
              const token = await getValidAccessToken();
              const payload = {
                companyId: resolvedCompanyId,
                safra: currentSafra || "2026/2027",
                userId: user?.uid || "system",
                currentBatch: chunkIndex + 1,
                totalBatches: totalChunks,
                dados: chunk.map(item => ({
                  talhaoId: item.uniqueTalhaoId,
                  ...item.payload
                }))
              };

              const response = await fetch(`${apiUrl}/api/estimativa/import-chunk`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify(payload)
              });

              const responseText = await response.text();
              let result = {};
              try {
                result = responseText ? JSON.parse(responseText) : {};
              } catch (parseError) {
                const preview = responseText?.slice(0, 120)?.replace(/\s+/g, " ") || "sem conteúdo";
                throw new Error(`Resposta inválida no lote ${chunkIndex + 1} (HTTP ${response.status}). Trecho: ${preview}`);
              }

              if (!response.ok || !result.success) {
                throw new Error(result.message || `Falha no lote ${chunkIndex + 1} (HTTP ${response.status})`);
              }

              return result.quantidade || chunk.length;
            };

            const updateProgress = (processedCount) => {
              const percent = Math.min(100, Math.round((processedCount / linesToSave.length) * 100));
              setEstProgress({
                current: processedCount,
                total: linesToSave.length,
                percent
              });
            };

            const executeChunkWithRetry = async (chunk, chunkIndex) => {
              let retries = 3;
              let lastError = null;

              while (retries > 0) {
                try {
                  console.log(`[Estimativa Import] Enviando lote ${chunkIndex + 1}/${totalChunks} com ${chunk.length} registros...`);
                  const quantidade = await uploadChunk(chunk, chunkIndex);
                  console.log(`[Estimativa Import] Lote ${chunkIndex + 1}/${totalChunks} concluído (${quantidade} registros).`);
                  return quantidade;
                } catch (error) {
                  lastError = error;
                  retries -= 1;
                  if (retries > 0) {
                    console.warn(`[Estimativa Import] Lote ${chunkIndex + 1} falhou (${error.message}). Nova tentativa em 3s. Restam ${retries} tentativas.`);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                  }
                }
              }

              throw lastError || new Error(`Falha ao enviar lote ${chunkIndex + 1}`);
            };

            const queue = chunks.map((chunk, chunkIndex) => ({ chunk, chunkIndex }));
            const workers = Array.from({ length: Math.min(MAX_PARALLEL, queue.length) }, async () => {
              while (queue.length > 0) {
                const next = queue.shift();
                if (!next) return;
                try {
                  const quantidade = await executeChunkWithRetry(next.chunk, next.chunkIndex);
                  savedCount += quantidade;
                  updateProgress(savedCount);
                } catch (error) {
                  failedChunks.push({ chunkIndex: next.chunkIndex + 1, message: error.message });
                }
              }
            });

            await Promise.all(workers);

            if (failedChunks.length > 0) {
              throw new Error(`Falha em ${failedChunks.length} lote(s): ${failedChunks.map(item => `#${item.chunkIndex}`).join(", ")}.`);
            }

            if (refetchEstimates) await refetchEstimates();
          }

          // Gerar relatório se houver falhas
          if (missingLines.length > 0) {
            const ws = XLSX.utils.json_to_sheet(missingLines);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Falhas na Importação");
            const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
            const dataBlob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8" });
            saveAs(dataBlob, "relatorio_falha_importacao.xlsx");

            setEstErrorMessage(`Importação finalizada. ${savedCount} talhões importados. ${missingLines.length} talhões falharam e o relatório foi baixado.`);
            setEstStatus("error"); // Usamos error pra mostrar a msg de aviso
          } else {
            setEstStatus("success");
            setEstErrorMessage(`${savedCount} talhões importados com sucesso! Nenhuma falha encontrada.`);
          }

        } catch (err) {
          setEstStatus("error");
          setEstErrorMessage("Erro ao ler o arquivo: " + err.message);
        }
      };

      reader.onerror = () => {
        setEstStatus("error");
        setEstErrorMessage("Erro ao processar a leitura do arquivo.");
      };

      reader.readAsArrayBuffer(estFile);
    } catch (err) {
      setEstStatus("error");
      setEstErrorMessage(err.message || "Erro desconhecido ao processar planilha.");
    }
  };

  const handleMigrateDates = async () => {
    setMigrationStatus("processing");
    try {
      const token = await getValidAccessToken();
      const configuredApiUrl =
        import.meta.env.VITE_API_BASE_URL ||
        import.meta.env.VITE_API_URL ||
        '';
      const isLocalHost = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
      const apiUrl = configuredApiUrl || (isLocalHost ? '' : 'https://agro-system-hrbb.onrender.com');

      // Garante que usa o mesmo companyId real com o qual os cadastros (Producao/Apontamento) foram salvos
      const realCompanyId = resolvedCompanyId;

      const res = await fetch(`${apiUrl}/api/cadastros/apontamentos-insumo/migrar-datas`, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ companyId: realCompanyId })
      });
      const responseText = await res.text();
      let data = {};
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch (parseError) {
        if (!res.ok) {
          const preview = responseText?.slice(0, 120)?.replace(/\s+/g, ' ') || 'sem conteúdo';
          throw new Error(`Resposta inválida do servidor (HTTP ${res.status}). Trecho: ${preview}`);
        }
        throw parseError;
      }
      if (res.ok && data.success) {
          setMigrationStatus("success");
          alert(data.message);
      } else {
          setMigrationStatus("error");
          alert("Erro: " + data.message);
      }
    } catch (err) {
      setMigrationStatus("error");
      alert("Falha na migração: " + err.message);
    } finally {
      setTimeout(() => setMigrationStatus("idle"), 5000);
    }
  };

  const handleFixOrdemCorteFazenda = async () => {
    if (!resolvedCompanyId) {
      showError("Empresa não identificada para executar a correção.");
      return;
    }

    const confirm = window.confirm(
      `Deseja rodar agora a correção de fazenda das solicitações antigas de Ordem de Corte para a empresa ${resolvedCompanyId}?`
    );
    if (!confirm) return;

    setFixOcFazendaStatus("processing");
    try {
      const response = await apiRequest(`/api/admin/companies/${encodeURIComponent(resolvedCompanyId)}/actions/fix-ordem-corte-fazenda`, {
        method: "POST",
        body: JSON.stringify({
          dryRun: false,
          safra: currentSafra || ""
        })
      });

      const resumo = response?.data || {};
      setFixOcFazendaStatus("success");
      showSuccess(
        "Correção executada",
        `Atualizados: ${resumo.totalAtualizado || 0} | Elegíveis: ${resumo.totalElegiveisAtualizacao || 0} | Restantes sem fazenda: ${resumo.restanteSemFazenda || 0}`
      );
    } catch (error) {
      setFixOcFazendaStatus("error");
      showError("Falha ao executar correção de fazenda", error.message || "Não foi possível processar a solicitação.");
    } finally {
      setTimeout(() => setFixOcFazendaStatus("idle"), 5000);
    }
  };

  const removeFile = (indexToRemove) => {
    setFiles(files.filter((_, idx) => idx !== indexToRemove));
  };

  const handleVerifyShp = async () => {
    if (!geoJsonData || !geoJsonData.features || geoJsonData.features.length === 0) {
      showError("Nenhum mapa (SHP) ativo encontrado para comparar. Faça o upload primeiro.");
      return;
    }

    setVerifyShpStatus("processing");
    try {
      // 1. Fetch all talhoes from IndexedDB for the current company
      const dbTalhoes = await db.talhoes.where('companyId').equals(resolvedCompanyId).toArray();

      const divergencias = [];
      const shpProcessedIds = new Set();

      // Helper to generate a consistent ID for comparison (Stripping zeros to match!)
      const getShpId = (p) => {
        let cod = p.COD ? String(p.COD).trim() : p.FUNDO_AGR ? String(p.FUNDO_AGR).trim() : '';
        cod = cod.replace(/^0+/, ''); // Strip zeros
        let talhao = p.TALHAO ? String(p.TALHAO).trim() : '';
        talhao = talhao.replace(/^0+/, ''); // Strip zeros
        return `${cod}_${talhao}`.toUpperCase();
      };

      const getDbId = (t) => {
        let cod = t.codFaz ? String(t.codFaz).trim() : '';
        cod = cod.replace(/^0+/, ''); // Strip zeros
        let talhao = t.TALHAO ? String(t.TALHAO).trim() : '';
        talhao = talhao.replace(/^0+/, ''); // Strip zeros
        return `${cod}_${talhao}`.toUpperCase();
      };

      // 2. Map DB Talhoes for quick lookup
      const dbTalhoesMap = new Map();
      dbTalhoes.forEach(t => {
        dbTalhoesMap.set(getDbId(t), t);
      });

      // 3. Compare SHP against DB
      geoJsonData.features.forEach(feature => {
        const p = feature.properties || {};
        const shpId = getShpId(p);
        const shpArea = parseBrazilianFloat(p.AREA);
        const shpCod = p.COD ? String(p.COD).trim() : p.FUNDO_AGR ? String(p.FUNDO_AGR).trim() : '';
        const shpTalhao = p.TALHAO ? String(p.TALHAO).trim() : '';

        shpProcessedIds.add(shpId);

        const dbTalhao = dbTalhoesMap.get(shpId);

        if (!dbTalhao) {
          divergencias.push({
            'Tipo Divergência': 'Existe no SHP, mas NÃO existe no Banco',
            'Cód. Fazenda': shpCod,
            'Talhão': shpTalhao,
            'Área SHP (ha)': shpArea,
            'Área Banco (ha)': '-',
            'Diferença Área': '-'
          });
        } else {
          const dbArea = parseBrazilianFloat(dbTalhao.AREA);
          const diff = Math.abs(shpArea - dbArea);
          // Consider a difference of more than 0.01 ha as a divergence
          if (diff > 0.01) {
            divergencias.push({
              'Tipo Divergência': 'Diferença de Área',
              'Cód. Fazenda': shpCod,
              'Talhão': shpTalhao,
              'Área SHP (ha)': shpArea,
              'Área Banco (ha)': dbArea,
              'Diferença Área': diff.toFixed(4)
            });
          }
        }
      });

      // 4. Check DB against SHP (Find missing in SHP)
      dbTalhoes.forEach(dbTalhao => {
        const dbId = getDbId(dbTalhao);
        if (!shpProcessedIds.has(dbId)) {
          divergencias.push({
            'Tipo Divergência': 'Existe no Banco, mas NÃO existe no SHP',
            'Cód. Fazenda': dbTalhao.codFaz,
            'Talhão': dbTalhao.TALHAO,
            'Área SHP (ha)': '-',
            'Área Banco (ha)': parseBrazilianFloat(dbTalhao.AREA),
            'Diferença Área': '-'
          });
        }
      });

      if (divergencias.length === 0) {
        showSuccess("Nenhuma divergência encontrada! O SHP e o Banco estão sincronizados.");
        setVerifyShpStatus("idle");
        return;
      }

      // 5. Generate Excel
      const worksheet = XLSX.utils.json_to_sheet(divergencias);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Divergências SHP vs BD");

      // Auto-size columns
      const wscols = [
        { wch: 45 }, // Tipo Divergência
        { wch: 15 }, // Cód. Fazenda
        { wch: 10 }, // Talhão
        { wch: 15 }, // Área SHP
        { wch: 15 }, // Área Banco
        { wch: 15 }  // Diferença
      ];
      worksheet['!cols'] = wscols;

      try {
        const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
        // Usar array ao invés de blob puro para compatibilidade melhor com algumas versões do file-saver
        const data = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8" });
        const dateStr = new Date().toISOString().split('T')[0];
        saveAs(data, `Relatorio_Divergencias_SHP_${dateStr}.xlsx`);
      } catch (writeErr) {
         console.error("Erro ao escrever XLSX:", writeErr);
         throw new Error("Falha ao gerar o arquivo Excel.");
      }

      showSuccess(`${divergencias.length} divergências encontradas. O download do relatório foi iniciado.`);

    } catch (error) {
      console.error("Erro ao verificar SHP:", error);
      showError("Ocorreu um erro ao verificar as inconsistências. Tente novamente.");
    } finally {
      setVerifyShpStatus("idle");
    }
  };

  return (
    <div className="h-full overflow-auto p-3 sm:p-4 xl:p-6 text-white">
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-3xl font-semibold flex items-center gap-3">
          <Map className="w-8 h-8" style={{ color: palette.gold }} />
          Configuração da Empresa
        </h1>
        <p className="mt-2 text-sm" style={{ color: palette.text2 }}>
          Gerencie as áreas da sua fazenda importando arquivos Shapefile (SHP).
          Eles serão processados e utilizados nos módulos de Estimativa de Safra.
        </p>
      </div>

      <div
        className="rounded-[28px] border overflow-hidden shadow-2xl backdrop-blur-md relative mb-8"
        style={{
          background: "linear-gradient(180deg, rgba(22,24,28,0.78), rgba(18,20,24,0.66))",
          borderColor: "rgba(230,199,107,0.18)",
        }}
      >
        <div className="p-4 sm:p-6 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <h2 className="text-lg sm:text-xl font-medium">Manutenção do Banco de Dados</h2>
          <p className="text-sm mt-1" style={{ color: palette.text2 }}>
            Ferramentas para correção ou migração de dados antigos.
          </p>
        </div>
        <div className="p-4 sm:p-6 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-[20px] transition-colors duration-200" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.05)" }}>
                 <DatabaseZap className="w-6 h-6" style={{ color: palette.gold }} />
               </div>
               <div>
                 <h3 className="font-medium text-[15px]">Migração de Datas (Produção e Apontamento)</h3>
                 <p className="text-xs" style={{ color: palette.text2 }}>Converte as datas de registros antigos para o novo formato pesquisável (ISO). Rode apenas uma vez.</p>
               </div>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
               <button
                  onClick={handleMigrateDates}
                  disabled={migrationStatus === "processing"}
                  className="ml-auto sm:ml-4 px-4 py-2 rounded-xl text-sm font-medium transition-transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-2"
                  style={{
                    background: `linear-gradient(135deg, ${palette.gold} 0%, ${palette.goldLight} 100%)`,
                    color: palette.bg
                  }}
               >
                 {migrationStatus === "processing" ? <><Loader2 className="w-4 h-4 animate-spin"/> Processando...</> : migrationStatus === "success" ? "Migração Concluída!" : "Rodar Migração"}
               </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-[20px] transition-colors duration-200" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.05)" }}>
                 <DatabaseZap className="w-6 h-6" style={{ color: palette.gold }} />
               </div>
               <div>
                 <h3 className="font-medium text-[15px]">Correção Fazenda (OC) — Temporário</h3>
                 <p className="text-xs" style={{ color: palette.text2 }}>Executa o script de correção em lote no backend para preencher fazenda em solicitações antigas de Ordem de Corte.</p>
               </div>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
               <button
                  onClick={handleFixOrdemCorteFazenda}
                  disabled={fixOcFazendaStatus === "processing"}
                  className="ml-auto sm:ml-4 px-4 py-2 rounded-xl text-sm font-medium transition-transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-2"
                  style={{
                    background: `linear-gradient(135deg, ${palette.gold} 0%, ${palette.goldLight} 100%)`,
                    color: palette.bg
                  }}
               >
                 {fixOcFazendaStatus === "processing"
                   ? <><Loader2 className="w-4 h-4 animate-spin"/> Processando...</>
                   : fixOcFazendaStatus === "success"
                   ? "Correção Concluída!"
                   : "Rodar Correção Fazenda OC"}
               </button>
            </div>
          </div>
        </div>
      </div>

      <div
        className="rounded-[28px] border overflow-hidden shadow-2xl backdrop-blur-md relative mb-8"
        style={{
          background: "linear-gradient(180deg, rgba(22,24,28,0.78), rgba(18,20,24,0.66))",
          borderColor: "rgba(230,199,107,0.18)",
        }}
      >
        <div className="p-4 sm:p-6 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <h2 className="text-lg sm:text-xl font-medium">Personalização Visual</h2>
          <p className="text-sm mt-1" style={{ color: palette.text2 }}>
            Ajuste a cor principal da identidade visual da empresa no sistema.
          </p>
        </div>

        <div className="p-4 sm:p-6 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-[20px] transition-colors duration-200" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.05)" }}>
                 <Palette className="w-6 h-6" style={{ color: localColor }} />
               </div>
               <div>
                 <h3 className="font-medium text-[15px]">Cor do Ícone Principal</h3>
                 <p className="text-xs" style={{ color: palette.text2 }}>Altera a cor do logo em todas as telas</p>
               </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
               <input
                 type="color"
                 value={localColor}
                 onChange={(e) => setLocalColor(e.target.value)}
                 className="w-10 h-10 p-1 rounded-lg cursor-pointer bg-transparent border-none"
                 title="Escolha uma cor"
               />
               <span className="text-sm font-mono" style={{ color: palette.text2 }}>{localColor.toUpperCase()}</span>

               <button
                  onClick={handleSaveColor}
                  disabled={colorStatus === "processing"}
                  className="ml-auto sm:ml-4 px-4 py-2 rounded-xl text-sm font-medium transition-transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-2"
                  style={{
                    background: `linear-gradient(135deg, ${palette.gold} 0%, ${palette.goldLight} 100%)`,
                    color: palette.bg
                  }}
               >
                 {colorStatus === "processing" ? "Salvando..." : colorStatus === "success" ? "Salvo!" : "Salvar Cor"}
               </button>
            </div>
          </div>
        </div>
      </div>

      <div
        className="rounded-[28px] border overflow-hidden shadow-2xl backdrop-blur-md relative"
        style={{
          background: "linear-gradient(180deg, rgba(22,24,28,0.78), rgba(18,20,24,0.66))",
          borderColor: "rgba(230,199,107,0.18)",
        }}
      >
        <div className="p-4 sm:p-6 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <h2 className="text-lg sm:text-xl font-medium">Importação de Contornos (Shapefile)</h2>
          <p className="text-sm mt-1" style={{ color: palette.text2 }}>
            Faça upload do arquivo .ZIP contendo o shapefile ou selecione os arquivos soltos (.shp, .shx, .dbf, .prj, etc).
          </p>
        </div>

        <div className="p-4 sm:p-6 space-y-6">
          <div
            className="border-2 border-dashed rounded-[20px] p-6 sm:p-8 text-center transition-colors duration-200"
            style={{
              borderColor: "rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.02)",
            }}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <UploadCloud className="w-12 h-12 mx-auto mb-4" style={{ color: palette.goldLight }} />
            <h3 className="text-lg font-medium mb-2">Arraste seu arquivo .ZIP ou arquivos soltos aqui</h3>
            <p className="text-sm mb-4" style={{ color: palette.text2 }}>
              ou clique para procurar no seu computador
            </p>
            <input
              type="file"
              multiple
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".zip,.shp,.shx,.dbf,.prj,.cpg,.qmd"
            />
            <button
              onClick={() => fileInputRef.current.click()}
              className="px-6 py-2.5 rounded-xl text-sm font-medium transition-transform hover:scale-105"
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              Procurar arquivos
            </button>
          </div>

          {files.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium" style={{ color: palette.text2 }}>Arquivos selecionados ({files.length})</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {files.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-xl border"
                    style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)" }}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <File className="w-5 h-5 shrink-0" style={{ color: palette.text2 }} />
                      <span className="text-sm truncate">{file.name}</span>
                    </div>
                    {status !== "processing" && status !== "success" && (
                      <button
                        onClick={() => removeFile(idx)}
                        className="text-xs hover:text-red-400 p-1 rounded-md"
                        style={{ color: palette.text2 }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {status === "error" && (
                <div className="flex items-start gap-3 p-4 rounded-xl mt-4" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-red-400">Erro na importação</div>
                    <div className="text-xs text-red-300 mt-1">{errorMessage}</div>
                  </div>
                </div>
              )}

              {status === "success" && (
                <div className="flex items-start gap-3 p-4 rounded-xl mt-4" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)" }}>
                  <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-green-400">Shapefile importado com sucesso!</div>
                    <div className="text-xs text-green-300 mt-1">Os contornos foram processados e já estão prontos para o mapa de estimativa.</div>
                  </div>
                </div>
              )}

              <div className="pt-4 flex justify-end">
                <button
                  onClick={handleUpload}
                  disabled={status === "processing" || status === "success"}
                  className="px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
                  style={{
                    background: `linear-gradient(135deg, ${palette.gold} 0%, ${palette.goldLight} 100%)`,
                    color: palette.bg
                  }}
                >
                  {status === "processing" ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Processando...
                    </>
                  ) : status === "success" ? (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      Concluído
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-5 h-5" />
                      Iniciar Processamento
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reversão administrativa de reestimativa */}
      {isSuperAdminUser && (
        <div
          className="rounded-[28px] border overflow-hidden shadow-2xl backdrop-blur-md relative mt-8"
          style={{
            background: "linear-gradient(180deg, rgba(32,18,18,0.82), rgba(18,20,24,0.68))",
            borderColor: "rgba(248,113,113,0.32)",
          }}
        >
          <div className="p-4 sm:p-6 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-1 h-6 w-6 text-red-300" />
              <div>
                <h2 className="text-lg sm:text-xl font-medium">Reversão de Reestimativa</h2>
                <p className="text-sm mt-1" style={{ color: palette.text2 }}>
                  Ferramenta de emergência para Super Admin. Primeiro simule, confira os registros e só depois execute. A estimativa original não é removida.
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: palette.text2 }}>Empresa / código</label>
                <input
                  value={rollbackForm.companyId}
                  onChange={(e) => updateRollbackForm('companyId', e.target.value)}
                  placeholder="002"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-red-300/50"
                />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: palette.text2 }}>Safra</label>
                <input
                  value={rollbackForm.harvestYear}
                  onChange={(e) => updateRollbackForm('harvestYear', e.target.value)}
                  placeholder="2026/2027"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-red-300/50"
                />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: palette.text2 }}>De</label>
                <input
                  type="datetime-local"
                  value={rollbackForm.from}
                  onChange={(e) => updateRollbackForm('from', e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-red-300/50"
                />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: palette.text2 }}>Até opcional</label>
                <input
                  type="datetime-local"
                  value={rollbackForm.to}
                  onChange={(e) => updateRollbackForm('to', e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-red-300/50"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
              <div>
                <label className="block text-xs mb-1" style={{ color: palette.text2 }}>Rodada específica opcional</label>
                <input
                  value={rollbackForm.round}
                  onChange={(e) => updateRollbackForm('round', e.target.value)}
                  placeholder="Ex: Reestimativa 1. Vazio = todas que começam com Reestimativa"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-red-300/50"
                />
              </div>
              <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white/80">
                <input
                  type="checkbox"
                  checked={rollbackForm.includeAllRounds}
                  onChange={(e) => updateRollbackForm('includeAllRounds', e.target.checked)}
                />
                Incluir qualquer rodada diferente de Estimativa
              </label>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <p className="text-xs leading-5 text-red-200/85">
                Segurança: por padrão remove apenas rodadas iniciando com “Reestimativa”. O backend exige Super Admin e gera backup em <strong>backend/backups</strong>.
              </p>
              <button
                onClick={handlePreviewRollback}
                disabled={rollbackStatus === "previewing" || rollbackStatus === "applying"}
                className="px-5 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 bg-white/10 border border-white/15"
              >
                {rollbackStatus === "previewing" ? <Loader2 className="w-5 h-5 animate-spin" /> : <RotateCcw className="w-5 h-5" />}
                Simular reversão
              </button>
            </div>

            {rollbackResult && (
              <div className="rounded-2xl border border-white/10 bg-black/25 p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div className="rounded-xl bg-white/5 p-3">
                    <div className="text-xs text-white/50">Encontrados</div>
                    <div className="text-xl font-semibold text-white">{rollbackResult.total ?? rollbackResult.deleted?.estimates ?? 0}</div>
                  </div>
                  <div className="rounded-xl bg-white/5 p-3">
                    <div className="text-xs text-white/50">Toneladas envolvidas</div>
                    <div className="text-xl font-semibold text-white">{Number(rollbackResult.totalTon || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</div>
                  </div>
                  <div className="rounded-xl bg-white/5 p-3">
                    <div className="text-xs text-white/50">Backup</div>
                    <div className="text-xs font-medium text-amber-200 break-all">{rollbackResult.backupFile || '-'}</div>
                  </div>
                </div>

                {Array.isArray(rollbackResult.items) && rollbackResult.items.length > 0 && (
                  <div className="max-h-64 overflow-auto rounded-xl border border-white/10">
                    <table className="min-w-full text-xs">
                      <thead className="bg-white/10 text-white/70 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left">Rodada</th>
                          <th className="px-3 py-2 text-left">Fazenda</th>
                          <th className="px-3 py-2 text-left">Talhão</th>
                          <th className="px-3 py-2 text-right">TCH</th>
                          <th className="px-3 py-2 text-right">Ton.</th>
                          <th className="px-3 py-2 text-left">Atualizado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rollbackResult.items.slice(0, 50).map((item) => (
                          <tr key={item.id} className="border-t border-white/10">
                            <td className="px-3 py-2">{item.round || '-'}</td>
                            <td className="px-3 py-2">{item.farm?.code || item.rawData?.fundo_agricola || item.rawData?.fazenda || '-'}</td>
                            <td className="px-3 py-2">{item.field?.code || item.rawData?.talhaoId || item.rawData?.talhao || '-'}</td>
                            <td className="px-3 py-2 text-right">{Number(item.estimatedTch || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
                            <td className="px-3 py-2 text-right">{Number(item.estimatedTon || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
                            <td className="px-3 py-2">{item.updatedAt ? new Date(item.updatedAt).toLocaleString('pt-BR') : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 items-end">
                  <div>
                    <label className="block text-xs mb-1 text-red-200">Para executar, digite REVERTER</label>
                    <input
                      value={rollbackForm.confirmText}
                      onChange={(e) => updateRollbackForm('confirmText', e.target.value)}
                      placeholder="REVERTER"
                      className="w-full rounded-xl border border-red-300/20 bg-red-950/20 px-3 py-2.5 text-sm outline-none focus:border-red-300/70"
                    />
                  </div>
                  <button
                    onClick={handleApplyRollback}
                    disabled={rollbackStatus === "applying" || (rollbackResult.total || 0) === 0}
                    className="px-5 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 bg-red-500/80 hover:bg-red-500 text-white"
                  >
                    {rollbackStatus === "applying" ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldAlert className="w-5 h-5" />}
                    Executar reversão
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Verificação SHP vs Banco */}
      <div
        className="rounded-[28px] border overflow-hidden shadow-2xl backdrop-blur-md relative mt-8"
        style={{
          background: "linear-gradient(180deg, rgba(22,24,28,0.78), rgba(18,20,24,0.66))",
          borderColor: "rgba(230,199,107,0.18)",
        }}
      >
        <div className="p-4 sm:p-6 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <h2 className="text-lg sm:text-xl font-medium">Verificar Inconsistências SHP vs Banco</h2>
          <p className="text-sm mt-1" style={{ color: palette.text2 }}>
            Cruza os talhões do mapa atual (SHP) com o Cadastro de Fazendas/Talhões no banco de dados para encontrar diferenças de área ou talhões faltantes.
          </p>
        </div>

        <div className="p-4 sm:p-6 flex justify-end">
          <button
            onClick={handleVerifyShp}
            disabled={verifyShpStatus === "processing"}
            className="px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
            style={{
              background: `linear-gradient(135deg, ${palette.gold} 0%, ${palette.goldLight} 100%)`,
              color: palette.bg
            }}
          >
            {verifyShpStatus === "processing" ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <DatabaseZap className="w-5 h-5" />
                Verificar e Gerar Relatório
              </>
            )}
          </button>
        </div>
      </div>

      <div
        className="rounded-[28px] border overflow-hidden shadow-2xl backdrop-blur-md relative mt-8"
        style={{
          background: "linear-gradient(180deg, rgba(22,24,28,0.78), rgba(18,20,24,0.66))",
          borderColor: "rgba(230,199,107,0.18)",
        }}
      >
        <div className="p-4 sm:p-6 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <h2 className="text-lg sm:text-xl font-medium">Importação de Estimativa Inicial (Planilha)</h2>
          <p className="text-sm mt-1" style={{ color: palette.text2 }}>
            Faça upload de uma planilha (.XLSX ou .CSV) contendo as colunas de FUNDO, TALHÃO e TCH. O sistema vai cruzar a área com o mapa atual e salvar como primeira estimativa.
          </p>
        </div>

        <div className="p-4 sm:p-6 space-y-6">
          <div
            className="border-2 border-dashed rounded-[20px] p-6 sm:p-8 text-center transition-colors duration-200"
            style={{
              borderColor: "rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <FileSpreadsheet className="w-12 h-12 mx-auto mb-4" style={{ color: palette.goldLight }} />
            <h3 className="text-lg font-medium mb-2">Selecione seu arquivo .XLSX ou .CSV</h3>
            <p className="text-sm mb-4" style={{ color: palette.text2 }}>
              A planilha deve conter colunas chamadas FUNDO, TALHÃO e TCH
            </p>
            <input
              type="file"
              className="hidden"
              ref={fileInputRefEst}
              onChange={handleEstFileChange}
              accept=".xlsx,.xls,.csv"
            />
            <button
              onClick={() => fileInputRefEst.current.click()}
              className="px-6 py-2.5 rounded-xl text-sm font-medium transition-transform hover:scale-105"
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              Procurar planilha
            </button>
          </div>

          {estFile && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium" style={{ color: palette.text2 }}>Arquivo selecionado</h4>
              <div className="grid grid-cols-1 gap-3">
                  <div
                    className="flex items-center justify-between p-3 rounded-xl border"
                    style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)" }}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <File className="w-5 h-5 shrink-0" style={{ color: palette.text2 }} />
                      <span className="text-sm truncate">{estFile.name}</span>
                    </div>
                    {estStatus !== "processing" && (
                      <button
                        onClick={removeEstFile}
                        className="text-xs hover:text-red-400 p-1 rounded-md"
                        style={{ color: palette.text2 }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
              </div>

              {estStatus === "error" && (
                <div className="flex items-start gap-3 p-4 rounded-xl mt-4" style={{ background: estErrorMessage.includes("falharam") ? "rgba(234,179,8,0.1)" : "rgba(239,68,68,0.1)", border: estErrorMessage.includes("falharam") ? "1px solid rgba(234,179,8,0.3)" : "1px solid rgba(239,68,68,0.3)" }}>
                  <AlertCircle className={`w-5 h-5 ${estErrorMessage.includes("falharam") ? 'text-yellow-400' : 'text-red-400'} shrink-0`} />
                  <div>
                    <div className={`text-sm font-medium ${estErrorMessage.includes("falharam") ? 'text-yellow-400' : 'text-red-400'}`}>Aviso / Erro na Importação</div>
                    <div className={`text-xs ${estErrorMessage.includes("falharam") ? 'text-yellow-300' : 'text-red-300'} mt-1`}>{estErrorMessage}</div>
                  </div>
                </div>
              )}

              {estStatus === "success" && (
                <div className="flex items-start gap-3 p-4 rounded-xl mt-4" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)" }}>
                  <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-green-400">Sucesso!</div>
                    <div className="text-xs text-green-300 mt-1">{estErrorMessage}</div>
                  </div>
                </div>
              )}

              {estStatus === "processing" && estProgress.total > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs mb-2" style={{ color: palette.text2 }}>
                    <span>Enviando lotes...</span>
                    <span>{estProgress.percent}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.12)" }}>
                    <div
                      className="h-full transition-all duration-300"
                      style={{
                        width: `${estProgress.percent}%`,
                        background: `linear-gradient(135deg, ${palette.gold} 0%, ${palette.goldLight} 100%)`
                      }}
                    />
                  </div>
                </div>
              )}

              <div className="pt-4 flex justify-end">
                <button
                  onClick={handleEstUpload}
                  disabled={estStatus === "processing"}
                  className="px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
                  style={{
                    background: `linear-gradient(135deg, ${palette.gold} 0%, ${palette.goldLight} 100%)`,
                    color: palette.bg
                  }}
                >
                  {estStatus === "processing" ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {estProgress.total > 0
                        ? `Salvando (${estProgress.current}/${estProgress.total}) - ${estProgress.percent}%`
                        : "Processando..."}
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-5 h-5" />
                      Importar Planilha
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      </div>
    </div>
  );
}
