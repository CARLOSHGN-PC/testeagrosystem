/**
 * ordemCorteRules.js
 *
 * O que este bloco faz:
 * Armazena e expõe todas as regras "puras" de negócio: validadores
 * e checagens lógicas para o ecossistema de Ordens de Corte.
 *
 * Por que ele existe:
 * Funções pequenas, limpas e previsíveis. Facilita muito escrever testes
 * se eu puder chamar apenas essa função para verificar o comportamento de
 * "Esse talhão já tem uma Ordem?".
 */

import { ORDEM_CORTE_STATUS } from './ordemCorteConstants.js';

/**
 * Valida se é seguro e permitido abrir ordem de corte para os talhões escolhidos.
 * Checa na lista de vínculos de uma Safra se algum desses idsJá está com status "ABERTA".
 *
 * @param {Array<string>} talhoesDesejados - IDs Reais no Dexie/FB
 * @param {Array<Object>} todosVinculosSafra - Todos os objetos 'ordensCorteTalhoes' lidos do bd local da safra atual
 * @returns {Object} { canOpen: boolean, conflictId: string } Onde conflictId é o primeiro que barrar
 */
export const validatePodeAbrirOrdem = (talhoesDesejados, todosVinculosSafra) => {
    // Para todos os vínculos da Safra que o bd me deu, procuramos os que estão ABERTOS
    const vinculosAbertos = todosVinculosSafra.filter(v => v.status === ORDEM_CORTE_STATUS.ABERTA);

    // Verificamos se algum dos talhões desejados está dentro dessa lista restrita
    for (const dId of talhoesDesejados) {
        if (vinculosAbertos.some(v => v.talhaoId === dId)) {
            // Existe um talhão ABERTO. Quebramos a regra!
            return { canOpen: false, conflictId: dId };
        }
    }

    // Regra Validada: Todos os desejados não constam em listas abertas
    return { canOpen: true, conflictId: null };
};
