import { prisma } from '../lib/prisma.js';
import {
  ACCESS_MODULES,
  ROLES,
  ROLE_DEFAULT_PERMISSIONS,
  createDisabledModules,
  normalizeEnabledModules,
} from '../constants/accessModules.js';

let ensured = false;

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export async function isSuperAdminIdentity(email, role = '') {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === ROLES.SUPER_ADMIN) return true;

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return false;

  await ensureAccessControlTables();
  const rows = await prisma.$queryRawUnsafe(
    'SELECT 1 FROM system_super_admins WHERE email = $1 AND active = true LIMIT 1',
    normalizedEmail
  );
  return Array.isArray(rows) && rows.length > 0;
}

export function normalizeRole(role) {
  const value = String(role || '').trim().toUpperCase();
  if (value === 'ADMIN' || value === 'ADMIN_EMPRESA' || value === 'ADMINISTRADOR') return ROLES.ADMIN_EMPRESA;
  if (value === 'SUPER_ADMIN' || value === 'SUPERADMIN' || value === 'ROOT' || value === 'OWNER') return ROLES.SUPER_ADMIN;
  if (value === 'MANAGER' || value === 'GESTOR') return ROLES.GESTOR;
  if (value === 'VISUALIZADOR' || value === 'VIEWER') return ROLES.VISUALIZADOR;
  return ROLES.OPERADOR;
}

export function normalizeStatus(status) {
  const value = String(status || '').toUpperCase();
  if (value === 'INATIVO' || value === 'INACTIVE') return 'inativo';
  return 'ativo';
}

export function allModulesEnabled() {
  return ACCESS_MODULES.reduce((acc, key) => ({ ...acc, [key]: true }), {});
}

export function resolveCompanyModules(companyModules = null) {
  // Compatibilidade com empresas antigas: quando enabledModules vem vazio/null do banco,
  // o sistema deve continuar liberado como era antes do SaaS.
  if (companyModules === null || companyModules === undefined) return normalizeEnabledModules(allModulesEnabled());
  const modules = companyModules && typeof companyModules === 'object' ? companyModules : {};
  const hasAnyConfiguredModule = ACCESS_MODULES.some((moduleKey) => Object.prototype.hasOwnProperty.call(modules, moduleKey));
  if (!hasAnyConfiguredModule) return normalizeEnabledModules(allModulesEnabled());
  return normalizeEnabledModules(modules);
}

export function defaultPermissionsForRole(role, companyModules = null) {
  const legacyRole = normalizeRole(role);
  const base = { ...createDisabledModules(), ...(ROLE_DEFAULT_PERMISSIONS[legacyRole] || {}) };
  const normalizedCompanyModules = resolveCompanyModules(companyModules);
  return ACCESS_MODULES.reduce((acc, moduleKey) => {
    // super_admin enxerga o sistema inteiro; outros respeitam os módulos contratados/liberados da empresa.
    acc[moduleKey] = legacyRole === ROLES.SUPER_ADMIN ? true : normalizedCompanyModules[moduleKey] === true && base[moduleKey] === true;
    return acc;
  }, {});
}

export function normalizeUserPermissions(permissions = {}, role = ROLES.OPERADOR, companyModules = null) {
  const defaults = defaultPermissionsForRole(role, companyModules);
  const requested = permissions && typeof permissions === 'object' ? permissions : {};
  const normalizedCompanyModules = resolveCompanyModules(companyModules);
  const legacyRole = normalizeRole(role);

  return ACCESS_MODULES.reduce((acc, moduleKey) => {
    if (legacyRole === ROLES.SUPER_ADMIN) {
      acc[moduleKey] = true;
      return acc;
    }
    const companyAllows = normalizedCompanyModules[moduleKey] === true;
    const value = requested[moduleKey] === undefined ? defaults[moduleKey] : requested[moduleKey] === true;
    acc[moduleKey] = companyAllows && value === true;
    return acc;
  }, {});
}

export async function ensureAccessControlTables() {
  if (ensured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS user_access_permissions (
      user_id TEXT PRIMARY KEY,
      permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
      read_only BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS system_super_admins (
      email TEXT PRIMARY KEY,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  ensured = true;
}

export function extractSavedRoleReal(savedPermissions = null, fallbackRole = ROLES.OPERADOR, readOnly = false) {
  const source = savedPermissions && typeof savedPermissions === 'object' ? savedPermissions : {};
  const roleFromJson = source.__roleReal || source.roleReal || source._roleReal;
  const normalizedRole = normalizeRole(roleFromJson || fallbackRole);

  // Compatibilidade com usuários já salvos antes desta correção:
  // se o banco Prisma está como USER, mas o registro salvo era somente leitura,
  // o perfil real deve voltar como visualizador e não como operador.
  if ((readOnly === true) && normalizeRole(fallbackRole) === ROLES.OPERADOR && !roleFromJson) {
    return ROLES.VISUALIZADOR;
  }

  return normalizedRole;
}

export async function getUserAccess(userId, role, companyModules = null) {
  await ensureAccessControlTables();
  const rows = await prisma.$queryRawUnsafe(
    'SELECT permissions, read_only FROM user_access_permissions WHERE user_id = $1 LIMIT 1',
    String(userId)
  );
  const saved = rows?.[0] || null;
  const roleReal = extractSavedRoleReal(saved?.permissions, role, saved?.read_only === true);
  const permissions = normalizeUserPermissions(saved?.permissions || {}, roleReal, companyModules);
  return {
    role: roleReal,
    roleReal,
    permissions,
    readOnly: saved?.read_only === true || roleReal === ROLES.VISUALIZADOR,
  };
}

export async function setUserAccess(userId, permissions = {}, readOnly = false, role = ROLES.OPERADOR, companyModules = null) {
  await ensureAccessControlTables();
  const roleReal = normalizeRole(role);
  const normalized = normalizeUserPermissions(permissions, roleReal, companyModules);
  const ro = readOnly === true || roleReal === ROLES.VISUALIZADOR;
  const persistedPermissions = {
    ...normalized,
    __roleReal: roleReal,
  };

  await prisma.$executeRawUnsafe(
    `INSERT INTO user_access_permissions (user_id, permissions, read_only, updated_at)
     VALUES ($1, $2::jsonb, $3, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET permissions = EXCLUDED.permissions, read_only = EXCLUDED.read_only, updated_at = NOW()`,
    String(userId),
    JSON.stringify(persistedPermissions),
    ro
  );
  return { role: roleReal, roleReal, permissions: normalized, readOnly: ro };
}
