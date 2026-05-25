import { getActiveCompanyId } from '../../../services/companyContext.js';
import React, { useState, useEffect } from 'react';
import { palette } from '../../../constants/theme.js';
import { Download, Upload, MapPin, Eye, FileSpreadsheet, Search, Edit } from 'lucide-react';
import { getFazendas, replaceFazendasAndTalhoes, subscribeToFazendasRealtime, subscribeToTalhoesRealtime } from '../../../services/cadastros_mestres/fazendas/fazendasService.js';
import { useAuth } from '../../../hooks/useAuth.js';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../../services/localDb.js';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import FazendaDetail from './FazendaDetail.jsx';
import EditFazendaModal from './EditFazendaModal.jsx';

/**
 * @file FazendasList.jsx
 * @description Listagem Mestra do Cadastro Geral de Fazendas e Ferramenta de Importação via Excel.
 * @module FazendasList
 */

// Todas as 45 colunas exigidas pelo modelo do Cadastro Geral (Mestre de Fazendas)
const CABECALHO_MODELO = [
  "CLUSTER", "EMPRESA", "MOD_ADM", "UM_INDUSTRIAL", "CD_SAFRA", "TIPO_PROPRIEDADE",
  "CD_EMPRESA", "COD_FAZ", "DES_FAZENDA", "BLOCO", "TALHAO", "AREA_TALHAO",
  "ESTAGIO", "VARIEDADE", "AMBIENTE", "FORNECEDOR", "DE_MUNICIPIO", "OCUPACAO",
  "DE_ESPACAMENTO", "TIPO_SOLO", "DT_PLANTIO", "DT_ULTCORTE", "SISTEMA_PLANTIO",
  "DIST_TERRA", "DIST_ASFALTO", "DIST_TOTAL", "SIST_IRRIG", "MATURACAO",
  "INSTITUICAO", "MANEJO_HIPOTETICO", "INCIO_CTT", "FIM_CTT", "VENC_CONTRATO",
  "EXPANSAO", "REF_PLANEJADA", "REF_CONFIRMADA", "DEVOLUCAO", "BACIA_VINHACA",
  "PAV", "RESTRICAO_1", "RESTRICAO_2", "RESTRICAO_3", "CERTIFICACAO_1",
  "CERTIFICACAO_2", "CERTIFICACAO_3"
];

