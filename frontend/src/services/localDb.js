import Dexie from 'dexie';

/**
 * localDb.js
 *
 * O que este bloco faz:
 * É o banco de dados principal da aplicação (IndexedDB) gerenciado pelo Dexie.
 * Define as tabelas/stores e seus índices primários que serão consultados sem internet.
 *
 * Por que ele existe:
 * Para funcionar offline-first, não podemos ler as informações do PostgreSQL.
 * O app precisará gravar aqui (muito rápido) e ler daqui também.
 * As mudanças daqui alimentarão o `syncService` que joga no PostgreSQL em background.
 */

export const db = new Dexie('AgroSystemLocalDB');

// Definição do schema e versão atual. Se você alterar isso, mude a versão.
// Cada store recebe como string suas chaves, `&` significa chave única.
db.version(5).stores({
  // Tabela para guardar os arquivos pesados de Mapas (GeoJSON) que não podem baixar toda hora.
  // 'id' será no formato "empresaId_safra" pra puxar rápido.
  mapData: '&id, companyId, updatedAt',

  // Tabela do Módulo Cadastro Profissional
  // uuid é o ID real no PostgreSQL. matricula e cpf também são importantes para busca
  profissionais: '&id, uuid, companyId, nomeCompleto, cpf, matricula, status, funcao, equipe, unidade, syncStatus, createdAt, updatedAt, [companyId+status], [companyId+funcao]',

  // Tabela com as estimativas salvas (id é a junção empresaId_safra_rodada_talhaoId igual no PostgreSQL).
  // Adicionamos índices compostos para permitir as queries rápidas offline.
  estimativas: '&id, companyId, safra, talhaoId, rodada, syncStatus, updatedAt, [companyId+safra], [companyId+safra+rodada]',

  // Histórico de versões do Talhão. Serve pro painel de "Histórico"
  historico: '++localId, estimateDocId, companyId, safra, talhaoId, rodada, version, [companyId+safra+talhaoId], [companyId+safra+talhaoId+rodada]',

  // Fila de sincronização. Tudo que falhar em ir pro PostgreSQL fica aqui aguardando.
  // Pode conter ações de criação ('create'), update ou delete.
  syncQueue: '++id, type, targetCollection, documentId, payload, status, retryCount, createdAt, [type+documentId]',

  // Tabela de Notificações. Guarda o histórico de alertas do sistema (sucesso, erro, avisos).
  // Serve para a central de notificações persistente do TopNavbar.
  notifications: '++id, title, type, isRead, createdAt',

  // Tabela mestre para as Ordens de Corte (O cabeçalho da ordem).
  // Permite consultar rápido todas as ordens de uma safra.
  ordensCorte: '&id, companyId, safra, status, syncStatus, [companyId+safra], [companyId+safra+status]',

  // Tabela pivô/vínculo entre Ordem de Corte e Talhão.
  // Permite consultar rápido em qual ordem um talhão está vinculado.
  ordensCorteTalhoes: '&id, companyId, safra, talhaoId, ordemCorteId, status, syncStatus, [companyId+safra], [companyId+safra+talhaoId], [companyId+safra+talhaoId+status]'
});

// Aumentamos a versão do Dexie para acomodar o Módulo Premissas e Cadastros Mestres.
// É crítico não quebrar os dados antigos, então fazemos apenas um upgrade incremental.
db.version(7).stores({
  // === Cadastro Geral: Propriedades Agrícolas (Fazendas e Talhões baseados em planilha) ===
  fazendas: '&id, companyId, codFaz, desFazenda, syncStatus, [companyId+codFaz]',

  // Guardamos todos os 45 campos aqui no Talhão
  talhoes: '&id, fazendaId, companyId, talhao, syncStatus, [companyId+fazendaId], [companyId+fazendaId+talhao]',

  // === Módulo Premissas / Tratos Culturais ===
  // Estrutura Base
  modulos: '&id, nome, status',

  // Protocolos (Receitas Mestres) de um Módulo
  protocolos: '&id, moduloId, nome, status, companyId, syncStatus, [companyId+moduloId]',

  // Operações que compõem o Protocolo (agora nascem dentro da Receita)
  protocoloOperacoes: '&id, protocoloId, nome, status, ordem, syncStatus, [protocoloId+ordem]',

  // Itens (Produtos) que compõem o Protocolo. Representa a Subcoleção no PostgreSQL.
  protocoloItens: '&id, protocoloId, produtoId, status, ordem, syncStatus, [protocoloId+ordem]',

  // === Cadastros Mestres ===
  produtos: '&id, codigo, nome, categoriaId, unidadePadraoId, status, companyId, syncStatus, [companyId+categoriaId]',
  categoriasProduto: '&id, nome, sigla, status, companyId, syncStatus',
  unidadesMedida: '&id, nome, sigla, status, companyId, syncStatus',

  // === Log Centralizado / Auditoria ===
  auditoriaLogs: '&id, entidade, entidadeId, acao, usuarioId, timestamp, companyId, syncStatus, [companyId+entidade]'
});

