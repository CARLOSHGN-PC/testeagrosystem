import { ACCESS_MODULES, normalizeEnabledModules } from '../constants/accessModules.js';

function normalizeRoleValue(role) {
  return String(role || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isCompanyAdminRole(role) {
  const value = normalizeRoleValue(role);
  return value === 'adminempresa' || value === 'admin' || value === 'administrador';
}

function isPrivilegedModuleRole(authUser) {
  return isSuperAdminRole(authUser?.role) || isCompanyAdminRole(authUser?.role);
}

function normalizeCompanyId(value) {
  return String(value || '').trim().toLowerCase();
}

export function isSuperAdminRole(role) {
  const value = normalizeRoleValue(role);
  return value === 'superadmin' || value === 'superadminuser' || value === 'root' || value === 'owner';
}

function sameCompanyRef(a, b) {
  return normalizeCompanyId(a) && normalizeCompanyId(a) === normalizeCompanyId(b);
}

export function resolveScopedCompanyId(req, source = {}) {
  const authUser = req.authUser || req.user || {};
  const requested = source.companyId || req.params?.companyId || req.query?.companyId || req.body?.companyId;
  const tokenCompanyCode = authUser.companyId;
  const tokenCompanyDbId = authUser.companyDbId;

  if (isSuperAdminRole(authUser.role)) {
    const value = requested || req.companyId || tokenCompanyCode || tokenCompanyDbId;
    if (!value) throw new Error('companyId obrigatório para super_admin.');
    return String(value).trim();
  }

  const value = tokenCompanyCode || tokenCompanyDbId;
  if (!value) throw new Error('Empresa não encontrada no token/JWT.');
  return String(value).trim();
}

function resolveCompanyModules(companyModules = null) {
  const source = companyModules && typeof companyModules === 'object' ? companyModules : {};
  const hasAnyConfiguredModule = ACCESS_MODULES.some((moduleKey) => Object.prototype.hasOwnProperty.call(source, moduleKey));
  if (!companyModules || !hasAnyConfiguredModule) {
    return ACCESS_MODULES.reduce((acc, moduleKey) => ({ ...acc, [moduleKey]: true }), {});
  }
  return normalizeEnabledModules(source);
}

export function requireModuleAccess(moduleKey) {
  return (req, res, next) => {
    if (!ACCESS_MODULES.includes(moduleKey)) {
      return res.status(400).json({ success: false, message: 'Módulo inválido.' });
    }

    if (isPrivilegedModuleRole(req.authUser)) return next();

    const companyModules = resolveCompanyModules(req.company?.enabledModules);
    const userPermissions = req.authUser.permissions || {};
    const hasAccess = companyModules[moduleKey] === true && userPermissions[moduleKey] === true;

    if (!hasAccess) {
      return res.status(403).json({ success: false, message: 'Acesso ao módulo não permitido.' });
    }

    next();
  };
}

export function enforceCompanyScope(req, res, next) {
  try {
    const authUser = req.authUser || req.user || {};
    const requestedCompanyId = req.params?.companyId || req.query?.companyId || req.body?.companyId;
    const tokenCompanyCode = authUser.companyId;
    const tokenCompanyDbId = authUser.companyDbId;

    if (!isSuperAdminRole(authUser.role) && !tokenCompanyCode && !tokenCompanyDbId) {
      return res.status(401).json({ success: false, message: 'Empresa não encontrada no token/JWT.' });
    }

    if (requestedCompanyId && !isSuperAdminRole(authUser.role)) {
      const allowed = sameCompanyRef(requestedCompanyId, tokenCompanyCode) || sameCompanyRef(requestedCompanyId, tokenCompanyDbId);
      if (!allowed) {
        return res.status(403).json({ success: false, message: 'Acesso cruzado entre empresas não permitido.' });
      }
    }

    req.companyId = resolveScopedCompanyId(req);
    req.companyDbId = tokenCompanyDbId || req.companyDbId;

    // Para usuário comum, o backend sempre impõe a empresa do JWT.
    // O frontend pode mandar companyId para compatibilidade, mas ele não decide o escopo.
    if (!isSuperAdminRole(authUser.role)) {
      if (req.query) req.query.companyId = req.companyId;
      if (req.body && typeof req.body === 'object') req.body.companyId = req.companyId;
    }

    return next();
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || 'Erro ao validar empresa.' });
  }
}

export function isReadOnlyUser(authUser) {
  return authUser?.readOnly === true || authUser?.role === 'visualizador';
}

export function requireWriteAccess(moduleKey) {
  return (req, res, next) => {
    if (!ACCESS_MODULES.includes(moduleKey)) {
      return res.status(400).json({ success: false, message: 'Módulo inválido.' });
    }

    if (isPrivilegedModuleRole(req.authUser)) return next();

    const companyModules = resolveCompanyModules(req.company?.enabledModules);
    const userPermissions = req.authUser.permissions || {};
    const hasAccess = companyModules[moduleKey] === true && userPermissions[moduleKey] === true;

    if (!hasAccess) {
      return res.status(403).json({ success: false, message: 'Acesso ao módulo não permitido.' });
    }

    if (isReadOnlyUser(req.authUser)) {
      return res.status(403).json({ success: false, message: 'Usuário com acesso somente leitura.' });
    }

    next();
  };
}
