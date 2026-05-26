import { getActiveCompanyId } from '../../../services/companyContext.js';
import React, { useState, useEffect } from 'react';
import { palette } from '../../../constants/theme.js';
import { Leaf, Plus, Edit2, Trash2, Download, Upload, Search, FileSpreadsheet } from 'lucide-react';
import { getVariedades, saveVariedade, inactivateVariedade, saveVariedadesEmMassa, subscribeToVariedadesRealtime } from '../../../services/cadastros_mestres/variedadesService.js';
import { useAuth } from '../../../hooks/useAuth.js';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../../services/localDb.js';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import Swal from 'sweetalert2';

/**
 * @file VariedadesList.jsx
 * @description Listagem e importação do Cadastro Mestre de Variedades de Cana de Açúcar.
 * @module VariedadesList
 */

export default function VariedadesList() {
  const { user } = useAuth();
  const companyId = getActiveCompanyId();

  const rawVariedades = useLiveQuery(() => db.variedades.where('companyId').equals(companyId).toArray(), [companyId]) || [];
  const [variedades, setVariedades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Sync state whenever Dexie updates
  useEffect(() => {
    if (rawVariedades) {
        setVariedades(rawVariedades.filter(v => v.status === 'ATIVO'));
        setLoading(false);
    }
  }, [rawVariedades]);

  // State para o modal de criação/edição manual
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentVariedade, setCurrentVariedade] = useState({
      codigo: '', variedade: '', tipoMaturacao: '', inicioJanela: '', fimJanela: ''
  });

  useEffect(() => {
    let mounted = true;

    async function carregarPostgreSQL() {
      setLoading(true);
      try {
        const data = await getVariedades(companyId);
        if (mounted) {
          setVariedades((data || []).filter(v => v.status === 'ATIVO'));
        }
      } catch (error) {
        console.error('[Cadastro Geral] Erro ao carregar dados PostgreSQL:', error);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    carregarPostgreSQL();
    const unsubscribe = subscribeToVariedadesRealtime(companyId);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [companyId]);

  const handleSaveManual = async () => {
    if (!currentVariedade.variedade) {
        Swal.fire({
            title: 'Campo Obrigatório',
            text: 'O nome da Variedade é obrigatório.',
            icon: 'warning',
            background: '#121212',
            color: '#fff',
            confirmButtonColor: palette.gold
        });
        return;
    }

    // Converter para números quando pertinente para padronizar
    const payload = {
        ...currentVariedade,
        inicioJanela: currentVariedade.inicioJanela ? Number(currentVariedade.inicioJanela) : null,
        fimJanela: currentVariedade.fimJanela ? Number(currentVariedade.fimJanela) : null
    };

    await saveVariedade(payload, user?.uid || 'system', companyId);
    setIsModalOpen(false);
  };

  const handleInactivate = async (id) => {
    Swal.fire({
        title: 'Tem certeza?',
        text: "Deseja realmente inativar esta variedade?",
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
            await inactivateVariedade(id, user?.uid || 'system', companyId);
            Swal.fire({ title: 'Inativado!', text: 'Variedade inativada com sucesso.', icon: 'success', background: '#121212', color: '#fff' });
        }
    });
  };

  /**
   * Baixa a planilha modelo com os cabeçalhos esperados pelo sistema
   */
  const exportarModelo = () => {
    const ws_data = [
        ['CODIGO', 'VARIEDADE', 'TIPO_MATURACAO', 'INICIO_JANELA', 'FIM_JANELA'], // Header obrigatório na linha 1
        ['1', 'CTC ADVANA 1', 'PRECOCE', 4, 7], // Linha de exemplo 1
        ['2', 'CTC2994', 'TARDIA', 10, 12]      // Linha de exemplo 2
    ];

    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // Ajuste da largura das colunas
    const wscols = [
        { wch: 15 }, // CODIGO
        { wch: 30 }, // VARIEDADE
        { wch: 20 }, // TIPO_MATURACAO
        { wch: 15 }, // INICIO_JANELA
        { wch: 15 }  // FIM_JANELA
    ];
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Variedades");
    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const dataBlob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    saveAs(dataBlob, "Modelo_Cadastro_Variedades.xlsx");
  };

  /**
   * Processa o upload da planilha com trava de tela (SweetAlert)
   */
  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // SweetAlert interativo e bloqueador para importações que demoram
    Swal.fire({
        title: 'Importando Variedades...',
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

            // O `saveVariedadesEmMassa` vai atualizar as variedades existentes (baseado no nome uppercase) e criar as novas.
            await saveVariedadesEmMassa(json, user?.uid || 'system', companyId);

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

  const filteredVariedades = variedades.filter(v => {
      const term = searchTerm.toLowerCase();
      return (v.codigo && String(v.codigo).toLowerCase().includes(term)) ||
             (v.variedade && String(v.variedade).toLowerCase().includes(term)) ||
             (v.tipoMaturacao && String(v.tipoMaturacao).toLowerCase().includes(term));
  });

  return (
    <div className="flex flex-col h-full animate-fade-in relative min-h-0">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4 shrink-0">
        <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
                <Leaf className="w-6 h-6" style={{ color: palette.gold }} />
                Variedades de Cana
            </h2>
            <p className="text-sm text-white/50 mt-1">Gerencie a base de variedades, tipo de maturação e janela ideal.</p>
        </div>

        <div className="flex-1 max-w-md relative mx-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
                type="text"
                placeholder="Pesquisar por Código, Nome ou Maturação..."
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
                onClick={() => { setCurrentVariedade({ codigo: '', variedade: '', tipoMaturacao: '', inicioJanela: '', fimJanela: '' }); setIsModalOpen(true); }}
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
                    <th className="px-6 py-4 font-semibold">Código</th>
                    <th className="px-6 py-4 font-semibold">Variedade</th>
                    <th className="px-6 py-4 font-semibold">Tipo Maturação</th>
                    <th className="px-6 py-4 font-semibold text-center">Início Janela</th>
                    <th className="px-6 py-4 font-semibold text-center">Fim Janela</th>
                    <th className="px-6 py-4 font-semibold">Sincronia</th>
                    <th className="px-6 py-4 font-semibold text-right">Ações</th>
                </tr>
            </thead>
            <tbody>
                {variedades.length === 0 && !loading ? (
                    <tr>
                        <td colSpan="7" className="text-center py-16 text-white/40">
                            <div className="flex flex-col items-center justify-center">
                                <FileSpreadsheet className="w-12 h-12 mb-4 opacity-20" />
                                <p className="text-lg mb-2">Nenhuma variedade cadastrada no momento.</p>
                                <p className="text-sm">Baixe o modelo e importe sua planilha, ou clique em Nova.</p>
                            </div>
                        </td>
                    </tr>
                ) : filteredVariedades.length === 0 && !loading ? (
                    <tr>
                        <td colSpan="7" className="text-center py-16 text-white/40">
                            <div className="flex flex-col items-center justify-center">
                                <Search className="w-12 h-12 mb-4 opacity-20" />
                                <p className="text-lg">Nenhuma variedade encontrada com esse filtro.</p>
                            </div>
                        </td>
                    </tr>
                ) : (
                    filteredVariedades.map(v => (
                        <tr key={v.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                            <td className="px-6 py-4 font-mono text-white/80">{v.codigo || '-'}</td>
                            <td className="px-6 py-4 font-medium text-white">{v.variedade}</td>
                            <td className="px-6 py-4 text-white/70">{v.tipoMaturacao || '-'}</td>
                            <td className="px-6 py-4 text-center text-white/70">{v.inicioJanela ? `${v.inicioJanela}` : '-'}</td>
                            <td className="px-6 py-4 text-center text-white/70">{v.fimJanela ? `${v.fimJanela}` : '-'}</td>
                            <td className="px-6 py-4">
                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${v.syncStatus === 'synced' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                    {v.syncStatus === 'synced' ? 'Nuvem OK' : 'Sincronizando'}
                                </span>
                            </td>
                            <td className="px-6 py-4 flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => { setCurrentVariedade(v); setIsModalOpen(true); }}
                                    className="p-2 hover:bg-white/10 rounded-lg text-white/60 hover:text-white"
                                    title="Editar Variedade"
                                >
                                    <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => handleInactivate(v.id)}
                                    className="p-2 hover:bg-red-500/20 rounded-lg text-red-400/60 hover:text-red-400"
                                    title="Inativar Variedade"
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
            <div className="bg-[#121212] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl p-6">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <Leaf className="w-5 h-5 text-gold" style={{ color: palette.gold }} />
                    {currentVariedade.id ? 'Editar Variedade' : 'Nova Variedade'}
                </h3>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Código (Opcional)</label>
                        <input
                            value={currentVariedade.codigo}
                            onChange={(e) => setCurrentVariedade({...currentVariedade, codigo: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Ex: 1"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Variedade <span className="text-red-400">*</span></label>
                        <input
                            value={currentVariedade.variedade}
                            onChange={(e) => setCurrentVariedade({...currentVariedade, variedade: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Ex: CTC ADVANA 1"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Tipo Maturação</label>
                        <input
                            value={currentVariedade.tipoMaturacao}
                            onChange={(e) => setCurrentVariedade({...currentVariedade, tipoMaturacao: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Ex: PRECOCE"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="block text-xs font-medium text-white/50 mb-1">Início da Janela (Mês)</label>
                            <input
                                type="number" min="1" max="12"
                                value={currentVariedade.inicioJanela}
                                onChange={(e) => setCurrentVariedade({...currentVariedade, inicioJanela: e.target.value})}
                                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                                placeholder="Mês (Ex: 4)"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-white/50 mb-1">Fim da Janela (Mês)</label>
                            <input
                                type="number" min="1" max="12"
                                value={currentVariedade.fimJanela}
                                onChange={(e) => setCurrentVariedade({...currentVariedade, fimJanela: e.target.value})}
                                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                                placeholder="Mês (Ex: 7)"
                            />
                        </div>
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
                        Salvar Variedade
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
