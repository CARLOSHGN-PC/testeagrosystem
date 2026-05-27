import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma.js';

const TEMP_PASSWORD = process.env.POSTGRES_TEMP_PASSWORD || '123456789';
const ACCESS_SECRET = process.env.JWT_SECRET || 'agro_system_jwt_secret_local';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'agro_system_refresh_secret_local';
const ACCESS_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

const ALL_MODULES = [
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
  'gerenciamento_empresas',
];

function allPermissions() {
  return ALL_MODULES.reduce((acc, key) => {
    acc[key] = true;
    return acc;
  }, {});
}

function normalizeRole(role) {
  const value = String(role || '').toUpperCase();
  if (value === 'ADMIN') return 'admin_empresa';
  if (value === 'MANAGER') return 'gestor';
  if (value === 'USER') return 'operador';
  return String(role || 'operador').toLowerCase();
}

function normalizeUserStatus(status) {
  const value = String(status || '').toUpperCase();
  if (value === 'INATIVO' || value === 'INACTIVE') return 'inativo';
  return 'ativo';
}

function normalizeCompanyStatus(status) {
  const value = String(status || '').toUpperCase();
  if (value === 'INATIVO' || value === 'INACTIVE') return 'inactive';
  return 'active';
}

function publicCompany(company) {
  if (!company) return null;
  const companyId = company.code || company.id;
  return {
    id: company.id,
    companyId,
    code: company.code || companyId,
    name: company.name || companyId,
    status: normalizeCompanyStatus(company.status),
    plan: company.plan || 'postgres',
    maxUsers: company.maxUsers || null,
    logoColor: company.logoColor || '#55AB52',
    enabledModules: company.enabledModules || allPermissions(),
    source: 'postgres',
  };
}

function publicUser(user) {
  const company = publicCompany(user.company);
  const role = normalizeRole(user.role);
  return {
    uid: user.id,
    id: user.id,
    nome: user.name || user.email,
    name: user.name || user.email,
    email: user.email,
    role,
    status: normalizeUserStatus(user.status),
    readOnly: role === 'visualizador',
    companyId: company?.companyId || user.companyId,
    companyDbId: user.companyId,
    company,
    permissions: allPermissions(),
    source: 'postgres',
  };
}

function buildSession(user) {
  const safeUser = publicUser(user);
  return {
    user: safeUser,
    company: safeUser.company,
    loadedAt: Date.now(),
    authProvider: 'postgres',
  };
}

function signTokens(user) {
  const company = user.company || null;
  const payload = {
    sub: user.id,
    uid: user.id,
    email: user.email,
    role: normalizeRole(user.role),
    companyId: company?.code || user.companyId,
    companyDbId: user.companyId,
    provider: 'postgres',
  };

  return {
    accessToken: jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES_IN }),
    refreshToken: jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES_IN }),
  };
}

async function findUserByEmail(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  return prisma.user.findFirst({
    where: {
      email: {
        equals: normalizedEmail,
        mode: 'insensitive',
      },
    },
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

    if (normalizeUserStatus(user.status) !== 'ativo') {
      return res.status(403).json({ success: false, message: 'Usuário inativo.' });
    }

    if (user.company && normalizeCompanyStatus(user.company.status) !== 'active') {
      return res.status(403).json({ success: false, message: 'Empresa inativa.' });
    }

    let passwordOk = false;

    if (user.passwordHash === 'MIGRATED_FROM_FIREBASE_AUTH') {
      passwordOk = password === TEMP_PASSWORD;
      if (passwordOk) {
        const hash = await bcrypt.hash(password, 12);
        await prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: hash },
        });
        user.passwordHash = hash;
      }
    } else {
      passwordOk = await bcrypt.compare(password, user.passwordHash);
    }

    if (!passwordOk) {
      return res.status(401).json({ success: false, message: 'E-mail ou senha incorretos.' });
    }

    const freshUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { company: true },
    });

    const tokens = signTokens(freshUser);
    const session = buildSession(freshUser);

    return res.json({
      success: true,
      provider: 'postgres',
      ...tokens,
      session,
      user: session.user,
      company: session.company,
    });
  } catch (error) {
    console.error('[authPostgres] login error:', error);
    return res.status(500).json({ success: false, message: 'Erro ao realizar login.' });
  }
}

export async function mePostgres(req, res) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Token não informado.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, ACCESS_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.sub || decoded.uid },
      include: { company: true },
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Usuário não encontrado.' });
    }

    const session = buildSession(user);
    return res.json({ success: true, session, user: session.user, company: session.company });
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Sessão inválida ou expirada.' });
  }
}

export async function refreshPostgres(req, res) {
  try {
    const refreshToken = req.body?.refreshToken || req.headers['x-refresh-token'];
    if (!refreshToken) {
      return res.status(401).json({ success: false, message: 'Refresh token não informado.' });
    }

    const decoded = jwt.verify(refreshToken, REFRESH_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub || decoded.uid },
      include: { company: true },
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Usuário não encontrado.' });
    }

    const tokens = signTokens(user);
    const session = buildSession(user);

    return res.json({ success: true, ...tokens, session, user: session.user, company: session.company });
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Refresh token inválido.' });
  }
}

export async function logoutPostgres(req, res) {
  return res.json({ success: true });
}
