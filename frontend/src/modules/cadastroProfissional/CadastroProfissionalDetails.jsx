import React from "react";
import { X, User, Briefcase, FileText, CheckCircle, Clock } from "lucide-react";
import { palette } from "../../constants/theme";
import ProfissionalStatusBadge from "./components/ProfissionalStatusBadge";

/**
 * CadastroProfissionalDetails.jsx
 *
 * O que este bloco faz:
 * Modal de visualização (apenas leitura) de todos os detalhes de um profissional.
 */
export default function CadastroProfissionalDetails({ profissional, onClose }) {
  if (!profissional) return null;

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString("pt-BR");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative z-10 w-[95%] max-w-lg bg-[#1e1e1e] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5 bg-white/5 rounded-t-2xl shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-yellow-600 to-yellow-400 flex items-center justify-center text-black font-bold text-lg">
              {profissional.nomeCompleto.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white leading-tight">
                {profissional.nomeCompleto}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[13px] text-gray-400">ID: {profissional.matricula}</span>
                <span className="text-gray-600">•</span>
                <ProfissionalStatusBadge status={profissional.status} />
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition"
          >
            <X className="w-4 h-4 text-gray-300" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#121212] p-4 rounded-xl border border-white/5">
              <div className="flex items-center gap-2 text-gray-400 text-[12px] mb-1">
                <User className="w-3.5 h-3.5" /> CPF
              </div>
              <div className="text-[14px] text-white font-medium">{profissional.cpf || "Não informado"}</div>
            </div>
            <div className="bg-[#121212] p-4 rounded-xl border border-white/5">
              <div className="flex items-center gap-2 text-gray-400 text-[12px] mb-1">
                <User className="w-3.5 h-3.5" /> Telefone
              </div>
              <div className="text-[14px] text-white font-medium">{profissional.telefone || "Não informado"}</div>
            </div>
          </div>

          <div className="bg-[#121212] p-4 rounded-xl border border-white/5 space-y-3">
             <div className="flex items-center gap-2 text-white text-[14px] font-medium border-b border-white/5 pb-2 mb-2">
               <Briefcase className="w-4 h-4 text-yellow-500" /> Informações Corporativas
             </div>
             <div className="grid grid-cols-2 gap-y-3">
                <div>
                  <span className="block text-[11px] text-gray-500 uppercase tracking-wider">Função</span>
                  <span className="text-[14px] text-gray-200">{profissional.funcao || "-"}</span>
                </div>
                <div>
                  <span className="block text-[11px] text-gray-500 uppercase tracking-wider">Matrícula</span>
                  <span className="text-[14px] text-gray-200">{profissional.matricula || "-"}</span>
                </div>
                <div>
                  <span className="block text-[11px] text-gray-500 uppercase tracking-wider">Equipe</span>
                  <span className="text-[14px] text-gray-200">{profissional.equipe || "-"}</span>
                </div>
                <div>
                  <span className="block text-[11px] text-gray-500 uppercase tracking-wider">Unidade</span>
                  <span className="text-[14px] text-gray-200">{profissional.unidade || "-"}</span>
                </div>
             </div>
          </div>

          {profissional.observacoes && (
            <div className="bg-[#121212] p-4 rounded-xl border border-white/5">
               <div className="flex items-center gap-2 text-gray-400 text-[12px] mb-2">
                 <FileText className="w-3.5 h-3.5" /> Observações
               </div>
               <p className="text-[13px] text-gray-300 whitespace-pre-wrap">{profissional.observacoes}</p>
            </div>
          )}

          {/* Rodapé Interno Sistema */}
          <div className="flex items-center justify-between text-[11px] text-gray-500 mt-4 px-2">
             <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Criado em: {formatDate(profissional.createdAt)}</span>
             <span className="flex items-center gap-1">
               {profissional.syncStatus === "synced" ? (
                 <CheckCircle className="w-3 h-3 text-green-500/70" />
               ) : profissional.syncStatus === "pending" ? (
                 <Clock className="w-3 h-3 text-yellow-500/70" />
               ) : (
                 <X className="w-3 h-3 text-red-500/70" />
               )}
               Sync: {profissional.syncStatus}
             </span>
          </div>

        </div>
      </div>
    </div>
  );
}
