import React, { useState, useEffect } from 'react';
import { palette } from '../../../../constants/theme.js';
import { Beaker, Plus, Trash2, Save, X, Settings2 } from 'lucide-react';
import { getProtocoloItens, getProtocoloOperacoes, saveProtocolo, getProtocolos } from '../../../../services/premissas/tratos_culturais/tratosCulturaisService.js';
import { getOperacoes } from '../../../../services/cadastros_mestres/operacoesService.js';
import Swal from 'sweetalert2';
import { getInsumos } from '../../../../services/cadastros_mestres/insumosService.js';
import Select from 'react-select';
import db from '../../../../services/localDb.js';
import { useAuth } from '../../../../hooks/useAuth.js';
import { showError, showSuccess } from '../../../../utils/alert.js';

/**
 * @file ProtocoloFormModal.jsx
 * @description Formulário para criação/edição de Protocolo (Guarda-chuva) com suas Operações e Produtos.
 * @module ProtocoloFormModal
 */

export default function ProtocoloFormModal({ protocoloId, onClose, onSaveSuccess }) {
  const { user } = useAuth();
  const companyId = JSON.parse(localStorage.getItem('@AgroSystem:auth'))?.companyId || "AgroSystem_Demo";

  // Estado do Protocolo (Capa / Guarda-chuva)
  const [protocolo, setProtocolo] = useState({ nome: '', observacoesTecnicas: '', status: 'ATIVO', subProtocolos: ['Protocolo I'] });

  // Listas internas do Protocolo
  const [operacoes, setOperacoes] = useState([]);
  const [itens, setItens] = useState([]); // Produtos

  // Estado UI
  const [activeSubProtocolo, setActiveSubProtocolo] = useState('Protocolo I');

  // Catálogos Mestres
  const [produtosDisponiveis, setProdutosDisponiveis] = useState([]);
  const [operacoesDisponiveis, setOperacoesDisponiveis] = useState([]);

  useEffect(() => {
    loadData();

    // Adiciona listener para garantir que o formulário atualiza
    // se alguém editar e salvar o mesmo protocolo de outra aba/dispositivo
    const handleDbChange = () => {
        if (protocoloId) loadData();
    };
    window.addEventListener('sync-completed', handleDbChange);

    return () => {
        window.removeEventListener('sync-completed', handleDbChange);
    };
  }, [protocoloId]); // Re-carrega se o ID mudar

  const loadData = async () => {
    const ops = await getOperacoes(companyId);
    setOperacoesDisponiveis(ops.filter(o => o.status === 'ATIVO'));

    const insumos = await getInsumos(companyId);
    setProdutosDisponiveis(insumos.filter(i => i.status === 'ATIVO'));

    if (protocoloId) {
        const pCapa = await db.protocolos.get(protocoloId);
        if (pCapa) setProtocolo(pCapa);

        const pOps = await getProtocoloOperacoes(protocoloId);
        setOperacoes(pOps.sort((a,b) => a.ordem - b.ordem));

        const pItens = await getProtocoloItens(protocoloId);
        // Garante que itens antigos que não tem subProtocolo caiam no Protocolo I
        const itensComSub = pItens.map(i => ({...i, subProtocolo: i.subProtocolo || 'Protocolo I'}));
        setItens(itensComSub.sort((a,b) => a.ordem - b.ordem));

        // Atualiza a lista de sub-protocolos baseado nos itens
        if (pCapa && pCapa.subProtocolos && pCapa.subProtocolos.length > 0) {
            setActiveSubProtocolo(pCapa.subProtocolos[0]);
        } else {
            const subsExistentes = [...new Set(itensComSub.map(i => i.subProtocolo))];
            if (subsExistentes.length > 0) {
                setProtocolo(prev => ({...prev, subProtocolos: subsExistentes}));
                setActiveSubProtocolo(subsExistentes[0]);
            }
        }
    }
  };

  // --- Handlers para Operações ---
  const addOperacao = () => {
      setOperacoes([...operacoes, { id: `temp-op-${Date.now()}`, operacaoId: '', nome: '', status: 'ATIVO', ordem: operacoes.length + 1 }]);
  };

  const updateOperacao = (index, field, value) => {
      const newOps = [...operacoes];
      newOps[index][field] = value;
      setOperacoes(newOps);
  };

  const removeOperacao = (index) => {
      const newOps = operacoes.filter((_, i) => i !== index);
      newOps.forEach((op, i) => op.ordem = i + 1);
      setOperacoes(newOps);
  };

  // --- Handlers para Sub-Protocolos ---
  const numberToRoman = (num) => {
      const roman = { M: 1000, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1 };
      let str = '';
      for (let i of Object.keys(roman)) {
          let q = Math.floor(num / roman[i]);
          num -= q * roman[i];
          str += i.repeat(q);
      }
      return str;
  };

  const addSubProtocolo = () => {
      const currentSubs = protocolo.subProtocolos || ['Protocolo I'];
      const nextNum = currentSubs.length + 1;
      const nextName = `Protocolo ${numberToRoman(nextNum)}`;
      const newSubs = [...currentSubs, nextName];
      setProtocolo({ ...protocolo, subProtocolos: newSubs });
      setActiveSubProtocolo(nextName);
  };

  // --- Handlers para Produtos (Itens) ---
  const addItem = () => {
      setItens([...itens, { id: `temp-item-${Date.now()}`, insumoId: '', dosagem: '', unidadeMedidaId: '', subProtocolo: activeSubProtocolo, status: 'ATIVO', ordem: itens.length + 1 }]);
  };

  const updateItem = (id, field, value) => {
      const newItens = itens.map(item => {
          if (item.id === id) {
              return { ...item, [field]: value };
          }
          return item;
      });
      setItens(newItens);
  };

  const removeItem = (id) => {
      const newItens = itens.filter(item => item.id !== id);
      // Reordena apenas os do mesmo sub-protocolo (opcional, mas bom pra manter a ordem visual)
      let ordem = 1;
      newItens.forEach(item => {
          if (item.subProtocolo === activeSubProtocolo) {
              item.ordem = ordem++;
          }
      });
      setItens(newItens);
  };

  // Filtra itens pelo sub-protocolo ativo
  const activeItens = itens.filter(item => item.subProtocolo === activeSubProtocolo);

  // Estilo customizado escuro para o react-select
  const customSelectStyles = {
    control: (provided, state) => ({
      ...provided,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      borderColor: state.isFocused ? palette.gold : 'rgba(255, 255, 255, 0.1)',
      borderRadius: '0.5rem',
      boxShadow: 'none',
      '&:hover': {
        borderColor: state.isFocused ? palette.gold : 'rgba(255, 255, 255, 0.2)'
      },
      minHeight: '42px',
      padding: '0'
    }),
    valueContainer: (provided) => ({
        ...provided,
        padding: '0 12px'
    }),
    input: (provided) => ({
        ...provided,
        color: 'white',
        margin: '0',
        padding: '0'
    }),
    singleValue: (provided) => ({
      ...provided,
      color: 'white',
      fontSize: '0.875rem' // text-sm
    }),
    menu: (provided) => ({
      ...provided,
      backgroundColor: '#1E1E1E',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      zIndex: 9999
    }),
    option: (provided, state) => ({
      ...provided,
      backgroundColor: state.isSelected ? palette.gold : state.isFocused ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
      color: state.isSelected ? 'black' : 'white',
      fontSize: '0.875rem',
      cursor: 'pointer',
      '&:active': {
        backgroundColor: palette.gold,
      }
    }),
    placeholder: (provided) => ({
        ...provided,
        color: 'rgba(255,255,255,0.4)',
        fontSize: '0.875rem'
    })
  };

  // --- Salvar ---
  const handleSave = async () => {
      if (!protocolo.nome) {
          showError('Atenção', 'Preencha o Nome do Protocolo/Receita.');
          return;
      }

      for (const op of operacoes) {
          if (!op.operacaoId) {
              showError('Atenção', 'Todas as Operações devem ter uma operação selecionada.');
              return;
          }
      }

      for (const item of itens) {
          if (!(item.insumoId || item.produtoId) || !item.dosagem) {
              showError('Atenção', 'Todos os produtos da receita devem ter Produto e Dosagem definidos.');
              return;
          }
      }

      try {
          await saveProtocolo(protocolo, operacoes, itens, user?.uid || 'system', companyId);
          showSuccess('Sucesso', 'Protocolo salvo com sucesso!');
          onSaveSuccess();
      } catch (error) {
          console.error("Erro ao salvar protocolo:", error);
          showError('Erro', 'Ocorreu um erro ao salvar o protocolo.');
      }
  };

  return (
    <div className="flex flex-col h-full bg-[#121212] animate-slide-in">
        {/* Cabeçalho Fixo */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-black/40 sticky top-0 z-20">
            <div>
                <h3 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
                    <Beaker className="w-6 h-6" style={{ color: palette.gold }} />
                    {protocoloId ? 'Editar Protocolo e Receita' : 'Novo Protocolo'}
                </h3>
                <p className="text-sm text-white/50">Configure o cabeçalho, as operações e os produtos da mistura</p>
            </div>
            <div className="flex items-center gap-3">
                <button onClick={onClose} className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-white/60 hover:text-white transition-colors">
                    <X className="w-5 h-5" />
                </button>
            </div>
        </div>

        {/* Corpo (Scrollable Principal) */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-8">

            {/* Seção 1: Capa do Protocolo */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <h4 className="font-semibold text-white/80 border-b border-white/10 pb-2 mb-4">Dados da Receita (Protocolo)</h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Nome do Protocolo *</label>
                        <input
                            value={protocolo.nome}
                            onChange={(e) => setProtocolo({...protocolo, nome: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold transition-all"
                            placeholder="Ex: 1º Vegetativo - Aplicação Aérea"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Status</label>
                        <select
                            value={protocolo.status}
                            onChange={(e) => setProtocolo({...protocolo, status: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold transition-all appearance-none"
                        >
                            <option value="ATIVO">Ativo</option>
                            <option value="INATIVO">Inativo</option>
                        </select>
                    </div>

                    <div className="md:col-span-2 flex flex-col md:flex-row gap-4">
                        <div className="flex-1">
                            <label className="block text-xs font-medium text-white/50 mb-1">Observações Técnicas</label>
                            <textarea
                                value={protocolo.observacoesTecnicas}
                                onChange={(e) => setProtocolo({...protocolo, observacoesTecnicas: e.target.value})}
                                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold transition-all resize-none h-20"
                                placeholder="Instruções gerais, restrições climáticas..."
                            />
                        </div>

                        {/* Seletor de Sub-Protocolos (Etapas) */}
                        <div className="w-full md:w-1/3 flex flex-col justify-end pb-1">
                            <label className="block text-xs font-medium text-white/50 mb-1">Etapa / Sub-Protocolo</label>
                            <div className="flex gap-2">
                                <select
                                    value={activeSubProtocolo}
                                    onChange={(e) => setActiveSubProtocolo(e.target.value)}
                                    className="flex-1 bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold transition-all appearance-none"
                                >
                                    {(protocolo.subProtocolos || ['Protocolo I']).map(sub => (
                                        <option key={sub} value={sub}>{sub}</option>
                                    ))}
                                </select>
                                <button
                                    onClick={addSubProtocolo}
                                    className="px-4 py-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-white font-semibold flex items-center gap-1 transition-colors"
                                    title="Adicionar nova etapa (Protocolo II, III...)"
                                >
                                    <Plus className="w-4 h-4" /> Add
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[500px] min-h-[500px]">

                {/* Seção 2: Operações Vinculadas */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col h-full">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 border-b border-white/10 pb-4 gap-4 shrink-0">
                        <div>
                            <h4 className="font-semibold text-white flex items-center gap-2">
                                <Settings2 className="w-5 h-5 opacity-70"/> Operações
                            </h4>
                            <p className="text-xs text-white/50 mt-1">Quais operações compõem esta receita?</p>
                        </div>
                        <button onClick={addOperacao} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-white/10 hover:bg-white/20 text-white transition-all border border-white/10 shrink-0">
                            <Plus className="w-4 h-4" /> Add Operação
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2">
                        {operacoes.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center text-white/30 p-4 border border-dashed border-white/5 rounded-xl">
                                <p className="text-sm">Nenhuma operação adicionada.</p>
                            </div>
                        ) : (
                            operacoes.map((op, index) => (
                                <div key={op.id} className={`flex flex-col sm:flex-row gap-3 bg-black/40 border p-3 rounded-xl items-center ${op.status === 'INATIVO' ? 'border-red-500/20 opacity-60' : 'border-white/10'}`}>
                                    <div className="flex-1 w-full text-left">
                                        <Select
                                            styles={customSelectStyles}
                                            placeholder="Pesquise ou selecione a Operação..."
                                            value={
                                                op.operacaoId ? {
                                                    value: op.operacaoId,
                                                    label: `${operacoesDisponiveis.find(o => o.id === op.operacaoId)?.cdOperacao || operacoesDisponiveis.find(o => o.id === op.operacaoId)?.cd0peracao || ''} - ${operacoesDisponiveis.find(o => o.id === op.operacaoId)?.deOperacao || operacoesDisponiveis.find(o => o.id === op.operacaoId)?.de0peracao || ''}`
                                                } : null
                                            }
                                            onChange={(selectedOption) => {
                                                if (!selectedOption) {
                                                    updateOperacao(index, 'operacaoId', '');
                                                    updateOperacao(index, 'nome', '');
                                                    return;
                                                }
                                                const val = selectedOption.value;
                                                updateOperacao(index, 'operacaoId', val);
                                                const selectedOp = operacoesDisponiveis.find(o => o.id === val);
                                                if (selectedOp) {
                                                    const cd = selectedOp.cdOperacao || selectedOp.cd0peracao || '';
                                                    const de = selectedOp.deOperacao || selectedOp.de0peracao || '';
                                                    updateOperacao(index, 'nome', `${cd} - ${de}`);
                                                }
                                            }}
                                            options={operacoesDisponiveis
                                                .filter(o => {
                                                    const isAlreadySelected = operacoes.some((otherOp, otherIndex) => otherIndex !== index && otherOp.operacaoId === o.id);
                                                    return !isAlreadySelected;
                                                })
                                                .map(o => ({
                                                    value: o.id,
                                                    label: `${o.cdOperacao || o.cd0peracao || ''} - ${o.deOperacao || o.de0peracao || ''}`
                                                }))
                                            }
                                            isClearable
                                            noOptionsMessage={() => "Nenhuma operação encontrada"}
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0 justify-end">
                                        <select
                                            value={op.status}
                                            onChange={(e) => updateOperacao(index, 'status', e.target.value)}
                                            className="bg-black/50 border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none"
                                        >
                                            <option value="ATIVO">Ativo</option>
                                            <option value="INATIVO">Desativado</option>
                                        </select>
                                        <button onClick={() => removeOperacao(index)} className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg" title="Remover Operação">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Seção 3: Receituário / Produtos */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col h-full">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 border-b border-white/10 pb-4 gap-4 shrink-0">
                        <div>
                            <h4 className="font-semibold text-white flex items-center gap-2">
                                <Beaker className="w-5 h-5 opacity-70"/> Produtos - {activeSubProtocolo}
                            </h4>
                            <p className="text-xs text-white/50 mt-1">Produtos utilizados nesta etapa da receita</p>
                        </div>
                        <button onClick={addItem} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-white/10 hover:bg-white/20 text-white transition-all border border-white/10 shrink-0">
                            <Plus className="w-4 h-4" /> Add Produto
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2">
                        {activeItens.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center text-white/30 p-4 border border-dashed border-white/5 rounded-xl">
                                <p className="text-sm">Nenhum produto adicionado em <b>{activeSubProtocolo}</b>.</p>
                            </div>
                        ) : (
                            activeItens.map((item) => {
                                const selectedProduto = produtosDisponiveis.find(p => p.id === (item.insumoId || item.produtoId));
                                let displayedPrice = '';
                                if (selectedProduto) {
                                    const vlrString = (selectedProduto.vlrUnit || '').toString().trim();
                                    const parsedPrice = parseFloat(vlrString.replace(',', '.'));
                                    if (!isNaN(parsedPrice) && parsedPrice > 0) {
                                        displayedPrice = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parsedPrice);
                                    }
                                }

                                return (
                                    <div key={item.id} className={`flex flex-col gap-3 bg-black/40 border p-3 rounded-xl ${item.status === 'INATIVO' ? 'border-red-500/20 opacity-60' : 'border-white/10'}`}>
                                        <div className="flex flex-col sm:flex-row gap-3 w-full items-center">
                                            <div className="flex-1 w-full text-left">
                                                <Select
                                                    styles={customSelectStyles}
                                                    placeholder="Pesquise o Produto (Mestre)..."
                                                    value={
                                                        (item.insumoId || item.produtoId) ? {
                                                            value: item.insumoId || item.produtoId,
                                                            label: `${produtosDisponiveis.find(p => p.id === (item.insumoId || item.produtoId))?.codInsumo || ''} - ${produtosDisponiveis.find(p => p.id === (item.insumoId || item.produtoId))?.descInsumo || ''} ${produtosDisponiveis.find(p => p.id === (item.insumoId || item.produtoId))?.und ? `(${produtosDisponiveis.find(p => p.id === (item.insumoId || item.produtoId))?.und})` : ''}`
                                                        } : null
                                                    }
                                                    onChange={(selectedOption) => {
                                                        updateItem(item.id, 'insumoId', selectedOption ? selectedOption.value : '');
                                                    }}
                                                    options={produtosDisponiveis.map(p => ({
                                                        value: p.id,
                                                        label: `${p.codInsumo} - ${p.descInsumo} ${p.und ? `(${p.und})` : ''}`
                                                    }))}
                                                    isClearable
                                                    noOptionsMessage={() => "Nenhum produto encontrado"}
                                                />
                                            </div>
                                            {/* Preço Unitário Display (readonly) */}
                                            <div className="w-full sm:w-28 shrink-0">
                                                <div className="w-full bg-white/5 border border-white/5 rounded-lg px-3 py-2.5 text-sm text-white/50 text-right h-[42px] flex items-center justify-end overflow-hidden whitespace-nowrap" title="Valor Unitário">
                                                    {displayedPrice || '-'}
                                                </div>
                                            </div>
                                            {/* Dose Input */}
                                            <div className="w-full sm:w-24 shrink-0">
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    value={item.dosagem}
                                                    onChange={(e) => updateItem(item.id, 'dosagem', e.target.value)}
                                                    className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-gold"
                                                    placeholder="Dose"
                                                />
                                            </div>
                                            {/* Actions */}
                                            <div className="flex items-center gap-2 justify-end w-full sm:w-auto shrink-0">
                                                <select
                                                    value={item.status}
                                                    onChange={(e) => updateItem(item.id, 'status', e.target.value)}
                                                    className="bg-black/50 border border-white/10 rounded-lg px-2 py-2.5 text-xs text-white focus:outline-none"
                                                >
                                                    <option value="ATIVO">Ativ.</option>
                                                    <option value="INATIVO">Desat.</option>
                                                </select>
                                                <button onClick={() => removeItem(item.id)} className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

            </div>
        </div>

        {/* Rodapé Fixo (Ações) */}
        <div className="p-6 border-t border-white/10 bg-black/60 backdrop-blur-md flex justify-end gap-3 sticky bottom-0 z-20 shrink-0">
            <button
                onClick={onClose}
                className="px-6 py-3 rounded-xl font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors"
            >
                Cancelar
            </button>
            <button
                onClick={handleSave}
                className="px-6 py-3 rounded-xl font-semibold text-black transition-transform hover:scale-[1.02] flex items-center gap-2 shadow-lg"
                style={{ background: palette.gold, boxShadow: "0 0 20px rgba(212,175,55,0.2)" }}
            >
                <Save className="w-5 h-5" /> Salvar Protocolo
            </button>
        </div>
    </div>
  );
}
