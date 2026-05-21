import { getActiveCompanyId } from '../../../services/companyContext.js';
import React, { useState, useEffect } from 'react';
import { palette } from '../../../constants/theme.js';
import { Tractor, Plus, Edit2, Trash2, Download, Upload, Search, FileSpreadsheet, Loader2 } from 'lucide-react';
import { saveProducao, inactivateProducao, saveProducaoEmMassa, getProducoesPaginadas } from '../../../services/cadastros_mestres/producaoAgricolaService.js';
import { useAuth } from '../../../hooks/useAuth.js';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import Swal from 'sweetalert2';

/**
 * @file ProducaoAgricolaList.jsx
 * @description Listagem e importação do Cadastro Mestre de Produção Agrícola.
 * @module ProducaoAgricolaList
 */

export default function ProducaoAgricolaList() {
  const { user } = useAuth();
  const companyId = getActiveCompanyId();

  const [producoes, setProducoes] = useState([]);
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

        const result = await getProducoesPaginadas(companyId, itemsPerPage, currentLastVisible, searchTerm, dtInicialIso, dtFinalIso);

        if (reset) {
            setProducoes(result.data);
        } else {
            setProducoes(prev => [...prev, ...result.data]);
        }

        setLastVisible(result.lastVisible);
        setHasMore(result.hasMore);
    } catch (err) {
        console.error("Erro ao carregar produções paginadas:", err);
        Swal.fire({ title: 'Erro', text: 'Não foi possível carregar os dados.', icon: 'error', background: '#121212', color: '#fff' });
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
      loadData(true);
  }, [companyId]); // Carrega a primeira página ao montar

  const handleSearch = () => {
      loadData(true);
  };

  // State para o modal de criação/edição manual
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentProducao, setCurrentProducao] = useState({
      codFaz: '', desFazenda: '', talhao: '', areaHa: '', corte: '', dtUltCorte: '', tchEst: '', tonEst: '', tchFechado: '', tonFechada: '', atrReal: ''
  });

  const handleSaveManual = async () => {
    if (!currentProducao.codFaz || !currentProducao.talhao) {
        Swal.fire({
            title: 'Campos Obrigatórios',
            text: 'O Código da Fazenda e o Talhão são obrigatórios.',
            icon: 'warning',
            background: '#121212',
            color: '#fff',
            confirmButtonColor: palette.gold
        });
        return;
    }

    const payload = { ...currentProducao };

    await saveProducao(payload, user?.uid || 'system', companyId);
    setIsModalOpen(false);
    loadData(true);
  };

  const handleInactivate = async (id) => {
    Swal.fire({
        title: 'Tem certeza?',
        text: "Deseja realmente inativar este registro?",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sim, inativar!',
        cancelButtonText: 'Cancelar',
        background: '#121212',
        color: '#fff'
    }).then(async (result) => {
        if (result.isConfirmed) {
            await inactivateProducao(id, user?.uid || 'system', companyId);
            Swal.fire({ title: 'Inativado!', text: 'Registro inativado com sucesso.', icon: 'success', background: '#121212', color: '#fff' });
            loadData(true);
        }
    });
  };

  /**
   * Baixa a planilha modelo com os cabeçalhos esperados pelo sistema
   */
  const exportarModelo = () => {
    const ws_data = [
        ['COD_FAZ', 'DES_FAZENDA', 'TALHAO', 'AREA_HA', 'CORTE', 'DT_ULTCORTE', 'TCH_EST', 'TON_EST', 'TCH_FECHADO', 'TON_FECHADA', 'ATR_REAL'], // Header obrigatório na linha 1
        ['4002', 'FAZENDA MUTUM', '1', '19,23', '9', '21/11/2025', '55', '1057,65', '51,0400416', '981,5', '146,46'] // Linha de exemplo 1
    ];

    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // Ajuste da largura das colunas
    const wscols = [
        { wch: 15 }, // COD_FAZ
        { wch: 40 }, // DES_FAZENDA
        { wch: 10 }, // TALHAO
        { wch: 15 }, // AREA_HA
        { wch: 10 }, // CORTE
        { wch: 15 }, // DT_ULTCORTE
        { wch: 15 }, // TCH_EST
        { wch: 15 }, // TON_EST
        { wch: 15 }, // TCH_FECHADO
        { wch: 15 }, // TON_FECHADA
        { wch: 15 }  // ATR_REAL
    ];
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ProducaoAgricola");
    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const dataBlob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    saveAs(dataBlob, "Modelo_Producao_Agricola.xlsx");
  };

  /**
   * Processa o upload da planilha com trava de tela (SweetAlert) e barra de progresso
   */
  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    Swal.fire({
        title: 'Lendo arquivo...',
        html: 'Preparando a planilha. Por favor, aguarde.',
        allowOutsideClick: false,
        allowEscapeKey: false,
        background: '#121212',
        color: '#fff',
        didOpen: () => {
            Swal.showLoading();
        }
    });

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });

            if (json.length === 0) {
                Swal.fire({ title: 'Planilha Vazia', text: 'A planilha informada está vazia ou sem o formato correto.', icon: 'error', background: '#121212', color: '#fff' });
                e.target.value = null;
                return;
            }

            // Atualiza barra de progresso
            Swal.update({
                title: 'Importando Produção...',
                html: `Processando <b id="swal-progress-text">0</b> de ${json.length} linhas.<br/><br/><div style="width:100%;background:#333;height:20px;border-radius:10px;overflow:hidden;"><div id="swal-progress-bar" style="width:0%;height:100%;background:${palette.gold};transition:width 0.1s;"></div></div><br/><b>Não feche ou atualize a página.</b>`
            });

            const updateProgress = (processed, total) => {
                const elText = document.getElementById('swal-progress-text');
                const elBar = document.getElementById('swal-progress-bar');
                if (elText) elText.innerText = processed;
                if (elBar) elBar.style.width = `${Math.round((processed/total)*100)}%`;
            };

            await saveProducaoEmMassa(json, user?.uid || 'system', companyId, updateProgress);

            // Sucesso! Tira a trava da tela e avisa o usuário
            Swal.fire({
                title: 'Importação Concluída!',
                text: `${json.length} registros processados e enfileirados para sincronização.`,
                icon: 'success',
                confirmButtonColor: palette.gold,
                background: '#121212',
                color: '#fff'
            });
            loadData(true);

        } catch (error) {
            console.error("Erro na importação:", error);
            Swal.fire({
                title: 'Erro na Importação',
                text: 'Houve uma falha ao ler o arquivo. Certifique-se de usar o Modelo (Excel) fornecido e não alterar as colunas da linha 1.',
                icon: 'error',
                confirmButtonColor: '#d33',
                background: '#121212',
                color: '#fff'
            });
        } finally {
            e.target.value = null; // Libera o input de arquivo pra aceitar upload da mesma planilha se necessário corrigir
        }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="flex flex-col h-full animate-fade-in relative min-h-0 bg-[#0A0A0A] rounded-[24px]">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4 shrink-0 p-6 border-b border-white/10">
        <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
                <Tractor className="w-6 h-6" style={{ color: palette.gold }} />
                Produção Agrícola
            </h2>
            <p className="text-sm text-white/50 mt-1">Gerencie a base de produção, áreas e cortes.</p>
        </div>

        <div className="flex-1 flex flex-wrap items-center gap-2 mx-4">
            <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                    type="text"
                    placeholder="Pesquisar por Código, Fazenda ou Talhão..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-gold transition-colors"
                />
            </div>
            <div className="flex items-center gap-2">
                <input
                    type="date"
                    value={dtInicial}
                    onChange={e => setDtInicial(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-gold"
                    title="Data Inicial (Corte)"
                />
                <span className="text-white/30">até</span>
                <input
                    type="date"
                    value={dtFinal}
                    onChange={e => setDtFinal(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-gold"
                    title="Data Final (Corte)"
                />
                <button
                    onClick={handleSearch}
                    className="px-3 py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-sm font-medium transition-colors"
                >
                    Buscar
                </button>
            </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0">
            <button
                onClick={exportarModelo}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white/80 bg-white/5 hover:bg-white/10 hover:text-white transition-all border border-white/10 whitespace-nowrap"
            >
                <Download className="w-4 h-4" /> Baixar Modelo
            </button>
            <label className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-black transition-all shadow-lg cursor-pointer hover:scale-105 whitespace-nowrap" style={{ background: palette.gold }}>
                <Upload className="w-4 h-4" /> Importar Planilha
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImport} />
            </label>
            <button
                onClick={() => { setCurrentProducao({ codFaz: '', desFazenda: '', talhao: '', areaHa: '', corte: '', dtUltCorte: '', tchEst: '', tonEst: '', tchFechado: '', tonFechada: '', atrReal: '' }); setIsModalOpen(true); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-white/10 hover:bg-white/20 transition-all border border-white/10 whitespace-nowrap"
            >
                <Plus className="w-4 h-4" /> Novo
            </button>
        </div>
      </div>

      <div className="flex-1 rounded-2xl border border-white/5 bg-[#0A0A0A] overflow-y-auto custom-scrollbar relative">
        <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-black/80 text-white/50 border-b border-white/5 z-20 sticky top-0 backdrop-blur-md">
                <tr>
                    <th className="px-6 py-4 font-semibold">Cód. Faz</th>
                    <th className="px-6 py-4 font-semibold">Fazenda</th>
                    <th className="px-6 py-4 font-semibold">Talhão</th>
                    <th className="px-6 py-4 font-semibold text-right">Área (HA)</th>
                    <th className="px-6 py-4 font-semibold text-center">Corte</th>
                    <th className="px-6 py-4 font-semibold text-center">TCH Fechado</th>
                    <th className="px-6 py-4 font-semibold text-center">Sincronia</th>
                    <th className="px-6 py-4 font-semibold text-right">Ações</th>
                </tr>
            </thead>
            <tbody>
                {loading && producoes.length === 0 ? (
                    <tr>
                        <td colSpan="8" className="text-center py-16 text-white/40">
                            <div className="flex flex-col items-center justify-center">
                                <Loader2 className="w-8 h-8 animate-spin mb-4" style={{ color: palette.gold }} />
                                <p className="text-sm">Carregando produções...</p>
                            </div>
                        </td>
                    </tr>
                ) : producoes.length === 0 ? (
                    <tr>
                        <td colSpan="8" className="text-center py-16 text-white/40">
                            <div className="flex flex-col items-center justify-center">
                                <FileSpreadsheet className="w-12 h-12 mb-4 opacity-20" />
                                <p className="text-lg mb-2">Nenhuma produção encontrada.</p>
                                <p className="text-sm">Tente ajustar os filtros ou importe uma planilha.</p>
                            </div>
                        </td>
                    </tr>
                ) : (
                    producoes.map(prod => (
                        <tr key={prod.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                            <td className="px-6 py-4 font-mono font-medium text-white">{prod.codFaz || '-'}</td>
                            <td className="px-6 py-4 font-medium text-white">{prod.desFazenda || '-'}</td>
                            <td className="px-6 py-4 text-white/70">{prod.talhao || '-'}</td>
                            <td className="px-6 py-4 text-right text-white/70">{prod.areaHa || '-'}</td>
                            <td className="px-6 py-4 text-center text-white/70">{prod.corte || '-'}</td>
                            <td className="px-6 py-4 text-center text-white/70">{prod.tchFechado || '-'}</td>
                            <td className="px-6 py-4 text-center">
                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${prod.syncStatus === 'synced' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                    {prod.syncStatus === 'synced' ? 'Nuvem OK' : 'Sincronizando'}
                                </span>
                            </td>
                            <td className="px-6 py-4 flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => { setCurrentProducao(prod); setIsModalOpen(true); }}
                                    className="p-2 hover:bg-white/10 rounded-lg text-white/60 hover:text-white"
                                    title="Editar Registro"
                                >
                                    <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => handleInactivate(prod.id)}
                                    className="p-2 hover:bg-red-500/20 rounded-lg text-red-400/60 hover:text-red-400"
                                    title="Inativar Registro"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </td>
                        </tr>
                    ))
                )}
            </tbody>
        </table>
      </div>

      {/* CARREGAR MAIS */}
      {hasMore && producoes.length > 0 && (
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

      {/* Modal Manual */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in overflow-y-auto">
            <div className="bg-[#121212] border border-white/10 rounded-2xl w-full max-w-4xl shadow-2xl p-6 m-auto">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <Tractor className="w-5 h-5 text-gold" style={{ color: palette.gold }} />
                    {currentProducao.id ? 'Editar Produção' : 'Nova Produção'}
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Cód. Fazenda <span className="text-red-400">*</span></label>
                        <input
                            value={currentProducao.codFaz}
                            onChange={(e) => setCurrentProducao({...currentProducao, codFaz: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Ex: 4002"
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-white/50 mb-1">Fazenda</label>
                        <input
                            value={currentProducao.desFazenda}
                            onChange={(e) => setCurrentProducao({...currentProducao, desFazenda: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Ex: FAZENDA MUTUM"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Talhão <span className="text-red-400">*</span></label>
                        <input
                            value={currentProducao.talhao}
                            onChange={(e) => setCurrentProducao({...currentProducao, talhao: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Ex: 1"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Área (HA)</label>
                        <input
                            value={currentProducao.areaHa}
                            onChange={(e) => setCurrentProducao({...currentProducao, areaHa: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Ex: 19.23"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Corte</label>
                        <input
                            value={currentProducao.corte}
                            onChange={(e) => setCurrentProducao({...currentProducao, corte: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Ex: 9"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Data Ult. Corte</label>
                        <input
                            value={currentProducao.dtUltCorte}
                            onChange={(e) => setCurrentProducao({...currentProducao, dtUltCorte: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Ex: 21/11/2025"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">TCH Est.</label>
                        <input
                            value={currentProducao.tchEst}
                            onChange={(e) => setCurrentProducao({...currentProducao, tchEst: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Ex: 55"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Ton Est.</label>
                        <input
                            value={currentProducao.tonEst}
                            onChange={(e) => setCurrentProducao({...currentProducao, tonEst: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Ex: 1057.65"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">TCH Fechado</label>
                        <input
                            value={currentProducao.tchFechado}
                            onChange={(e) => setCurrentProducao({...currentProducao, tchFechado: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Ex: 51.04"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Ton Fechada</label>
                        <input
                            value={currentProducao.tonFechada}
                            onChange={(e) => setCurrentProducao({...currentProducao, tonFechada: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Ex: 981.5"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">ATR Real</label>
                        <input
                            value={currentProducao.atrReal}
                            onChange={(e) => setCurrentProducao({...currentProducao, atrReal: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Ex: 146.46"
                        />
                    </div>
                </div>

                <div className="mt-8 flex gap-3 justify-end">
                    <button
                        onClick={() => setIsModalOpen(false)}
                        className="px-5 py-2.5 rounded-xl font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSaveManual}
                        className="px-5 py-2.5 rounded-xl font-medium text-black transition-transform hover:scale-105"
                        style={{ background: palette.gold }}
                    >
                        Salvar Registro
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
