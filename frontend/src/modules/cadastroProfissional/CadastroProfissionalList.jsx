import React from "react";
import { Users, FileX } from "lucide-react";
import ProfissionalStatusBadge from "./components/ProfissionalStatusBadge";
import ProfissionalActions from "./components/ProfissionalActions";
import { palette } from "../../constants/theme";

/**
 * CadastroProfissionalList.jsx
 *
 * O que este bloco faz:
 * É o componente visual de Tabela que renderiza a lista filtrada de profissionais.
 *
 * Por que ele existe:
 * Desacoplar a complexidade da tabela do layout da página principal.
 */
export default function CadastroProfissionalList({ list, onView, onEdit, onToggleStatus }) {

  if (!list || list.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-[#1e1e1e]/40 border border-white/5 rounded-3xl mt-4">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
          <FileX className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-white font-medium text-[16px]">Nenhum profissional encontrado</h3>
        <p className="text-gray-400 text-[13px] mt-1 max-w-sm text-center">
          Verifique os filtros aplicados ou cadastre um novo profissional para começar.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#1e1e1e]/60 border border-white/5 rounded-3xl overflow-hidden shadow-xl mt-4">
      {/* Container scrollável horizontal para responsividade */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-white/5 text-[12px] uppercase tracking-wider text-gray-400 border-b border-white/5">
              <th className="px-6 py-4 font-medium">Profissional</th>
              <th className="px-6 py-4 font-medium">Matrícula</th>
              <th className="px-6 py-4 font-medium">Função</th>
              <th className="px-6 py-4 font-medium">Equipe</th>
              <th className="px-6 py-4 font-medium">Status</th>
              <th className="px-6 py-4 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {list.map((prof) => (
              <tr
                key={prof.id}
                className="hover:bg-white/5 transition-colors group"
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-yellow-600/20 to-yellow-400/20 border border-yellow-500/20 flex items-center justify-center">
                      <Users className="w-4 h-4 text-yellow-500" />
                    </div>
                    <div>
                      <div className="text-[14px] font-medium text-white">{prof.nomeCompleto}</div>
                      {prof.cpf && <div className="text-[12px] text-gray-400 mt-0.5">{prof.cpf}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-[14px] text-gray-300 font-medium">
                  {prof.matricula}
                </td>
                <td className="px-6 py-4 text-[14px] text-gray-300">
                  {prof.funcao || "-"}
                </td>
                <td className="px-6 py-4 text-[13px] text-gray-400">
                  {prof.equipe || "-"}
                  {prof.unidade && <span className="block text-[11px] text-gray-500">{prof.unidade}</span>}
                </td>
                <td className="px-6 py-4">
                  <ProfissionalStatusBadge status={prof.status} />
                </td>
                <td className="px-6 py-4 flex justify-end">
                   <ProfissionalActions
                     profissional={prof}
                     onView={onView}
                     onEdit={onEdit}
                     onToggleStatus={onToggleStatus}
                   />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
