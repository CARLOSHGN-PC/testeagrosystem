import React, { useState } from "react";
import { Users, Plus } from "lucide-react";
import { palette } from "../../constants/theme";

// Hooks
import { useProfissionaisData } from "../../hooks/cadastroProfissional/useProfissionaisData";
import { useProfissionaisFilters } from "../../hooks/cadastroProfissional/useProfissionaisFilters";

// Componentes do Módulo
import CadastroProfissionalFilters from "./CadastroProfissionalFilters";
import CadastroProfissionalList from "./CadastroProfissionalList";
import CadastroProfissionalForm from "./CadastroProfissionalForm";
import CadastroProfissionalDetails from "./CadastroProfissionalDetails";

/**
 * CadastroProfissionalPage.jsx
 *
 * O que este bloco faz:
 * É a página principal do módulo, orquestrando estado (hooks), filtros e modais.
 * Renderizada pelo PostLoginScreen quando activeModule === 'cadastroProfissional'.
 *
 * Por que ele existe:
 * Seguir o padrão de arquitetura modular baseado em features. O módulo é autossuficiente
 * em regra de negócio e UI.
 */
export default function CadastroProfissionalPage({ companyId }) {
  // --- Estados de Modais ---
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedProfissional, setSelectedProfissional] = useState(null);

  // --- Lógica de Dados (Offline-first / Dexie / PostgreSQL) ---
  const { profissionais, saveProfissional, toggleStatus } = useProfissionaisData(companyId);

  // --- Lógica de Filtragem (em memória) ---
  const filtersHook = useProfissionaisFilters(profissionais);

  // --- Handlers de Ação ---
  const handleOpenNew = () => {
    setSelectedProfissional(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (prof) => {
    setSelectedProfissional(prof);
    setIsFormOpen(true);
  };

  const handleOpenDetails = (prof) => {
    setSelectedProfissional(prof);
    setIsDetailsOpen(true);
  };

  return (
    <div className="flex flex-col h-full bg-[#121212] overflow-y-auto px-4 py-8 lg:px-8 custom-scrollbar">

      {/* Título e Ação Principal */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Users className="w-6 h-6" style={{ color: palette.gold }} />
            Cadastro Profissional
          </h1>
          <p className="text-gray-400 text-[14px] mt-1">
            Gerencie operadores, motoristas, líderes e equipes.
          </p>
        </div>

        <button
          onClick={handleOpenNew}
          className="flex items-center gap-2 px-6 py-3 rounded-xl text-[14px] font-semibold transition shadow-lg shrink-0"
          style={{
            background: `linear-gradient(135deg, ${palette.gold}, #B8860B)`,
            color: palette.black,
            boxShadow: `0 8px 24px -8px ${palette.gold}40`
          }}
        >
          <Plus className="w-5 h-5" />
          Novo Profissional
        </button>
      </div>

      {/* Área de Filtros */}
      <CadastroProfissionalFilters filters={filtersHook} />

      {/* Lista Principal */}
      <CadastroProfissionalList
        list={filtersHook.filteredList}
        onView={handleOpenDetails}
        onEdit={handleOpenEdit}
        onToggleStatus={toggleStatus}
      />

      {/* Modais de Fluxo */}
      {isFormOpen && (
        <CadastroProfissionalForm
          initialData={selectedProfissional}
          onClose={() => setIsFormOpen(false)}
          onSave={saveProfissional}
        />
      )}

      {isDetailsOpen && (
        <CadastroProfissionalDetails
          profissional={selectedProfissional}
          onClose={() => setIsDetailsOpen(false)}
        />
      )}

    </div>
  );
}
