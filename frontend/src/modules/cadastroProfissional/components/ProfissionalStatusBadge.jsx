import React from "react";
import { palette } from "../../../constants/theme";

/**
 * ProfissionalStatusBadge.jsx
 *
 * O que este bloco faz:
 * Um badge visual simples para mostrar se está Ativo ou Inativo,
 * puxando as cores corretas e estilo padrão.
 */
export default function ProfissionalStatusBadge({ status }) {
  const isAtivo = status === "ativo";
  return (
    <span
      className={`px-2 py-1 rounded-full text-[12px] font-medium tracking-wide ${
        isAtivo ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
      }`}
    >
      {isAtivo ? "Ativo" : "Inativo"}
    </span>
  );
}
