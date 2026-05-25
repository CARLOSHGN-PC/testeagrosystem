import React, { useState, useEffect } from 'react';
import { palette } from '../../../../constants/theme.js';
import { Settings, Plus, Edit2, Trash2 } from 'lucide-react';
import { getOperacoes, saveOperacao } from '../../../../services/premissas/tratos_culturais/tratosCulturaisService.js';
import { useAuth } from '../../../../hooks/useAuth.js';

/**
 * @file OperacoesList.jsx
 * @description Listagem e CRUD de Operações de Tratos Culturais.
 * @module OperacoesList
 */

export default function OperacoesList() {
  const { user } = useAuth();
  const companyId = JSON.parse(localStorage.getItem('@AgroSystem:auth'))?.companyId || "AgroSystem_Demo";
  const [operacoes, setOperacoes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentOperacao, setCurrentOperacao] = useState({ codigo: '', nome: '' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const data = await getOperacoes(companyId);
    setOperacoes(data);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!currentOperacao.nome) return;
    await saveOperacao(currentOperacao, user?.uid || 'system', companyId);
    setIsModalOpen(false);
    loadData();
  };

  const handleInactivate = async (id) => {
    if (window.confirm("Deseja realmente inativar esta operação?")) {
        const op = operacoes.find(o => o.id === id);
        if (op) {
             await saveOperacao({ ...op, status: 'INATIVO' }, user?.uid || 'system', companyId);
             loadData();
        }
    }
  };

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
            <Settings className="w-5 h-5" style={{ color: palette.gold }} />
            Gestão de Operações Agrícolas
        </h2>
        <button
          onClick={() => { setCurrentOperacao({ codigo: '', nome: '' }); setIsModalOpen(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-white/10 hover:bg-white/20 transition-all border border-white/10"
        >
          <Plus className="w-4 h-4" /> Nova Operação
        </button>
      </div>

      <div className="flex-1 overflow-auto rounded-xl border border-white/5 bg-white/5">
        <table className="w-full text-left text-sm">
            <thead className="bg-black/40 text-white/50 border-b border-white/5 sticky top-0">
                <tr>
                    <th className="px-6 py-4 font-semibold">Código</th>
                    <th className="px-6 py-4 font-semibold">Nome da Operação</th>
                    <th className="px-6 py-4 font-semibold">Status</th>
                    <th className="px-6 py-4 font-semibold text-right">Ações</th>
                </tr>
            </thead>
            <tbody>
                {operacoes.length === 0 && !loading && (
                    <tr><td colSpan="4" className="text-center py-8 text-white/40">Nenhuma operação cadastrada.</td></tr>
                )}
                {operacoes.map(o => (
                    <tr key={o.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                        <td className="px-6 py-4 text-white/80">{o.codigo || '-'}</td>
                        <td className="px-6 py-4 font-medium text-white">{o.nome}</td>
                        <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${o.status === 'ATIVO' ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/40'}`}>
                                {o.status}
                            </span>
                        </td>
                        <td className="px-6 py-4 flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setCurrentOperacao(o); setIsModalOpen(true); }} className="p-2 hover:bg-white/10 rounded-lg text-white/60 hover:text-white" title="Editar">
                                <Edit2 className="w-4 h-4" />
                            </button>
                            {o.status === 'ATIVO' && (
                                <button onClick={() => handleInactivate(o.id)} className="p-2 hover:bg-red-500/20 rounded-lg text-red-400/60 hover:text-red-400" title="Inativar">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-[#121212] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl p-6">
                <h3 className="text-xl font-bold mb-4">{currentOperacao.id ? 'Editar Operação' : 'Nova Operação'}</h3>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Código (Opcional)</label>
                        <input
                            value={currentOperacao.codigo}
                            onChange={(e) => setCurrentOperacao({...currentOperacao, codigo: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Ex: OP-01"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Nome da Operação</label>
                        <input
                            value={currentOperacao.nome}
                            onChange={(e) => setCurrentOperacao({...currentOperacao, nome: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Ex: Adubação Foliar"
                        />
                    </div>
                </div>

                <div className="mt-6 flex gap-3 justify-end">
                    <button
                        onClick={() => setIsModalOpen(false)}
                        className="px-5 py-2.5 rounded-xl font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
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