export default function FazendasList() {
  const { user } = useAuth();
  const companyId = getActiveCompanyId();

  const rawFazendas = useLiveQuery(() => db.fazendas.where('companyId').equals(companyId).toArray(), [companyId]) || [];
  const [fazendas, setFazendas] = useState([]);
  const [loading, setLoading] = useState(true);

  // Sync state whenever Dexie updates
  useEffect(() => {
    if (rawFazendas) {
        const sortedFazendas = [...rawFazendas].sort((a, b) => {
            const codA = parseInt(a.codFaz, 10);
            const codB = parseInt(b.codFaz, 10);
            if (!isNaN(codA) && !isNaN(codB)) {
                return codA - codB;
            }
            return String(a.codFaz).localeCompare(String(b.codFaz), undefined, { numeric: true });
        });
        setFazendas(sortedFazendas);
        setLoading(false);
    }
  }, [rawFazendas]);
  const [isImporting, setIsImporting] = useState(false);

  // O que este estado faz: Armazena o termo de busca digitado pelo usuário para filtrar a lista de fazendas.
  // Por que ele existe: Para que o usuário possa encontrar facilmente uma fazenda pelo código ou descrição, caso precise editá-la manualmente no futuro.
  const [searchTerm, setSearchTerm] = useState('');

  // Navegação e Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentFazendaId, setCurrentFazendaId] = useState(null);

  // O que este estado faz: Controla se estamos na visão de lista ou na visão de detalhes (tela cheia)
  // Por que ele existe: Para alternar as views sem a necessidade do react-router-dom, já que essa seção inteira renderiza condicionalmente dentro do main App.
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'detail'

  useEffect(() => {
    loadData();

      const unsubFazendas = subscribeToFazendasRealtime(companyId);
      const unsubTalhoes = subscribeToTalhoesRealtime(companyId);

      return () => {
          unsubFazendas();
          unsubTalhoes();
      };
  }, [companyId]);

  const loadData = async () => {
    setLoading(true);
    const dataFazendas = await getFazendas(companyId);

    const sortedFazendas = dataFazendas.sort((a, b) => {
        const codA = parseInt(a.codFaz, 10);
        const codB = parseInt(b.codFaz, 10);
        if (!isNaN(codA) && !isNaN(codB)) {
            return codA - codB;
        }
        return String(a.codFaz).localeCompare(String(b.codFaz), undefined, { numeric: true });
    });

    setFazendas(sortedFazendas);
    setLoading(false);
  };

  const exportarModelo = () => {
    const ws = XLSX.utils.aoa_to_sheet([CABECALHO_MODELO]);

    // Configurar a largura das colunas para melhor visualização
    const wscols = CABECALHO_MODELO.map(() => ({ wch: 20 }));
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cadastro Geral");
    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const data = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    saveAs(data, "Modelo_Cadastro_Geral_AgroSystem.xlsx");
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            // Usamos raw: true para que as datas venham como objetos Date reais ou números seriais, não strings pré-formatadas incorretamente
            const json = XLSX.utils.sheet_to_json(firstSheet, { defval: "", raw: true });


            if (json.length === 0) {
                alert("Planilha vazia ou com formato inválido.");
                setIsImporting(false);
                return;
            }

            // Agrupar todas as linhas da planilha por COD_FAZ para iterar de forma eficiente
            const fazendasGrouped = {};

            // Converter objetos Date do JS ou Números Seriais em strings DD/MM/YYYY estritas
            const formatDateForDB = (val) => {
                if (!val) return "";

                let dateObj = null;

                // Se o XLSX nos entregou um objeto Date real (graças ao cellDates: true)
                if (val instanceof Date) {
                    dateObj = val;
                }
                // Se o XLSX nos entregou o número serial (ex: 48579)
                else if (typeof val === 'number') {
                    // 25569 é o offset entre 1900 (Excel) e 1970 (Unix)
                    const utc_days = Math.floor(val - 25569);
                    const utc_value = utc_days * 86400;
                    dateObj = new Date(utc_value * 1000);
                    // Como a data é UTC, evitamos o problema de fuso ajustando para a hora local "neutra"
                    dateObj = new Date(dateObj.getTime() + (dateObj.getTimezoneOffset() * 60000));
                }
                // Se por acaso veio string suja (ex: "8/31/29" ou "2029-08-31" ou já formatada "31/08/2029")
                else if (typeof val === 'string') {
                    // Já é DD/MM/YYYY
                    if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) return val;

                    // Se veio do tipo M/D/YY ou MM/DD/YYYY, forçamos um parse padrão do JS (CUIDADO com formatação americana MM/DD vs DD/MM,
                    // mas assumindo que o browser lerá e formataremos na marra).
                    // Para garantir, confiamos primariamente no cellDates = true ou número, mas tentamos o Date.parse como fallback:
                    const parsedDate = new Date(val);
                    if (!isNaN(parsedDate.getTime())) {
                        dateObj = parsedDate;
                    } else {
                        return val; // Devolve como está se não der parse
                    }
                }

                if (dateObj && !isNaN(dateObj.getTime())) {
                    // Para datas vindas do XLSX (que são geradas como UTC meia-noite),
                    // precisamos usar getUTCDate para evitar que fusos negativos (ex: Brasil UTC-3)
                    // voltem o dia para o final da tarde do dia anterior.
                    const d = String(dateObj.getUTCDate()).padStart(2, '0');
                    const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
                    const y = dateObj.getUTCFullYear();
                    return `${d}/${m}/${y}`;
                }

                return String(val);
            };

            json.forEach(row => {
                const codFaz = row['COD_FAZ'];
                if (codFaz !== undefined && codFaz !== "") {
                    if (!fazendasGrouped[codFaz]) {
                        fazendasGrouped[codFaz] = {
                            COD_FAZ: codFaz,
                            DES_FAZENDA: row['DES_FAZENDA'],
                            talhoes: []
                        };
                    }

                    // Ajuste explícito nas colunas de data solicitadas
                    const talhaoLimpo = { ...row };
                    if (talhaoLimpo['DT_ULTCORTE']) talhaoLimpo['DT_ULTCORTE'] = formatDateForDB(talhaoLimpo['DT_ULTCORTE']);
                    if (talhaoLimpo['DT_PLANTIO']) talhaoLimpo['DT_PLANTIO'] = formatDateForDB(talhaoLimpo['DT_PLANTIO']);
                    if (talhaoLimpo['VENC_CONTRATO']) talhaoLimpo['VENC_CONTRATO'] = formatDateForDB(talhaoLimpo['VENC_CONTRATO']);

                    fazendasGrouped[codFaz].talhoes.push(talhaoLimpo);
                }
            });

            // Modo substituição total: apaga fazendas/talhões antigos da empresa no PostgreSQL e importa somente a planilha atual.
            const allTalhoes = Object.values(fazendasGrouped).flatMap((grupo) => grupo.talhoes);
            const result = await replaceFazendasAndTalhoes(allTalhoes, user?.uid || 'system', companyId);

            alert(`Importação concluída com sucesso! ${result?.farms || Object.keys(fazendasGrouped).length} fazendas e ${result?.fields || allTalhoes.length} talhões substituídos no banco.`);
            loadData();
        } catch (error) {
            console.error("Erro na importação:", error);
            alert("Ocorreu um erro ao ler a planilha. Verifique o formato do arquivo.");
        } finally {
            setIsImporting(false);
            e.target.value = null; // Reseta o input
        }
    };
    reader.readAsArrayBuffer(file);
  };

  const filteredFazendas = fazendas.filter(f => {
      const term = searchTerm.toLowerCase();
      return (f.codFaz && String(f.codFaz).toLowerCase().includes(term)) ||
             (f.desFazenda && String(f.desFazenda).toLowerCase().includes(term));
  });

  return (
    <div className="flex flex-col h-full animate-fade-in relative min-h-0">

      {/* Overlay Full-Screen para o Detalhe da Fazenda (Talhões) */}
      {viewMode === 'detail' && currentFazendaId && (
        <div className="fixed inset-0 top-16 z-[100] bg-[#121212] flex flex-col overflow-hidden animate-slide-in">
            <FazendaDetail fazendaId={currentFazendaId} onBack={() => { setViewMode('list'); loadData(); }} />
        </div>
      )}

      {/* Lista Principal (Fica por baixo do Overlay) */}
      <div className={`flex flex-col h-full ${viewMode === 'detail' ? 'hidden' : ''}`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4 shrink-0">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
                <MapPin className="w-6 h-6" style={{ color: palette.gold }} />
                Fazendas Cadastradas
            </h2>
            <p className="text-sm text-white/50 mt-1">Base mestre de propriedades e talhões (via planilha)</p>
        </div>

        <div className="flex-1 max-w-md relative mx-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
                type="text"
                placeholder="Pesquisar por Código ou Fazenda..."
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
                <Download className="w-4 h-4" /> Baixar Modelo (Excel)
            </button>
            <label className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-black transition-all shadow-lg cursor-pointer ${isImporting ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}`} style={{ background: palette.gold }}>
                <Upload className="w-4 h-4" />
                {isImporting ? 'Importando...' : 'Importar Planilha'}
                <input
                    type="file"
                    accept=".xlsx, .xls"
                    className="hidden"
                    onChange={handleImport}
                    disabled={isImporting}
                />
            </label>
        </div>
      </div>

      <div className="flex-1 rounded-2xl border border-white/5 bg-[#0A0A0A] overflow-y-auto custom-scrollbar relative">
        <table className="w-full text-left text-sm">
            <thead className="bg-black/80 text-white/50 border-b border-white/5 z-20 sticky top-0 backdrop-blur-md">
                <tr>
                    <th className="px-6 py-4 font-semibold">Código da Fazenda</th>
                    <th className="px-6 py-4 font-semibold">Nome / Descrição</th>
                    <th className="px-6 py-4 font-semibold">Status de Sincronia</th>
                    <th className="px-6 py-4 font-semibold text-right">Ver Detalhes</th>
                </tr>
            </thead>
            <tbody>
                {fazendas.length === 0 && !loading ? (
                    <tr>
                        <td colSpan="4" className="text-center py-16 text-white/40">
                            <div className="flex flex-col items-center justify-center">
                                <FileSpreadsheet className="w-12 h-12 mb-4 opacity-20" />
                                <p className="text-lg mb-2">Nenhuma fazenda cadastrada no momento.</p>
                                <p className="text-sm">Baixe o modelo e importe sua planilha para começar.</p>
                            </div>
                        </td>
                    </tr>
                ) : filteredFazendas.length === 0 && !loading ? (
                    <tr>
                        <td colSpan="4" className="text-center py-16 text-white/40">
                            <div className="flex flex-col items-center justify-center">
                                <Search className="w-12 h-12 mb-4 opacity-20" />
                                <p className="text-lg">Nenhuma fazenda encontrada com esse filtro.</p>
                            </div>
                        </td>
                    </tr>
                ) : (
                    filteredFazendas.map(f => (
                        <tr key={f.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                            <td className="px-6 py-4 font-mono text-white/80">{f.codFaz}</td>
                            <td className="px-6 py-4 font-medium text-white">{f.desFazenda}</td>
                            <td className="px-6 py-4">
                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${f.syncStatus === 'synced' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                    {f.syncStatus === 'synced' ? 'Nuvem OK' : 'Sincronizando...'}
                                </span>
                            </td>
                            <td className="px-6 py-4 flex items-center justify-end gap-2">
                                <button
                                    onClick={() => { setCurrentFazendaId(f.id); setIsEditModalOpen(true); }}
                                    className="p-2 hover:bg-white/10 rounded-xl text-white/60 hover:text-blue-400 flex items-center transition-all border border-transparent group-hover:border-white/10"
                                    title="Editar Fazenda"
                                >
                                    <Edit className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => { setCurrentFazendaId(f.id); setViewMode('detail'); }}
                                    className="p-2 hover:bg-white/10 rounded-xl text-white/60 hover:text-white flex items-center gap-2 transition-all border border-transparent group-hover:border-white/10"
                                >
                                    <span className="text-xs font-semibold uppercase tracking-wider hidden sm:block">Consultar Talhões</span>
                                    <Eye className="w-4 h-4" />
                                </button>
                            </td>
                        </tr>
                    ))
                )}
            </tbody>
        </table>
      </div>

        {isEditModalOpen && (
          <EditFazendaModal
              fazendaId={currentFazendaId}
              onClose={() => setIsEditModalOpen(false)}
              onSave={() => {
                  setIsEditModalOpen(false);
                  loadData();
              }}
          />
        )}
      </div>
    </div>
  );
}
