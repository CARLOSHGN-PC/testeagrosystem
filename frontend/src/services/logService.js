import db from './localDb.js';
import { enqueueTask } from './syncService.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * @file logService.js
 * @description Serviço centralizado de log e auditoria para rastreabilidade de ações.
 */

/**
 * Registra um log de auditoria tanto localmente quanto enfileira para a nuvem.
 *
 * @param {string} entidade - Ex: 'protocolos', 'produtos', 'modulo_acesso'
 * @param {string|null} entidadeId - ID do documento afetado (ou null se for só visualização geral)
 * @param {string} acao - Ex: 'CREATE', 'UPDATE', 'INACTIVATE', 'VIEW', 'ACCESS'
 * @param {Object} detalhes - Dados antes/depois ou descrições adicionais
 * @param {string} usuarioId - ID do usuário que fez a ação
 * @param {string} companyId - ID da empresa atual
 */
export const logAuditoria = async (entidade, entidadeId, acao, detalhes, usuarioId, companyId) => {
  const logEntry = {
    id: uuidv4(),
    entidade,
    entidadeId,
    acao,
    detalhes: JSON.stringify(detalhes),
    usuarioId,
    timestamp: new Date().toISOString(),
    companyId,
    syncStatus: 'pending'
  };

  try {
    // 1. Salvar no IndexedDB local
    await db.auditoriaLogs.put(logEntry);

    // 2. Enfileirar para sincronizar com PostgreSQL
    await enqueueTask('createOrUpdate', 'auditoria_logs', logEntry.id, logEntry);
  } catch (error) {
    console.error('Erro ao registrar log de auditoria:', error);
  }
};
