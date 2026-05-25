import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { getUserAccess, normalizeRole, normalizeStatus, resolveCompanyModules, isSuperAdminIdentity } from '../services/accessControlService.js';

const TEMP_DEFAULT_PASSWORD = process.env.POSTGRES_TEMP_PASSWORD || '123456789';

function getJwtSecrets() {
  const accessSecret = process.env.JWT_SECRET || 'agro_system_jwt_secret_local';
  const refreshSecret = process.env.JWT_REFRESH_SECRET || 'agro_system_refresh_secret_local';
  return { accessSecret, refreshSecret };
}

function signAccessToken(user) {
  const { accessSecret } = getJwtSecrets();
  return jwt.sign(
    {
      sub: user.id,
      uid: user.id,
      email: user.email,
      companyId: user.companyId,
      role: user.role,
    },
    accessSecret,
    { expiresIn: '8h' }
  );
}

function signRefreshToken(user) {
  const { refreshSecret } = getJwtSecrets();
  return jwt.sign(
    {
      sub: user.id,
      uid: user.id,
      email: user.email,
      companyId: user.companyId,
      role: user.role,
      type: 'refresh',
    },
    refreshSecret,
    { expiresIn: '30d' }
  );
}

export async function buildSession(user) {
  const company = user.company || null;
  const companyModules = resolveCompanyModules(company?.enabledModules);
  const dbRole = await isSuperAdminIdentity(user.email, user.role) ? 'super_admin' : normalizeRole(user.role);
  const status = normalizeStatus(user.status);
  const access = await getUserAccess(user.id, dbRole, companyModules);
  const role = access.roleReal || access.role || dbRole;

  return {
    user: {
      uid: user.id,
      id: user.id,
      nome: user.name || user.email,
      name: user.name || user.email,
      email: user.email,
      companyId: company?.code || user.companyId,
      companyDbId: user.companyId,
      role,
      status,
      readOnly: access.readOnly,
      permissions: access.permissions,
      source: 'postgres',
    },
    company: company
      ? {
          id: company.id,
          companyId: company.code || company.id,
          companyDbId: company.id,
          name: company.name,
          code: company.code,
          status: normalizeStatus(company.status) === 'ativo' ? 'active' : 'inactive',
          plan: company.plan || 'basic',
          maxUsers: company.maxUsers || 0,
          enabledModules: companyModules,
          source: 'postgres',
        }
      : null,
    loadedAt: Date.now(),
  };
}

async function findUserByEmail(email) {
  return prisma.user.findUnique({
    where: { email: String(email || '').trim().toLowerCase() },
    include: { company: true },
  });
}

export async function loginPostgres(req, res) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Informe e-mail e senha.' });
    }

    const user = await findUserByEmail(email);

    if (!user) {
      return res.status(401).json({ success: false, message: 'E-mail ou senha incorretos.' });
    }

    if (normalizeStatus(user.status) !== 'ativo') {
      return res.status(403).json({ success: false, message: 'Usuário inativo.' });
    }

    if (user.company && normalizeStatus(user.company.status) !== 'ativo') {
      return res.status(403).json({ success: false, message: 'Empresa inativa.' });
    }

    let valid = false;

    try {
      valid = await bcrypt.compare(password, user.passwordHash || '');
    } catch {
      valid = false;
    }

    // Migração PostgreSQL -> PostgreSQL:
    // usuários antigos podem ainda estar com hash placeholder ou hash não aplicado.
    // A senha temporária padrão entra uma vez e já grava o bcrypt correto no PostgreSQL.
    if (!valid && password === TEMP_DEFAULT_PASSWORD) {
      const migratedPlaceholder =
        !user.passwordHash ||
        user.passwordHash === 'MIGRATED_FROM_FIREBASE_AUTH' ||
        !String(user.passwordHash).startsWith('$2');

      if (migratedPlaceholder) {
        const passwordHash = await bcrypt.hash(TEMP_DEFAULT_PASSWORD, 10);
        await prisma.user.update({
          where: { id: user.id },
          data: { passwordHash },
        });
        valid = true;
      }
    }

    if (!valid) {
      return res.status(401).json({ success: false, message: 'E-mail ou senha incorretos.' });
    }

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    const session = await buildSession(user);

    return res.json({
      success: true,
      accessToken,
      refreshToken,
      session,
      user: session.user,
      company: session.company,
    });
  } catch (error) {
    console.error('[authPostgresController.loginPostgres] erro:', error);
    return res.status(500).json({ success: false, message: 'Erro ao realizar login.' });
  }
}

export async function mePostgres(req, res) {
  try {
    const userId = req.authUser?.id || req.authUser?.uid || req.user?.id || req.user?.uid;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Sessão inválida.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
    }

    const session = await buildSession(user);

    return res.json({
      success: true,
      session,
      user: session.user,
      company: session.company,
    });
  } catch (error) {
    console.error('[authPostgresController.mePostgres] erro:', error);
    return res.status(500).json({ success: false, message: 'Erro ao carregar sessão.' });
  }
}

export async function refreshPostgres(req, res) {
  try {
    const refreshToken = req.body?.refreshToken;

    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Refresh token não informado.' });
    }

    const { refreshSecret } = getJwtSecrets();
    const decoded = jwt.verify(refreshToken, refreshSecret);

    if (decoded.type !== 'refresh') {
      return res.status(401).json({ success: false, message: 'Refresh token inválido.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.sub || decoded.uid },
      include: { company: true },
    });

    if (!user || normalizeStatus(user.status) !== 'ativo') {
      return res.status(401).json({ success: false, message: 'Sessão expirada.' });
    }

    const accessToken = signAccessToken(user);
    const session = await buildSession(user);

    return res.json({
      success: true,
      accessToken,
      refreshToken,
      session,
      user: session.user,
      company: session.company,
    });
  } catch (error) {
    console.error('[authPostgresController.refreshPostgres] erro:', error);
    return res.status(401).json({ success: false, message: 'Sessão expirada.' });
  }
}

export async function logoutPostgres(req, res) {
  return res.json({ success: true });
}
