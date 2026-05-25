/**
 * ordemCorteHelpers.js
 *
 * O que este bloco faz:
 * Coleção de funções puras focadas em UI/Formatação e Chaves Visuais.
 *
 * Por que ele existe:
 * Evita espalhar lógicas de preenchimento (pad) de strings, ou concatenação
 * complexa dentro do JSX.
 */

/**
 * Formata o número sequencial de Ordem de Corte para string de 2 a 3 dígitos visíveis.
 * Exemplo: 1 -> "01", 10 -> "10", 150 -> "150".
 *
 * @param {number} numero - O identificador da ordem salvo no banco (seq).
 * @returns {string} String do Código amigável
 */
export const formatarCodigoOrdem = (numero) => {
    if (!numero) return '00';
    return numero.toString().padStart(2, '0');
};
