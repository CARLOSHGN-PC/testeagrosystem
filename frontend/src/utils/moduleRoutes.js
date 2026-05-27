export const moduleToRoute = {
  estimativa: '/app/mapas',
  premissas: '/app/premissas',
  cadastros_mestres: '/app/cadastro-geral',
  cadastroProfissional: '/app/cadastro-profissional',
  relatorioEstimativa: '/app/relatorios',
  gerenciamentoOrdemCorte: '/app/solicitacoes/ordens-corte',
  gerenciamentoOrdemServico: '/app/solicitacoes/ordens-servico',
  aprovacaoSolicitacoesServico: '/app/solicitacoes/aprovacao-servico',
  configuracao: '/app/configuracao-empresa',
  userManagement: '/app/usuarios',
  companyManagement: '/app/empresas',
  dashboards: '/app/dashboard',
  dadosDashboard: '/app/dados-dashboard',
  lancamentos: '/app/lancamentos',
};

export const routeToModule = Object.fromEntries(
  Object.entries(moduleToRoute).map(([key, value]) => [value, key])
);

export function getModuleFromPath(defaultModule = 'estimativa') {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  return routeToModule[path] || defaultModule;
}

export function getRouteForModule(moduleKey) {
  return moduleToRoute[moduleKey] || '/app/mapas';
}

export function navigateToModule(moduleKey, { replace = false } = {}) {
  const path = getRouteForModule(moduleKey);
  if (!path || window.location.pathname === path) return;
  const method = replace ? 'replaceState' : 'pushState';
  window.history[method]({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
