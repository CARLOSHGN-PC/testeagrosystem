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

async function ensureLancamentosBrocaTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS lancamentos_broca (
      id TEXT PRIMARY KEY,
      uuid_local TEXT,
      company_id TEXT NOT NULL,
      data_inspecao TIMESTAMPTZ,
      fazenda_codigo TEXT,
      fazenda_nome TEXT,
      talhao TEXT,
      talhao_id TEXT,
      variedade TEXT,
      entrenos_contados NUMERIC(14,2),
      brocado_base NUMERIC(14,2),
      brocado_meio NUMERIC(14,2),
      brocado_topo NUMERIC(14,2),
      total_brocado NUMERIC(14,2),
      percentual_brocamento NUMERIC(14,2),
      cochonilha NUMERIC(14,2),
      total_cochonilha NUMERIC(14,2),
      percentual_cochonilha NUMERIC(14,2),
      sincronizado BOOLEAN DEFAULT TRUE,
      status_sincronizacao TEXT,
      erro_sincronizacao TEXT,
      created_by TEXT,
      created_by_email TEXT,
      synced_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      raw_data JSONB
    )
  `);
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_lancamentos_broca_company ON lancamentos_broca(company_id)');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_lancamentos_broca_data ON lancamentos_broca(data_inspecao)');
  await prisma.$executeRawUnsafe('ALTER TABLE lancamentos_broca ADD COLUMN IF NOT EXISTS cochonilha NUMERIC(14,2)');
  await prisma.$executeRawUnsafe('ALTER TABLE lancamentos_broca ADD COLUMN IF NOT EXISTS total_cochonilha NUMERIC(14,2)');
  await prisma.$executeRawUnsafe('ALTER TABLE lancamentos_broca ADD COLUMN IF NOT EXISTS percentual_cochonilha NUMERIC(14,2)');
  await prisma.$executeRawUnsafe("ALTER TABLE lancamentos_broca ADD COLUMN IF NOT EXISTS status_registro TEXT DEFAULT 'ativo'");
  await prisma.$executeRawUnsafe('ALTER TABLE lancamentos_broca ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT');
  await prisma.$executeRawUnsafe('ALTER TABLE lancamentos_broca ADD COLUMN IF NOT EXISTS cancelado_por TEXT');
  await prisma.$executeRawUnsafe('ALTER TABLE lancamentos_broca ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMPTZ');
}

async function ensureLancamentosPerdaTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS lancamentos_perda (
      id TEXT PRIMARY KEY,
      uuid_local TEXT,
      company_id TEXT NOT NULL,
      data TIMESTAMPTZ,
      fazenda_codigo TEXT,
      fazenda_nome TEXT,
      talhao TEXT,
      talhao_id TEXT,
      variedade TEXT,
      frente_servico TEXT,
      turno TEXT,
      frota_equipamento TEXT,
      matricula_operador TEXT,
      nome_operador TEXT,
      cana_inteira NUMERIC(14,2),
      tolete NUMERIC(14,2),
      toco NUMERIC(14,2),
      ponta NUMERIC(14,2),
      estilhaco NUMERIC(14,2),
      pedaco NUMERIC(14,2),
      pisoteio_metros NUMERIC(14,2),
      percentual_pisoteio NUMERIC(10,4),
      paralelismo_esquerdo NUMERIC(14,2),
      paralelismo_direito NUMERIC(14,2),
      percentual_paralelismo NUMERIC(10,4),
      total_perda NUMERIC(14,2),
      sincronizado BOOLEAN DEFAULT TRUE,
      status_sincronizacao TEXT,
      erro_sincronizacao TEXT,
      created_by TEXT,
      created_by_email TEXT,
      synced_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      raw_data JSONB
    )
  `);
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_lancamentos_perda_company ON lancamentos_perda(company_id)');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_lancamentos_perda_data ON lancamentos_perda(data)');
  await prisma.$executeRawUnsafe('ALTER TABLE lancamentos_perda ADD COLUMN IF NOT EXISTS pisoteio_metros NUMERIC(14,2)');
  await prisma.$executeRawUnsafe('ALTER TABLE lancamentos_perda ADD COLUMN IF NOT EXISTS percentual_pisoteio NUMERIC(10,4)');
  await prisma.$executeRawUnsafe('ALTER TABLE lancamentos_perda ADD COLUMN IF NOT EXISTS paralelismo_esquerdo NUMERIC(14,2)');
  await prisma.$executeRawUnsafe('ALTER TABLE lancamentos_perda ADD COLUMN IF NOT EXISTS paralelismo_direito NUMERIC(14,2)');
  await prisma.$executeRawUnsafe('ALTER TABLE lancamentos_perda ADD COLUMN IF NOT EXISTS percentual_paralelismo NUMERIC(10,4)');
  await prisma.$executeRawUnsafe("ALTER TABLE lancamentos_perda ADD COLUMN IF NOT EXISTS status_registro TEXT DEFAULT 'ativo'");
  await prisma.$executeRawUnsafe('ALTER TABLE lancamentos_perda ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT');
  await prisma.$executeRawUnsafe('ALTER TABLE lancamentos_perda ADD COLUMN IF NOT EXISTS cancelado_por TEXT');
  await prisma.$executeRawUnsafe('ALTER TABLE lancamentos_perda ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMPTZ');
}

