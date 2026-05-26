/**
 * ordemServicoConstants.js
 * Constantes para o módulo de Ordem de Serviço (Tratos Culturais).
 */

export const ORDEM_SERVICO_STATUS = {
    RASCUNHO: 'RASCUNHO',
    ABERTA: 'ABERTA',
    PENDENTE_APROVACAO: 'PENDENTE_APROVACAO',
    APROVADA: 'APROVADA',
    REPROVADA: 'REPROVADA',
    EXECUTADA: 'EXECUTADA',
    CANCELADA: 'CANCELADA'
};

export const ORDEM_SERVICO_COLECOES = {
    MESTRE: 'ordens_servico',
    VINCULO: 'ordens_servico_talhoes'
};
