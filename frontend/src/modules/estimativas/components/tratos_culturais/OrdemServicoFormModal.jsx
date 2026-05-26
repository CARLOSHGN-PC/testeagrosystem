import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { palette } from '../../../../constants/theme';
import { Layers, AlertTriangle, Info, ListChecks, Check, X, Map, Trash2, Plus } from 'lucide-react';
import Select from 'react-select';
import db from '../../../../services/localDb';
import { getDiretrizVinhaca, calculateVinhacaResumoTalhao } from '../../../../services/premissas/tratos_culturais/diretrizVinhacaService';
import { getProtocolos } from '../../../../services/premissas/tratos_culturais/tratosCulturaisService';

export const OrdemServicoFormModal = ({ isOpen, onClose, onConfirm, talhoesCount, totalArea, companyId, selectedTalhoesNomes, planningMode = false, selectedTalhoesData = [], selectedOperacaoContext = null }) => {
    const [protocolosDisponiveis, setProtocolosDisponiveis] = useState([]);
    const [protocoloOperacoes, setProtocoloOperacoes] = useState([]);
    const [produtosMestre, setProdutosMestre] = useState([]);

    const [selectedOperacao, setSelectedOperacao] = useState(null); // Agora armazena o Protocolo Mestre
    const [selectedProtocolo, setSelectedProtocolo] = useState(null); // Agora armazena o SubProtocolo selecionado
    const [subprotocolosDisponiveis, setSubprotocolosDisponiveis] = useState([]);
    const [protocoloItens, setProtocoloItens] = useState([]);
    const [originalItensMap, setOriginalItensMap] = useState({});
    const [isModified, setIsModified] = useState(false);
    const [justificativa, setJustificativa] = useState('');
    const [diretrizVinhaca, setDiretrizVinhaca] = useState(null);

    // activeSubProtocolo é agora o mesmo que selectedProtocolo (sub-protocolo)
    const activeSubProtocolo = selectedProtocolo ? selectedProtocolo.value : null;

    useEffect(() => {
        if (isOpen) {
            carregarDadosBasicos();
            // Reset state
            setSelectedOperacao(planningMode ? selectedOperacaoContext : null);
            setSelectedProtocolo(null);
            setSubprotocolosDisponiveis([]);
            setProtocoloItens([]);
            setIsModified(false);
            setOriginalItensMap({});
            setDiretrizVinhaca(null);
        }
    }, [isOpen, planningMode, selectedOperacaoContext]);

    const carregarDadosBasicos = async () => {
        try {
            // Primeiro hidrata protocolos do PostgreSQL/API e mantém o Dexie no mesmo formato da produção.
            await getProtocolos(companyId).catch((error) => {
                console.warn('[OrdemServico] Falha ao hidratar protocolos PostgreSQL. Usando Dexie local.', error);
                return [];
            });

            // Carregar protocolos do módulo Tratos Culturais ignorando companyId conforme produção.
            const protocolos = await db.protocolos.toArray();
            setProtocolosDisponiveis(protocolos.filter(p => p.status !== 'INATIVO'));

            const protocoloOps = await db.protocoloOperacoes.toArray();
            setProtocoloOperacoes(protocoloOps.filter(p => p.status !== 'INATIVO'));

            // Carregar produtos (insumos) para exibição dos nomes e unidades ignorando companyId
            const produtos = await db.insumos.toArray();
            setProdutosMestre(produtos);

            const diretriz = await getDiretrizVinhaca();
            setDiretrizVinhaca(diretriz);
        } catch (error) {
            console.error("Erro ao carregar dados básicos da OS:", error);
        }
    };

    const handleOperacaoChange = (selectedOption) => {
        if (planningMode) return;
        setSelectedOperacao(selectedOption);
        setSelectedProtocolo(null); // Resetar sub-protocolo ao mudar a operação/protocolo base
        setProtocoloItens([]);
        setOriginalItensMap({});
        setIsModified(false);
    };

    const handleProtocoloChange = async (selectedOption) => {
        setSelectedProtocolo(selectedOption);

        const protocoloAtual = protocoloBaseSelecionado || selectedOperacao;
        if (selectedOption && protocoloAtual) {
            const protocoloId = protocoloAtual.value || protocoloAtual?.raw?.id;
            const subProtocoloNome = planningMode ? selectedOption.value : selectedOption.value;
            try {
                const todosItens = await db.protocoloItens.toArray();
                const itens = (todosItens || []).filter((item) => String(item?.protocoloId || '').trim() === String(protocoloId || '').trim());

                const activeItens = itens.filter(i => i.status !== 'INATIVO' && String(i.subProtocolo || 'Protocolo I').trim() === String(subProtocoloNome || '').trim()).sort((a, b) => a.ordem - b.ordem);

                // Deep copy para edição
                const itensParaEdicao = JSON.parse(JSON.stringify(activeItens));
                setProtocoloItens(itensParaEdicao);

                // Mapa original para comparação
                const mapOriginal = {};
                activeItens.forEach(item => {
                    mapOriginal[item.id] = item;
                });
                setOriginalItensMap(mapOriginal);
                setIsModified(false);

            } catch (error) {
                console.error("Erro ao carregar itens do protocolo:", error);
                setProtocoloItens([]);
                setOriginalItensMap({});
            }
        } else {
            setProtocoloItens([]);
            setOriginalItensMap({});
            setIsModified(false);
        }
    };

    const handleItemChange = (itemId, fieldOrUpdates, value) => {
        setProtocoloItens(prevItens => {
            const novosItens = prevItens.map(item => {
                if (item.id === itemId) {
                    if (typeof fieldOrUpdates === 'object' && fieldOrUpdates !== null) {
                        return { ...item, ...fieldOrUpdates };
                    }
                    return { ...item, [fieldOrUpdates]: value };
                }
                return item;
            });
            checkIfModified(novosItens);
            return novosItens;
        });
    };

    const handleRemoveItem = (itemId) => {
        const novosItens = protocoloItens.filter(item => item.id !== itemId);
        setProtocoloItens(novosItens);
        checkIfModified(novosItens);
    };

    const handleAddItem = () => {
        const newItem = {
            id: `novo_${Date.now()}`,
            produtoId: null,
            insumoId: null,
            dosagem: '',
            subProtocolo: activeSubProtocolo || 'Protocolo I',
            status: 'ATIVO'
        };
        const novosItens = [...protocoloItens, newItem];
        setProtocoloItens(novosItens);
        checkIfModified(novosItens);
    };

    const checkIfModified = (currentItens) => {
        let modified = false;
        const activeCurrentItens = currentItens.filter(i => i.status !== 'INATIVO');
        const originalKeys = Object.keys(originalItensMap);

        if (activeCurrentItens.length !== originalKeys.length) {
            modified = true;
        } else {
            for (const item of activeCurrentItens) {
                const original = originalItensMap[item.id];
                // Compara dosagem (como string para evitar falsos positivos com floats) e produto
                if (!original ||
                    String(original.dosagem) !== String(item.dosagem) ||
                    original.insumoId !== item.insumoId ||
                    original.produtoId !== item.produtoId) {
                    modified = true;
                    break;
                }
            }
        }
        setIsModified(modified);
    };

    const handleSubmit = () => {
        if (!selectedOperacao) {
            alert(planningMode ? 'Selecione o protocolo no filtro da camada!' : 'Selecione uma operação!');
            return;
        }
        if (!selectedProtocolo) {
            alert('Selecione um protocolo!');
            return;
        }
        if (!planningMode && excedeCusto && (!justificativa || justificativa.trim() === '')) {
            alert('A O.S. excede o custo base do protocolo. Por favor, insira uma justificativa para aprovação gerencial.');
            return;
        }

        // Passamos de volta os dados preenchidos para a camada superior (Hook de Action)
        onConfirm({
            operacaoId: selectedOperacao.value,
            operacaoNome: selectedOperacao.label,
            protocoloOriginal: selectedOperacao,
            subProtocoloSelecionado: selectedProtocolo?.value || selectedProtocolo?.label || 'Protocolo I',
            protocoloEditadoItens: protocoloItens,
            custoTotalOriginal: custoTotalProtocolo,
            custoTotalOS: custoTotalOS,
            isPendente: !planningMode && excedeCusto,
            justificativaAprovacao: !planningMode && excedeCusto ? justificativa.trim() : null
        });
    };

    if (!isOpen) return null;

    // Estilos personalizados para o react-select adaptados ao tema dark
    const customSelectStyles = {
        control: (provided, state) => ({
            ...provided,
            backgroundColor: 'rgba(0,0,0,0.5)',
            borderColor: state.isFocused ? palette.gold : 'rgba(255,255,255,0.1)',
            borderRadius: '0.5rem',
            padding: '2px',
            minHeight: '42px',
            boxShadow: 'none',
            '&:hover': {
                borderColor: state.isFocused ? palette.gold : 'rgba(255,255,255,0.2)'
            }
        }),
        menu: (provided) => ({
            ...provided,
            backgroundColor: '#1a1f2e', // Um azul bem escuro, quase preto
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '0.5rem',
            overflow: 'hidden',
            zIndex: 50
        }),
        option: (provided, state) => ({
            ...provided,
            backgroundColor: state.isSelected
                ? palette.gold
                : state.isFocused
                    ? 'rgba(255,255,255,0.05)'
                    : 'transparent',
            color: state.isSelected ? '#000' : '#fff',
            cursor: 'pointer',
            '&:active': {
                backgroundColor: palette.gold,
                color: '#000'
            }
        }),
        singleValue: (provided) => ({
            ...provided,
            color: '#fff'
        }),
        input: (provided) => ({
            ...provided,
            color: '#fff'
        }),
        placeholder: (provided) => ({
            ...provided,
            color: 'rgba(255,255,255,0.4)'
        })
    };

    const getNomeProtocolo = (protocolo) => {
        if (!protocolo) return '';
        // Origem correta: tabela de Protocolos/Receitas em Premissas > Tratos Culturais.
        // Nessa tabela o campo persistido é `nome`, apesar do rótulo visual ser "Nome do Protocolo".
        return String(protocolo.nome || protocolo.label || '').trim();
    };

    const protocoloBaseSelecionado = useMemo(() => {
        if (planningMode) {
            if (!selectedOperacaoContext) return null;

            const selectedId = String(selectedOperacaoContext.value || '').trim().toLowerCase();
            const selectedLabel = String(selectedOperacaoContext.label || '').trim().toLowerCase();
            const matchDireto = protocolosDisponiveis.find((p) => {
                const pid = String(p.id || '').trim().toLowerCase();
                const pname = getNomeProtocolo(p).toLowerCase();
                return (selectedId && pid === selectedId) || (selectedLabel && pname === selectedLabel);
            });

            if (matchDireto) {
                return { value: matchDireto.id, label: getNomeProtocolo(matchDireto), raw: matchDireto };
            }

            const protocoloIds = new Set(
                (protocoloOperacoes || [])
                    .filter((item) => {
                        const itemOperacaoId = String(item.operacaoId || item.operacao || item.operacao_id || '').trim().toLowerCase();
                        const nome = String(item.nome || '').trim().toLowerCase();
                        return (itemOperacaoId && itemOperacaoId === selectedId) || (!!nome && (nome === selectedLabel || nome.includes(selectedLabel) || selectedLabel.includes(nome)));
                    })
                    .map((item) => String(item.protocoloId || '').trim().toLowerCase())
                    .filter(Boolean)
            );

            const matchPorOperacao = protocolosDisponiveis.find((p) => protocoloIds.has(String(p.id || '').trim().toLowerCase()));
            return matchPorOperacao ? { value: matchPorOperacao.id, label: getNomeProtocolo(matchPorOperacao), raw: matchPorOperacao } : selectedOperacaoContext;
        }
        return selectedOperacao;
    }, [planningMode, selectedOperacaoContext, protocolosDisponiveis, protocoloOperacoes, selectedOperacao]);

    useEffect(() => {
        let cancelled = false;

        const carregarSubprotocolos = async () => {
            const protocoloAtual = protocoloBaseSelecionado;
            const protocoloId = protocoloAtual?.value || protocoloAtual?.raw?.id || null;

            if (!protocoloId) {
                if (!cancelled) setSubprotocolosDisponiveis([]);
                return;
            }

            try {
                const todosItens = await db.protocoloItens.toArray();
                const itens = (todosItens || []).filter((item) => String(item?.protocoloId || '').trim() === String(protocoloId || '').trim());
                const subDosItens = Array.from(new Set((itens || [])
                    .filter((i) => (i.status || 'ATIVO') !== 'INATIVO')
                    .map((i) => String(i.subProtocolo || 'Protocolo I').trim())
                    .filter(Boolean)));

                const subDaCapa = Array.isArray(protocoloAtual?.raw?.subProtocolos)
                    ? protocoloAtual.raw.subProtocolos.map((s) => String(s || '').trim()).filter(Boolean)
                    : [];

                const merged = Array.from(new Set([ ...subDaCapa, ...subDosItens ]));
                const finalSubs = merged.length > 0 ? merged : ['Protocolo I'];

                if (!cancelled) {
                    setSubprotocolosDisponiveis(finalSubs);
                    setSelectedProtocolo((prev) => {
                        if (prev && finalSubs.includes(String(prev.value || prev.label || '').trim())) {
                            return prev;
                        }
                        if (finalSubs.length === 1) {
                            return { value: finalSubs[0], label: finalSubs[0] };
                        }
                        return prev;
                    });
                }
            } catch (error) {
                console.error('Erro ao carregar subprotocolos do protocolo:', error);
                if (!cancelled) setSubprotocolosDisponiveis([]);
            }
        };

        carregarSubprotocolos();

        return () => {
            cancelled = true;
        };
    }, [protocoloBaseSelecionado]);

    const operacoesOptions = protocolosDisponiveis.map(p => ({
        value: p.id,
        label: getNomeProtocolo(p),
        raw: p,
    }));

    const protocolosFiltrados = useMemo(() => {
        if (!planningMode) return protocolosDisponiveis;
        if (!selectedOperacaoContext?.value) return [];

        // No planejamento, o filtro da camada agora traz diretamente o protocolo/receita
        // vindo de Premissas > Tratos Culturais > Protocolos e Receitas.
        // Então priorizamos um match direto por ID/nome do protocolo.
        const protocoloDireto = protocolosDisponiveis.find((p) => {
            const pid = String(p.id || '').trim();
            const sid = String(selectedOperacaoContext.value || '').trim();
            const pnome = getNomeProtocolo(p).toLowerCase();
            const snome = String(selectedOperacaoContext.label || '').trim().toLowerCase();
            return (pid && sid && pid === sid) || (pnome && snome && pnome === snome);
        });
        if (protocoloDireto) return [protocoloDireto];

        const operacaoId = selectedOperacaoContext.value;
        const opNome = String(selectedOperacaoContext.label || '').trim().toLowerCase();
        const protocoloIds = new Set(
            protocoloOperacoes
                .filter((item) => {
                    const itemOperacaoId = item.operacaoId || item.operacao || item.operacao_id || null;
                    if (itemOperacaoId && itemOperacaoId === operacaoId) return true;
                    const nome = String(item.nome || '').trim().toLowerCase();
                    return !!nome && (nome === opNome || nome.includes(opNome) || opNome.includes(nome));
                })
                .map((item) => item.protocoloId)
                .filter(Boolean)
        );

        return protocolosDisponiveis.filter((p) => protocoloIds.has(p.id));
    }, [planningMode, protocolosDisponiveis, protocoloOperacoes, selectedOperacaoContext]);

    const protocolosOptions = (subprotocolosDisponiveis || []).map((sub) => ({
        value: sub,
        label: sub
    }));

    useEffect(() => {
        if (!planningMode) return;
        if (!selectedProtocolo || !selectedProtocolo.value) return;
        if (!protocolosOptions.some((option) => option.value === selectedProtocolo.value)) return;
        handleProtocoloChange(selectedProtocolo);
    }, [planningMode, selectedProtocolo?.value, protocoloBaseSelecionado?.value]);

    const getProdutoInfo = (id) => {
        const prod = produtosMestre.find(p => p.id === id);
        if (!prod) return { nome: 'Produto não encontrado', valor: 0 };
        return {
            nome: `${prod.codInsumo || ''} - ${prod.descInsumo || ''} ${prod.und ? `(${prod.und})` : ''}`,
            valor: parseFloat(prod.vlrUnit || prod.valorUnitario || prod.preco || 0)
        };
    };

    const produtosOptions = produtosMestre.map(p => ({
        value: p.id,
        label: `${p.codInsumo || ''} - ${p.descInsumo || ''} ${p.und ? `(${p.und})` : ''}`
    }));

    // Calculo de Custos Totais (Dose * Valor Unitário)
    const custoTotalProtocolo = useMemo(() => {
        if (!selectedProtocolo) return 0;
        let total = 0;
        Object.values(originalItensMap).forEach(item => {
            const dose = parseFloat(item.dosagem || 0);
            const itemId = item.insumoId || item.produtoId;
            const info = getProdutoInfo(itemId);
            total += dose * info.valor;
        });
        return total;
    }, [originalItensMap, produtosMestre]);

    const custoTotalOS = useMemo(() => {
        if (!selectedProtocolo) return 0;
        let total = 0;
        protocoloItens.forEach(item => {
            const dose = parseFloat(item.dosagem || 0);
            const itemId = item.insumoId || item.produtoId;
            const info = getProdutoInfo(itemId);
            total += dose * info.valor;
        });
        return total;
    }, [protocoloItens, produtosMestre]);

    const excedeCusto = custoTotalOS > custoTotalProtocolo;


    const isVinhacaPlanejamento = useMemo(() => {
        if (!planningMode) return false;
        const opLabel = String((planningMode ? selectedOperacaoContext?.label : selectedOperacao?.label) || '').toLowerCase();
        const subLabel = String(selectedProtocolo?.label || '').toLowerCase();
        return opLabel.includes('vinha') || subLabel.includes('vinha');
    }, [planningMode, selectedOperacao, selectedOperacaoContext, selectedProtocolo]);

    const resumoVinhaca = useMemo(() => {
        if (!planningMode || !isVinhacaPlanejamento || !diretrizVinhaca) return null;
        const rows = (selectedTalhoesData || []).map((talhao) => calculateVinhacaResumoTalhao(talhao, diretrizVinhaca));
        const totals = rows.reduce((acc, item) => ({
            area: acc.area + (item.area || 0),
            totalMap: acc.totalMap + (item.totalMap || 0),
            totalUreia: acc.totalUreia + (item.totalUreia || 0),
            totalKcl: acc.totalKcl + (item.totalKcl || 0),
        }), { area: 0, totalMap: 0, totalUreia: 0, totalKcl: 0 });
        return { rows, totals };
    }, [planningMode, isVinhacaPlanejamento, diretrizVinhaca, selectedTalhoesData]);

    const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    const formatNumber = (val) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(val || 0));


    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 top-16 z-[100] flex flex-col bg-[#121212] overflow-hidden animate-slide-in">
                    {/* Header Fixo */}
                    <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between shrink-0 bg-black/40 sticky top-0 z-20 backdrop-blur-md">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-blue-500/20 text-blue-400">
                                <Layers className="w-6 h-6" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white">{planningMode ? 'Planejamento de Tratos Culturais' : 'Abrir Ordem de Serviço'}</h2>
                                <p className="text-sm text-white/50 mt-0.5">
                                    {planningMode ? 'Defina apenas o subprotocolo. O filtro da camada já traz o protocolo/receita.' : 'Tratos Culturais'} • {talhoesCount} {talhoesCount === 1 ? 'talhão selecionado' : 'talhões selecionados'}
                                </p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-white/50 hover:text-white transition-colors bg-white/5 border border-white/10">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Body - Scrollable 100% Height */}
                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar bg-[#121212]">
                        <div className="max-w-5xl mx-auto flex flex-col gap-6">

                            {/* Resumo dos Talhões e Área */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-white/80 mb-2">
                                        <ListChecks className="w-4 h-4" /> Talhões Selecionados
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedTalhoesNomes?.slice(0, 10).map((nome, i) => (
                                            <span key={i} className="px-2 py-1 rounded bg-black/40 border border-white/10 text-xs text-white/70">
                                                {nome}
                                            </span>
                                        ))}
                                        {selectedTalhoesNomes?.length > 10 && (
                                            <span className="px-2 py-1 rounded bg-black/40 border border-white/10 text-xs text-white/70">
                                                + {selectedTalhoesNomes.length - 10} outros...
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col justify-center items-start">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-white/80 mb-2">
                                        <Map className="w-4 h-4" /> Área Total Selecionada
                                    </div>
                                    <div className="text-2xl font-bold text-white">
                                        {totalArea ? `${totalArea.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha` : '0,00 ha'}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                {!planningMode ? (
                                    <>
                                        <div>
                                            <label className="block text-sm font-medium text-white/70 mb-2">
                                                Operação
                                            </label>
                                            <Select
                                                styles={customSelectStyles}
                                                placeholder="Selecione a Operação..."
                                                options={operacoesOptions}
                                                value={selectedOperacao}
                                                onChange={handleOperacaoChange}
                                                isClearable
                                                noOptionsMessage={() => "Nenhuma operação encontrada"}
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-white/70 mb-2">
                                                Protocolo (Receita Base)
                                            </label>
                                            <Select
                                                styles={customSelectStyles}
                                                placeholder="Selecione o Protocolo..."
                                                options={protocolosOptions}
                                                value={selectedProtocolo}
                                                onChange={handleProtocoloChange}
                                                isClearable
                                                noOptionsMessage={() => "Nenhum protocolo encontrado"}
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-white/70 mb-2">
                                            Subprotocolo
                                        </label>
                                        <Select
                                            styles={customSelectStyles}
                                            placeholder={protocoloBaseSelecionado ? "Selecione o subprotocolo para os talhões selecionados..." : "Selecione o protocolo no filtro da camada primeiro..."}
                                            options={protocolosOptions}
                                            value={selectedProtocolo}
                                            onChange={handleProtocoloChange}
                                            isClearable
                                            isDisabled={!protocoloBaseSelecionado}
                                            noOptionsMessage={() => protocoloBaseSelecionado ? "Nenhum subprotocolo encontrado para o protocolo selecionado" : "Selecione o protocolo no filtro da camada"}
                                        />
                                        <div className="text-xs text-white/40 mt-2">
                                            Os subprotocolos listados aqui vêm de Premissas → Tratos Culturais → Protocolos e Receitas.
                                        </div>
                                    </div>
                                )}
                            </div>


                            {planningMode && isVinhacaPlanejamento && resumoVinhaca && (
                                <div className="rounded-2xl border border-[#D9B04C]/20 bg-[#D9B04C]/10 overflow-hidden">
                                    <div className="px-4 py-3 border-b border-[#D9B04C]/15 flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-semibold text-[#F4D78C]">Resumo da Dose — Vinhaça Localizada</div>
                                            <div className="text-xs text-[#F4D78C]/80 mt-1">Apoio de cálculo com base na Diretriz Vinhaça por corte. Não grava dose nem altera a lógica da camada de Tratos Culturais.</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs text-[#F4D78C]/70">Área selecionada</div>
                                            <div className="text-lg font-bold text-white">{formatNumber(resumoVinhaca.totals.area)} ha</div>
                                        </div>
                                    </div>
                                    <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3 border-b border-white/10 bg-black/10">
                                        <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-xs text-white/60">MAP total</div><div className="text-lg font-bold text-white mt-1">{formatNumber(resumoVinhaca.totals.totalMap)} kg</div></div>
                                        <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-xs text-white/60">Uréia total</div><div className="text-lg font-bold text-white mt-1">{formatNumber(resumoVinhaca.totals.totalUreia)} kg</div></div>
                                        <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-xs text-white/60">KCL total</div><div className="text-lg font-bold text-white mt-1">{formatNumber(resumoVinhaca.totals.totalKcl)} kg</div></div>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-[920px] w-full text-sm">
                                            <thead className="bg-black/20 text-white/60">
                                                <tr>
                                                    <th className="px-4 py-3 text-left">Talhão</th>
                                                    <th className="px-4 py-3 text-center">Corte</th>
                                                    <th className="px-4 py-3 text-center">TCH Diretriz</th>
                                                    <th className="px-4 py-3 text-center">Área</th>
                                                    <th className="px-4 py-3 text-center">MAP kg/ha</th>
                                                    <th className="px-4 py-3 text-center">Uréia kg/ha</th>
                                                    <th className="px-4 py-3 text-center">KCL kg/ha</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {resumoVinhaca.rows.map((row) => (
                                                    <tr key={row.talhaoId || row.talhaoNome} className="border-t border-white/10">
                                                        <td className="px-4 py-3 text-white font-medium">{row.talhaoNome}</td>
                                                        <td className="px-4 py-3 text-center text-white/80">{row.corte}</td>
                                                        <td className="px-4 py-3 text-center text-white/80">{formatNumber(row.tchDiretriz)}</td>
                                                        <td className="px-4 py-3 text-center text-white/80">{formatNumber(row.area)} ha</td>
                                                        <td className="px-4 py-3 text-center text-[#F4D78C] font-semibold">{formatNumber(row.doseMap)}</td>
                                                        <td className="px-4 py-3 text-center text-[#F4D78C] font-semibold">{formatNumber(row.doseUreia)}</td>
                                                        <td className="px-4 py-3 text-center text-[#F4D78C] font-semibold">{formatNumber(row.doseKcl)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Itens do Protocolo */}
                            {selectedProtocolo && (
                                <div className="mt-6 border border-white/10 rounded-2xl overflow-hidden flex flex-col bg-white/5">
                                    <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/40">
                                        <h3 className="font-semibold text-white flex items-center gap-2">
                                            {planningMode ? 'Itens do Protocolo Selecionado' : 'Itens da Ordem de Serviço'}
                                        </h3>
                                        <div className="flex gap-3 items-center">
                                            <span className="text-xs text-white/50">
                                                {protocoloItens.length} produtos
                                            </span>
                                            <button
                                                onClick={handleAddItem}
                                                className="px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors flex items-center gap-1 text-sm font-medium border border-green-500/20"
                                            >
                                                <Plus className="w-4 h-4" /> Adicionar Produto
                                            </button>
                                        </div>
                                    </div>
                                    <div className="p-0">
                                        {/* Grid Responsiva (Flex) */}
                                        <div className="w-full text-left flex flex-col">
                                            {/* Cabeçalho - Visível apenas em Telas Maiores */}
                                            <div className="hidden lg:flex bg-black/20 text-xs uppercase text-white/50 border-b border-white/10">
                                                <div className="p-4 font-medium w-[40%] shrink-0 border-r border-white/10">Original (Protocolo Base)</div>
                                                <div className="p-4 font-medium flex-1 bg-blue-500/5">Configuração da O.S. (Editável)</div>
                                            </div>

                                            {protocoloItens.length === 0 ? (
                                                <div className="text-center text-sm text-white/40 py-8">
                                                    Nenhum item configurado nesta etapa.
                                                </div>
                                            ) : (
                                                <div className="flex flex-col">
                                                    {Array.from(new Set([...Object.keys(originalItensMap), ...protocoloItens.map(i => i.id)])).map((itemId) => {
                                                        const originalItem = originalItensMap[itemId];
                                                        const itemAtual = protocoloItens.find(i => i.id === itemId);
                                                        const isRemoved = originalItem && !itemAtual;

                                                        const item = itemAtual || originalItem; // fallback pra renderizar

                                                        const itemIdOriginal = originalItem?.insumoId || originalItem?.produtoId;
                                                        const itemIdAtual = itemAtual?.insumoId || itemAtual?.produtoId;

                                                        const isItemModified = isRemoved || !originalItem || String(itemAtual.dosagem) !== String(originalItem?.dosagem) || itemIdOriginal !== itemIdAtual;

                                                        const originalInfo = originalItem ? getProdutoInfo(itemIdOriginal) : null;
                                                        const atualInfo = itemAtual ? getProdutoInfo(itemIdAtual) : null;

                                                        return (
                                                            <div key={itemId} className={`flex flex-col lg:flex-row border-b border-white/5 last:border-b-0 transition-colors ${isRemoved ? 'opacity-50 grayscale bg-red-500/5' : 'hover:bg-white/5'}`}>

                                                                {/* Lado Esquerdo - Original */}
                                                                <div className="p-4 w-full lg:w-[40%] shrink-0 border-b lg:border-b-0 lg:border-r border-white/5">
                                                                    {/* Label mobile */}
                                                                    <div className="lg:hidden text-[10px] uppercase text-white/40 mb-2 font-semibold">Original (Protocolo Base)</div>
                                                                    {originalItem ? (
                                                                        <div className="flex flex-col gap-1">
                                                                            <span className={`text-sm font-medium ${isRemoved ? 'text-white/40 line-through' : 'text-white/60'}`}>
                                                                                {originalInfo.nome}
                                                                            </span>
                                                                            <div className="flex items-center gap-3">
                                                                                <span className="text-xs text-white/40">
                                                                                    Dose Padrão: {originalItem.dosagem}
                                                                                </span>
                                                                                <span className="text-xs text-white/40">
                                                                                    V.U: {formatCurrency(originalInfo.valor)}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-sm text-white/30 italic">Item Adicionado</span>
                                                                    )}
                                                                </div>

                                                                {/* Lado Direito - Editável */}
                                                                <div className={`p-4 flex-1 flex flex-col justify-center ${isRemoved ? 'bg-transparent' : isItemModified ? 'bg-yellow-500/5' : 'bg-blue-500/5'}`}>
                                                                    {/* Label mobile */}
                                                                    <div className="lg:hidden text-[10px] uppercase text-white/40 mb-2 font-semibold">Configuração da O.S. (Editável)</div>
                                                                    {isRemoved ? (
                                                                        <div className="flex items-center justify-between py-2">
                                                                            <span className="text-red-400/80 text-sm italic font-medium">Produto removido da O.S.</span>
                                                                            <button
                                                                                onClick={() => {
                                                                                    const restored = { ...originalItem };
                                                                                    setProtocoloItens(prev => {
                                                                                        const novos = [...prev, restored];
                                                                                        checkIfModified(novos);
                                                                                        return novos;
                                                                                    });
                                                                                }}
                                                                                className="px-3 py-1.5 rounded-lg bg-white/5 text-white/70 hover:bg-white/10 transition-colors text-sm border border-white/10"
                                                                            >
                                                                                Restaurar
                                                                            </button>
                                                                        </div>
                                                                    ) : (
                                                                        <>
                                                                        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                                                                            <div className="flex-1 w-full min-w-[200px]">
                                                                                <Select
                                                                                    styles={{
                                                                                        ...customSelectStyles,
                                                                                        control: (provided, state) => ({
                                                                                            ...customSelectStyles.control(provided, state),
                                                                                            minHeight: '38px',
                                                                                            backgroundColor: 'rgba(0,0,0,0.3)',
                                                                                        }),
                                                                                        menuPortal: base => ({ ...base, zIndex: 9999 })
                                                                                    }}
                                                                                    menuPortalTarget={document.body}
                                                                                    menuPosition="fixed"
                                                                                    placeholder="Produto..."
                                                                                    options={produtosOptions}
                                                                                    value={produtosOptions.find(p => p.value === itemIdAtual) || null}
                                                                                    onChange={(selected) => {
                                                                                        const val = selected ? selected.value : null;
                                                                                        handleItemChange(itemAtual.id, { insumoId: val, produtoId: val });
                                                                                    }}
                                                                                    isClearable
                                                                                />
                                                                            </div>
                                                                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                                                                <input
                                                                                    type="number"
                                                                                    step="0.01"
                                                                                    value={itemAtual.dosagem || ''}
                                                                                    onChange={(e) => handleItemChange(itemAtual.id, 'dosagem', e.target.value)}
                                                                                    className={`w-full sm:w-[100px] bg-black/50 border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold ${isItemModified ? 'border-yellow-500/50' : 'border-white/20'}`}
                                                                                    placeholder="Dose"
                                                                                />
                                                                                <button
                                                                                    onClick={() => handleRemoveItem(itemAtual.id)}
                                                                                    className="p-2 rounded-lg text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors border border-transparent hover:border-red-500/30 shrink-0"
                                                                                    title="Remover Item"
                                                                                >
                                                                                    <Trash2 className="w-4 h-4" />
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                        <div className="mt-2 flex items-center justify-between">
                                                                            <span className="text-xs text-white/40">
                                                                                V.U: {formatCurrency(atualInfo.valor)}
                                                                            </span>
                                                                            {isItemModified && originalItem && (
                                                                                <div className="text-[11px] text-yellow-500 flex items-center gap-1">
                                                                                    <AlertTriangle className="w-3 h-3" /> Alterado
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                    <div className="flex flex-col lg:flex-row bg-black/40 border-t border-white/10">
                                                        <div className="p-4 w-full lg:w-[40%] text-right border-b lg:border-b-0 lg:border-r border-white/10">
                                                            <span className="text-xs text-white/50 block">Custo Total Protocolo Base</span>
                                                            <span className="text-lg font-bold text-white">{formatCurrency(custoTotalProtocolo)}</span>
                                                        </div>
                                                        <div className="p-4 flex-1 text-right">
                                                            <span className="text-xs text-white/50 block">Custo Total da O.S.</span>
                                                            <span className={`text-lg font-bold ${excedeCusto ? 'text-red-400' : 'text-blue-400'}`}>
                                                                {formatCurrency(custoTotalOS)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Aviso de Modificação e Custos */}
                            <AnimatePresence>
                                {(!planningMode && (isModified || excedeCusto)) && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="mt-4 overflow-hidden flex flex-col gap-4"
                                    >
                                        <div className={`p-4 rounded-xl flex items-start gap-3 ${excedeCusto ? 'bg-red-500/10 border border-red-500/30' : 'bg-yellow-500/10 border border-yellow-500/30'}`}>
                                            <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${excedeCusto ? 'text-red-500' : 'text-yellow-500'}`} />
                                            <div className="w-full">
                                                <h4 className={`text-sm font-semibold ${excedeCusto ? 'text-red-500' : 'text-yellow-500'}`}>
                                                    {excedeCusto ? 'Aprovação Gerencial Necessária' : 'Configuração Alterada'}
                                                </h4>
                                                <p className={`text-sm mt-1 mb-3 ${excedeCusto ? 'text-red-500/80' : 'text-yellow-500/80'}`}>
                                                    {excedeCusto
                                                        ? 'O custo total da Ordem de Serviço excede o custo original do Protocolo. A O.S. será salva como PENDENTE aguardando aprovação da gerência.'
                                                        : 'Você modificou o protocolo original, mas o custo está dentro do orçamento. A O.S. seguirá o fluxo normal.'}
                                                </p>

                                                {excedeCusto && (
                                                    <div className="w-full mt-2">
                                                        <label className="block text-xs font-medium text-red-400/80 mb-2 uppercase">
                                                            Justificativa para a Diretoria/Gerência *
                                                        </label>
                                                        <textarea
                                                            value={justificativa}
                                                            onChange={(e) => setJustificativa(e.target.value)}
                                                            className="w-full bg-black/40 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-red-500/60 placeholder-red-500/30 min-h-[80px] custom-scrollbar"
                                                            placeholder="Descreva o motivo da alteração de custo do protocolo base..."
                                                        ></textarea>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Footer Fixo (Bottom) */}
                    <div className="p-6 border-t border-white/10 bg-black/40 flex justify-end gap-3 shrink-0 mt-auto sticky bottom-0 z-20 backdrop-blur-md">
                        <div className="max-w-5xl mx-auto w-full flex justify-end gap-3">
                            <button
                                onClick={onClose}
                                className="px-6 py-2.5 rounded-xl font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSubmit}
                                className="px-6 py-2.5 rounded-xl font-semibold text-black transition-transform hover:scale-[1.02] flex items-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{ background: palette.gold, boxShadow: "0 0 20px rgba(212,175,55,0.2)" }}
                                disabled={planningMode ? (!protocoloBaseSelecionado || !selectedProtocolo) : (!selectedOperacao || !selectedProtocolo)}
                            >
                                <Check className="w-5 h-5" />
                                {planningMode ? 'Salvar Protocolo Planejado' : 'Confirmar e Salvar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
};
