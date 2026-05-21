/**
 * profissionalValidators.js
 *
 * O que este bloco faz:
 * Contém funções puras para validar dados de um profissional antes de salvar.
 *
 * Por que ele existe:
 * Centralizar as regras de negócio para garantir que nomes, CPFs, e matrículas
 * não sejam nulos ou inválidos, evitando sujeira no banco de dados.
 */

/**
 * Verifica se um CPF é válido segundo o cálculo de dígitos verificadores brasileiros.
 *
 * @param {string} cpf - O CPF a ser validado (apenas números ou formatado).
 * @returns {boolean} True se for válido ou vazio (já que CPF é opcional), False se for inválido.
 */
export function isValidCPF(cpf) {
  if (!cpf) return true; // CPF não é obrigatório no projeto, apenas único se informado

  const cleanCPF = cpf.replace(/[^\d]+/g, '');
  if (cleanCPF.length !== 11) return false;

  // Impede CPFs com todos os números iguais (ex: 111.111.111-11)
  if (/^(\d)\1+$/.test(cleanCPF)) return false;

  let sum = 0;
  let remainder;

  for (let i = 1; i <= 9; i++) {
    sum += parseInt(cleanCPF.substring(i - 1, i)) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCPF.substring(9, 10))) return false;

  sum = 0;
  for (let i = 1; i <= 10; i++) {
    sum += parseInt(cleanCPF.substring(i - 1, i)) * (12 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCPF.substring(10, 11))) return false;

  return true;
}

/**
 * Valida o formulário completo do profissional.
 *
 * @param {Object} formData - Os dados preenchidos no formulário.
 * @returns {Object} Objeto com `isValid` e uma lista de `erros` se houver.
 */
export function validateProfissionalForm(formData) {
  const erros = [];

  if (!formData.nomeCompleto || formData.nomeCompleto.trim().length < 3) {
    erros.push('Nome completo é obrigatório e deve ter no mínimo 3 caracteres.');
  }

  if (!formData.matricula || formData.matricula.trim() === '') {
    erros.push('A Matrícula é obrigatória.');
  }

  if (!formData.funcao || formData.funcao.trim() === '') {
    erros.push('A Função é obrigatória.');
  }

  if (formData.cpf && !isValidCPF(formData.cpf)) {
    erros.push('O CPF informado é inválido.');
  }

  return {
    isValid: erros.length === 0,
    erros
  };
}
