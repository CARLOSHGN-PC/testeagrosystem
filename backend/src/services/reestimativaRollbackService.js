import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../lib/prisma.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function normalizeTextKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function parseDate(value, label) {
  const raw = String(value || '').trim();
  // O input datetime-local do navegador chega sem fuso. Como a operação da usina usa horário de Brasília,
  // assumimos -03:00 para não deslocar o período quando o servidor estiver em UTC.
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw) ? `${raw}-03:00` : raw;
  const d = new Date(normalized);
  if (!raw || Number.isNaN(d.getTime())) {
    throw new Error(`Data inválida em ${label}.`);
  }
  return d;
}

function decimalToNumber(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toSafeEstimate(e) {
  return {
    id: e.id,
    round: e.round,
    harvestYear: e.harvestYear,
    farm: e.farm ? { id: e.farm.id, code: e.farm.code, name: e.farm.name } : null,
    field: e.field ? { id: e.field.id, code: e.field.code, name: e.field.name } : null,
    variety: e.variety ? { id: e.variety.id, code: e.variety.code, name: e.variety.name } : null,
    area: decimalToNumber(e.area),
    estimatedTch: decimalToNumber(e.estimatedTch),
    estimatedTon: decimalToNumber(e.estimatedTon),
    estimatedAtr: decimalToNumber(e.estimatedAtr),
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    historyCount: Array.isArray(e.history) ? e.history.length : 0,
    rawData: e.rawData || null,
  };
}

function ensureSuperAdmin(req) {
  const role = normalizeTextKey(req.authUser?.role);
  const email = String(req.authUser?.email || '').trim().toLowerCase();
  const superEmails = String(process.env.SYSTEM_SUPER_ADMIN_EMAILS || process.env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  const isRoleAllowed = ['superadmin', 'superadminuser', 'root', 'owner'].includes(role);
  const isEmailAllowed = superEmails.includes(email);

  if (!isRoleAllowed && !isEmailAllowed) {
    const err = new Error('Apenas Super Admin pode simular ou executar reversão de reestimativa.');
    err.status = 403;
    throw err;
  }
}

async function resolveCompany(raw) {
  const clean = String(raw || '').trim();
  if (!clean) throw new Error('Empresa é obrigatória.');

  const company = await prisma.company.findFirst({
    where: {
      OR: [
        { id: clean },
        { code: clean },
        { name: { equals: clean, mode: 'insensitive' } },
      ],
    },
  });
  if (company) return company;

  const normalized = normalizeTextKey(clean);
  const companies = await prisma.company.findMany();
  const found = companies.find((c) => normalizeTextKey(c.code) === normalized || normalizeTextKey(c.name) === normalized);
  if (!found) throw new Error(`Empresa não encontrada: ${clean}`);
  return found;
}

function buildRoundFilter({ round, includeAllRounds }) {
  if (round) return { round: String(round).trim() };
  if (includeAllRounds) return { NOT: [{ round: null }, { round: 'Estimativa' }] };
  return { round: { startsWith: 'Reestimativa', mode: 'insensitive' } };
}

async function findRollbackTargets({ company, harvestYear, from, to, round, includeAllRounds }) {
  if (!harvestYear) throw new Error('Safra é obrigatória.');
  const fromDate = parseDate(from, 'data inicial');
  const toDate = to ? parseDate(to, 'data final') : new Date();

  if (toDate < fromDate) throw new Error('A data final não pode ser menor que a data inicial.');

  const where = {
    companyId: company.id,
    harvestYear: String(harvestYear).trim(),
    ...buildRoundFilter({ round, includeAllRounds }),
    OR: [
      { createdAt: { gte: fromDate, lte: toDate } },
      { updatedAt: { gte: fromDate, lte: toDate } },
    ],
  };

  const estimates = await prisma.estimate.findMany({
    where,
    include: { farm: true, field: true, variety: true, history: true },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  });

  return { estimates, fromDate, toDate, where };
}

function backupDir() {
  return path.resolve(__dirname, '../../backups');
}

function writeBackup({ company, harvestYear, fromDate, toDate, round, includeAllRounds, estimates, user, mode }) {
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const companyToken = String(company.code || company.id).replace(/[^a-z0-9_-]/gi, '_');
  const fileName = `rollback-reestimativa-${companyToken}-${stamp}.json`;
  const fullPath = path.join(dir, fileName);

  fs.writeFileSync(fullPath, JSON.stringify({
    type: 'rollback-reestimativa',
    mode,
    generatedAt: new Date().toISOString(),
    generatedBy: user ? { id: user.id || user.uid, email: user.email, name: user.name, role: user.role } : null,
    company,
    harvestYear,
    period: { from: fromDate.toISOString(), to: toDate.toISOString() },
    filter: {
      round: round || null,
      includeAllRounds: includeAllRounds === true,
      defaultRoundFilter: !round && !includeAllRounds ? 'startsWith Reestimativa' : null,
    },
    total: estimates.length,
    estimates,
  }, null, 2));

  return { fileName, fullPath };
}

export async function previewReestimativaRollback(input, req) {
  ensureSuperAdmin(req);
  const company = await resolveCompany(input.companyId || input.company || input.companyCode);
  const { estimates, fromDate, toDate } = await findRollbackTargets({
    company,
    harvestYear: input.harvestYear || input.safra,
    from: input.from,
    to: input.to,
    round: input.round,
    includeAllRounds: input.includeAllRounds === true,
  });

  const safeEstimates = estimates.map(toSafeEstimate);
  const backup = writeBackup({
    company,
    harvestYear: input.harvestYear || input.safra,
    fromDate,
    toDate,
    round: input.round,
    includeAllRounds: input.includeAllRounds === true,
    estimates: safeEstimates,
    user: req.authUser,
    mode: 'preview',
  });

  const totalTon = safeEstimates.reduce((sum, e) => sum + (Number(e.estimatedTon) || 0), 0);
  const rounds = [...new Set(safeEstimates.map((e) => e.round || '(sem rodada)'))];

  return {
    success: true,
    mode: 'preview',
    company: { id: company.id, code: company.code, name: company.name },
    harvestYear: input.harvestYear || input.safra,
    period: { from: fromDate.toISOString(), to: toDate.toISOString() },
    filter: {
      round: input.round || null,
      includeAllRounds: input.includeAllRounds === true,
      defaultRoundFilter: !input.round && input.includeAllRounds !== true ? 'somente rodadas iniciando com Reestimativa' : null,
    },
    total: safeEstimates.length,
    totalTon,
    rounds,
    backupFile: backup.fileName,
    items: safeEstimates.slice(0, 200),
  };
}

export async function applyReestimativaRollback(input, req) {
  ensureSuperAdmin(req);
  const confirmText = String(input.confirmText || '').trim().toUpperCase();
  if (confirmText !== 'REVERTER') {
    throw new Error('Confirmação inválida. Digite REVERTER para executar a reversão.');
  }

  const company = await resolveCompany(input.companyId || input.company || input.companyCode);
  const { estimates, fromDate, toDate } = await findRollbackTargets({
    company,
    harvestYear: input.harvestYear || input.safra,
    from: input.from,
    to: input.to,
    round: input.round,
    includeAllRounds: input.includeAllRounds === true,
  });

  const safeEstimates = estimates.map(toSafeEstimate);
  const backup = writeBackup({
    company,
    harvestYear: input.harvestYear || input.safra,
    fromDate,
    toDate,
    round: input.round,
    includeAllRounds: input.includeAllRounds === true,
    estimates: safeEstimates,
    user: req.authUser,
    mode: 'apply',
  });

  const ids = estimates.map((e) => e.id);
  if (ids.length === 0) {
    return {
      success: true,
      mode: 'apply',
      message: 'Nenhuma reestimativa encontrada para remover.',
      deleted: { histories: 0, estimates: 0 },
      backupFile: backup.fileName,
      company: { id: company.id, code: company.code, name: company.name },
    };
  }

  const deleted = await prisma.$transaction(async (tx) => {
    const histories = await tx.estimateHistory.deleteMany({ where: { estimateId: { in: ids } } });
    const estimatesResult = await tx.estimate.deleteMany({ where: { id: { in: ids } } });
    return { histories: histories.count, estimates: estimatesResult.count };
  });

  return {
    success: true,
    mode: 'apply',
    message: 'Reversão executada com sucesso.',
    deleted,
    backupFile: backup.fileName,
    company: { id: company.id, code: company.code, name: company.name },
    harvestYear: input.harvestYear || input.safra,
    period: { from: fromDate.toISOString(), to: toDate.toISOString() },
  };
}
