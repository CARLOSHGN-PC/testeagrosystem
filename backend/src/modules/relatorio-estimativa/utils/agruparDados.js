/**
 * Agrupa os dados e calcula os subtotais por chave (Ex: Corte ou Fazenda_Talhao).
 * @param {Array} items Lista de itens obtidos do banco.
 * @param {Function} keyFn Função que retorna a chave de agrupamento do item.
 * @returns {Array} Array de grupos formatado.
 */
import { calcularTotais } from './calcularTotais.js';

export const agruparDados = (items, keyFn) => {
    const mapaGrupos = new Map();

    items.forEach(item => {
        const chave = keyFn(item);
        if (!mapaGrupos.has(chave)) {
            mapaGrupos.set(chave, {
                chave,
                itens: []
            });
        }

        mapaGrupos.get(chave).itens.push(item);
    });

    const gruposFormatados = [];

    mapaGrupos.forEach((grupo, key) => {
        const subtotal = calcularTotais(grupo.itens);

        gruposFormatados.push({
            chave: grupo.chave, // Pode ser o nome da fazenda ou tipo de prop.
            itens: grupo.itens,
            subtotal
        });
    });

    return gruposFormatados;
};
