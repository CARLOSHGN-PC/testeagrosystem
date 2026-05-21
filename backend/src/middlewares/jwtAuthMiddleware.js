import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { createDisabledModules } from '../constants/accessModules.js';
import { getUserAccess, normalizeRole, resolveCompanyModules, isSuperAdminIdentity } from '../services/accessControlService.js';

function getAccessSecret() {
  return process.env.JWT_SECRET || 'agro_system_jwt_secret_local';
}

export async function authenticateJwtRequest(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Token não informado.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, getAccessSecret());

    const user = await prisma.user.findUnique({
      where: { id: decoded.sub || decoded.uid },
      include: { company: true },
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Usuário não encontrado.' });
    }

    if (String(user.status || '').toUpperCase() === 'INATIVO') {
      return res.status(403).json({ success: false, message: 'Usuário inativo.' });
    }

    if (user.company && String(user.company.status || '').toUpperCase() === 'INATIVO') {
      return res.status(403).json({ success: false, message: 'Empresa inativa.' });
    }

    const dbRole = await isSuperAdminIdentity(user.email, user.role) ? 'super_admin' : normalizeRole(user.role);
    const companyModules = resolveCompanyModules(user.company?.enabledModules);
    const access = await getUserAccess(user.id, dbRole, companyModules);
    const role = access.roleReal || access.role || dbRole;

    req.authUser = {
      id: user.id,
      uid: user.id,
      email: user.email,
      name: user.name,
      role,
      companyId: user.company?.code || user.companyId,
      companyDbId: user.companyId,
      permissions: access.permissions,
      readOnly: access.readOnly,
      source: 'postgres',
    };

    req.user = req.authUser;
    req.company = user.company
      ? {
          id: user.company.id,
          companyId: user.company.code || user.company.id,
          companyDbId: user.company.id,
          code: user.company.code,
          name: user.company.name,
          enabledModules: companyModules,
          source: 'postgres',
        }
      : { enabledModules: createDisabledModules() };

    next();
  } catch (error) {
    console.error('[jwtAuthMiddleware] erro:', error);
    return res.status(401).json({ success: false, message: 'Token inválido ou expirado.' });
  }
}