async function upsertLancamentoBroca(task, company) {
  await ensureLancamentosBrocaTable();
  const p = task.payload || {};
  const id = String(task.documentId || p.id || randomUUID());
  await prisma.$executeRawUnsafe(
    `INSERT INTO lancamentos_broca (
      id, uuid_local, company_id, data_inspecao, fazenda_codigo, fazenda_nome, talhao, talhao_id, variedade,
      entrenos_contados, brocado_base, brocado_meio, brocado_topo, total_brocado, percentual_brocamento, cochonilha, total_cochonilha, percentual_cochonilha,
      sincronizado, status_sincronizacao, erro_sincronizacao, created_by, created_by_email, synced_at, created_at, updated_at, raw_data
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,true,'sincronizado',NULL,$19,$20,NOW(),COALESCE($21,NOW()),NOW(),$22::jsonb)
    ON CONFLICT (id) DO UPDATE SET
      uuid_local=EXCLUDED.uuid_local, company_id=EXCLUDED.company_id, data_inspecao=EXCLUDED.data_inspecao,
      fazenda_codigo=EXCLUDED.fazenda_codigo, fazenda_nome=EXCLUDED.fazenda_nome, talhao=EXCLUDED.talhao,
      talhao_id=EXCLUDED.talhao_id, variedade=EXCLUDED.variedade, entrenos_contados=EXCLUDED.entrenos_contados,
      brocado_base=EXCLUDED.brocado_base, brocado_meio=EXCLUDED.brocado_meio, brocado_topo=EXCLUDED.brocado_topo,
      total_brocado=EXCLUDED.total_brocado, percentual_brocamento=EXCLUDED.percentual_brocamento,
      cochonilha=EXCLUDED.cochonilha, total_cochonilha=EXCLUDED.total_cochonilha, percentual_cochonilha=EXCLUDED.percentual_cochonilha,
      sincronizado=true, status_sincronizacao='sincronizado', erro_sincronizacao=NULL,
      created_by=EXCLUDED.created_by, created_by_email=EXCLUDED.created_by_email, synced_at=NOW(), updated_at=NOW(), raw_data=EXCLUDED.raw_data`,
    id,
    firstValue(p.uuidLocal, p.uuid_local, id),
    company.id,
    parseDate(p.dataInspecao),
    firstValue(p.fazendaCodigo, p.codFaz),
    firstValue(p.fazendaNome, p.desFazenda),
    firstValue(p.talhao),
    firstValue(p.talhaoId),
    firstValue(p.variedade),
    toDecimal(p.entrenosContados),
    toDecimal(p.brocadoBase),
    toDecimal(p.brocadoMeio),
    toDecimal(p.brocadoTopo),
    toDecimal(p.totalBrocado),
    toDecimal(p.percentualBrocamento),
    toDecimal(p.cochonilha),
    toDecimal(firstValue(p.totalCochonilha, p.cochonilha)),
    toDecimal(p.percentualCochonilha),
    firstValue(p.createdBy),
    firstValue(p.createdByEmail),
    parseDate(p.createdAt),
    JSON.stringify(p),
  );
}

