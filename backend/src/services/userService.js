import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma.js';
import { createDisabledModules, ROLES, normalizeEnabledModules } from '../constants/accessModules.js';
import { getUserAccess, setUserAccess, normalizeUserPermissions, resolveCompanyModules, normalizeRole } from './accessControlService.js';

const TEMP_RESET_PASSWORD = process.env.POSTGRES_TEMP_PASSWORD || '123456789';

function sanitizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function sanitizeName(nome) {
  return String(nome || '').trim();
}

function sanitizeCompanyId(companyId) {
  return String(companyId || '').trim();
}

function toPrismaRole(role) {
  const value = String(role || '').trim().toLowerCase();
  if (value === ROLES.SUPER_ADMIN || value === ROLES.ADMIN_EMPRESA || value === 'admin' || value === 'admin_empresa') return 'ADMIN';
  if (value === ROLES.GESTOR || value === 'manager') return 'MANAGER';
  return 'USER';
}

function toLegacyRole(role) {
  const value = String(role || '').toUpperCase();
  if (value === 'ADMIN') return ROLES.ADMIN_EMPRESA;
  if (value === 'MANAGER') return ROLES.GESTOR;
  return ROLES.OPERADOR;
}

function toPrismaStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  return value === 'inativo' || value === 'inactive' ? 'INATIVO' : 'ATIVO';
}

function toLegacyStatus(status) {
  return String(status || '').toUpperCase() === 'INATIVO' ? 'inativo' : 'ativo';
}

async function publicUser(user) {
  const dbRole = toLegacyRole(user.role);
  const companyId = user.company?.code || user.companyId;
  const companyModules = resolveCompanyModules(user.company?.enabledModules);
  const access = await getUserAccess(user.id, dbRole, companyModules);
  const role = access.roleReal || access.role || dbRole;
  return {
    uid: user.id,
    id: user.id,
    nome: user.name,
    name: user.name,
    email: user.email,
    companyId,
    companyDbId: user.companyId,
    company: user.company ? {
      id: user.company.id,
      companyId,
      code: user.company.code || companyId,
      name: user.company.name,
      status: String(user.company.status || '').toUpperCase() === 'INATIVO' ? 'inactive' : 'active',
      plan: user.company.plan || 'basic',
      maxUsers: user.company.maxUsers || 10,
      logoColor: user.company.logoColor || '#55AB52',
      enabledModules: companyModules,
      source: 'postgres'
    } : null,
    role,
    readOnly: access.readOnly,
    status: toLegacyStatus(user.status),
    permissions: access.permissions,
    source: 'postgres'
  };
}

async function findCompanyOrThrow(companyId) {
  const raw = sanitizeCompanyId(companyId);
  const company = await prisma.company.findFirst({
    where: { OR: [{ id: raw }, { code: raw }, { name: raw }] },
    include: { _count: { select: { users: true } } }
  });
  if (!company) throw new Error('Empresa não encontrada.');
  return company;
}

async function assertActorCanManageCompany(actor, company) {
  if (!actor) throw new Error('Usuário autenticado não encontrado.');
  if (actor.role === ROLES.SUPER_ADMIN || actor.role === 'super_admin') return;
  const actorCompany = actor.companyDbId || actor.companyId;
  const targetCompany = company.id || company.companyId || company.code;
  if (![company.id, company.code].includes(actorCompany) && actorCompany !== targetCompany) {
    throw new Error('Escopo de empresa inválido.');
  }
}

export async function listUsers(companyId = null) {
  let companyFilter = {};
  if (companyId) {
    const company = await findCompanyOrThrow(companyId);
    companyFilter = { companyId: company.id };
  }

  const users = await prisma.user.findMany({
    where: companyFilter,
    include: { company: true },
    orderBy: { name: 'asc' }
  });

  return Promise.all(users.map(publicUser));
}

export async function createUser(payload, actor) {
  const company = await findCompanyOrThrow(payload.companyId || actor?.companyId);
  await assertActorCanManageCompany(actor, company);

  const nome = sanitizeName(payload.nome || payload.name);
  const email = sanitizeEmail(payload.email);
  const legacyRole = normalizeRole(payload.role || ROLES.OPERADOR);
  const role = toPrismaRole(legacyRole);
  const status = toPrismaStatus(payload.status);

  if (!nome || !email || !company.id) throw new Error('Nome, e-mail, empresa e perfil são obrigatórios.');
  if (!payload.password || String(payload.password).length < 6) throw new Error('Senha obrigatória com no mínimo 6 caracteres.');

  if (actor?.role !== ROLES.SUPER_ADMIN && legacyRole === ROLES.SUPER_ADMIN) {
    throw new Error('admin_empresa não pode criar super_admin.');
  }

  if (String(company.status || '').toUpperCase() === 'INATIVO') throw new Error('Não é possível cadastrar usuários em empresa inativa.');

  const activeUsers = await prisma.user.count({ where: { companyId: company.id, status: 'ATIVO' } });
  if (activeUsers >= Number(company.maxUsers || 0)) throw new Error('Limite de usuários da empresa atingido.');

  const passwordHash = await bcrypt.hash(String(payload.password), 12);
  const created = await prisma.user.create({
    data: { name: nome, email, companyId: company.id, role, status, passwordHash },
    include: { company: true }
  });

  const companyModules = resolveCompanyModules(company.enabledModules);
  await setUserAccess(created.id, payload.permissions || normalizeUserPermissions({}, legacyRole, companyModules), payload.readOnly === true, legacyRole, companyModules);

  return publicUser(created);
}

