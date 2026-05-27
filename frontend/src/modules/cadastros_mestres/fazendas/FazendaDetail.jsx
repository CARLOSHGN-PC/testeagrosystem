import { getActiveCompanyId, getActiveUserId } from '../../../services/companyContext.js';
import React, { useState, useEffect } from 'react';
import { palette } from '../../../constants/theme.js';
import { MapPin, X, Target, Info, Search, ArrowLeft, Edit2, Save } from 'lucide-react';
import { getTalhoesPorFazenda, updateTalhao } from '../../../services/cadastros_mestres/fazendas/fazendasService.js';
import db from '../../../services/localDb.js';
import { useLiveQuery } from 'dexie-react-hooks';

/**
 * @file FazendaDetail.jsx
 * @description Página inteira (Full Page) de detalhamento exibindo todos os Talhões de uma Fazenda importada (com as 45 colunas) com suporte a edição inline.
 * @module FazendaDetail
 */

export default function FazendaDetail({ fazendaId, onBack }) {
  const companyId = getActiveCompanyId();
  const authUser = getActiveUserId();

  const rawFazenda = useLiveQuery(() => db.fazendas.get(fazendaId), [fazendaId]);
  const rawTalhoes = useLiveQuery(() => db.talhoes.where('[companyId+fazendaId]').equals([companyId, fazendaId]).toArray(), [companyId, fazendaId]);

  const [fazenda, setFazenda] = useState(null);
  const [talhoes, setTalhoes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Para visualização de uma linha completa
  const [selectedTalhao, setSelectedTalhao] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Modo de Edição
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, [fazendaId]);

  const loadData = async () => {
    if (!fazendaId) return;
    setLoading(true);
    const f = await db.fazendas.get(fazendaId);
    setFazenda(f);

    const tData = await getTalhoesPorFazenda(companyId, fazendaId);
    // Ordenar logicamente pelo número do talhão se possível
    setTalhoes(tData.sort((a,b) => String(a.TALHAO).localeCompare(String(b.TALHAO), undefined, {numeric: true})));
    setLoading(false);
  };

  const handleSelectTalhao = (t) => {
      setSelectedTalhao(t);
      setIsEditing(false); // reseta modo de edição ao trocar de talhão
      setEditFormData(t);
  };

  const handleStartEdit = () => {
      setEditFormData({...selectedTalhao});
      setIsEditing(true);
  };

  const handleCancelEdit = () => {
      setIsEditing(false);
      setEditFormData({...selectedTalhao});
  };

  const handleChange = (e, field) => {
      setEditFormData(prev => ({
          ...prev,
          [field]: e.target.value
      }));
  };

  const handleSaveEdit = async () => {
      if (!selectedTalhao) return;
      setIsSaving(true);
      try {
          const updated = await updateTalhao(companyId, fazendaId, selectedTalhao.id, editFormData, authUser);
          // Atualiza a lista local
          setTalhoes(prev => prev.map(t => t.id === updated.id ? updated : t));
          setSelectedTalhao(updated);
          setIsEditing(false);
      } catch (error) {
          console.error("Erro ao salvar talhão", error);
          alert("Ocorreu um erro ao salvar os dados.");
      } finally {
          setIsSaving(false);
      }
  };

  const filteredTalhoes = talhoes.filter(t =>
      String(t.TALHAO).toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(t.VARIEDADE).toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col bg-[#0A0A0A] animate-fade-in relative z-10 w-full h-full overflow-hidden">
        {/* Cabeçalho Fixo */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-white/10 bg-black/40 shrink-0 z-30 sticky top-0 backdrop-blur-md">
            <div className="absolute inset-0 bg-gradient-to-r from-green-500/10 to-transparent pointer-events-none"></div>
            <div className="z-10 flex items-center gap-4">
                <button
                    onClick={onBack}
                    className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-white/60 hover:text-white transition-colors flex items-center gap-2 group"
                >
                    <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                    <span className="hidden sm:block text-sm font-medium">Voltar à Lista</span>
                </button>
                <div className="h-8 w-px bg-white/10 hidden sm:block"></div>
                <div>
                    <h3 className="text-xl sm:text-2xl font-bold text-white mb-1 flex items-center gap-2">
                        <MapPin className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: palette.gold }} />
                        {fazenda ? `${fazenda.codFaz} - ${fazenda.desFazenda}` : 'Carregando...'}
                    </h3>
                    <p className="text-xs sm:text-sm text-white/50">{talhoes.length} talhões cadastrados nesta unidade</p>
                </div>
            </div>
        </div>

        <div className="flex-1 flex flex-col md:flex-row relative overflow-hidden">
            {/* Lista Lateral de Talhões */}
            <div className={`w-full md:w-1/3 md:min-w-[280px] md:max-w-[350px] flex flex-col border-r border-white/10 bg-[#0A0A0A] ${selectedTalhao ? 'hidden md:flex' : 'flex'} shrink-0 h-full relative`}>
                <div className="p-4 border-b border-white/5 shrink-0 bg-[#0A0A0A] sticky top-0 z-20 backdrop-blur-md">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                        <input
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Buscar Talhão ou Variedade..."
                            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-gold transition-all"
                        />
                    </div>
                </div>

                <div className="flex-1 p-2 space-y-1 relative overflow-y-auto custom-scrollbar">
                    {loading ? (
                        <p className="p-4 text-center text-white/30 text-sm">Carregando dados...</p>
                    ) : filteredTalhoes.length === 0 ? (
                        <p className="p-4 text-center text-white/30 text-sm">Nenhum talhão encontrado.</p>
                    ) : (
                        filteredTalhoes.map(t => (
                            <button
                                key={t.id}
                                onClick={() => handleSelectTalhao(t)}
                                className={`w-full text-left p-4 rounded-xl transition-all border ${selectedTalhao?.id === t.id ? 'bg-white/10 border-white/20' : 'bg-transparent border-transparent hover:bg-white/5'}`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="font-bold text-lg text-white">T {t.TALHAO}</span>
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                                        {t.AREA_TALHAO} ha
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-xs text-white/50">
                                    <span>{t.VARIEDADE || 'Var. Mista'}</span>
                                    <span>Corte: {t.ESTAGIO}</span>
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </div>

            {/* Painel de Detalhes Principal */}
            <div className={`flex-1 bg-[#121212] relative p-4 sm:p-6 overflow-y-auto custom-scrollbar h-full ${!selectedTalhao ? 'hidden md:flex flex-col' : 'block'}`}>
                {!selectedTalhao ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white/20">
                        <Target className="w-16 h-16 mb-4 opacity-50" />
                        <p className="text-lg">Selecione um talhão na lista</p>
                        <p className="text-sm">Para visualizar e editar as informações de plantio e georreferenciamento</p>
                    </div>
                ) : (
                    <div className="animate-fade-in space-y-6 pb-8">
                        {/* Header do Talhão Selecionado */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10 shrink-0">
                            <div className="flex items-center gap-4">
                                <button onClick={() => setSelectedTalhao(null)} className="md:hidden p-2 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">
                                    <ArrowLeft className="w-5 h-5 text-white/70" />
                                </button>
                                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-xl font-bold text-white border border-white/10 shrink-0">
                                    {selectedTalhao.TALHAO}
                                </div>
                                <div>
                                    <h4 className="text-xl font-bold text-white">Talhão {selectedTalhao.TALHAO}</h4>
                                    <p className="text-sm text-white/60">Detalhes cadastrais importados</p>
                                </div>
                            </div>

                            {/* Controles de Edição */}
                            <div className="flex items-center gap-2">
                                {!isEditing ? (
                                    <button
                                        onClick={handleStartEdit}
                                        className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl border border-white/10 transition-colors text-sm font-semibold w-full sm:w-auto justify-center"
                                    >
                                        <Edit2 className="w-4 h-4" /> Editar Dados
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            onClick={handleCancelEdit}
                                            disabled={isSaving}
                                            className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl border border-red-500/20 transition-colors text-sm font-semibold flex-1 sm:flex-none text-center"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={handleSaveEdit}
                                            disabled={isSaving}
                                            className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-xl border border-transparent transition-colors text-sm font-semibold shadow-lg disabled:opacity-50 flex-1 sm:flex-none"
                                        >
                                            <Save className="w-4 h-4" /> {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Grid de Informações Densas */}
                        <div className="space-y-4">
                            {/* Bloco 1: Identificação Básica */}
                            <div className="bg-black/30 border border-white/5 rounded-2xl p-4">
                                <h5 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3 flex items-center gap-2">
                                    <Info className="w-4 h-4"/> Identificação & Localização
                                </h5>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                    <DataPoint label="Empresa" field="EMPRESA" value={editFormData.EMPRESA} isEditing={isEditing} onChange={handleChange} />
                                    <DataPoint label="Cluster" field="CLUSTER" value={editFormData.CLUSTER} isEditing={isEditing} onChange={handleChange} />
                                    <DataPoint label="Unid. Indústrial" field="UM_INDUSTRIAL" value={editFormData.UM_INDUSTRIAL} isEditing={isEditing} onChange={handleChange} />
                                    <DataPoint label="Município" field="DE_MUNICIPIO" value={editFormData.DE_MUNICIPIO} isEditing={isEditing} onChange={handleChange} />
                                    <DataPoint label="Fornecedor" field="FORNECEDOR" value={editFormData.FORNECEDOR} isEditing={isEditing} onChange={handleChange} />
                                    <DataPoint label="Tipo Propriedade" field="TIPO_PROPRIEDADE" value={editFormData.TIPO_PROPRIEDADE} isEditing={isEditing} onChange={handleChange} />
                                    <DataPoint label="Bloco" field="BLOCO" value={editFormData.BLOCO} isEditing={isEditing} onChange={handleChange} />
                                    <DataPoint label="Ocupação" field="OCUPACAO" value={editFormData.OCUPACAO} isEditing={isEditing} onChange={handleChange} />
                                    <DataPoint label="Safra (CD_SAFRA)" field="CD_SAFRA" value={editFormData.CD_SAFRA} isEditing={isEditing} onChange={handleChange} />
                                </div>
                            </div>

                            {/* Bloco 2: Agronômico */}
                            <div className="bg-black/30 border border-white/5 rounded-2xl p-4">
                                <h5 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3 flex items-center gap-2">
                                    <Info className="w-4 h-4"/> Agronômico & Plantio
                                </h5>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                    <DataPoint label="Variedade" field="VARIEDADE" value={editFormData.VARIEDADE} highlight isEditing={isEditing} onChange={handleChange} />
                                    <DataPoint label="Área (ha)" field="AREA_TALHAO" value={editFormData.AREA_TALHAO} type="number" highlight isEditing={isEditing} onChange={handleChange} />
                                    <DataPoint label="Estágio / Corte" field="ESTAGIO" value={editFormData.ESTAGIO} type="number" isEditing={isEditing} onChange={handleChange} />
                                    <DataPoint label="Tipo Solo" field="TIPO_SOLO" value={editFormData.TIPO_SOLO} isEditing={isEditing} onChange={handleChange} />

                                    <DataPoint label="Data Plantio" field="DT_PLANTIO" value={editFormData.DT_PLANTIO} isEditing={isEditing} onChange={handleChange} />
                                    <DataPoint label="Últ. Corte" field="DT_ULTCORTE" value={editFormData.DT_ULTCORTE} isEditing={isEditing} onChange={handleChange} />
                                    <DataPoint label="Espaçamento" field="DE_ESPACAMENTO" value={editFormData.DE_ESPACAMENTO} isEditing={isEditing} onChange={handleChange} />
                                    <DataPoint label="Manejo" field="MANEJO_HIPOTETICO" value={editFormData.MANEJO_HIPOTETICO} isEditing={isEditing} onChange={handleChange} />

                                    <DataPoint label="Sistema Plantio" field="SISTEMA_PLANTIO" value={editFormData.SISTEMA_PLANTIO} isEditing={isEditing} onChange={handleChange} />
                                    <DataPoint label="Ambiente" field="AMBIENTE" value={editFormData.AMBIENTE} isEditing={isEditing} onChange={handleChange} />
                                    <DataPoint label="Maturação" field="MATURACAO" value={editFormData.MATURACAO} isEditing={isEditing} onChange={handleChange} />
                                    <DataPoint label="Irrigação" field="SIST_IRRIG" value={editFormData.SIST_IRRIG} isEditing={isEditing} onChange={handleChange} />
                                </div>
                            </div>

                            {/* Bloco 3: Logística e Contratos */}
                            <div className="bg-black/30 border border-white/5 rounded-2xl p-4">
                                <h5 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3 flex items-center gap-2">
                                    <Info className="w-4 h-4"/> Logística & Contratos
                                </h5>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                    <DataPoint label="Dist. Asfalto" field="DIST_ASFALTO" value={editFormData.DIST_ASFALTO} isEditing={isEditing} onChange={handleChange} />
                                    <DataPoint label="Dist. Terra" field="DIST_TERRA" value={editFormData.DIST_TERRA} isEditing={isEditing} onChange={handleChange} />
                                    <DataPoint label="Dist. Total" field="DIST_TOTAL" value={editFormData.DIST_TOTAL} isEditing={isEditing} onChange={handleChange} />
                                    <DataPoint label="Bacia Vinhaça" field="BACIA_VINHACA" value={editFormData.BACIA_VINHACA} isEditing={isEditing} onChange={handleChange} />

                                    <DataPoint label="Início Contrato" field="INCIO_CTT" value={editFormData.INCIO_CTT} isEditing={isEditing} onChange={handleChange} />
                                    <DataPoint label="Fim Contrato" field="FIM_CTT" value={editFormData.FIM_CTT} isEditing={isEditing} onChange={handleChange} />
                                    <DataPoint label="Vencimento" field="VENC_CONTRATO" value={editFormData.VENC_CONTRATO} isEditing={isEditing} onChange={handleChange} />
                                    <DataPoint label="Devolução" field="DEVOLUCAO" value={editFormData.DEVOLUCAO} isEditing={isEditing} onChange={handleChange} />
                                </div>
                            </div>

                            {/* Bloco 4: Restrições & Certificações */}
                            <div className="bg-black/30 border border-white/5 rounded-2xl p-4">
                                <h5 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3 flex items-center gap-2">
                                    <Info className="w-4 h-4"/> Restrições & Certificações
                                </h5>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    <DataPoint label="Restrição 1" field="RESTRICAO_1" value={editFormData.RESTRICAO_1} isEditing={isEditing} onChange={handleChange} />
                                    <DataPoint label="Restrição 2" field="RESTRICAO_2" value={editFormData.RESTRICAO_2} isEditing={isEditing} onChange={handleChange} />
                                    <DataPoint label="Restrição 3" field="RESTRICAO_3" value={editFormData.RESTRICAO_3} isEditing={isEditing} onChange={handleChange} />

                                    <DataPoint label="Certificação 1" field="CERTIFICACAO_1" value={editFormData.CERTIFICACAO_1} isEditing={isEditing} onChange={handleChange} />
                                    <DataPoint label="Certificação 2" field="CERTIFICACAO_2" value={editFormData.CERTIFICACAO_2} isEditing={isEditing} onChange={handleChange} />
                                    <DataPoint label="Certificação 3" field="CERTIFICACAO_3" value={editFormData.CERTIFICACAO_3} isEditing={isEditing} onChange={handleChange} />
                                    <DataPoint label="Instituição" field="INSTITUICAO" value={editFormData.INSTITUICAO} isEditing={isEditing} onChange={handleChange} />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
}

// Mini Componente para exibição dos dados: suporta Read Mode e Edit Mode
const DataPoint = ({ label, field, value, highlight = false, isEditing = false, onChange, type = "text" }) => (
    <div className={`p-2 rounded-xl border flex flex-col justify-center ${highlight ? 'bg-white/5 border-white/10' : 'border-transparent'} ${isEditing ? 'bg-black/40 border-white/10' : ''}`}>
        <label className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-1">{label}</label>
        {isEditing ? (
            <input
                type={type}
                value={value || ''}
                onChange={(e) => onChange(e, field)}
                className="w-full bg-white/5 border border-white/20 rounded-md px-2 py-1 text-sm text-white focus:outline-none focus:border-gold transition-colors focus:bg-white/10"
            />
        ) : (
            <div className={`text-sm font-medium ${!value || value === '0' || value === 'N' ? 'text-white/30 italic' : 'text-white'} truncate`} title={value || '-'}>
                {value || '-'}
            </div>
        )}
    </div>
);
