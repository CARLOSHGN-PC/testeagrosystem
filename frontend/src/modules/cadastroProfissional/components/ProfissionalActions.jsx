import React from "react";
import { Eye, Edit2, Power } from "lucide-react";
import { palette } from "../../../constants/theme";

/**
 * ProfissionalActions.jsx
 *
 * O que este bloco faz:
 * É um conjunto de botões de ações para cada linha da lista de profissionais.
 *
 * Por que ele existe:
 * Separar as ações da estrutura principal da tabela.
 */
export default function ProfissionalActions({ profissional, onView, onEdit, onToggleStatus }) {
  const isAtivo = profissional.status === "ativo";

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onView(profissional)}
        className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/10"
        title="Visualizar Detalhes"
      >
        <Eye className="w-4 h-4 text-blue-400" />
      </button>

      <button
        onClick={() => onEdit(profissional)}
        className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/10"
        title="Editar"
      >
        <Edit2 className="w-4 h-4" style={{ color: palette.gold }} />
      </button>

      <button
        onClick={() => onToggleStatus(profissional)}
        className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/10"
        title={isAtivo ? "Inativar" : "Ativar"}
      >
        <Power className={`w-4 h-4 ${isAtivo ? "text-red-400" : "text-green-400"}`} />
      </button>
    </div>
  );
}