// Aumentamos a versão do Dexie para acomodar o Cadastro de Variedades.
db.version(8).stores({
  // === Cadastros Mestres: Variedades ===
  // Armazena as variedades da cana de açúcar importadas via planilha.
  variedades: '&id, codigo, variedade, tipoMaturacao, inicioJanela, fimJanela, status, companyId, syncStatus, [companyId+variedade]'
});

// Aumentamos a versão do Dexie para acomodar o Cadastro de Operações.
db.version(9).stores({
  // === Cadastros Mestres: Operações ===
  // Armazena as operações importadas via planilha.
  operacoes: '&id, codCcustoRateio, cdCcusto, deCcusto, cdOperacao, deOperacao, unidade, tipoOperacao, classe, status, companyId, syncStatus, [companyId+cdOperacao]'
});

// Aumentamos a versão do Dexie para acomodar o Cadastro de Insumos.
db.version(10).stores({
  // === Cadastros Mestres: Insumos ===
  // Armazena os insumos importados via planilha.
  insumos: '&id, codInsumoRateio, codInsumo, descInsumo, descGrupo, descSubgrupo, und, vlrUnit, dtVlrUnit, nomeComercial, doseMedia, doseMinima, doseMaxima, status, companyId, syncStatus, [companyId+codInsumo]'
});

// Aumentamos a versão do Dexie para acomodar a Produção Agrícola.
db.version(11).stores({
  // === Cadastros Mestres: Produção Agrícola ===
  // Armazena os dados de produção importados via planilha.
  producaoAgricola: '&id, codFaz, desFazenda, talhao, areaHa, corte, dtUltCorte, tchEst, tonEst, tchFechado, tonFechada, atrReal, status, companyId, syncStatus, [companyId+codFaz], [companyId+codFaz+talhao]'
});

// Aumentamos a versão do Dexie para acomodar os Apontamentos de Insumo.
db.version(12).stores({
  // === Cadastros Mestres: Apontamentos de Insumo ===
  // Armazena os apontamentos importados via planilha (cada linha é um novo registro).
  apontamentosInsumo: '&id, cluster, empresa, modAdm, instancia, dtHistorico, cdCcusto, deCcusto, cdOp, deOperacao, undOper, codFaz, desFazenda, bloco, desBloco, talhao, etapa, codInsumo, descInsumo, haAplic, qtdeAplic, doseAplic, doseRec, vlrUnit, totalRs, status, companyId, syncStatus, [companyId+codInsumo]'
});

// Aumentamos a versão do Dexie para acomodar o módulo de Ordem de Serviço (Tratos Culturais).
db.version(13).stores({
  // Tabela mestre para as Ordens de Serviço (Tratos Culturais).
  ordensServico: '&id, sequencial, companyId, safra, status, syncStatus, [companyId+safra], [companyId+safra+status]',
  // Tabela pivô/vínculo entre Ordem de Serviço e Talhão.
  ordensServicoTalhoes: '&id, companyId, safra, talhaoId, ordemServicoId, status, syncStatus, [companyId+safra], [companyId+safra+talhaoId], [companyId+safra+talhaoId+status]'
});

