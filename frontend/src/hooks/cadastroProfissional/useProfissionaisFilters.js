import { useState, useMemo } from "react";

/**
 * useProfissionaisFilters.js
 *
 * O que este bloco faz:
 * É um hook de filtragem na memória. Recebe a lista cheia do Dexie,
 * armazena os estados dos campos de filtro e cospe uma lista filtrada rápida.
 *
 * Por que ele existe:
 * Separar a lógica de Array.filter() da lógica da View. O listComponent
 * só recebe `filteredList` e os `setters` do painel de filtros.
 */
export function useProfissionaisFilters(profissionais) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos"); // "todos" | "ativo" | "inativo"
  const [funcaoFilter, setFuncaoFilter] = useState("todas");
  const [equipeFilter, setEquipeFilter] = useState("todas");
  const [unidadeFilter, setUnidadeFilter] = useState("todas");

  const filteredList = useMemo(() => {
    if (!profissionais) return [];

    return profissionais.filter(p => {
      // 1. Busca por Nome, CPF ou Matrícula
      const searchStr = searchTerm.toLowerCase();
      const matchSearch =
        p.nomeCompleto?.toLowerCase().includes(searchStr) ||
        p.cpf?.includes(searchStr) ||
        p.matricula?.toLowerCase().includes(searchStr);

      if (!matchSearch) return false;

      // 2. Filtro Status
      if (statusFilter !== "todos" && p.status !== statusFilter) return false;

      // 3. Filtro Função
      if (funcaoFilter !== "todas" && p.funcao !== funcaoFilter) return false;

      // 4. Filtro Equipe
      if (equipeFilter !== "todas" && p.equipe !== equipeFilter) return false;

      // 5. Filtro Unidade
      if (unidadeFilter !== "todas" && p.unidade !== unidadeFilter) return false;

      return true;
    });
  }, [profissionais, searchTerm, statusFilter, funcaoFilter, equipeFilter, unidadeFilter]);

  /**
   * Limpa todos os filtros de uma vez.
   */
  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("todos");
    setFuncaoFilter("todas");
    setEquipeFilter("todas");
    setUnidadeFilter("todas");
  };

  return {
    searchTerm, setSearchTerm,
    statusFilter, setStatusFilter,
    funcaoFilter, setFuncaoFilter,
    equipeFilter, setEquipeFilter,
    unidadeFilter, setUnidadeFilter,
    filteredList,
    clearFilters
  };
}
