import React from "react";
import { X, Save, User, Briefcase, FileText } from "lucide-react";
import { palette } from "../../constants/theme";
import { useProfissionalForm } from "../../hooks/cadastroProfissional/useProfissionalForm";
import { FUNCOES_MOCK, EQUIPES_MOCK, UNIDADES_MOCK } from "./utils/profissionalSelectors";

/**
 * CadastroProfissionalForm.jsx
 *
 * O que este bloco faz:
 * O modal de formulário para criação e edição.
 * Separado em 3 sessões: Dados Pessoais, Profissionais, e Observações.
 */
export default function CadastroProfissionalForm({ onClose, onSave, initialData }) {
  const { formData, handleChange, handleSubmit } = useProfissionalForm(initialData, async (data) => {
    const success = await onSave(data);
    if (success) {
      onClose();
    }
    return success;
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Overlay com Blur */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Box */}
      <div
        className="relative z-10 w-[95%] max-w-2xl bg-[#1e1e1e] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        style={{ boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5 shrink-0">
          <div>
            <h2 className="text-xl font-semibold text-white">
              {initialData ? "Editar Profissional" : "Novo Profissional"}
            </h2>
            <p className="text-[13px] text-gray-400 mt-1">
              Preencha os dados pessoais e profissionais.
            </p>
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
          {/* Seção 1: Dados Pessoais */}
          <div className="bg-white/5 rounded-2xl p-5 border border-white/5">
            <h3 className="flex items-center gap-2 text-[15px] font-medium text-white mb-4">
              <User className="w-4 h-4 text-blue-400" /> Dados Pessoais
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-[12px] text-gray-400 mb-1 block">Nome Completo *</label>
                <input
                  type="text"
                  value={formData.nomeCompleto}
                  onChange={(e) => handleChange("nomeCompleto", e.target.value)}
                  className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-2 text-[14px] text-white focus:border-yellow-500/50 focus:outline-none"
                  placeholder="Ex: João da Silva"
                />
              </div>
              <div>
                <label className="text-[12px] text-gray-400 mb-1 block">CPF</label>
                <input
                  type="text"
                  value={formData.cpf}
                  onChange={(e) => handleChange("cpf", e.target.value)}
                  className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-2 text-[14px] text-white focus:border-yellow-500/50 focus:outline-none"
                  placeholder="000.000.000-00"
                />
              </div>
              <div>
                <label className="text-[12px] text-gray-400 mb-1 block">Telefone</label>
                <input
                  type="text"
                  value={formData.telefone}
                  onChange={(e) => handleChange("telefone", e.target.value)}
                  className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-2 text-[14px] text-white focus:border-yellow-500/50 focus:outline-none"
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>
          </div>

          {/* Seção 2: Dados Profissionais */}
          <div className="bg-white/5 rounded-2xl p-5 border border-white/5">
            <h3 className="flex items-center gap-2 text-[15px] font-medium text-white mb-4">
              <Briefcase className="w-4 h-4 text-green-400" /> Dados Profissionais
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[12px] text-gray-400 mb-1 block">Matrícula *</label>
                <input
                  type="text"
                  value={formData.matricula}
                  onChange={(e) => handleChange("matricula", e.target.value)}
                  className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-2 text-[14px] text-white focus:border-yellow-500/50 focus:outline-none"
                  placeholder="Ex: M12345"
                />
              </div>
              <div>
                <label className="text-[12px] text-gray-400 mb-1 block">Função *</label>
                <select
                  value={formData.funcao}
                  onChange={(e) => handleChange("funcao", e.target.value)}
                  className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-2 text-[14px] text-white focus:border-yellow-500/50 focus:outline-none appearance-none"
                >
                  <option value="">Selecione...</option>
                  {FUNCOES_MOCK.map((f, i) => <option key={i} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[12px] text-gray-400 mb-1 block">Equipe</label>
                <select
                  value={formData.equipe}
                  onChange={(e) => handleChange("equipe", e.target.value)}
                  className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-2 text-[14px] text-white focus:border-yellow-500/50 focus:outline-none appearance-none"
                >
                  <option value="">Selecione...</option>
                  {EQUIPES_MOCK.map((e, i) => <option key={i} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[12px] text-gray-400 mb-1 block">Unidade</label>
                <select
                  value={formData.unidade}
                  onChange={(e) => handleChange("unidade", e.target.value)}
                  className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-2 text-[14px] text-white focus:border-yellow-500/50 focus:outline-none appearance-none"
                >
                  <option value="">Selecione...</option>
                  {UNIDADES_MOCK.map((u, i) => <option key={i} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Seção 3: Observações */}
          <div className="bg-white/5 rounded-2xl p-5 border border-white/5">
             <h3 className="flex items-center gap-2 text-[15px] font-medium text-white mb-4">
              <FileText className="w-4 h-4 text-gray-400" /> Observações
            </h3>
            <textarea
              value={formData.observacoes}
              onChange={(e) => handleChange("observacoes", e.target.value)}
              rows={3}
              className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-[14px] text-white focus:border-yellow-500/50 focus:outline-none resize-none"
              placeholder="Anotações extras..."
            />
          </div>

        </div>

        {/* Footer */}
        <div className="p-5 border-t border-white/5 shrink-0 flex items-center justify-end gap-3 bg-black/20 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-[14px] font-medium transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            className="px-6 py-2.5 rounded-xl text-[14px] font-medium transition flex items-center gap-2 text-black"
            style={{ background: `linear-gradient(135deg, ${palette.gold}, #B8860B)` }}
          >
            <Save className="w-4 h-4" />
            Salvar Profissional
          </button>
        </div>
      </div>
    </div>
  );
}
