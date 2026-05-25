/**
 * Formata um número para o padrão de exibição (Português Brasil) com casas decimais.
 * @param {Number} num O número a ser formatado.
 * @param {Number} fractionDigits O número de casas decimais (padrão 2).
 * @returns {String} Número formatado como string, ex: '1.234,56'
 */
export const formatarNumero = (num, fractionDigits = 2) => {
    if (num === null || num === undefined || isNaN(num)) {
        return '-';
    }

    return Number(num).toLocaleString('pt-BR', {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits
    });
};
