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
  'dashboard_entrada_cana',
  'dashboard_talhoes_fechados',
  'dados_dashboard_colheita',
  'dados_dashboard_talhoes_fechados',
  'lancamentos',
  'apontamentos_broca',
  'apontamentos_perda',
  'apontamentos_complexo_murcha',
  'gerenciar_apontamentos',
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
  dashboard_entrada_cana: 'Dashboard - Entrada de Cana',
  dashboard_talhoes_fechados: 'Dashboard - Talhões Fechados',
  dados_dashboard_colheita: 'Dados Dashboard - Colheita',
  dados_dashboard_talhoes_fechados: 'Dados Dashboard - Talhões Fechados',
  lancamentos: 'Apontamentos',
  apontamentos_broca: 'Apontamento Broca',
  apontamentos_perda: 'Apontamento Perda',
  apontamentos_complexo_murcha: 'Complexo de Murcha',
  gerenciar_apontamentos: 'Gerenciar Apontamentos',
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
    dashboard_entrada_cana: true,
    dashboard_talhoes_fechados: true,
    dados_dashboard_colheita: true,
    dados_dashboard_talhoes_fechados: true,
    lancamentos: true,
    apontamentos_broca: true,
    apontamentos_perda: true,
    apontamentos_complexo_murcha: true,
    gerenciar_apontamentos: true,
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
    dashboard_entrada_cana: true,
    dashboard_talhoes_fechados: true,
    dados_dashboard_colheita: true,
    dados_dashboard_talhoes_fechados: true,
    lancamentos: true,
    apontamentos_broca: true,
    apontamentos_perda: true,
    apontamentos_complexo_murcha: true,
    gerenciar_apontamentos: true,
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
    dashboard_entrada_cana: true,
    dashboard_talhoes_fechados: true,
    dados_dashboard_colheita: true,
    dados_dashboard_talhoes_fechados: true,
    lancamentos: true,
    apontamentos_broca: true,
    apontamentos_perda: true,
    apontamentos_complexo_murcha: true,
    gerenciar_apontamentos: true,
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
    dashboard_entrada_cana: true,
    dashboard_talhoes_fechados: true,
    dados_dashboard_colheita: true,
    dados_dashboard_talhoes_fechados: true,
    lancamentos: true,
    apontamentos_broca: true,
    apontamentos_perda: true,
    apontamentos_complexo_murcha: true,
    gerenciar_apontamentos: true,
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
    dashboard_entrada_cana: true,
    dashboard_talhoes_fechados: true,
    dados_dashboard_colheita: true,
    dados_dashboard_talhoes_fechados: true,
    lancamentos: false,
    apontamentos_broca: false,
    apontamentos_perda: false,
    apontamentos_complexo_murcha: false,
    gerenciar_apontamentos: false,
    gerenciamento_ordem_corte: false,
    gerenciamento_ordem_servico: false,
    aprovacao_solicitacoes_servico: false,
    configuracao_empresa: false,
    gerenciamento_usuarios: false,
    gerenciamento_empresas: false
  }
};

export const createDisabledModules = () => ACCESS_MODULES.reduce((acc, moduleKey) => ({ ...acc, [moduleKey]: false }), {});

export const createAllEnabledModules = () => ACCESS_MODULES.reduce((acc, moduleKey) => ({ ...acc, [moduleKey]: true }), {});

export const MAP_LAYER_MODULE_KEYS = ['estimativa_safra', 'planejamento_safra', 'ordem_corte', 'tratos_culturais'];

export const normalizeEnabledModules = (modules = {}) => {
  const source = modules && typeof modules === 'object' ? modules : {};
  const hasAnyConfiguredModule = ACCESS_MODULES.some((moduleKey) => Object.prototype.hasOwnProperty.call(source, moduleKey));
  // Compatibilidade com empresas antigas: enabledModules vazio significa sistema liberado.
  const normalized = hasAnyConfiguredModule
    ? { ...createDisabledModules(), ...source }
    : { ...createAllEnabledModules() };
  const hasAnyMapLayerEnabled = MAP_LAYER_MODULE_KEYS.some((moduleKey) => normalized[moduleKey] === true);

  if (source.dados_dashboard === undefined && normalized.dashboards === true) {
    normalized.dados_dashboard = true;
  }

  if (source.dashboard_entrada_cana === undefined && normalized.dashboards === true) {
    normalized.dashboard_entrada_cana = true;
  }
  if (source.dashboard_talhoes_fechados === undefined && normalized.dashboards === true) {
    normalized.dashboard_talhoes_fechados = true;
  }
  if (source.dados_dashboard_colheita === undefined && normalized.dados_dashboard === true) {
    normalized.dados_dashboard_colheita = true;
  }
  if (source.dados_dashboard_talhoes_fechados === undefined && normalized.dados_dashboard === true) {
    normalized.dados_dashboard_talhoes_fechados = true;
  }

  if (normalized.dashboard_entrada_cana === true || normalized.dashboard_talhoes_fechados === true) {
    normalized.dashboards = true;
  }
  if (normalized.dados_dashboard_colheita === true || normalized.dados_dashboard_talhoes_fechados === true) {
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
