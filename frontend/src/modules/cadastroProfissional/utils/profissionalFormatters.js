/**
 * profissionalFormatters.js
 *
 * O que este bloco faz:
 * Contém funções puras para formatar dados visuais (como CPF, telefone).
 *
 * Por que ele existe:
 * Para melhorar a interface e evitar dados crus bagunçados, aplicando
 * máscaras de entrada em campos específicos.
 */

/**
 * Aplica máscara de CPF "000.000.000-00"
 *
 * @param {string} value - A string de entrada.
 * @returns {string} String com formato de CPF.
 */
export function formatCPF(value) {
  if (!value) return '';
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return digits.replace(/(\d{3})(\d{3})?(\d{3})?(\d{2})?/, (m, p1, p2, p3, p4) => {
    let res = p1;
    if (p2) res += `.${p2}`;
    if (p3) res += `.${p3}`;
    if (p4) res += `-${p4}`;
    return res;
  });
}

/**
 * Remove qualquer formatação, restando apenas números.
 *
 * @param {string} value - A string formatada.
 * @returns {string} String de números.
 */
export function unformatNumber(value) {
  if (!value) return '';
  return value.replace(/\D/g, '');
}

/**
 * Aplica máscara de telefone "(00) 00000-0000"
 *
 * @param {string} value - O telefone em string.
 * @returns {string} Telefone mascarado.
 */
export function formatTelefone(value) {
  if (!value) return '';
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return digits.replace(/(\d{2})(\d{4,5})?(\d{4})?/, (m, p1, p2, p3) => {
    let res = `(${p1})`;
    if (p2) res += ` ${p2}`;
    if (p3) res += `-${p3}`;
    return res;
  });
}