async function upsertLancamentoPerda(task, company) {
  await ensureLancamentosPerdaTable();
  const p = task.payload || {};
  const id = String(task.documentId || p.id || randomUUID());
  await prisma.$executeRawUnsafe(
    `INSERT INTO lancamentos_perda (
      id, uuid_local, company_id, data, fazenda_codigo, fazenda_nome, talhao, talhao_id, variedade,
      frente_servico, turno, frota_equipamento, matricula_operador, nome_operador,
      cana_inteira, tolete, toco, ponta, estilhaco, pedaco, pisoteio_metros, percentual_pisoteio, paralelismo_esquerdo, paralelismo_direito, percentual_paralelismo, total_perda,
      sincronizado, status_sincronizacao, erro_sincronizacao, created_by, created_by_email, synced_at, created_at, updated_at, raw_data
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,true,'sincronizado',NULL,$27,$28,NOW(),COALESCE($29,NOW()),NOW(),$30::jsonb)
    ON CONFLICT (id) DO UPDATE SET
      uuid_local=EXCLUDED.uuid_local, company_id=EXCLUDED.company_id, data=EXCLUDED.data,
      fazenda_codigo=EXCLUDED.fazenda_codigo, fazenda_nome=EXCLUDED.fazenda_nome, talhao=EXCLUDED.talhao,
      talhao_id=EXCLUDED.talhao_id, variedade=EXCLUDED.variedade, frente_servico=EXCLUDED.frente_servico,
      turno=EXCLUDED.turno, frota_equipamento=EXCLUDED.frota_equipamento, matricula_operador=EXCLUDED.matricula_operador,
      nome_operador=EXCLUDED.nome_operador, cana_inteira=EXCLUDED.cana_inteira, tolete=EXCLUDED.tolete,
      toco=EXCLUDED.toco, ponta=EXCLUDED.ponta, estilhaco=EXCLUDED.estilhaco, pedaco=EXCLUDED.pedaco, pisoteio_metros=EXCLUDED.pisoteio_metros, percentual_pisoteio=EXCLUDED.percentual_pisoteio,
      paralelismo_esquerdo=EXCLUDED.paralelismo_esquerdo, paralelismo_direito=EXCLUDED.paralelismo_direito, percentual_paralelismo=EXCLUDED.percentual_paralelismo, total_perda=EXCLUDED.total_perda, sincronizado=true, status_sincronizacao='sincronizado', erro_sincronizacao=NULL,
      created_by=EXCLUDED.created_by, created_by_email=EXCLUDED.created_by_email, synced_at=NOW(), updated_at=NOW(), raw_data=EXCLUDED.raw_data`,
    id,
    firstValue(p.uuidLocal, p.uuid_local, id),
    company.id,
    parseDate(p.data),
    firstValue(p.fazendaCodigo, p.codFaz),
    firstValue(p.fazendaNome, p.desFazenda),
    firstValue(p.talhao),
    firstValue(p.talhaoId),
    firstValue(p.variedade),
    firstValue(p.frenteServico),
    firstValue(p.turno),
    firstValue(p.frotaEquipamento),
    firstValue(p.matriculaOperador),
    firstValue(p.nomeOperador),
    toDecimal(p.canaInteira),
    toDecimal(p.tolete),
    toDecimal(p.toco),
    toDecimal(p.ponta),
    toDecimal(p.estilhaco),
    toDecimal(p.pedaco),
    toDecimal(p.pisoteioMetros),
    toDecimal(p.percentualPisoteio),
    toDecimal(p.paralelismoEsquerdo),
    toDecimal(p.paralelismoDireito),
    toDecimal(p.percentualParalelismo),
    toDecimal(p.totalPerda),
    firstValue(p.createdBy),
    firstValue(p.createdByEmail),
    parseDate(p.createdAt),
    JSON.stringify(p),
  );
}


async function ensureLancamentosComplexoMurchaTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS lancamentos_complexo_murcha (
      id TEXT PRIMARY KEY,
      uuid_local TEXT,
      company_id TEXT NOT NULL,
      data_avaliacao TIMESTAMPTZ,
      fazenda_codigo TEXT,
      fazenda_nome TEXT,
      talhao TEXT,
      talhao_id TEXT,
      variedade TEXT,
      cigarrinha NUMERIC(14,2),
      colletotrichum NUMERIC(14,2),
      plectocyta NUMERIC(14,2),
      estria NUMERIC(14,2),
      numero_colmos_3m NUMERIC(14,2),
      total_complexo NUMERIC(14,2),
      percentual_murcha NUMERIC(10,4),
      sincronizado BOOLEAN DEFAULT TRUE,
      status_sincronizacao TEXT,
      erro_sincronizacao TEXT,
      status_registro TEXT DEFAULT 'ativo',
      motivo_cancelamento TEXT,
      cancelado_por TEXT,
      cancelado_em TIMESTAMPTZ,
      created_by TEXT,
      created_by_email TEXT,
      synced_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      raw_data JSONB
    )
  `);
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_lancamentos_complexo_murcha_company ON lancamentos_complexo_murcha(company_id)');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_lancamentos_complexo_murcha_data ON lancamentos_complexo_murcha(data_avaliacao)');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_lancamentos_complexo_murcha_company_status ON lancamentos_complexo_murcha(company_id, status_registro)');
}

async function upsertLancamentoComplexoMurcha(task, company) {
  await ensureLancamentosComplexoMurchaTable();
  const p = task.payload || {};
  const id = String(task.documentId || p.id || randomUUID());
  await prisma.$executeRawUnsafe(
    `INSERT INTO lancamentos_complexo_murcha (
      id, uuid_local, company_id, data_avaliacao, fazenda_codigo, fazenda_nome, talhao, talhao_id, variedade,
      cigarrinha, colletotrichum, plectocyta, estria, numero_colmos_3m, total_complexo, percentual_murcha,
      sincronizado, status_sincronizacao, erro_sincronizacao, created_by, created_by_email, synced_at, created_at, updated_at, raw_data
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true,'sincronizado',NULL,$17,$18,NOW(),COALESCE($19,NOW()),NOW(),$20::jsonb)
    ON CONFLICT (id) DO UPDATE SET
      uuid_local=EXCLUDED.uuid_local, company_id=EXCLUDED.company_id, data_avaliacao=EXCLUDED.data_avaliacao,
      fazenda_codigo=EXCLUDED.fazenda_codigo, fazenda_nome=EXCLUDED.fazenda_nome, talhao=EXCLUDED.talhao,
      talhao_id=EXCLUDED.talhao_id, variedade=EXCLUDED.variedade, cigarrinha=EXCLUDED.cigarrinha,
      colletotrichum=EXCLUDED.colletotrichum, plectocyta=EXCLUDED.plectocyta, estria=EXCLUDED.estria,
      numero_colmos_3m=EXCLUDED.numero_colmos_3m, total_complexo=EXCLUDED.total_complexo, percentual_murcha=EXCLUDED.percentual_murcha,
      sincronizado=true, status_sincronizacao='sincronizado', erro_sincronizacao=NULL,
      created_by=EXCLUDED.created_by, created_by_email=EXCLUDED.created_by_email, synced_at=NOW(), updated_at=NOW(), raw_data=EXCLUDED.raw_data`,
    id,
    firstValue(p.uuidLocal, p.uuid_local, id),
    company.id,
    parseDate(p.dataAvaliacao),
    firstValue(p.fazendaCodigo, p.codFaz),
    firstValue(p.fazendaNome, p.desFazenda),
    firstValue(p.talhao),
    firstValue(p.talhaoId),
    firstValue(p.variedade),
    toDecimal(p.cigarrinha),
    toDecimal(p.colletotrichum),
    toDecimal(p.plectocyta),
    toDecimal(p.estria),
    toDecimal(p.numeroColmos3m),
    toDecimal(p.totalComplexo),
    toDecimal(p.percentualMurcha),
    firstValue(p.createdBy),
    firstValue(p.createdByEmail),
    parseDate(p.createdAt),
    JSON.stringify(p),
  );
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
    case 'lancamentos_broca': await upsertLancamentoBroca(task, company); break;
    case 'lancamentos_perda': await upsertLancamentoPerda(task, company); break;
    case 'lancamentos_complexo_murcha': await upsertLancamentoComplexoMurcha(task, company); break;
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


function mapApontamentoRow(row, tipo) {
  const raw = row.raw_data && typeof row.raw_data === 'object' ? row.raw_data : {};
  if (tipo === 'broca') {
    return {
      ...raw,
      id: row.id,
      uuidLocal: row.uuid_local,
      tipo: 'broca',
      companyId: row.company_id,
      dataInspecao: row.data_inspecao ? new Date(row.data_inspecao).toISOString().slice(0, 10) : raw.dataInspecao,
      fazendaCodigo: row.fazenda_codigo || raw.fazendaCodigo,
      fazendaNome: row.fazenda_nome || raw.fazendaNome,
      talhao: row.talhao || raw.talhao,
      talhaoId: row.talhao_id || raw.talhaoId,
      variedade: row.variedade || raw.variedade,
      entrenosContados: row.entrenos_contados ?? raw.entrenosContados,
      brocadoBase: row.brocado_base ?? raw.brocadoBase,
      brocadoMeio: row.brocado_meio ?? raw.brocadoMeio,
      brocadoTopo: row.brocado_topo ?? raw.brocadoTopo,
      totalBrocado: row.total_brocado ?? raw.totalBrocado,
      percentualBrocamento: row.percentual_brocamento ?? raw.percentualBrocamento,
      cochonilha: row.cochonilha ?? raw.cochonilha,
      percentualCochonilha: row.percentual_cochonilha ?? raw.percentualCochonilha,
      statusRegistro: row.status_registro || raw.statusRegistro || 'ativo',
      motivoCancelamento: row.motivo_cancelamento || raw.motivoCancelamento || '',
      createdByEmail: row.created_by_email || raw.createdByEmail,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      syncStatus: 'synced',
      status: row.status_sincronizacao || 'sincronizado',
    };
  }
  return {
    ...raw,
    id: row.id,
    uuidLocal: row.uuid_local,
    tipo: 'perda',
    companyId: row.company_id,
    data: row.data ? new Date(row.data).toISOString().slice(0, 10) : raw.data,
    fazendaCodigo: row.fazenda_codigo || raw.fazendaCodigo,
    fazendaNome: row.fazenda_nome || raw.fazendaNome,
    talhao: row.talhao || raw.talhao,
    talhaoId: row.talhao_id || raw.talhaoId,
    variedade: row.variedade || raw.variedade,
    frenteServico: row.frente_servico || raw.frenteServico,
    turno: row.turno || raw.turno,
    frotaEquipamento: row.frota_equipamento || raw.frotaEquipamento,
    matriculaOperador: row.matricula_operador || raw.matriculaOperador,
    nomeOperador: row.nome_operador || raw.nomeOperador,
    canaInteira: row.cana_inteira ?? raw.canaInteira,
    tolete: row.tolete ?? raw.tolete,
    toco: row.toco ?? raw.toco,
    ponta: row.ponta ?? raw.ponta,
    estilhaco: row.estilhaco ?? raw.estilhaco,
    pedaco: row.pedaco ?? raw.pedaco,
    pisoteioMetros: row.pisoteio_metros ?? raw.pisoteioMetros,
    percentualPisoteio: row.percentual_pisoteio ?? raw.percentualPisoteio,
    paralelismoEsquerdo: row.paralelismo_esquerdo ?? raw.paralelismoEsquerdo,
    paralelismoDireito: row.paralelismo_direito ?? raw.paralelismoDireito,
    percentualParalelismo: row.percentual_paralelismo ?? raw.percentualParalelismo,
    totalPerda: row.total_perda ?? raw.totalPerda,
    statusRegistro: row.status_registro || raw.statusRegistro || 'ativo',
    motivoCancelamento: row.motivo_cancelamento || raw.motivoCancelamento || '',
    createdByEmail: row.created_by_email || raw.createdByEmail,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncStatus: 'synced',
    status: row.status_sincronizacao || 'sincronizado',
  };
}

async function ensureAllLancamentosTables() {
  await ensureLancamentosBrocaTable();
  await ensureLancamentosPerdaTable();
}

router.get('/apontamentos', async (req, res) => {
  try {
    const company = await resolveCompany(req.query.companyId, req.authUser);
    await ensureAllLancamentosTables();
    const tipo = String(req.query.tipo || 'todos');
    const limit = Math.min(Number(req.query.limit || 200), 1000);
    const conditionsBroca = ['company_id = $1'];
    const conditionsPerda = ['company_id = $1'];
    const params = [company.id];
    if (req.query.dataInicial) {
      params.push(parseDate(req.query.dataInicial));
      conditionsBroca.push(`data_inspecao >= $${params.length}`);
      conditionsPerda.push(`data >= $${params.length}`);
    }
    if (req.query.dataFinal) {
      params.push(parseDate(req.query.dataFinal));
      conditionsBroca.push(`data_inspecao < ($${params.length}::timestamptz + interval '1 day')`);
      conditionsPerda.push(`data < ($${params.length}::timestamptz + interval '1 day')`);
    }
    if (req.query.fazenda) {
      params.push(String(req.query.fazenda));
      conditionsBroca.push(`fazenda_codigo = $${params.length}`);
      conditionsPerda.push(`fazenda_codigo = $${params.length}`);
    }
    if (req.query.talhao) {
      params.push(String(req.query.talhao));
      conditionsBroca.push(`talhao = $${params.length}`);
      conditionsPerda.push(`talhao = $${params.length}`);
    }
    if (req.query.statusRegistro && req.query.statusRegistro !== 'todos') {
      params.push(String(req.query.statusRegistro));
      conditionsBroca.push(`COALESCE(status_registro,'ativo') = $${params.length}`);
      conditionsPerda.push(`COALESCE(status_registro,'ativo') = $${params.length}`);
    }
    const rows = [];
    if (tipo === 'todos' || tipo === 'broca') {
      const brocaRows = await prisma.$queryRawUnsafe(`SELECT * FROM lancamentos_broca WHERE ${conditionsBroca.join(' AND ')} ORDER BY data_inspecao DESC NULLS LAST, updated_at DESC LIMIT ${limit}`, ...params);
      rows.push(...brocaRows.map((r) => mapApontamentoRow(r, 'broca')));
    }
    if (tipo === 'todos' || tipo === 'perda') {
      const perdaRows = await prisma.$queryRawUnsafe(`SELECT * FROM lancamentos_perda WHERE ${conditionsPerda.join(' AND ')} ORDER BY data DESC NULLS LAST, updated_at DESC LIMIT ${limit}`, ...params);
      rows.push(...perdaRows.map((r) => mapApontamentoRow(r, 'perda')));
    }
    rows.sort((a, b) => String(b.dataInspecao || b.data || b.updatedAt || '').localeCompare(String(a.dataInspecao || a.data || a.updatedAt || '')));
    res.json({ success: true, data: rows.slice(0, limit) });
  } catch (error) {
    console.error('[Gerenciar Apontamentos] Erro ao listar:', error);
    res.status(500).json({ success: false, message: error.message || 'Erro ao listar apontamentos.' });
  }
});

router.put('/apontamentos/:tipo/:id', async (req, res) => {
  try {
    const tipo = String(req.params.tipo || '').toLowerCase();
    const payload = { ...(req.body || {}), id: req.params.id };
    const targetCollection = tipo === 'broca' ? 'lancamentos_broca' : tipo === 'perda' ? 'lancamentos_perda' : null;
    if (!targetCollection) return res.status(400).json({ success: false, message: 'Tipo de apontamento inválido.' });
    await processTask({ type: 'createOrUpdate', targetCollection, documentId: req.params.id, payload }, req.authUser);
    res.json({ success: true, data: { id: req.params.id, tipo } });
  } catch (error) {
    console.error('[Gerenciar Apontamentos] Erro ao editar:', error);
    res.status(500).json({ success: false, message: error.message || 'Erro ao editar apontamento.' });
  }
});

router.patch('/apontamentos/:tipo/:id/cancelar', async (req, res) => {
  try {
    const company = await resolveCompany(req.body?.companyId || req.query.companyId, req.authUser);
    const tipo = String(req.params.tipo || '').toLowerCase();
    const table = tipo === 'broca' ? 'lancamentos_broca' : tipo === 'perda' ? 'lancamentos_perda' : null;
    if (!table) return res.status(400).json({ success: false, message: 'Tipo de apontamento inválido.' });
    if (tipo === 'broca') await ensureLancamentosBrocaTable(); else await ensureLancamentosPerdaTable();
    await prisma.$executeRawUnsafe(
      `UPDATE ${table}
       SET status_registro='cancelado', motivo_cancelamento=$1, cancelado_por=$2, cancelado_em=NOW(), updated_at=NOW(),
           raw_data = COALESCE(raw_data, '{}'::jsonb) || $3::jsonb
       WHERE id=$4 AND company_id=$5`,
      firstValue(req.body?.motivo, 'Cancelado pelo gerenciamento de apontamentos'),
      firstValue(req.authUser?.email, req.authUser?.uid, req.authUser?.id),
      JSON.stringify({ statusRegistro: 'cancelado', motivoCancelamento: firstValue(req.body?.motivo, 'Cancelado pelo gerenciamento de apontamentos') }),
      req.params.id,
      company.id,
    );
    res.json({ success: true });
  } catch (error) {
    console.error('[Gerenciar Apontamentos] Erro ao cancelar:', error);
    res.status(500).json({ success: false, message: error.message || 'Erro ao cancelar apontamento.' });
  }
});

export default router;
