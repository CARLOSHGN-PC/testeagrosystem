export const ACCESS_MODULES = [
  'mapas',
  'estimativa_safra',
  'planejamento_safra',
  'ordem_corte',
  'tratos_culturais',
  'premissas',
  'cadastros_mestres',
  'cadastro_profissional',
  'relatorio_estimativa',
  'dashboards',
  'dados_dashboard',
  'gerenciamento_ordem_corte',
  'gerenciamento_ordem_servico',
  'aprovacao_solicitacoes_servico',
  'configuracao_empresa',
  'gerenciamento_usuarios',
  'gerenciamento_empresas'
];

export const MODULE_LABELS = {
  mapas: 'Mapas',
  estimativa_safra: 'Estimativa Safra',
  planejamento_safra: 'Planejamento Safra',
  ordem_corte: 'Camada Ordem de Corte',
  tratos_culturais: 'Camada Tratos Culturais',
  premissas: 'Premissas',
  cadastros_mestres: 'Cadastro Geral',
  cadastro_profissional: 'Cadastro Profissional',
  relatorio_estimativa: 'Relatórios',
  dashboards: 'Dashboards',
  dados_dashboard: 'Dados Dashboard',
  gerenciamento_ordem_corte: 'Ordens de Corte',
  gerenciamento_ordem_servico: 'Ordens de Serviço',
  aprovacao_solicitacoes_servico: 'Aprovação de Solicitações',
  configuracao_empresa: 'Configuração da Empresa',
  gerenciamento_usuarios: 'Gerenciamento de Usuários',
  gerenciamento_empresas: 'Gerenciamento de Empresas'
};

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN_EMPRESA: 'admin_empresa',
  GESTOR: 'gestor',
  OPERADOR: 'operador',
  VISUALIZADOR: 'visualizador'
};

export const ROLE_DEFAULT_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: {
    mapas: true,
    estimativa_safra: true,
    planejamento_safra: true,
    ordem_corte: true,
    tratos_culturais: true,
    premissas: true,
    cadastros_mestres: true,
    cadastro_profissional: true,
    relatorio_estimativa: true,
    dashboards: true,
    dados_dashboard: true,
    gerenciamento_ordem_corte: true,
    gerenciamento_ordem_servico: true,
    aprovacao_solicitacoes_servico: true,
    configuracao_empresa: true,
    gerenciamento_usuarios: true,
    gerenciamento_empresas: true
  },
  [ROLES.ADMIN_EMPRESA]: {
    mapas: true,
    estimativa_safra: true,
    planejamento_safra: true,
    ordem_corte: true,
    tratos_culturais: true,
    premissas: true,
    cadastros_mestres: true,
    cadastro_profissional: true,
    relatorio_estimativa: true,
    dashboards: true,
    dados_dashboard: true,
    gerenciamento_ordem_corte: true,
    gerenciamento_ordem_servico: true,
    aprovacao_solicitacoes_servico: true,
    configuracao_empresa: true,
    gerenciamento_usuarios: true,
    gerenciamento_empresas: false
  },
  [ROLES.GESTOR]: {
    mapas: true,
    estimativa_safra: true,
    planejamento_safra: true,
    ordem_corte: true,
    tratos_culturais: true,
    premissas: true,
    cadastros_mestres: true,
    cadastro_profissional: true,
    relatorio_estimativa: true,
    dashboards: true,
    dados_dashboard: true,
    gerenciamento_ordem_corte: true,
    gerenciamento_ordem_servico: true,
    aprovacao_solicitacoes_servico: true,
    configuracao_empresa: false,
    gerenciamento_usuarios: false,
    gerenciamento_empresas: false
  },
  [ROLES.OPERADOR]: {
    mapas: true,
    estimativa_safra: false,
    planejamento_safra: false,
    ordem_corte: false,
    tratos_culturais: false,
    premissas: false,
    cadastros_mestres: false,
    cadastro_profissional: false,
    relatorio_estimativa: true,
    dashboards: true,
    dados_dashboard: true,
    gerenciamento_ordem_corte: true,
    gerenciamento_ordem_servico: true,
    aprovacao_solicitacoes_servico: false,
    configuracao_empresa: false,
    gerenciamento_usuarios: false,
    gerenciamento_empresas: false
  },
  [ROLES.VISUALIZADOR]: {
    mapas: true,
    estimativa_safra: false,
    planejamento_safra: false,
    ordem_corte: false,
    tratos_culturais: false,
    premissas: false,
    cadastros_mestres: false,
    cadastro_profissional: false,
    relatorio_estimativa: true,
    dashboards: true,
    dados_dashboard: true,
    gerenciamento_ordem_corte: false,
    gerenciamento_ordem_servico: false,
    aprovacao_solicitacoes_servico: false,
    configuracao_empresa: false,
    gerenciamento_usuarios: false,
    gerenciamento_empresas: false
  }
};

export const createDisabledModules = () => ACCESS_MODULES.reduce((acc, moduleKey) => ({ ...acc, [moduleKey]: false }), {});

export const MAP_LAYER_MODULE_KEYS = ['estimativa_safra', 'planejamento_safra', 'ordem_corte', 'tratos_culturais'];

export const normalizeEnabledModules = (modules = {}) => {
  const normalized = { ...createDisabledModules(), ...(modules || {}) };
  const hasAnyMapLayerEnabled = MAP_LAYER_MODULE_KEYS.some((moduleKey) => normalized[moduleKey] === true);

  if ((modules || {}).dados_dashboard === undefined && normalized.dashboards === true) {
    normalized.dados_dashboard = true;
  }

  if (hasAnyMapLayerEnabled) {
    normalized.mapas = true;
  }

  if (normalized.mapas !== true) {
    MAP_LAYER_MODULE_KEYS.forEach((moduleKey) => {
      normalized[moduleKey] = false;
    });
  }

  return normalized;
};
