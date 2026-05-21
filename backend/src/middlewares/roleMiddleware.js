function normalizeRoleValue(role) {
  return String(role || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function roleMatches(actualRole, expectedRole) {
  const actual = normalizeRoleValue(actualRole);
  const expected = normalizeRoleValue(expectedRole);

  if (!actual || !expected) return false;

  const superAdminValues = new Set(['superadmin', 'superadminuser', 'root', 'owner']);
  const adminEmpresaValues = new Set(['adminempresa', 'admin', 'administrador']);

  if (superAdminValues.has(actual)) return true;
  if (superAdminValues.has(expected)) return superAdminValues.has(actual);
  if (adminEmpresaValues.has(expected)) return adminEmpresaValues.has(actual);

  return actual === expected;
}

export function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.authUser || !roles.some((role) => roleMatches(req.authUser.role, role))) {
      return res.status(403).json({ success: false, message: 'Permissão insuficiente para esta ação.' });
    }
    next();
  };
}
