import { useState, useCallback } from "react";
import { formatCPF, formatTelefone, unformatNumber } from "../../modules/cadastroProfissional/utils/profissionalFormatters";
import { validateProfissionalForm } from "../../modules/cadastroProfissional/utils/profissionalValidators";
import { showSuccess, showError } from "../../utils/alert";

/**
 * useProfissionalForm.js
 *
 * O que este bloco faz:
 * É um hook local para gerenciar a entrada de dados (state) no formulário
 * do profissional, assim como as validações de campo a campo,
 * evitando componente gigantesco no CadastroProfissionalForm.
 *
 * Por que ele existe:
 * O Form só chama as funções handle e pega o formData formatado pronto pra envio.
 */
export function useProfissionalForm(initialData = null, onSubmit) {
  const [formData, setFormData] = useState({
    id: initialData?.id || "",
    uuid: initialData?.uuid || "",
    nomeCompleto: initialData?.nomeCompleto || "",
    cpf: initialData?.cpf || "",
    matricula: initialData?.matricula || "",
    funcao: initialData?.funcao || "",
    equipe: initialData?.equipe || "",
    unidade: initialData?.unidade || "",
    telefone: initialData?.telefone || "",
    status: initialData?.status || "ativo",
    observacoes: initialData?.observacoes || ""
  });

  const handleChange = useCallback((field, value) => {
    setFormData(prev => {
      let formattedValue = value;

      if (field === "cpf") {
        formattedValue = formatCPF(value);
      } else if (field === "telefone") {
        formattedValue = formatTelefone(value);
      } else if (field === "matricula") {
        // Matrícula pode ser letras e números sem máscara específica, ou toda maiúscula.
        formattedValue = value.toUpperCase();
      }

      return { ...prev, [field]: formattedValue };
    });
  }, []);

  const handleSubmit = useCallback(async (e) => {
    if (e) e.preventDefault();

    // Desformata os números na validação (cpf limpo).
    // Mas salva formatado se preferir, ou apenas unformatado para banco (aqui salvamos formatado pois a máscara ja garante).
    const validation = validateProfissionalForm(formData);

    if (!validation.isValid) {
      showError("Atenção aos campos", validation.erros.join("\n"));
      return;
    }

    const success = await onSubmit(formData);
    if (success) {
      // O chamador decide se limpa ou não, normalmente sim:
      showSuccess("Operação concluída.");
    }

  }, [formData, onSubmit]);

  return { formData, handleChange, handleSubmit, setFormData };
}
