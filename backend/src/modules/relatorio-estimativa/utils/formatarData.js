import dayjs from 'dayjs';

/**
 * Formata uma data para o padrão de exibição DD/MM/YYYY.
 * @param {String|Date} data Data a ser formatada.
 * @returns {String} Data formatada ou string vazia caso a data não exista.
 */
export const formatarData = (data) => {
    if (!data) return '';
    const parsed = dayjs(data);
    return parsed.isValid() ? parsed.format('DD/MM/YYYY') : '';
};
