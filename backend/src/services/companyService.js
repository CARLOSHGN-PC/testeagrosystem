import { prisma } from '../lib/prisma.js';
import { createDisabledModules, normalizeEnabledModules } from '../constants/accessModules.js';

function normalizeCompanyId(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase();
}

function toPrismaStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  return value === 'inactive' || value === 'inativo' ? 'INATIVO' : 'ATIVO';
}

function toLegacyStatus(status) {
  return String(status || '').toUpperCase() === 'INATIVO' ? 'inactive' : 'active';
}

function normalizeHexColor(value) {
  const color = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#55AB52';
}

function sanitizeCompanyPayload(payload = {}, current = {}) {
  const companyId = normalizeCompanyId(payload.companyId || payload.code || current.code || current.id);
  const code = normalizeCode(payload.code || payload.companyId || current.code || companyId);
  const name = String(payload.name || current.name || '').trim();

  return {
    companyId,
    code,
    name,
    cnpj: payload.cnpj ?? current.cnpj ?? null,
    plan: String(payload.plan || current.plan || 'basic').trim() || 'basic',
    status: toPrismaStatus(payload.status || current.status || 'active'),
    maxUsers: Math.max(1, Number(payload.maxUsers ?? current.maxUsers ?? 10)),
    logoColor: normalizeHexColor(payload.logoColor || current.logoColor || '#55AB52'),
    enabledModules: normalizeEnabledModules(payload.enabledModules || current.enabledModules || createDisabledModules())
  };
}

function publicCompany(company, userCount = 0) {
  const companyId = company.code || company.id;
  return {
    id: company.id,
    companyId,
    code: company.code || companyId,
    name: company.name || companyId,
    cnpj: company.cnpj || null,
    plan: company.plan || 'basic',
    status: toLegacyStatus(company.status),
    maxUsers: company.maxUsers || 10,
    logoColor: company.logoColor || '#55AB52',
    enabledModules: normalizeEnabledModules(company.enabledModules || createDisabledModules()),
    userCount,
    source: 'postgres'
  };
}

async function findCompanyByAnyId(companyId) {
  const raw = String(companyId || '').trim();
  if (!raw) return null;
  const upper = normalizeCode(raw);
  return prisma.company.findFirst({
    where: {
      OR: [
        { id: raw },
        { code: raw },
        { code: upper }
      ]
    },
    include: { _count: { select: { users: true } } }
  });
}

async function ensureUniqueCode(code, exceptCompanyId = null) {
  const existing = await prisma.company.findUnique({ where: { code } });
  if (existing && existing.id !== exceptCompanyId && existing.code !== exceptCompanyId) {
    throw new Error('Código da empresa já existe.');
  }
}

export async function listCompanies() {
  const companies = await prisma.company.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { users: true } } }
  });

  return companies.map((company) => publicCompany(company, company._count?.users || 0));
}

export async function createCompany(payload, actorUid) {
  const data = sanitizeCompanyPayload(payload);

  if (!data.companyId || !data.name || !data.code) {
    throw new Error('companyId, nome e código são obrigatórios.');
  }

  await ensureUniqueCode(data.code);

  const existing = await findCompanyByAnyId(data.companyId);
  if (existing) throw new Error('companyId já cadastrado.');

  const company = await prisma.company.create({
    data: {
      id: data.companyId,
      name: data.name,
      code: data.code,
      cnpj: data.cnpj,
      plan: data.plan,
      status: data.status,
      maxUsers: data.maxUsers,
      logoColor: data.logoColor,
      enabledModules: data.enabledModules
    },
    include: { _count: { select: { users: true } } }
  });

  return publicCompany(company, company._count?.users || 0);
}

export async function updateCompany(companyId, payload) {
  const current = await findCompanyByAnyId(companyId);
  if (!current) throw new Error('Empresa não encontrada.');

  const data = sanitizeCompanyPayload({ ...payload, companyId: current.code || current.id }, current);
  await ensureUniqueCode(data.code, current.id);

  const company = await prisma.company.update({
    where: { id: current.id },
    data: {
      name: data.name,
      code: data.code,
      cnpj: data.cnpj,
      plan: data.plan,
      status: data.status,
      maxUsers: data.maxUsers,
      logoColor: data.logoColor,
      enabledModules: data.enabledModules
    },
    include: { _count: { select: { users: true } } }
  });

  return publicCompany(company, company._count?.users || 0);
}

export async function updateCompanyStatus(companyId, status) {
  const current = await findCompanyByAnyId(companyId);
  if (!current) throw new Error('Empresa não encontrada.');

  const company = await prisma.company.update({
    where: { id: current.id },
    data: { status: toPrismaStatus(status) },
    include: { _count: { select: { users: true } } }
  });

  return publicCompany(company, company._count?.users || 0);
}

export async function updateCompanyConfig(companyId, payload = {}) {
  const current = await findCompanyByAnyId(companyId);
  if (!current) throw new Error('Empresa não encontrada.');

  const data = {};
  if (payload.logoColor !== undefined) data.logoColor = normalizeHexColor(payload.logoColor);
  if (payload.enabledModules !== undefined) data.enabledModules = normalizeEnabledModules(payload.enabledModules || {});
  if (payload.maxUsers !== undefined) data.maxUsers = Math.max(1, Number(payload.maxUsers || 1));
  if (payload.plan !== undefined) data.plan = String(payload.plan || 'basic').trim() || 'basic';

  const company = await prisma.company.update({
    where: { id: current.id },
    data,
    include: { _count: { select: { users: true } } }
  });

  return publicCompany(company, company._count?.users || 0);
}

export async function runFixOrdemCorteFazendaBatch() {
  throw new Error('Rotina legada removida. Ordem de Corte agora usa PostgreSQL diretamente.');
}
