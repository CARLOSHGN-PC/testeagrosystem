import { getActiveCompanyId } from '../../../services/companyContext.js';
import React, { useState, useEffect } from 'react';
import { palette } from '../../../constants/theme.js';
import { Sprout, Plus, Edit2, Trash2, Download, Upload, Search, FileSpreadsheet } from 'lucide-react';
import { getInsumos, saveInsumo, inactivateInsumo, saveInsumosEmMassa, subscribeToInsumosRealtime } from '../../../services/cadastros_mestres/insumosService.js';
import { useAuth } from '../../../hooks/useAuth.js';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../../services/localDb.js';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import Swal from 'sweetalert2';

/**
 * @file InsumosList.jsx
 * @description Listagem e importação do Cadastro Mestre de Insumos.
 * @module InsumosList
 */

export default function InsumosList() {
  const { user } = useAuth();
  const companyId = getActiveCompanyId();

  const rawInsumos = useLiveQuery(() => db.insumos.where('companyId').equals(companyId).toArray(), [companyId]) || [];
  const [insumos, setInsumos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Sync state whenever Dexie updates
  useEffect(() => {
    if (rawInsumos) {
        setInsumos(rawInsumos.filter(ins => ins.status === 'ATIVO'));
        setLoading(false);
    }
  }, [rawInsumos]);

  // State para o modal de criação/edição manual
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentInsumo, setCurrentInsumo] = useState({
      codInsumoRateio: '', codInsumo: '', descInsumo: '', descGrupo: '', descSubgrupo: '', und: '', vlrUnit: '', dtVlrUnit: '', nomeComercial: '', doseMedia: '', doseMinima: '', doseMaxima: ''
  });

  useEffect(() => {
    let mounted = true;

    async function carregarPostgreSQL() {
      setLoading(true);
      try {
        const data = await getInsumos(companyId);
        if (mounted) {
          setInsumos((data || []).filter(ins => ins.status === 'ATIVO'));
        }
      } catch (error) {
        console.error('[Cadastro Geral] Erro ao carregar dados PostgreSQL:', error);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    carregarPostgreSQL();
    const unsubscribe = subscribeToInsumosRealtime(companyId);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [companyId]);

  const handleSaveManual = async () => {
    if (!currentInsumo.codInsumo || !currentInsumo.descInsumo) {
        Swal.fire({
            title: 'Campos Obrigatórios',
            text: 'O Código do Insumo e a Descrição do Insumo são obrigatórios.',
            icon: 'warning',
            background: '#121212',
            color: '#fff',
            confirmButtonColor: palette.gold
        });
        return;
    }

    const payload = { ...currentInsumo };

    await saveInsumo(payload, user?.uid || 'system', companyId);
    setIsModalOpen(false);
  };

  const handleInactivate = async (id) => {
    Swal.fire({
        title: 'Tem certeza?',
        text: "Deseja realmente inativar este insumo?",
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
            await inactivateInsumo(id, user?.uid || 'system', companyId);
            Swal.fire({ title: 'Inativado!', text: 'Insumo inativado com sucesso.', icon: 'success', background: '#121212', color: '#fff' });
        }
    });
  };

  /**
   * Baixa a planilha modelo com os cabeçalhos esperados pelo sistema
   */
  const exportarModelo = () => {
    const ws_data = [
        ['COD_INSUMO_RATEIO', 'COD_INSUMO', 'DESC_INSUMO', 'DESC_GRUPO', 'DESC_SUBGRUPO', 'UND', 'VLR_UNIT', 'DT_VLR_UNIT', 'NOME_COMERCIAL', 'DOSE_MEDIA', 'DOSE_MINIMA', 'DOSE_MAXIMA'], // Header obrigatório na linha 1
        ['', '9052', 'TORTA DE FILTRO', 'ADUBOS', '', 'TN', '10', '', '', '', '', ''] // Linha de exemplo 1
    ];

    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // Ajuste da largura das colunas
    const wscols = [
        { wch: 20 }, // COD_INSUMO_RATEIO
        { wch: 15 }, // COD_INSUMO
        { wch: 40 }, // DESC_INSUMO
        { wch: 20 }, // DESC_GRUPO
        { wch: 20 }, // DESC_SUBGRUPO
        { wch: 10 }, // UND
        { wch: 15 }, // VLR_UNIT
        { wch: 15 }, // DT_VLR_UNIT
        { wch: 20 }, // NOME_COMERCIAL
        { wch: 15 }, // DOSE_MEDIA
        { wch: 15 }, // DOSE_MINIMA
        { wch: 15 }  // DOSE_MAXIMA
    ];
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Insumos");
    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const dataBlob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    saveAs(dataBlob, "Modelo_Cadastro_Insumos.xlsx");
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
                title: 'Importando Insumos...',
                html: `Processando <b id="swal-progress-text">0</b> de ${json.length} linhas.<br/><br/><div style="width:100%;background:#333;height:20px;border-radius:10px;overflow:hidden;"><div id="swal-progress-bar" style="width:0%;height:100%;background:${palette.gold};transition:width 0.1s;"></div></div><br/><b>Não feche ou atualize a página.</b>`
            });

            const updateProgress = (processed, total) => {
                const elText = document.getElementById('swal-progress-text');
                const elBar = document.getElementById('swal-progress-bar');
                if (elText) elText.innerText = processed;
                if (elBar) elBar.style.width = `${Math.round((processed/total)*100)}%`;
            };

            await saveInsumosEmMassa(json, user?.uid || 'system', companyId, updateProgress);

            // Sucesso! Tira a trava da tela e avisa o usuário
            Swal.fire({
                title: 'Importação Concluída!',
                text: `${json.length} registros processados e enfileirados para sincronização.`,
                icon: 'success',
                confirmButtonColor: palette.gold,
                background: '#121212',
                color: '#fff'
            });

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

  const filteredInsumos = insumos.filter(ins => {
      const term = searchTerm.toLowerCase();
      return (ins.codInsumo && String(ins.codInsumo).toLowerCase().includes(term)) ||
             (ins.descInsumo && String(ins.descInsumo).toLowerCase().includes(term)) ||
             (ins.descGrupo && String(ins.descGrupo).toLowerCase().includes(term));
  });

  return (
    <div className="flex flex-col h-full animate-fade-in relative min-h-0">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4 shrink-0">
        <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
                <Sprout className="w-6 h-6" style={{ color: palette.gold }} />
                Insumos Agrícolas
            </h2>
            <p className="text-sm text-white/50 mt-1">Gerencie a base de insumos, valores e dosagens.</p>
        </div>

        <div className="flex-1 max-w-md relative mx-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
                type="text"
                placeholder="Pesquisar por Código, Descrição ou Grupo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-gold transition-colors"
            />
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
                onClick={() => { setCurrentInsumo({ codInsumoRateio: '', codInsumo: '', descInsumo: '', descGrupo: '', descSubgrupo: '', und: '', vlrUnit: '', dtVlrUnit: '', nomeComercial: '', doseMedia: '', doseMinima: '', doseMaxima: '' }); setIsModalOpen(true); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-white/10 hover:bg-white/20 transition-all border border-white/10 whitespace-nowrap"
            >
                <Plus className="w-4 h-4" /> Novo
            </button>
        </div>
      </div>

      <div className="flex-1 rounded-2xl border border-white/5 bg-[#0A0A0A] overflow-y-auto custom-scrollbar relative">
        <table className="w-full text-left text-sm">
            <thead className="bg-black/80 text-white/50 border-b border-white/5 z-20 sticky top-0 backdrop-blur-md">
                <tr>
                    <th className="px-6 py-4 font-semibold">Cód. Insumo</th>
                    <th className="px-6 py-4 font-semibold">Desc. Insumo</th>
                    <th className="px-6 py-4 font-semibold">Grupo</th>
                    <th className="px-6 py-4 font-semibold text-center">Unid.</th>
                    <th className="px-6 py-4 font-semibold text-right">Vlr. Unit</th>
                    <th className="px-6 py-4 font-semibold text-center">Sincronia</th>
                    <th className="px-6 py-4 font-semibold text-right">Ações</th>
                </tr>
            </thead>
            <tbody>
                {insumos.length === 0 && !loading ? (
                    <tr>
                        <td colSpan="7" className="text-center py-16 text-white/40">
                            <div className="flex flex-col items-center justify-center">
                                <FileSpreadsheet className="w-12 h-12 mb-4 opacity-20" />
                                <p className="text-lg mb-2">Nenhum insumo cadastrado no momento.</p>
                                <p className="text-sm">Baixe o modelo e importe sua planilha, ou clique em Novo.</p>
                            </div>
                        </td>
                    </tr>
                ) : filteredInsumos.length === 0 && !loading ? (
                    <tr>
                        <td colSpan="7" className="text-center py-16 text-white/40">
                            <div className="flex flex-col items-center justify-center">
                                <Search className="w-12 h-12 mb-4 opacity-20" />
                                <p className="text-lg">Nenhum insumo encontrado com esse filtro.</p>
                            </div>
                        </td>
                    </tr>
                ) : (
                    filteredInsumos.map(ins => (
                        <tr key={ins.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                            <td className="px-6 py-4 font-mono font-medium text-white">{ins.codInsumo || '-'}</td>
                            <td className="px-6 py-4 font-medium text-white">{ins.descInsumo || '-'}</td>
                            <td className="px-6 py-4 text-white/70">{ins.descGrupo || '-'}</td>
                            <td className="px-6 py-4 text-center text-white/70">{ins.und || '-'}</td>
                            <td className="px-6 py-4 text-right text-white/70">
                                {ins.vlrUnit ? (() => {
                                    const vlrString = ins.vlrUnit.toString().trim().replace(',', '.');
                                    const parsedPrice = parseFloat(vlrString);
                                    if (!isNaN(parsedPrice)) {
                                        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parsedPrice);
                                    }
                                    return ins.vlrUnit;
                                })() : '-'}
                            </td>
                            <td className="px-6 py-4 text-center">
                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${ins.syncStatus === 'synced' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                    {ins.syncStatus === 'synced' ? 'Nuvem OK' : 'Sincronizando'}
                                </span>
                            </td>
                            <td className="px-6 py-4 flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => { setCurrentInsumo(ins); setIsModalOpen(true); }}
                                    className="p-2 hover:bg-white/10 rounded-lg text-white/60 hover:text-white"
                                    title="Editar Insumo"
                                >
                                    <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => handleInactivate(ins.id)}
                                    className="p-2 hover:bg-red-500/20 rounded-lg text-red-400/60 hover:text-red-400"
                                    title="Inativar Insumo"
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

      {/* Modal Manual */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in overflow-y-auto">
            <div className="bg-[#121212] border border-white/10 rounded-2xl w-full max-w-4xl shadow-2xl p-6 m-auto">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <Sprout className="w-5 h-5 text-gold" style={{ color: palette.gold }} />
                    {currentInsumo.id ? 'Editar Insumo' : 'Novo Insumo'}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Cód. Insumo <span className="text-red-400">*</span></label>
                        <input
                            value={currentInsumo.codInsumo}
                            onChange={(e) => setCurrentInsumo({...currentInsumo, codInsumo: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Ex: 9052"
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-white/50 mb-1">Desc. Insumo <span className="text-red-400">*</span></label>
                        <input
                            value={currentInsumo.descInsumo}
                            onChange={(e) => setCurrentInsumo({...currentInsumo, descInsumo: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Ex: TORTA DE FILTRO"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Cód. Insumo Rateio</label>
                        <input
                            value={currentInsumo.codInsumoRateio}
                            onChange={(e) => setCurrentInsumo({...currentInsumo, codInsumoRateio: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Opcional"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Grupo</label>
                        <input
                            value={currentInsumo.descGrupo}
                            onChange={(e) => setCurrentInsumo({...currentInsumo, descGrupo: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Ex: ADUBOS"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Subgrupo</label>
                        <input
                            value={currentInsumo.descSubgrupo}
                            onChange={(e) => setCurrentInsumo({...currentInsumo, descSubgrupo: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Opcional"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Unidade</label>
                        <input
                            value={currentInsumo.und}
                            onChange={(e) => setCurrentInsumo({...currentInsumo, und: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Ex: TN"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Valor Unitário</label>
                        <input
                            value={currentInsumo.vlrUnit}
                            onChange={(e) => setCurrentInsumo({...currentInsumo, vlrUnit: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Ex: 10"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Data Vlr. Unit.</label>
                        <input
                            value={currentInsumo.dtVlrUnit}
                            onChange={(e) => setCurrentInsumo({...currentInsumo, dtVlrUnit: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Opcional"
                        />
                    </div>
                    <div className="md:col-span-3">
                        <label className="block text-xs font-medium text-white/50 mb-1">Nome Comercial</label>
                        <input
                            value={currentInsumo.nomeComercial}
                            onChange={(e) => setCurrentInsumo({...currentInsumo, nomeComercial: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Opcional"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Dose Média</label>
                        <input
                            value={currentInsumo.doseMedia}
                            onChange={(e) => setCurrentInsumo({...currentInsumo, doseMedia: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Opcional"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Dose Mínima</label>
                        <input
                            value={currentInsumo.doseMinima}
                            onChange={(e) => setCurrentInsumo({...currentInsumo, doseMinima: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Opcional"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Dose Máxima</label>
                        <input
                            value={currentInsumo.doseMaxima}
                            onChange={(e) => setCurrentInsumo({...currentInsumo, doseMaxima: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Opcional"
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
                        Salvar Insumo
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}