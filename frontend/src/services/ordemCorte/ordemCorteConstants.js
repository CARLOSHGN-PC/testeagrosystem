/**
 * ordemCorteConstants.js
 *
 * O que este bloco faz:
 * Armazena todos os valores fixos e strings estáticas (Magic Strings) relacionadas
 * ao fluxo de Ordens de Corte.
 *
 * Por que ele existe:
 * Centralizar nomes de status, cores e coleções evita erros de digitação e
 * facilita caso um dia queiramos mudar a cor ou a coleção no PostgreSQL.
 */

export const ORDEM_CORTE_STATUS = {
    AGUARDANDO: 'AGUARDANDO',
    ABERTA: 'ABERTA',
    FINALIZADA: 'FINALIZADA'
};

export const ORDEM_CORTE_COLECOES = {
    MESTRE: 'ordens_corte',
    VINCULO: 'ordens_corte_talhoes'
};

export const ORDEM_CORTE_CORES = {
    // Novo padrão visual obrigatório para Ordem de Corte:
    // FECHADO = vermelho | ABERTO = verde | PENDENTE/AGUARDANDO = amarelo
    FECHADA: '#ef4444',
    ABERTA: '#22c55e',
    AGUARDANDO: '#eab308',
};
