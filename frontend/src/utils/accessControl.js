import { ACCESS_MODULES, ROLES, ROLE_DEFAULT_PERMISSIONS, createDisabledModules, normalizeEnabledModules } from '../constants/accessModules';

const COMPANY_CONTEXT_OPTIONAL_MODULES = new Set([
  'gerenciamento_usuarios',
  'gerenciamento_empresas'
]);

export const MAP_LAYER_PERMISSION_MAP = {
  estimativa: 'estimativa_safra',
  planejamentoSafra: 'planejamento_safra',
  ordemCorte: 'ordem_corte',
  tratosCulturais: 'tratos_culturais'
};

export function isSuperAdmin(session) {
  const value = String(session?.user?.role || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return value === 'superadmin' || value === 'superadminuser' || value === 'root' || value === 'owner';
}

export function canManageCompanies(session) {
  return isSuperAdmin(session);
}

export function isCompanyAdmin(session) {
  const value = String(session?.user?.role || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return value === 'adminempresa' || value === 'admin' || value === 'administrador';
}

export function canManageUsers(session) {
  return isSuperAdmin(session) || isCompanyAdmin(session);
}

export function getRolePermissions(role) {
  return { ...createDisabledModules(), ...(ROLE_DEFAULT_PERMISSIONS[role] || {}) };
}

export function getCompanyModules(session) {
  return {
    ...normalizeEnabledModules(session?.company?.enabledModules || {})
  };
}

export function getUserPermissions(session) {
  const baseRolePermissions = getRolePermissions(session?.user?.role);
  return {
    ...baseRolePermissions,
    ...(session?.user?.permissions || {})
  };
}

export function moduleRequiresCompanyContext(moduleKey) {
  return !COMPANY_CONTEXT_OPTIONAL_MODULES.has(moduleKey);
}

export function hasCompanyContext(session) {
  return Boolean(session?.user?.companyId);
}

export function hasModuleAccess(session, moduleKey) {
  if (!moduleKey || !session?.user) return false;
  if (isSuperAdmin(session)) return true;
  if (isCompanyAdmin(session) && moduleKey !== 'gerenciamento_empresas') return true;

  const userPermissions = getUserPermissions(session);
  const requiresCompanyContext = moduleRequiresCompanyContext(moduleKey);

  if (!requiresCompanyContext) {
    return userPermissions[moduleKey] === true;
  }

  if (!hasCompanyContext(session)) return false;

  const companyModules = getCompanyModules(session);
  return companyModules[moduleKey] === true && userPermissions[moduleKey] === true;
}


export function hasMapLayerAccess(session, mapLayerKey) {
  if (!mapLayerKey || !session?.user) return false;
  if (isSuperAdmin(session)) return true;
  if (isCompanyAdmin(session)) return true;
  if (!hasModuleAccess(session, 'mapas')) return false;

  const permissionKey = MAP_LAYER_PERMISSION_MAP[mapLayerKey];
  if (!permissionKey) return false;

  return hasModuleAccess(session, permissionKey);
}

export function getFirstAccessibleModule(session) {
  const candidates = [
    ['dashboards', 'dashboards'],
    ['dadosDashboard', 'dados_dashboard'],
    ['estimativa', 'mapas'],
    ['companyManagement', 'gerenciamento_empresas'],
    ['userManagement', 'gerenciamento_usuarios'],
    ['premissas', 'premissas'],
    ['cadastros_mestres', 'cadastros_mestres'],
    ['cadastroProfissional', 'cadastro_profissional'],
    ['relatorioEstimativa', 'relatorio_estimativa'],
    ['gerenciamentoOrdemCorte', 'gerenciamento_ordem_corte'],
    ['gerenciamentoOrdemServico', 'gerenciamento_ordem_servico'],
    ['aprovacaoSolicitacoesServico', 'aprovacao_solicitacoes_servico'],
    ['configuracao', 'configuracao_empresa']
  ];

  const found = candidates.find(([, permissionKey]) => hasModuleAccess(session, permissionKey));
  return found?.[0] || null;
}


export function isReadOnlyUser(session) {
  return session?.user?.readOnly === true || session?.user?.role === ROLES.VISUALIZADOR;
}

export function canWriteModule(session, moduleKey) {
  return hasModuleAccess(session, moduleKey) && !isReadOnlyUser(session);
}
