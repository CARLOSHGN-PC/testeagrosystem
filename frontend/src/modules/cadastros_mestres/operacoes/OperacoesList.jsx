import { getActiveCompanyId } from '../../../services/companyContext.js';
import React, { useState, useEffect } from 'react';
import { palette } from '../../../constants/theme.js';
import { Wrench, Plus, Edit2, Trash2, Download, Upload, Search, FileSpreadsheet } from 'lucide-react';
import { getOperacoes, saveOperacao, inactivateOperacao, saveOperacoesEmMassa, subscribeToOperacoesRealtime } from '../../../services/cadastros_mestres/operacoesService.js';
import { useAuth } from '../../../hooks/useAuth.js';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../../services/localDb.js';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import Swal from 'sweetalert2';

/**
 * @file OperacoesList.jsx
 * @description Listagem e importação do Cadastro Mestre de Operações.
 * @module OperacoesList
 */

export default function OperacoesList() {
  const { user } = useAuth();
  const companyId = getActiveCompanyId();

  const rawOperacoes = useLiveQuery(() => db.operacoes.where('companyId').equals(companyId).toArray(), [companyId]) || [];
  const [operacoes, setOperacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Sync state whenever Dexie updates
  useEffect(() => {
    if (rawOperacoes) {
        setOperacoes(rawOperacoes.filter(op => op.status === 'ATIVO'));
        setLoading(false);
    }
  }, [rawOperacoes]);

  // State para o modal de criação/edição manual
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentOperacao, setCurrentOperacao] = useState({
      codCcustoRateio: '', cdCcusto: '', deCcusto: '', cdOperacao: '', deOperacao: '', unidade: '', tipoOperacao: '', classe: ''
  });

  useEffect(() => {
    let mounted = true;

    async function carregarPostgreSQL() {
      setLoading(true);
      try {
        const data = await getOperacoes(companyId);
        if (mounted) {
          setOperacoes((data || []).filter(op => op.status === 'ATIVO'));
        }
      } catch (error) {
        console.error('[Cadastro Geral] Erro ao carregar dados PostgreSQL:', error);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    carregarPostgreSQL();
    const unsubscribe = subscribeToOperacoesRealtime(companyId);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [companyId]);

  const handleSaveManual = async () => {
    if (!currentOperacao.cdOperacao || !currentOperacao.deOperacao) {
        Swal.fire({
            title: 'Campos Obrigatórios',
            text: 'O Código da Operação e a Descrição da Operação são obrigatórios.',
            icon: 'warning',
            background: '#121212',
            color: '#fff',
            confirmButtonColor: palette.gold
        });
        return;
    }

    const payload = { ...currentOperacao };

    await saveOperacao(payload, user?.uid || 'system', companyId);
    setIsModalOpen(false);
  };

  const handleInactivate = async (id) => {
    Swal.fire({
        title: 'Tem certeza?',
        text: "Deseja realmente inativar esta operação?",
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
            await inactivateOperacao(id, user?.uid || 'system', companyId);
            Swal.fire({ title: 'Inativado!', text: 'Operação inativada com sucesso.', icon: 'success', background: '#121212', color: '#fff' });
        }
    });
  };

  /**
   * Baixa a planilha modelo com os cabeçalhos esperados pelo sistema
   */
  const exportarModelo = () => {
    const ws_data = [
        ['COD_CCUSTO_RATEIO', 'CD_CCUSTO', 'DE_CCUSTO', 'CD_OPERACAO', 'DE_OPERACAO', 'UNIDADE', 'TIPO_OPERACAO', 'CLASSE'], // Header obrigatório na linha 1
        ['', '3007', 'PREPARO DE SOLO', '11102', 'CATACAO PREPARO', 'D', 'DIARIA', ''], // Linha de exemplo 1
        ['', '3007', 'PREPARO DE SOLO', '11103', 'DESLOCAMENTO MAQUINA PREPARO', 'HR', 'HORIMETRO', ''] // Linha de exemplo 2
    ];

    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // Ajuste da largura das colunas
    const wscols = [
        { wch: 20 }, // COD_CCUSTO_RATEIO
        { wch: 15 }, // CD_CCUSTO
        { wch: 30 }, // DE_CCUSTO
        { wch: 15 }, // CD_OPERACAO
        { wch: 40 }, // DE_OPERACAO
        { wch: 10 }, // UNIDADE
        { wch: 20 }, // TIPO_OPERACAO
        { wch: 15 }  // CLASSE
    ];
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Operações");
    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const dataBlob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    saveAs(dataBlob, "Modelo_Cadastro_Operacoes.xlsx");
  };

  /**
   * Processa o upload da planilha com trava de tela (SweetAlert)
   */
  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // SweetAlert interativo e bloqueador para importações que demoram
    Swal.fire({
        title: 'Importando Operações...',
        html: 'Por favor, aguarde enquanto validamos e gravamos a planilha. <b>Não feche ou atualize a página.</b>',
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

            // Atualiza as operações existentes (baseado no CD_OPERACAO) e cria as novas.
            await saveOperacoesEmMassa(json, user?.uid || 'system', companyId);

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

  const filteredOperacoes = operacoes.filter(op => {
      const term = searchTerm.toLowerCase();
      const cd = op.cdOperacao || op.cd0peracao || '';
      const de = op.deOperacao || op.de0peracao || '';
      return (cd && String(cd).toLowerCase().includes(term)) ||
             (de && String(de).toLowerCase().includes(term)) ||
             (op.cdCcusto && String(op.cdCcusto).toLowerCase().includes(term)) ||
             (op.deCcusto && String(op.deCcusto).toLowerCase().includes(term));
  });

  return (
    <div className="flex flex-col h-full animate-fade-in relative min-h-0">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4 shrink-0">
        <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
                <Wrench className="w-6 h-6" style={{ color: palette.gold }} />
                Operações
            </h2>
            <p className="text-sm text-white/50 mt-1">Gerencie a base de operações, centros de custo e tipos de operação.</p>
        </div>

        <div className="flex-1 max-w-md relative mx-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
                type="text"
                placeholder="Pesquisar por Código, Descrição ou C.Custo..."
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
                onClick={() => { setCurrentOperacao({ codCcustoRateio: '', cdCcusto: '', deCcusto: '', cdOperacao: '', deOperacao: '', unidade: '', tipoOperacao: '', classe: '' }); setIsModalOpen(true); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-white/10 hover:bg-white/20 transition-all border border-white/10 whitespace-nowrap"
            >
                <Plus className="w-4 h-4" /> Nova
            </button>
        </div>
      </div>

      <div className="flex-1 rounded-2xl border border-white/5 bg-[#0A0A0A] overflow-y-auto custom-scrollbar relative">
        <table className="w-full text-left text-sm">
            <thead className="bg-black/80 text-white/50 border-b border-white/5 z-20 sticky top-0 backdrop-blur-md">
                <tr>
                    <th className="px-6 py-4 font-semibold">C.Custo</th>
                    <th className="px-6 py-4 font-semibold">Desc. C.Custo</th>
                    <th className="px-6 py-4 font-semibold">Cód. Operação</th>
                    <th className="px-6 py-4 font-semibold">Desc. Operação</th>
                    <th className="px-6 py-4 font-semibold text-center">Unid.</th>
                    <th className="px-6 py-4 font-semibold">Tipo</th>
                    <th className="px-6 py-4 font-semibold">Sincronia</th>
                    <th className="px-6 py-4 font-semibold text-right">Ações</th>
                </tr>
            </thead>
            <tbody>
                {operacoes.length === 0 && !loading ? (
                    <tr>
                        <td colSpan="8" className="text-center py-16 text-white/40">
                            <div className="flex flex-col items-center justify-center">
                                <FileSpreadsheet className="w-12 h-12 mb-4 opacity-20" />
                                <p className="text-lg mb-2">Nenhuma operação cadastrada no momento.</p>
                                <p className="text-sm">Baixe o modelo e importe sua planilha, ou clique em Nova.</p>
                            </div>
                        </td>
                    </tr>
                ) : filteredOperacoes.length === 0 && !loading ? (
                    <tr>
                        <td colSpan="8" className="text-center py-16 text-white/40">
                            <div className="flex flex-col items-center justify-center">
                                <Search className="w-12 h-12 mb-4 opacity-20" />
                                <p className="text-lg">Nenhuma operação encontrada com esse filtro.</p>
                            </div>
                        </td>
                    </tr>
                ) : (
                    filteredOperacoes.map(op => (
                        <tr key={op.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                            <td className="px-6 py-4 font-mono text-white/80">{op.cdCcusto || '-'}</td>
                            <td className="px-6 py-4 text-white/70">{op.deCcusto || '-'}</td>
                            <td className="px-6 py-4 font-mono font-medium text-white">{op.cdOperacao || op.cd0peracao || '-'}</td>
                            <td className="px-6 py-4 font-medium text-white">{op.deOperacao || op.de0peracao || '-'}</td>
                            <td className="px-6 py-4 text-center text-white/70">{op.unidade || '-'}</td>
                            <td className="px-6 py-4 text-white/70">{op.tipoOperacao || '-'}</td>
                            <td className="px-6 py-4">
                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${op.syncStatus === 'synced' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                    {op.syncStatus === 'synced' ? 'Nuvem OK' : 'Sincronizando'}
                                </span>
                            </td>
                            <td className="px-6 py-4 flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => { setCurrentOperacao(op); setIsModalOpen(true); }}
                                    className="p-2 hover:bg-white/10 rounded-lg text-white/60 hover:text-white"
                                    title="Editar Operação"
                                >
                                    <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => handleInactivate(op.id)}
                                    className="p-2 hover:bg-red-500/20 rounded-lg text-red-400/60 hover:text-red-400"
                                    title="Inativar Operação"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-[#121212] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl p-6">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <Wrench className="w-5 h-5 text-gold" style={{ color: palette.gold }} />
                    {currentOperacao.id ? 'Editar Operação' : 'Nova Operação'}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Cód. C.Custo</label>
                        <input
                            value={currentOperacao.cdCcusto}
                            onChange={(e) => setCurrentOperacao({...currentOperacao, cdCcusto: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Ex: 3007"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Desc. C.Custo</label>
                        <input
                            value={currentOperacao.deCcusto}
                            onChange={(e) => setCurrentOperacao({...currentOperacao, deCcusto: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Ex: PREPARO DE SOLO"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Cód. Operação <span className="text-red-400">*</span></label>
                        <input
                            value={currentOperacao.cdOperacao}
                            onChange={(e) => setCurrentOperacao({...currentOperacao, cdOperacao: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Ex: 11102"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Desc. Operação <span className="text-red-400">*</span></label>
                        <input
                            value={currentOperacao.deOperacao}
                            onChange={(e) => setCurrentOperacao({...currentOperacao, deOperacao: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Ex: CATACAO PREPARO"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Unidade</label>
                        <input
                            value={currentOperacao.unidade}
                            onChange={(e) => setCurrentOperacao({...currentOperacao, unidade: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Ex: D"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Tipo Operação</label>
                        <input
                            value={currentOperacao.tipoOperacao}
                            onChange={(e) => setCurrentOperacao({...currentOperacao, tipoOperacao: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Ex: DIARIA"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Cód. C.Custo Rateio</label>
                        <input
                            value={currentOperacao.codCcustoRateio}
                            onChange={(e) => setCurrentOperacao({...currentOperacao, codCcustoRateio: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Opcional"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Classe</label>
                        <input
                            value={currentOperacao.classe}
                            onChange={(e) => setCurrentOperacao({...currentOperacao, classe: e.target.value})}
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
                        Salvar Operação
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
