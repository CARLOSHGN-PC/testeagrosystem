import express from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../../lib/prisma.js';
import { authenticateJwtRequest } from '../../middlewares/jwtAuthMiddleware.js';
import { enforceCompanyScope } from '../../middlewares/permissionMiddleware.js';

const router = express.Router();

router.use(authenticateJwtRequest, enforceCompanyScope);

function firstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return null;
}

function normalizeOperationValue(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = String(value).trim();
    return text || null;
  }
  if (typeof value === 'object') {
    const text = firstValue(
      value.nome,
      value.name,
      value.descricao,
      value.description,
      value.deOperacao,
      value.operacao,
      value.codigo,
      value.code,
      value.id,
    );
    return text ? String(text).trim() : null;
  }
  const text = String(value).trim();
  return text || null;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function toDecimal(value, max = 999999999999.99) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= max ? value : null;
  let text = String(value).trim();
  if (!text) return null;
  text = text.replace(/\s/g, '');
  if (text.includes(',') && text.includes('.')) text = text.replace(/\./g, '').replace(',', '.');
  else if (text.includes(',')) text = text.replace(',', '.');
  const number = Number(text);
  if (!Number.isFinite(number) || Math.abs(number) > max) return null;
  return number;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const text = String(value).trim();
  if (!text) return null;
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (br) {
    const [, dd, mm, yy] = br;
    const year = yy.length === 2 ? `20${yy}` : yy;
    const date = new Date(`${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function resolveCompany(companyRef, authUser) {
  const requested = firstValue(companyRef, authUser?.companyDbId, authUser?.companyId);
  if (!requested) throw new Error('companyId obrigatório para sincronização.');
  const normalized = normalizeText(requested);
  const company = await prisma.company.findFirst({
    where: {
      OR: [
        { id: String(requested) },
        { code: String(requested) },
        { name: String(requested) },
      ],
    },
  });
  if (company) return company;
  const companies = await prisma.company.findMany();
  const fuzzy = companies.find((c) => normalizeText(c.code) === normalized || normalizeText(c.name) === normalized);
  if (fuzzy) return fuzzy;
  throw new Error(`Empresa não encontrada: ${requested}`);
}

async function findOrCreateFarm(company, payload = {}) {
  const code = String(firstValue(payload.COD_FAZ, payload.codFaz, payload.fazendaId, payload.farmCode, payload.fazenda, payload.id_fazenda, payload.farmId, 'SEM_FAZENDA'));
  const name = String(firstValue(payload.DES_FAZENDA, payload.desFazenda, payload.nome_fazenda, payload.farmName, payload.fazenda, code));
  return prisma.farm.upsert({
    where: { companyId_code: { companyId: company.id, code } },
    update: { name, rawData: payload },
    create: { companyId: company.id, code, name, area: toDecimal(payload.area), rawData: payload },
  });
}

async function findOrCreateField(company, payload = {}, farm = null) {
  const code = String(firstValue(payload.talhaoId, payload.TALHAO, payload.talhao, payload.talhaoNome, payload.fieldCode, payload.fieldId, payload.id));
  if (!code) return null;
  const targetFarm = farm || await findOrCreateFarm(company, payload);
  return prisma.field.upsert({
    where: { companyId_code: { companyId: company.id, code } },
    update: {
      name: String(firstValue(payload.talhaoNome, payload.name, payload.TALHAO, payload.talhao, code)),
      area: toDecimal(firstValue(payload.area, payload.areaHa, payload.AREA_TALHAO, payload.areaTalhao), 9999999999.99),
      spacing: toDecimal(firstValue(payload.spacing, payload.ESPACAMENTO, payload.espacamento), 999999.99),
      stage: firstValue(payload.estagio, payload.ESTAGIO, payload.stage),
      farmId: targetFarm?.id || null,
      rawData: payload,
    },
    create: {
      companyId: company.id,
      code,
      name: String(firstValue(payload.talhaoNome, payload.name, payload.TALHAO, payload.talhao, code)),
      area: toDecimal(firstValue(payload.area, payload.areaHa, payload.AREA_TALHAO, payload.areaTalhao), 9999999999.99),
      spacing: toDecimal(firstValue(payload.spacing, payload.ESPACAMENTO, payload.espacamento), 999999.99),
      stage: firstValue(payload.estagio, payload.ESTAGIO, payload.stage),
      farmId: targetFarm?.id || null,
      rawData: payload,
    },
  });
}

async function upsertEstimate(task, company) {
  const payload = task.payload || {};
  const farm = await findOrCreateFarm(company, payload);
  const field = await findOrCreateField(company, payload, farm);
  let variety = null;
  const varietyName = firstValue(payload.variedade, payload.VARIEDADE, payload.nomeVariedade);
  if (varietyName) {
    variety = await prisma.variety.upsert({
      where: { companyId_name: { companyId: company.id, name: String(varietyName) } },
      update: { rawData: payload },
      create: { companyId: company.id, name: String(varietyName), code: firstValue(payload.codVariedade, payload.COD_VARIEDADE), rawData: payload },
    });
  }
  const id = String(task.documentId || payload.id || randomUUID());
  await prisma.estimate.upsert({
    where: { id },
    update: {
      companyId: company.id,
      farmId: farm?.id || null,
      fieldId: field?.id || null,
      varietyId: variety?.id || null,
      harvestYear: firstValue(payload.safra, payload.harvestYear),
      round: firstValue(payload.rodada, payload.round),
      estimatedTch: toDecimal(firstValue(payload.tch, payload.estimatedTch), 9999999999.99),
      estimatedTon: toDecimal(firstValue(payload.toneladas, payload.estimatedTon, payload.tonEst), 999999999999.99),
      estimatedAtr: toDecimal(firstValue(payload.atr, payload.estimatedAtr), 9999999999.99),
      area: toDecimal(firstValue(payload.area, payload.areaHa), 9999999999.99),
      source: 'sync:dexie',
      rawData: payload,
    },
    create: {
      id,
      companyId: company.id,
      farmId: farm?.id || null,
      fieldId: field?.id || null,
      varietyId: variety?.id || null,
      harvestYear: firstValue(payload.safra, payload.harvestYear),
      round: firstValue(payload.rodada, payload.round),
      estimatedTch: toDecimal(firstValue(payload.tch, payload.estimatedTch), 9999999999.99),
      estimatedTon: toDecimal(firstValue(payload.toneladas, payload.estimatedTon, payload.tonEst), 999999999999.99),
      estimatedAtr: toDecimal(firstValue(payload.atr, payload.estimatedAtr), 9999999999.99),
      area: toDecimal(firstValue(payload.area, payload.areaHa), 9999999999.99),
      source: 'sync:dexie',
      rawData: payload,
    },
  });
}

async function upsertCutOrder(task, company) {
  const p = task.payload || {};
  const farm = await findOrCreateFarm(company, p).catch(() => null);
  await prisma.cutOrder.upsert({
    where: { id: String(task.documentId || p.id) },
    update: { companyId: company.id, farmId: farm?.id || null, number: String(firstValue(p.numeroEmpresa, p.numero, p.number, '') || ''), status: p.status || null, openingDate: parseDate(firstValue(p.dataAbertura, p.openingDate, p.createdAt)), closingDate: parseDate(firstValue(p.closedAt, p.closingDate)), rawData: p },
    create: { id: String(task.documentId || p.id), companyId: company.id, farmId: farm?.id || null, number: String(firstValue(p.numeroEmpresa, p.numero, p.number, '') || ''), status: p.status || null, openingDate: parseDate(firstValue(p.dataAbertura, p.openingDate, p.createdAt)), closingDate: parseDate(firstValue(p.closedAt, p.closingDate)), rawData: p },
  });
}

async function upsertCutOrderField(task, company) {
  const p = task.payload || {};
  const cutOrderId = String(firstValue(p.ordemCorteId, p.cutOrderId));
  if (!cutOrderId) throw new Error('ordemCorteId obrigatório no vínculo de ordem de corte.');
  const field = await findOrCreateField(company, p).catch(() => null);
  await prisma.cutOrder.upsert({ where: { id: cutOrderId }, update: { companyId: company.id }, create: { id: cutOrderId, companyId: company.id, rawData: { createdBySync: true } } });
  await prisma.cutOrderField.upsert({
    where: { id: String(task.documentId || p.id) },
    update: { cutOrderId, fieldId: field?.id || null, area: toDecimal(firstValue(p.AREA, p.area, p.areaHa, p.AREA_HA), 9999999999.99), estimatedTon: toDecimal(firstValue(p.toneladas, p.tonEst, p.estimatedTon, p.TONELADAS), 999999999999.99), realTon: toDecimal(firstValue(p.realTon, p.tonReal), 999999999999.99), rawData: p },
    create: { id: String(task.documentId || p.id), cutOrderId, fieldId: field?.id || null, area: toDecimal(firstValue(p.AREA, p.area, p.areaHa, p.AREA_HA), 9999999999.99), estimatedTon: toDecimal(firstValue(p.toneladas, p.tonEst, p.estimatedTon, p.TONELADAS), 999999999999.99), realTon: toDecimal(firstValue(p.realTon, p.tonReal), 999999999999.99), rawData: p },
  });
}

async function upsertServiceOrder(task, company) {
  const p = task.payload || {};
  const id = String(task.documentId || p.id || randomUUID());
  const operation = normalizeOperationValue(firstValue(p.operacao, p.operation, p.protocoloNome, p.protocoloId));
  const data = {
    companyId: company.id,
    number: String(firstValue(p.numeroEmpresa, p.numero, p.number, '') || ''),
    status: p.status || null,
    operation,
    openingDate: parseDate(firstValue(p.dataAbertura, p.openingDate, p.createdAt)),
    closingDate: parseDate(firstValue(p.closedAt, p.closingDate)),
    rawData: p,
  };

  await prisma.serviceOrder.upsert({
    where: { id },
    update: data,
    create: { id, ...data },
  });
}

async function upsertServiceOrderField(task, company) {
  const p = task.payload || {};
  const serviceOrderId = String(firstValue(p.ordemServicoId, p.serviceOrderId));
  if (!serviceOrderId) throw new Error('ordemServicoId obrigatório no vínculo de ordem de serviço.');
  const field = await findOrCreateField(company, p).catch(() => null);
  await prisma.serviceOrder.upsert({ where: { id: serviceOrderId }, update: { companyId: company.id }, create: { id: serviceOrderId, companyId: company.id, rawData: { createdBySync: true } } });
  await prisma.serviceOrderField.upsert({
    where: { id: String(task.documentId || p.id) },
    update: { serviceOrderId, fieldId: field?.id || null, area: toDecimal(firstValue(p.AREA, p.area, p.areaHa, p.AREA_HA), 9999999999.99), rawData: p },
    create: { id: String(task.documentId || p.id), serviceOrderId, fieldId: field?.id || null, area: toDecimal(firstValue(p.AREA, p.area, p.areaHa, p.AREA_HA), 9999999999.99), rawData: p },
  });
}

async function upsertSimple(task, company) {
  const p = task.payload || {};
  const id = String(task.documentId || p.id || randomUUID());
  const target = task.targetCollection;
  const common = { id, companyId: company.id, rawData: p };
  if (target === 'profissionais') return prisma.professional.upsert({ where: { id }, update: { name: String(firstValue(p.nomeCompleto, p.name, p.nome, 'Sem nome')), cpf: firstValue(p.cpf), role: firstValue(p.funcao, p.role), status: firstValue(p.status, 'ATIVO'), rawData: p }, create: { ...common, name: String(firstValue(p.nomeCompleto, p.name, p.nome, 'Sem nome')), cpf: firstValue(p.cpf), role: firstValue(p.funcao, p.role), status: firstValue(p.status, 'ATIVO') } });
  if (target === 'operacoes') return prisma.operation.upsert({ where: { id }, update: { code: firstValue(p.cdOperacao, p.codigo, p.code), name: String(firstValue(p.deOperacao, p.nome, p.name, 'Operação')), unit: firstValue(p.unidade, p.unit), type: firstValue(p.tipoOperacao, p.type), rawData: p }, create: { ...common, code: firstValue(p.cdOperacao, p.codigo, p.code), name: String(firstValue(p.deOperacao, p.nome, p.name, 'Operação')), unit: firstValue(p.unidade, p.unit), type: firstValue(p.tipoOperacao, p.type) } });
  if (target === 'insumos' || target === 'produtos') return prisma.input.upsert({ where: { id }, update: { code: firstValue(p.codInsumo, p.codigo, p.code), name: String(firstValue(p.descInsumo, p.nome, p.name, 'Insumo')), unit: firstValue(p.und, p.unit), rawData: p }, create: { ...common, code: firstValue(p.codInsumo, p.codigo, p.code), name: String(firstValue(p.descInsumo, p.nome, p.name, 'Insumo')), unit: firstValue(p.und, p.unit) } });
  if (target === 'variedades') return prisma.variety.upsert({ where: { id }, update: { code: firstValue(p.codigo, p.CODIGO, p.code), name: String(firstValue(p.variedade, p.VARIEDADE, p.nome, p.name, 'Variedade')), rawData: p }, create: { ...common, code: firstValue(p.codigo, p.CODIGO, p.code), name: String(firstValue(p.variedade, p.VARIEDADE, p.nome, p.name, 'Variedade')) } });
  if (target === 'protocolos') return prisma.protocol.upsert({ where: { id }, update: { name: String(firstValue(p.nome, p.name, 'Protocolo')), description: firstValue(p.descricao, p.description), status: firstValue(p.status, 'ATIVO'), rawData: p }, create: { ...common, name: String(firstValue(p.nome, p.name, 'Protocolo')), description: firstValue(p.descricao, p.description), status: firstValue(p.status, 'ATIVO') } });
  if (target === 'fazendas') return findOrCreateFarm(company, p);
  if (target.includes('/talhoes') || target === 'talhoes') return findOrCreateField(company, p);
  return { skipped: true, reason: `Coleção sem tabela PostgreSQL direta: ${target}` };
}

async function processTask(task, authUser) {
  if (!task?.targetCollection) throw new Error('targetCollection obrigatório.');
  const company = await resolveCompany(firstValue(task.payload?.companyId, task.companyId), authUser);

  if (task.type === 'addHistory') {
    const p = task.payload || {};
    const estimateId = String(firstValue(p.estimateDocId, p.estimateId));
    if (!estimateId) return { skipped: true, reason: 'Histórico sem estimateDocId.' };
    const estimate = await prisma.estimate.findUnique({ where: { id: estimateId } });
    if (!estimate) return { skipped: true, reason: 'Estimativa ainda não existe para histórico.' };
    await prisma.estimateHistory.create({ data: { estimateId, action: firstValue(p.action, 'update'), newData: p } });
    return { synced: true };
  }

  switch (task.targetCollection) {
    case 'estimativas_safra': await upsertEstimate(task, company); break;
    case 'ordens_corte': await upsertCutOrder(task, company); break;
    case 'ordens_corte_talhoes': await upsertCutOrderField(task, company); break;
    case 'ordens_servico': await upsertServiceOrder(task, company); break;
    case 'ordens_servico_talhoes': await upsertServiceOrderField(task, company); break;
    default: await upsertSimple(task, company); break;
  }
  return { synced: true };
}

router.post('/task', async (req, res) => {
  try {
    const result = await processTask(req.body, req.authUser);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[PostgreSQL Sync] Erro ao sincronizar tarefa:', error);
    res.status(500).json({ success: false, message: error.message || 'Erro ao sincronizar tarefa no PostgreSQL.' });
  }
});

router.post('/batch', async (req, res) => {
  const tasks = Array.isArray(req.body?.tasks) ? req.body.tasks : [];
  const results = [];
  for (const task of tasks) {
    try {
      results.push({ documentId: task.documentId, success: true, ...(await processTask(task, req.authUser)) });
    } catch (error) {
      results.push({ documentId: task.documentId, success: false, message: error.message });
    }
  }
  res.json({ success: true, results });
});

export default router;
