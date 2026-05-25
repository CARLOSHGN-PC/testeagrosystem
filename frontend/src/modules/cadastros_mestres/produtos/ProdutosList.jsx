import { getActiveCompanyId } from '../../../services/companyContext.js';
import React, { useState, useEffect } from 'react';
import { palette } from '../../../constants/theme.js';
import { Package, Plus, Edit2, Trash2 } from 'lucide-react';
import { getProdutos, saveProduto, inactivateProduto } from '../../../services/cadastros_mestres/produtosService.js';
import { useAuth } from '../../../hooks/useAuth.js';

/**
 * @file ProdutosList.jsx
 * @description Listagem e CRUD do Cadastro Mestre de Produtos.
 * @module ProdutosList
 */

export default function ProdutosList() {
  const { user } = useAuth();
  const companyId = getActiveCompanyId();
  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentProduto, setCurrentProduto] = useState({ codigo: '', nome: '', categoriaId: '', unidadePadraoId: '' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const data = await getProdutos(companyId);
    setProdutos(data);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!currentProduto.nome) return;
    await saveProduto(currentProduto, user?.uid || 'system', companyId);
    setIsModalOpen(false);
    loadData();
  };

  const handleInactivate = async (id) => {
    if (window.confirm("Deseja realmente inativar este produto?")) {
        await inactivateProduto(id, user?.uid || 'system', companyId);
        loadData();
    }
  };

  return (
    <div className="flex-1 rounded-[24px] border overflow-hidden bg-[#0A0A0A] border-white/5 p-6 flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold flex items-center gap-2">
            <Package className="w-5 h-5 text-gold" style={{ color: palette.gold }} />
            Gestão de Produtos
        </h2>
        <button
          onClick={() => { setCurrentProduto({ codigo: '', nome: '', categoriaId: '', unidadePadraoId: '' }); setIsModalOpen(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-white/10 hover:bg-white/20 transition-all border border-white/10"
        >
          <Plus className="w-4 h-4" /> Novo Produto
        </button>
      </div>

      <div className="flex-1 overflow-auto rounded-xl border border-white/5 bg-white/5">
        <table className="w-full text-left text-sm">
            <thead className="bg-black/40 text-white/50 border-b border-white/5 sticky top-0">
                <tr>
                    <th className="px-6 py-4 font-semibold">Código</th>
                    <th className="px-6 py-4 font-semibold">Nome</th>
                    <th className="px-6 py-4 font-semibold">Categoria</th>
                    <th className="px-6 py-4 font-semibold">Unidade</th>
                    <th className="px-6 py-4 font-semibold">Status</th>
                    <th className="px-6 py-4 font-semibold text-right">Ações</th>
                </tr>
            </thead>
            <tbody>
                {produtos.length === 0 && !loading && (
                    <tr><td colSpan="6" className="text-center py-8 text-white/40">Nenhum produto cadastrado.</td></tr>
                )}
                {produtos.map(p => (
                    <tr key={p.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                        <td className="px-6 py-4 text-white/80">{p.codigo || '-'}</td>
                        <td className="px-6 py-4 font-medium text-white">{p.nome}</td>
                        <td className="px-6 py-4 text-white/60">{p.categoriaId || '-'}</td>
                        <td className="px-6 py-4 text-white/60">{p.unidadePadraoId || '-'}</td>
                        <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${p.status === 'ATIVO' ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/40'}`}>
                                {p.status}
                            </span>
                        </td>
                        <td className="px-6 py-4 flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setCurrentProduto(p); setIsModalOpen(true); }} className="p-2 hover:bg-white/10 rounded-lg text-white/60 hover:text-white" title="Editar">
                                <Edit2 className="w-4 h-4" />
                            </button>
                            {p.status === 'ATIVO' && (
                                <button onClick={() => handleInactivate(p.id)} className="p-2 hover:bg-red-500/20 rounded-lg text-red-400/60 hover:text-red-400" title="Inativar">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>

      {/* Modal Rápido de Criação */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-[#121212] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl p-6">
                <h3 className="text-xl font-bold mb-4">{currentProduto.id ? 'Editar Produto' : 'Novo Produto'}</h3>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Código (Opcional)</label>
                        <input
                            value={currentProduto.codigo}
                            onChange={(e) => setCurrentProduto({...currentProduto, codigo: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Ex: PRD-001"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Nome do Produto</label>
                        <input
                            value={currentProduto.nome}
                            onChange={(e) => setCurrentProduto({...currentProduto, nome: e.target.value})}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                            placeholder="Ex: Glifosato"
                        />
                    </div>
                    {/* Placeholder para dropdowns de Categoria e Unidade que buscarão do banco tb */}
                    <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="block text-xs font-medium text-white/50 mb-1">Categoria ID</label>
                            <input
                                value={currentProduto.categoriaId}
                                onChange={(e) => setCurrentProduto({...currentProduto, categoriaId: e.target.value})}
                                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                                placeholder="Temporário"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-white/50 mb-1">Unidade ID</label>
                            <input
                                value={currentProduto.unidadePadraoId}
                                onChange={(e) => setCurrentProduto({...currentProduto, unidadePadraoId: e.target.value})}
                                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all"
                                placeholder="Temporário"
                            />
                        </div>
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
                        Salvar Produto
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
