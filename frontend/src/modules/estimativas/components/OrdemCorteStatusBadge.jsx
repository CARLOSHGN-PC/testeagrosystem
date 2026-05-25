import React from 'react';
import { ORDEM_CORTE_STATUS } from '../../../services/ordemCorte/ordemCorteConstants';

/**
 * OrdemCorteStatusBadge.jsx
 *
 * O que este bloco faz:
 * É apenas um selo visual (Badge) que renderiza "ABERTA", "FECHADA" ou nada
 * com base no status da ordem de corte injetada.
 *
 * Por que ele existe:
 * Evita repetição de de CSS em `EstimativaPanels` e poluição com lógicas ternárias
 * para decidir se a bolinha é verde, azul ou vermelha.
 */

export const OrdemCorteStatusBadge = ({ status }) => {
    if (!status) return null;

    let bgClass = '';
    let dotClass = '';

    if (status === ORDEM_CORTE_STATUS.AGUARDANDO) {
        bgClass = 'bg-red-500/20 text-red-400 border border-red-500/30';
        dotClass = 'bg-red-400';
    } else if (status === ORDEM_CORTE_STATUS.ABERTA) {
        bgClass = 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30';
        dotClass = 'bg-yellow-400';
    } else if (status === ORDEM_CORTE_STATUS.FINALIZADA) {
        bgClass = 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
        dotClass = 'bg-emerald-400';
    } else {
        // Fallback para status desconhecidos
        bgClass = 'bg-gray-500/20 text-gray-400 border border-gray-500/30';
        dotClass = 'bg-gray-400';
    }

    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${bgClass}`}>
            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${dotClass}`}></span>
            {status}
        </span>
    );
};
