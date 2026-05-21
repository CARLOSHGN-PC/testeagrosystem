import React from "react";
import { Search, Filter, X } from "lucide-react";
import { palette } from "../../constants/theme";
import { FUNCOES_MOCK, EQUIPES_MOCK, UNIDADES_MOCK } from "./utils/profissionalSelectors";

/**
 * CadastroProfissionalFilters.jsx
 *
 * O que este bloco faz:
 * Um painel superior de filtros (busca e dropdowns).
 *
 * Por que ele existe:
 * Concentrar a lógica de apresentação dos filtros, recebendo os setters do hook `useProfissionaisFilters`.
 */
export default function CadastroProfissionalFilters({ filters }) {
  const {
    searchTerm, setSearchTerm,
    statusFilter, setStatusFilter,
    funcaoFilter, setFuncaoFilter,
    equipeFilter, setEquipeFilter,
    unidadeFilter, setUnidadeFilter,
    clearFilters
  } = filters;

  return (
    <div className="bg-[#1e1e1e]/60 border border-white/5 rounded-2xl p-4 mb-4 backdrop-blur-md">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
        {/* BUSCA */}
        <div className="relative">
          <label className="text-[12px] text-gray-400 mb-1 block">Buscar</label>
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Nome, CPF, Matrícula..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-[14px] text-white focus:outline-none focus:border-yellow-500/50"
            />
          </div>
        </div>

        {/* STATUS */}
        <div>
          <label className="text-[12px] text-gray-400 mb-1 block">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-[14px] text-white focus:outline-none focus:border-yellow-500/50 appearance-none"
          >
            <option value="todos">Todos</option>
            <option value="ativo">Ativos</option>
            <option value="inativo">Inativos</option>
          </select>
        </div>

        {/* FUNÇÃO */}
        <div>
          <label className="text-[12px] text-gray-400 mb-1 block">Função</label>
          <select
            value={funcaoFilter}
            onChange={(e) => setFuncaoFilter(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-[14px] text-white focus:outline-none focus:border-yellow-500/50 appearance-none"
          >
            <option value="todas">Todas as Funções</option>
            {FUNCOES_MOCK.map((f, i) => <option key={i} value={f}>{f}</option>)}
          </select>
        </div>

        {/* EQUIPE */}
        <div>
          <label className="text-[12px] text-gray-400 mb-1 block">Equipe</label>
          <select
            value={equipeFilter}
            onChange={(e) => setEquipeFilter(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-[14px] text-white focus:outline-none focus:border-yellow-500/50 appearance-none"
          >
            <option value="todas">Todas as Equipes</option>
            {EQUIPES_MOCK.map((e, i) => <option key={i} value={e}>{e}</option>)}
          </select>
        </div>

        {/* LIMPAR */}
        <div className="flex items-center">
          <button
            onClick={clearFilters}
            className="h-[38px] w-full flex items-center justify-center gap-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 transition text-[14px]"
          >
            <X className="w-4 h-4" />
            Limpar Filtros
          </button>
        </div>
      </div>
    </div>
  );
}