// Aumentamos a versão do Dexie para acomodar a nova camada de Planejamento Safra.
db.version(14).stores({
  // Tabela mestre para o Planejamento Safra (A camada do mapa).
  // Chave de agrupamento (bloco): companyId + safra + fazendaId + bloco + frenteColheita + mesColheita
  planejamentoSafra: '&id, companyId, safra, fazendaId, bloco, talhaoId, frenteColheita, mesColheita, sequencia, statusPlanejamento, syncStatus, [companyId+safra], [companyId+safra+fazendaId+bloco+frenteColheita+mesColheita], [companyId+safra+talhaoId]'
});

// Aumentamos a versão do Dexie para acomodar a Projeção Consolidada do Mapa
db.version(15).stores({
  // Tabela para a camada de projeção consolidada do mapa.
  // Será reconstruída localmente pelo mapProjectionService para centralizar os cruzamentos de dados,
  // permitindo que o mapa e hooks leiam diretamente daqui de forma otimizada no futuro.
  mapProjection: '&id, talhaoId, featureId, safra, companyId, codFaz, [companyId+safra], [companyId+talhaoId]'
});

// Aumentamos a versão do Dexie para acomodar o Planejamento de Tratos Culturais do mapa.
db.version(16).stores({
  planejamentoTratos: '&id, sequencial, companyId, safra, status, syncStatus, [companyId+safra], [companyId+safra+status]',
  planejamentoTratosTalhoes: '&id, companyId, safra, talhaoId, planejamentoId, status, syncStatus, [companyId+safra], [companyId+safra+talhaoId], [companyId+safra+talhaoId+status]'
});

// Aumentamos a versão do Dexie para indexar fazenda nas solicitações (ordens) de corte.
db.version(17).stores({
  ordensCorte: '&id, companyId, safra, status, fazendaId, id_fazenda, nome_fazenda, syncStatus, [companyId+safra], [companyId+safra+status], [companyId+safra+id_fazenda]',
  ordensCorteTalhoes: '&id, companyId, safra, talhaoId, ordemCorteId, status, fazendaId, id_fazenda, nome_fazenda, syncStatus, [companyId+safra], [companyId+safra+talhaoId], [companyId+safra+talhaoId+status], [companyId+safra+ordemCorteId]'
});

// Aumentamos a versão do Dexie para indexar fazenda nas Ordens de Serviço igual à Ordem de Corte.
db.version(18).stores({
  ordensServico: '&id, sequencial, companyId, safra, status, fazendaId, id_fazenda, nome_fazenda, syncStatus, [companyId+safra], [companyId+safra+status], [companyId+safra+id_fazenda]',
  ordensServicoTalhoes: '&id, companyId, safra, talhaoId, ordemServicoId, status, fazendaId, id_fazenda, nome_fazenda, syncStatus, [companyId+safra], [companyId+safra+talhaoId], [companyId+safra+talhaoId+status], [companyId+safra+ordemServicoId]'
});


// Aumentamos a versão do Dexie para acomodar os módulos de Apontamento de Broca e Perda.
db.version(19).stores({
  // Apontamentos feitos no campo. Online salva no PostgreSQL; offline fica pendente aqui até sincronizar.
  lancamentosBroca: '&id, uuidLocal, companyId, fazendaCodigo, talhao, dataInspecao, syncStatus, status, createdAt, updatedAt, syncedAt, [companyId+syncStatus], [companyId+fazendaCodigo], [companyId+dataInspecao]',
  lancamentosPerda: '&id, uuidLocal, companyId, fazendaCodigo, talhao, data, syncStatus, status, createdAt, updatedAt, syncedAt, [companyId+syncStatus], [companyId+fazendaCodigo], [companyId+data]'
});


// Aumentamos a versão do Dexie para acomodar o módulo Complexo de Murcha.
db.version(20).stores({
  lancamentosComplexoMurcha: '&id, uuidLocal, companyId, fazendaCodigo, talhao, dataAvaliacao, syncStatus, status, createdAt, updatedAt, syncedAt, [companyId+syncStatus], [companyId+fazendaCodigo], [companyId+dataAvaliacao]'
});

export default db;