export async function updateUser(uid, payload, actor) {
  const current = await prisma.user.findUnique({ where: { id: uid }, include: { company: true } });
  if (!current) throw new Error('Usuário não encontrado.');

  await assertActorCanManageCompany(actor, current.company);
  const nextCompany = await findCompanyOrThrow(payload.companyId || current.companyId);
  await assertActorCanManageCompany(actor, nextCompany);

  const currentDbRole = toLegacyRole(current.role);
  const currentCompanyModules = resolveCompanyModules(current.company?.enabledModules);
  const currentAccess = await getUserAccess(current.id, currentDbRole, currentCompanyModules);
  const legacyRole = normalizeRole(payload.role || currentAccess.roleReal || currentDbRole);
  const role = toPrismaRole(legacyRole);
  if (actor?.role !== ROLES.SUPER_ADMIN && legacyRole === ROLES.SUPER_ADMIN) {
    throw new Error('Não permitido promover para super_admin.');
  }

  if ((actor?.uid === uid || actor?.id === uid) && String(payload.status || '').toLowerCase() === 'inativo') {
    throw new Error('Você não pode inativar a própria conta por aqui.');
  }

  const updated = await prisma.user.update({
    where: { id: uid },
    data: {
      name: sanitizeName(payload.nome || payload.name || current.name),
      email: sanitizeEmail(payload.email || current.email),
      companyId: nextCompany.id,
      role,
      status: payload.status ? toPrismaStatus(payload.status) : current.status
    },
    include: { company: true }
  });

  const companyModules = resolveCompanyModules(nextCompany.enabledModules);
  if (payload.permissions !== undefined || payload.readOnly !== undefined || payload.role !== undefined || payload.companyId !== undefined) {
    const existingPermissions = currentAccess.permissions || {};
    await setUserAccess(updated.id, payload.permissions || existingPermissions, payload.readOnly === true || legacyRole === ROLES.VISUALIZADOR, legacyRole, companyModules);
  }

  return publicUser(updated);
}

export async function updateUserStatus(uid, status, actor) {
  if (!['ativo', 'inativo', 'active', 'inactive'].includes(String(status || '').toLowerCase())) {
    throw new Error('Status inválido para usuário.');
  }

  const current = await prisma.user.findUnique({ where: { id: uid }, include: { company: true } });
  if (!current) throw new Error('Usuário não encontrado.');
  await assertActorCanManageCompany(actor, current.company);

  if ((actor?.uid === uid || actor?.id === uid) && toPrismaStatus(status) === 'INATIVO') {
    throw new Error('Você não pode inativar a própria conta.');
  }

  const updated = await prisma.user.update({ where: { id: uid }, data: { status: toPrismaStatus(status) }, include: { company: true } });
  return publicUser(updated);
}

export async function resetUserPassword(uidOrEmail, actor) {
  const current = await prisma.user.findFirst({
    where: { OR: [{ id: uidOrEmail }, { email: sanitizeEmail(uidOrEmail) }] },
    include: { company: true }
  });
  if (!current) throw new Error('Usuário não encontrado.');
  await assertActorCanManageCompany(actor, current.company);

  const passwordHash = await bcrypt.hash(TEMP_RESET_PASSWORD, 12);
  await prisma.user.update({ where: { id: current.id }, data: { passwordHash } });
  return { uid: current.id, email: current.email, temporaryPassword: TEMP_RESET_PASSWORD };
}

export async function changeOwnPassword(actor, payload) {
  const senhaAtual = String(payload?.senhaAtual || '');
  const novaSenha = String(payload?.novaSenha || '');
  if (!senhaAtual || !novaSenha) throw new Error('Senha atual e nova senha são obrigatórias.');
  if (novaSenha.length < 6) throw new Error('A nova senha deve conter no mínimo 6 caracteres.');

  const user = await prisma.user.findUnique({ where: { id: actor.uid || actor.id } });
  if (!user) throw new Error('Usuário não encontrado.');

  const ok = await bcrypt.compare(senhaAtual, user.passwordHash || '');
  if (!ok) throw new Error('Senha atual incorreta.');

  const passwordHash = await bcrypt.hash(novaSenha, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  return { success: true };
}
