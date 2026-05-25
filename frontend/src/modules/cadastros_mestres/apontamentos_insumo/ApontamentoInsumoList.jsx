import { getActiveCompanyId } from '../../../services/companyContext.js';
import React, { useState, useEffect } from 'react';
import { palette } from '../../../constants/theme.js';
import { ClipboardList, Trash2, Download, Upload, Search, FileSpreadsheet, Loader2 } from 'lucide-react';
import { inactivateApontamentoInsumo, getApontamentosPaginados } from '../../../services/cadastros_mestres/apontamentoInsumoService.js';
import { useAuth } from '../../../hooks/useAuth.js';
import { getValidAccessToken } from '../../../services/postgresAuthService.js';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import Swal from 'sweetalert2';

const configuredApiUrl =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  '';

const isLocalHost = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
const apiUrl = configuredApiUrl || (isLocalHost ? '' : 'https://agro-system-hrbb.onrender.com');

/**
 * @file ApontamentoInsumoList.jsx
 * @description Listagem e importação do Cadastro Mestre de Apontamento de Insumos.
 * @module ApontamentoInsumoList
 */

export default function ApontamentoInsumoList() {
  const { user } = useAuth();
  const companyId = getActiveCompanyId();

  const [apontamentos, setApontamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Filtros de Data
  const [dtInicial, setDtInicial] = useState('');
  const [dtFinal, setDtFinal] = useState('');

  // Paginação Direta do PostgreSQL
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const itemsPerPage = 50;

  const loadData = async (reset = false) => {
    setLoading(true);
    try {
        const currentLastVisible = reset ? null : lastVisible;
        const dtInicialIso = dtInicial ? dtInicial : '';
        const dtFinalIso = dtFinal ? dtFinal : '';

        const result = await getApontamentosPaginados(companyId, itemsPerPage, currentLastVisible, searchTerm, dtInicialIso, dtFinalIso);

        if (reset) {
            setApontamentos(result.data);
        } else {
            setApontamentos(prev => [...prev, ...result.data]);
        }

        setLastVisible(result.lastVisible);
        setHasMore(result.hasMore);
    } catch (err) {
        console.error("Erro ao carregar apontamentos:", err);
        Swal.fire({ title: 'Erro', text: 'Não foi possível carregar os dados.', icon: 'error', background: '#121212', color: '#fff' });
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
      loadData(true);
  }, [companyId]);

  const handleSearch = () => {
      loadData(true);
  };

  const handleInactivate = async (id) => {
    const result = await Swal.fire({
      title: 'Desativar apontamento?',
      text: "Isso inativará este registro de apontamento de insumo.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: palette.danger,
      cancelButtonColor: '#333',
      confirmButtonText: 'Sim, inativar',
      cancelButtonText: 'Cancelar',
      background: '#1a1a1a',
      color: '#fff'
    });

    if (result.isConfirmed) {
      try {
        await inactivateApontamentoInsumo(id, user?.uid || 'user_demo', companyId);
        Swal.fire({
          title: 'Inativado!',
          text: 'O apontamento foi inativado.',
          icon: 'success',
          background: '#1a1a1a',
          color: '#fff',
          confirmButtonColor: palette.gold
        });
        loadData(true);
      } catch (error) {
        Swal.fire({
          title: 'Erro!',
          text: 'Não foi possível inativar o apontamento.',
          icon: 'error',
          background: '#1a1a1a',
          color: '#fff',
          confirmButtonColor: palette.danger
        });
      }
    }
  };

  const processarPlanilha = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Reseta o input
    e.target.value = null;

    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        // Parse a planilha localmente em binário (mais eficiente que base64 e suporta grandes volumes com Type Array)
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const wsname = workbook.SheetNames[0];
        const ws = workbook.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { defval: "" });

        if (data.length === 0) {
            Swal.fire({
                title: 'Planilha Vazia',
                text: 'A planilha selecionada não contém dados.',
                icon: 'warning',
                background: '#121212',
                color: '#fff',
                confirmButtonColor: palette.gold
            });
            return;
        }

        const CHUNK_SIZE = 500;
        const totalChunks = Math.ceil(data.length / CHUNK_SIZE);

        Swal.fire({
            title: 'Importando Apontamentos',
            html: `
              <div style="color: #ccc; margin-bottom: 15px;">Aguarde, os dados estão sendo enviados em lotes para o servidor...</div>
              <div style="font-size: 14px; font-weight: bold; margin-bottom: 10px;" id="progress-text">Processando lote 0 de ${totalChunks}...</div>
              <div style="width: 100%; background-color: #333; border-radius: 4px; height: 10px; overflow: hidden;">
                  <div id="progress-bar" style="width: 0%; height: 100%; background-color: ${palette.primary}; transition: width 0.1s linear;"></div>
              </div>
            `,
            allowOutsideClick: false,
            allowEscapeKey: false,
            showConfirmButton: false,
            background: '#121212',
            color: '#fff',
            didOpen: async () => {
                const updateProgress = (processed, total) => {
                    const pct = Math.round((processed / total) * 100);
                    const progressBar = document.getElementById('progress-bar');
                    const progressText = document.getElementById('progress-text');
                    if (progressBar && progressText) {
                        progressBar.style.width = `${pct}%`;
                        progressText.innerText = `Processando lote ${processed} de ${total}...`;
                    }
                };


                try {
                    for (let i = 0; i < totalChunks; i++) {
                        const chunk = data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
                        let retries = 3;
                        let success = false;
                        let lastError = null;

                        while (retries > 0 && !success) {
                            try {
                                // Atualizamos o token a cada requisição (ou retry) para evitar expiração em uploads muito longos
                                const token = await getValidAccessToken();

                                const response = await fetch(`${apiUrl}/api/cadastros/apontamentos-insumo/import-chunk`, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                                    },
                                    body: JSON.stringify({
                                        companyId,
                                        userId: user?.uid || 'user_demo',
                                        chunk,
                                        currentBatch: i + 1,
                                        totalBatches: totalChunks
                                    })
                                });

                                const responseText = await response.text();
                                let result = {};

                                try {
                                    result = responseText ? JSON.parse(responseText) : {};
                                } catch (parseError) {
                                    if (!response.ok) {
                                        const preview = responseText?.slice(0, 120)?.replace(/\s+/g, ' ') || 'sem conteúdo';
                                        throw new Error(`Servidor retornou resposta inválida no lote ${i + 1} (HTTP ${response.status}). Trecho: ${preview}`);
                                    }
                                    throw parseError;
                                }

                                if (!response.ok || !result.success) {
                                    throw new Error(result.message || `Erro no lote ${i + 1} (HTTP ${response.status})`);
                                }

                                success = true; // Deu certo, sai do loop de retry

                            } catch (error) {
                                lastError = error;
                                retries--;
                                if (retries > 0) {
                                    console.warn(`Lote ${i + 1} falhou (${error.message}). Tentando novamente em 3 segundos... Restam ${retries} tentativas.`);
                                    await new Promise(resolve => setTimeout(resolve, 3000)); // Espera 3s antes de tentar de novo
                                }
                            }
                        }

                        if (!success) {
                            // Se esgotou as 3 tentativas e continuou falhando, aborta o for
                            throw lastError;
                        }

                        updateProgress(i + 1, totalChunks);
                    }

                    Swal.fire({
                        title: 'Sucesso!',
                        text: `${data.length} apontamentos importados com sucesso.`,
                        icon: 'success',
                        background: '#121212',
                        color: '#fff',
                        confirmButtonColor: palette.primary
                    });
                    loadData(true);

                } catch (err) {
                    console.error("Erro no envio dos lotes:", err);
                    Swal.fire({
                        title: 'Erro na Importação',
                        text: 'A importação foi interrompida. ' + (err.message || 'Ocorreu um erro de comunicação com o servidor.'),
                        icon: 'error',
                        background: '#121212',
                        color: '#fff',
                        confirmButtonColor: palette.danger
                    });
                }
            }
        });

      } catch (err) {
        console.error("Erro de leitura local:", err);
        Swal.fire({
            title: 'Erro ao ler arquivo',
            text: 'Não foi possível ler a planilha selecionada.',
            icon: 'error',
            background: '#121212',
            color: '#fff',
            confirmButtonColor: palette.danger
        });
      }
    };

    reader.readAsBinaryString(file);
  };

  const baixarTemplate = () => {
      // Cria a estrutura que reflete exatamente as colunas
      const ws = XLSX.utils.json_to_sheet([{
          CLUSTER: '', EMPRESA: '', MOD_ADM: '', INSTANCIA: '', DT_HISTORICO: '', CD_CCUSTO: '', DE_CCUSTO: '', CD_OP: '', DE_OPERACAO: '', UND_OPER: '', COD_FAZ: '', DES_FAZENDA: '', BLOCO: '', DES_BLOCO: '', TALHAO: '', ETAPA: '', COD_INSUMO: '', DESC_INSUMO: '', HA_APLIC: '', QTDE_APLIC: '', DOSE_APLIC: '', DOSE_REC: '', VLR_UNIT: '', TOTAL_RS: ''
      }]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Apontamentos");
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      saveAs(new Blob([wbout], { type: "application/octet-stream" }), "template_apontamento_insumo.xlsx");
  };

  const baixarDadosAtuais = () => {
      if (apontamentos.length === 0) {
          Swal.fire({
            title: 'Sem dados',
            text: 'Não há apontamentos para exportar.',
            icon: 'info',
            background: '#121212',
            color: '#fff',
            confirmButtonColor: palette.primary
        });
        return;
      }

      const ws = XLSX.utils.json_to_sheet(apontamentos.map(ap => ({
          CLUSTER: ap.cluster, EMPRESA: ap.empresa, MOD_ADM: ap.modAdm, INSTANCIA: ap.instancia, DT_HISTORICO: ap.dtHistorico, CD_CCUSTO: ap.cdCcusto, DE_CCUSTO: ap.deCcusto, CD_OP: ap.cdOp, DE_OPERACAO: ap.deOperacao, UND_OPER: ap.undOper, COD_FAZ: ap.codFaz, DES_FAZENDA: ap.desFazenda, BLOCO: ap.bloco, DES_BLOCO: ap.desBloco, TALHAO: ap.talhao, ETAPA: ap.etapa, COD_INSUMO: ap.codInsumo, DESC_INSUMO: ap.descInsumo, HA_APLIC: ap.haAplic, QTDE_APLIC: ap.qtdeAplic, DOSE_APLIC: ap.doseAplic, DOSE_REC: ap.doseRec, VLR_UNIT: ap.vlrUnit, TOTAL_RS: ap.totalRs
      })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Apontamentos");
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      saveAs(new Blob([wbout], { type: "application/octet-stream" }), "apontamentos_insumo_exportacao.xlsx");
  };


  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0A0A0A] border border-white/5 rounded-[24px] overflow-hidden">

      {/* HEADER DA TAB */}
      <div className="sticky top-0 z-20 shrink-0 border-b border-white/10 bg-[#0A0A0A] p-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <ClipboardList className="w-5 h-5 text-white/70" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Apontamentos de Insumo</h2>
              <p className="text-sm text-white/50">Gerencie a base de apontamentos</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type="text"
                placeholder="Buscar (Cod, Insumo, Fazenda, Op)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-white/20 transition-colors"
              />
            </div>

            <div className="flex items-center gap-2">
                <input
                    type="date"
                    value={dtInicial}
                    onChange={e => setDtInicial(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-gold"
                    title="Data Inicial (Histórico)"
                />
                <span className="text-white/30">até</span>
                <input
                    type="date"
                    value={dtFinal}
                    onChange={e => setDtFinal(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-gold"
                    title="Data Final (Histórico)"
                />
                <button
                    onClick={handleSearch}
                    className="px-3 py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-sm font-medium transition-colors"
                >
                    Buscar
                </button>
            </div>

            <input
               type="file"
               id="import-excel-apontamentos"
               accept=".xlsx, .xls"
               className="hidden"
               onChange={processarPlanilha}
            />

            <button
                onClick={() => document.getElementById('import-excel-apontamentos').click()}
                className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-white rounded-xl text-sm font-medium hover:bg-white/10 transition-colors"
                title="Importar Excel"
            >
                <Upload className="w-4 h-4" /> <span className="hidden sm:inline">Importar</span>
            </button>

            <button
                onClick={baixarDadosAtuais}
                className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-white rounded-xl text-sm font-medium hover:bg-white/10 transition-colors"
                title="Exportar Dados Atuais"
            >
                <Download className="w-4 h-4" /> <span className="hidden sm:inline">Exportar</span>
            </button>
            <button
                 onClick={baixarTemplate}
                 className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-white rounded-xl text-sm font-medium hover:bg-white/10 transition-colors"
                 title="Baixar Template (Molde)"
            >
                 <FileSpreadsheet className="w-4 h-4" /> <span className="hidden sm:inline">Template</span>
            </button>
          </div>
      </div>

      {/* LISTA (TABELA) */}
      <div className="flex-1 overflow-auto custom-scrollbar">
          {loading && apontamentos.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-white/40">
                <Loader2 className="w-8 h-8 animate-spin mb-4" style={{ color: palette.gold }} />
                <p>Carregando apontamentos...</p>
            </div>
          ) : apontamentos.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-white/40">
                <ClipboardList className="w-12 h-12 mb-4 opacity-20" />
                <p>Nenhum apontamento encontrado.</p>
            </div>
          ) : (
            <div className="min-w-[1200px] p-6">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-white/10 text-xs uppercase text-white/40">
                            <th className="pb-3 px-4 font-semibold">Data</th>
                            <th className="pb-3 px-4 font-semibold">Fazenda/Talhão</th>
                            <th className="pb-3 px-4 font-semibold">Operação</th>
                            <th className="pb-3 px-4 font-semibold">Insumo</th>
                            <th className="pb-3 px-4 font-semibold text-right">Qtd. Aplic.</th>
                            <th className="pb-3 px-4 font-semibold text-right">Dose Aplic.</th>
                            <th className="pb-3 px-4 font-semibold text-center">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {apontamentos.map((ap) => (
                            <tr key={ap.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group">
                                <td className="py-4 px-4 text-sm text-white whitespace-nowrap">{ap.dtHistorico || '-'}</td>
                                <td className="py-4 px-4 text-sm text-white">
                                    <div className="font-medium text-white/90">{ap.codFaz} - {ap.desFazenda}</div>
                                    <div className="text-xs text-white/50">Bloco {ap.bloco || '-'} / Talhão {ap.talhao || '-'}</div>
                                </td>
                                <td className="py-4 px-4 text-sm text-white">
                                    <div className="font-medium text-white/90">{ap.cdOp}</div>
                                    <div className="text-xs text-white/50">{ap.deOperacao}</div>
                                </td>
                                <td className="py-4 px-4 text-sm text-white">
                                    <div className="font-medium text-white/90">{ap.codInsumo}</div>
                                    <div className="text-xs text-white/50 max-w-xs truncate" title={ap.descInsumo}>{ap.descInsumo}</div>
                                </td>
                                <td className="py-4 px-4 text-sm text-white/80 text-right">{ap.qtdeAplic || '-'}</td>
                                <td className="py-4 px-4 text-sm text-white/80 text-right">{ap.doseAplic || '-'}</td>
                                <td className="py-4 px-4 text-center">
                                    <button
                                        onClick={() => handleInactivate(ap.id)}
                                        className="p-2 text-white/30 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                        title="Inativar/Remover"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
          )}
      </div>

      {/* CARREGAR MAIS */}
      {hasMore && apontamentos.length > 0 && (
        <div className="shrink-0 border-t border-white/10 bg-[#0A0A0A] p-4 flex items-center justify-center">
            <button
                onClick={() => loadData(false)}
                disabled={loading}
                className="px-6 py-2 bg-white/5 border border-white/10 rounded-xl text-sm font-medium hover:bg-white/10 transition-colors flex items-center gap-2"
            >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {loading ? 'Carregando...' : 'Carregar Mais'}
            </button>
        </div>
      )}
    </div>
  );
}
