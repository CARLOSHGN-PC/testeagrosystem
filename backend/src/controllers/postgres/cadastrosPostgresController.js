import { randomUUID } from 'crypto';
import { prisma } from '../../lib/prisma.js';
import { buildCompanyWhere, resolveCompanyIds } from './postgresControllerUtils.js';

function parsePagination(query) {
  const page = Math.max(Number(query.page || 1), 1);
  const limit = Math.min(Math.max(Number(query.limit || 100), 1), 1000);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function normalizeStatusAtivo(value) {
  const raw = String(value || '').toUpperCase();
  return raw === 'INATIVO' || raw === 'INACTIVE' || raw === 'INATIVA' ? 'INATIVO' : 'ATIVO';
}

function toDecimal(value) {
  if (value === undefined || value === null || value === '') return null;

  const text = String(value).trim();
  if (!text) return null;

  // Aceita formato brasileiro (1.234,56), formato americano (1234.56)
  // e valores vindos do Excel. A regra antiga removia todo ponto, então
  // 12.35 virava 1235 e podia estourar o numeric do PostgreSQL.
  const cleaned = text.replace(/\s/g, '').replace(/[^0-9,.-]/g, '');
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  let normalized = cleaned;
  if (hasComma && hasDot) {
    normalized = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '');
  } else if (hasComma) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function toPostgresDecimal(value, precision = 12, scale = 2) {
  const n = toDecimal(value);
  if (n === null) return null;

  const maxIntegerDigits = precision - scale;
  const maxAbs = Number('9'.repeat(maxIntegerDigits)) + (1 - Math.pow(10, -scale));

  // Evita Prisma P2020 / PostgreSQL numeric out of range.
  // Para cadastro de talhão, valor fora desse limite é dado inválido de planilha.
  if (Math.abs(n) > maxAbs) return null;

  return Number(n.toFixed(scale));
}


function parseCadastroDate(value) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number' && Number.isFinite(value) && value > 20000 && value < 90000) {
    return new Date(Date.UTC(1899, 11, 30) + value * 86400000);
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const serial = raw.match(/^\d+(?:[.,]\d+)?$/);
  if (serial) {
    const n = Number(raw.replace(',', '.'));
    if (Number.isFinite(n) && n > 20000 && n < 90000) return new Date(Date.UTC(1899, 11, 30) + n * 86400000);
  }
  const br = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:\s+.*)?$/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    let year = Number(br[3]);
    if (year < 100) year += year > 50 ? 1900 : 2000;
    if (year >= 1900 && year <= 2500 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month - 1, day));
    }
  }
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function fromRaw(record) {
  return record?.rawData && typeof record.rawData === 'object' ? record.rawData : {};
}

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}


function normalizeDocIdCadastro(docId = '') {
  const raw = String(docId || '').trim();
  const match = raw.match(/^(\d+)_FAZ_([A-Z0-9_]+?)_(\d+)(?:_|$)/i);
  if (!match) return {};
  return {
    farmCode: match[1],
    farmName: `FAZ. ${match[2].replace(/_/g, ' ')}`.replace(/\s+/g, ' ').trim(),
    fieldName: match[3],
  };
}

function firstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function normalizePlanilhaRow(raw = {}) {
  const docInfo = normalizeDocIdCadastro(raw.id || raw.postgresId || raw.documentId || raw.code);
  return {
    ...raw,
    CLUSTER: firstValue(raw.CLUSTER, raw.cluster),
    EMPRESA: firstValue(raw.EMPRESA, raw.empresa),
    MOD_ADM: firstValue(raw.MOD_ADM, raw.modAdm),
    UM_INDUSTRIAL: firstValue(raw.UM_INDUSTRIAL, raw.INSTANCIA, raw.instancia, raw.umIndustrial),
    CD_SAFRA: firstValue(raw.CD_SAFRA, raw.cdSafra, raw.safra),
    TIPO_PROPRIEDADE: firstValue(raw.TIPO_PROPRIEDADE, raw.tipoPropriedade),
    CD_EMPRESA: firstValue(raw.CD_EMPRESA, raw.cdEmpresa),
    COD_FAZ: firstValue(raw.COD_FAZ, raw.codFaz, raw.codigo, raw.fundo_agricola, raw.fundoAgricola, docInfo.farmCode),
    DES_FAZENDA: firstValue(raw.DES_FAZENDA, raw.desFazenda, raw.nome, raw.name, raw.fazendaNome, raw.nome_fazenda, docInfo.farmName),
    BLOCO: firstValue(raw.BLOCO, raw.bloco),
    TALHAO: firstValue(raw.TALHAO, raw.talhao, raw.talhaoNome, docInfo.fieldName),
    AREA_TALHAO: firstValue(raw.AREA_TALHAO, raw.areaTalhao, raw.area, raw.areaHa),
    ESTAGIO: firstValue(raw.ESTAGIO, raw.estagio, raw.stage),
    VARIEDADE: firstValue(raw.VARIEDADE, raw.variedade),
    AMBIENTE: firstValue(raw.AMBIENTE, raw.ambiente),
    FORNECEDOR: firstValue(raw.FORNECEDOR, raw.fornecedor),
    DE_MUNICIPIO: firstValue(raw.DE_MUNICIPIO, raw.municipio, raw.deMunicipio),
    OCUPACAO: firstValue(raw.OCUPACAO, raw.ocupacao),
    DE_ESPACAMENTO: firstValue(raw.DE_ESPACAMENTO, raw.espacamento, raw.spacing, raw.espac),
    TIPO_SOLO: firstValue(raw.TIPO_SOLO, raw.tipoSolo),
    DT_PLANTIO: firstValue(raw.DT_PLANTIO, raw.plantingDate, raw.dtPlantio, raw.plantio),
    DT_ULTCORTE: firstValue(raw.DT_ULTCORTE, raw.lastCutDate, raw.dtUltCorte),
  };
}

function normalizeCompanyCode(req, recordCompany) {
  return req.query.companyId || req.body?.companyId || recordCompany?.code || recordCompany?.id || recordCompany || null;
}

function mapFarmToLegacy(item, req) {
  const raw = normalizePlanilhaRow(fromRaw(item));
  const codFaz = String(firstValue(raw.COD_FAZ, item.code, item.id)).trim();
  const desFazenda = String(firstValue(raw.DES_FAZENDA, item.name, codFaz)).trim();
  const stableId = codFaz || item.id;

  return {
    ...raw,
    id: stableId,
    postgresId: item.id,
    postgresId: item.id,
    companyId: normalizeCompanyCode(req, item.company),
    COD_FAZ: codFaz,
    DES_FAZENDA: desFazenda,
    codFaz,
    codigo: codFaz,
    code: codFaz,
    desFazenda,
    nome: desFazenda,
    name: desFazenda,
    area: raw.area ?? item.area ?? null,
    status: raw.status || 'ATIVO',
    syncStatus: 'synced',
    createdAt: raw.createdAt ?? item.createdAt,
    updatedAt: raw.updatedAt ?? item.updatedAt,
  };
}

function mapFieldToLegacy(item, req) {
  const raw = normalizePlanilhaRow(fromRaw(item));
  const codFaz = String(firstValue(raw.COD_FAZ, item.farm?.code)).trim();
  const desFazenda = String(firstValue(raw.DES_FAZENDA, item.farm?.name)).trim();
  const talhao = String(firstValue(raw.TALHAO, item.name, item.code, item.id)).trim();
  const areaTalhao = firstValue(raw.AREA_TALHAO, item.area);
  const fieldId = String(item.id || `${codFaz}_${talhao}`).trim();

  return {
    ...raw,
    id: fieldId,
    postgresId: item.id,
    companyId: normalizeCompanyCode(req, item.company),
    fazendaId: codFaz || item.farmId || raw.fazendaId || raw.farmId || '',
    farmId: codFaz || item.farmId || raw.farmId || raw.fazendaId || '',
    COD_FAZ: codFaz,
    DES_FAZENDA: desFazenda,
    codFaz,
    desFazenda,
    TALHAO: talhao,
    talhao,
    talhaoNome: talhao,
    code: String(firstValue(item.code, talhao)),
    AREA_TALHAO: areaTalhao,
    area: areaTalhao,
    areaHa: areaTalhao,
    ESTAGIO: firstValue(raw.ESTAGIO, item.stage),
    VARIEDADE: firstValue(raw.VARIEDADE, item.variety?.name),
    DE_ESPACAMENTO: firstValue(raw.DE_ESPACAMENTO, item.spacing),
    DT_PLANTIO: firstValue(raw.DT_PLANTIO, item.plantingDate),
    DT_ULTCORTE: firstValue(raw.DT_ULTCORTE, item.lastCutDate),
    status: raw.status || 'ATIVO',
    syncStatus: 'synced',
    createdAt: raw.createdAt ?? item.createdAt,
    updatedAt: raw.updatedAt ?? item.updatedAt,
  };
}

function mapVarietyToLegacy(item, req) {
  const raw = fromRaw(item);
  const codigo = String(firstValue(raw.CODIGO, raw.codigo, item.code)).trim();
  const variedade = String(firstValue(raw.VARIEDADE, raw.variedade, raw.nome, item.name)).trim();
  return {
    ...raw,
    id: item.id,
    companyId: normalizeCompanyCode(req, item.company),
    CODIGO: codigo,
    codigo,
    code: codigo,
    VARIEDADE: variedade,
    variedade,
    nome: variedade,
    name: variedade,
    TIPO_MATURACAO: firstValue(raw.TIPO_MATURACAO, raw.tipoMaturacao),
    INICIO_JANELA: firstValue(raw.INICIO_JANELA, raw.inicioJanela),
    FIM_JANELA: firstValue(raw.FIM_JANELA, raw.fimJanela),
    tipoMaturacao: firstValue(raw.TIPO_MATURACAO, raw.tipoMaturacao),
    inicioJanela: firstValue(raw.INICIO_JANELA, raw.inicioJanela),
    fimJanela: firstValue(raw.FIM_JANELA, raw.fimJanela),
    status: item.status || raw.status || 'ATIVO',
    syncStatus: 'synced',
    createdAt: raw.createdAt ?? item.createdAt,
    updatedAt: raw.updatedAt ?? item.updatedAt,
  };
}

function mapOperationToLegacy(item, req) {
  const raw = fromRaw(item);
  return {
    ...raw,
    id: item.id,
    companyId: normalizeCompanyCode(req, item.company),
    cdOperacao: raw.cdOperacao ?? item.code,
    deOperacao: raw.deOperacao ?? item.name,
    unidade: raw.unidade ?? item.unit,
    tipoOperacao: raw.tipoOperacao ?? item.type,
    cdCcusto: raw.cdCcusto ?? item.costCenterCode,
    deCcusto: raw.deCcusto ?? item.costCenterName,
    status: item.status || raw.status || 'ATIVO',
    syncStatus: 'synced',
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapInputToLegacy(item, req) {
  const raw = fromRaw(item);
  return {
    ...raw,
    id: item.id,
    companyId: normalizeCompanyCode(req, item.company),
    codInsumo: raw.codInsumo ?? item.code,
    descInsumo: raw.descInsumo ?? raw.nomeComercial ?? item.name,
    nomeComercial: raw.nomeComercial ?? '',
    und: raw.und ?? item.unit,
    status: item.status || raw.status || 'ATIVO',
    syncStatus: 'synced',
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapInputApplicationToLegacy(item, req) {
  const raw = fromRaw(item);
  return {
    ...raw,
    id: item.id,
    companyId: normalizeCompanyCode(req, item.company),
    descInsumo: raw.descInsumo ?? item.inputName,
    codFaz: raw.codFaz ?? item.farmCode,
    talhao: raw.talhao ?? item.fieldCode,
    deOperacao: raw.deOperacao ?? item.operation,
    doseAplic: raw.doseAplic ?? item.dose,
    haAplic: raw.haAplic ?? item.area,
    dtHistoricoIso: raw.dtHistoricoIso ?? (item.applicationDate ? new Date(item.applicationDate).toISOString().slice(0, 10) : ''),
    status: raw.status || 'ATIVO',
    syncStatus: 'synced',
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapProductionToLegacy(item, req) {
  const raw = fromRaw(item);
  return {
    ...raw,
    id: item.id,
    companyId: normalizeCompanyCode(req, item.company),
    codFaz: raw.codFaz ?? item.farmCode,
    talhao: raw.talhao ?? item.fieldCode,
    variedade: raw.variedade ?? item.varietyName,
    areaHa: raw.areaHa ?? item.cutArea,
    tonFechada: raw.tonFechada ?? item.realTon,
    tchFechado: raw.tchFechado ?? item.realTch,
    atrReal: raw.atrReal ?? item.atr,
    dtUltCorteIso: raw.dtUltCorteIso ?? (item.harvestDate ? new Date(item.harvestDate).toISOString().slice(0, 10) : ''),
    status: raw.status || 'ATIVO',
    syncStatus: 'synced',
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapProtocolToLegacy(item, req) {
  const raw = fromRaw(item);
  return {
    ...raw,
    id: item.id,
    companyId: normalizeCompanyCode(req, item.company),
    nome: raw.nome ?? item.name,
    name: item.name,
    observacoesTecnicas: raw.observacoesTecnicas ?? item.description,
    status: item.status || raw.status || 'ATIVO',
    syncStatus: 'synced',
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapProfessionalToLegacy(item, req) {
  const raw = fromRaw(item);
  return {
    ...raw,
    id: item.id,
    uuid: raw.uuid ?? item.id,
    companyId: normalizeCompanyCode(req, item.company),
    nomeCompleto: raw.nomeCompleto ?? item.name,
    cpf: raw.cpf ?? item.cpf,
    telefone: raw.telefone ?? item.phone,
    matricula: raw.matricula ?? item.registration,
    funcao: raw.funcao ?? item.role,
    equipe: raw.equipe ?? item.team,
    unidade: raw.unidade ?? item.unit,
    observacoes: raw.observacoes ?? item.notes,
    status: item.status || raw.status || 'ativo',
    syncStatus: 'synced',
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

async function resolveCompanyIdOrThrow(companyRef) {
  const ids = await resolveCompanyIds(companyRef);
  if (!ids || !ids.length) {
    const error = new Error(`Empresa não encontrada: ${companyRef}`);
    error.status = 400;
    throw error;
  }
  return ids[0];
}


function buildCadastroGeralRaw(body = {}) {
  const raw = normalizePlanilhaRow(body);
  return {
    ...body,
    ...raw,
    COD_FAZ: String(firstValue(raw.COD_FAZ, body.codFaz, body.codigo, body.code)).trim(),
    DES_FAZENDA: String(firstValue(raw.DES_FAZENDA, body.desFazenda, body.nome, body.name)).trim(),
    TALHAO: firstValue(raw.TALHAO, body.talhao, body.talhaoNome),
    AREA_TALHAO: firstValue(raw.AREA_TALHAO, body.area, body.areaHa),
  };
}

const resources = {
  farms: {
    model: 'farm', map: mapFarmToLegacy,
    orderBy: [{ code: 'asc' }, { name: 'asc' }],
    buildData: async (body) => ({
      companyId: await resolveCompanyIdOrThrow(body.companyId),
      code: String(firstValue(body.COD_FAZ, body.codFaz, body.codigo, body.code, body.fundo_agricola, body.id && !looksLikeUuid(body.id) ? body.id : randomUUID())),
      name: String(firstValue(body.DES_FAZENDA, body.desFazenda, body.nome, body.name, body.codFaz, 'Fazenda')),
      area: toDecimal(body.AREA_TALHAO ?? body.area ?? body.areaTotal ?? body.areaHa),
      rawData: buildCadastroGeralRaw(body),
    }),
  },
  fields: {
    model: 'field', map: mapFieldToLegacy,
    include: { farm: { select: { id: true, code: true, name: true } }, variety: { select: { id: true, code: true, name: true } } },
    orderBy: [{ code: 'asc' }],
    buildData: async (body) => {
      const companyId = await resolveCompanyIdOrThrow(body.companyId);
      const raw = buildCadastroGeralRaw(body);
      const codFaz = String(firstValue(raw.COD_FAZ, body.codFaz, body.fazendaId, body.farmId)).trim();
      const talhao = String(firstValue(raw.TALHAO, body.talhao, body.talhaoNome, body.name)).trim();
      let farmId = body.fazendaPostgresId || body.postgresFarmId || (looksLikeUuid(body.fazendaId || body.farmId) ? (body.fazendaId || body.farmId) : null);
      if (!farmId && codFaz) {
        const farm = await prisma.farm.findFirst({ where: { companyId, code: codFaz }, select: { id: true } });
        farmId = farm?.id || null;
      }
      return {
        companyId,
        farmId,
        code: String(firstValue(talhao ? `${codFaz}_${talhao}` : '', body.code && !looksLikeUuid(body.code) ? body.code : '', body.talhaoId, randomUUID())),
        name: talhao,
        area: toDecimal(raw.AREA_TALHAO ?? body.areaTalhao ?? body.area ?? body.AREA ?? body.areaHa),
        stage: raw.ESTAGIO !== undefined && raw.ESTAGIO !== null ? String(raw.ESTAGIO) : body.stage ? String(body.stage) : null,
        spacing: toDecimal(raw.DE_ESPACAMENTO ?? body.spacing),
        plantingDate: raw.DT_PLANTIO ? new Date(String(raw.DT_PLANTIO).split('/').reverse().join('-')) : null,
        lastCutDate: raw.DT_ULTCORTE ? new Date(String(raw.DT_ULTCORTE).split('/').reverse().join('-')) : null,
        rawData: raw,
      };
    },
  },
  varieties: {
    model: 'variety', map: mapVarietyToLegacy,
    orderBy: [{ name: 'asc' }],
    buildData: async (body) => ({
      companyId: await resolveCompanyIdOrThrow(body.companyId),
      code: body.codigo ? String(body.codigo) : body.CODIGO ? String(body.CODIGO) : body.code ? String(body.code) : body.id && !looksLikeUuid(body.id) ? String(body.id) : null,
      name: String(body.variedade ?? body.VARIEDADE ?? body.nome ?? body.name ?? body.id ?? 'Variedade'),
      status: normalizeStatusAtivo(body.status),
      rawData: { ...body, CODIGO: firstValue(body.CODIGO, body.codigo, body.code), VARIEDADE: firstValue(body.VARIEDADE, body.variedade, body.nome, body.name), TIPO_MATURACAO: firstValue(body.TIPO_MATURACAO, body.tipoMaturacao), INICIO_JANELA: firstValue(body.INICIO_JANELA, body.inicioJanela), FIM_JANELA: firstValue(body.FIM_JANELA, body.fimJanela) },
    }),
  },
  operations: {
    model: 'operation', map: mapOperationToLegacy,
    orderBy: [{ name: 'asc' }],
    buildData: async (body) => ({
      id: body.id || randomUUID(),
      companyId: await resolveCompanyIdOrThrow(body.companyId),
      code: body.cdOperacao ? String(body.cdOperacao) : body.code ? String(body.code) : null,
      name: String(body.deOperacao ?? body.nome ?? body.name ?? 'Operação'),
      unit: body.unidade ? String(body.unidade) : null,
      type: body.tipoOperacao ? String(body.tipoOperacao) : null,
      costCenterCode: body.cdCcusto ? String(body.cdCcusto) : null,
      costCenterName: body.deCcusto ? String(body.deCcusto) : null,
      status: normalizeStatusAtivo(body.status),
      rawData: body,
    }),
  },
  inputs: {
    model: 'input', map: mapInputToLegacy,
    orderBy: [{ name: 'asc' }],
    buildData: async (body) => ({
      companyId: await resolveCompanyIdOrThrow(body.companyId),
      code: body.codInsumo ? String(body.codInsumo) : body.code ? String(body.code) : null,
      name: String(body.descInsumo ?? body.nomeComercial ?? body.name ?? 'Insumo'),
      unit: body.und ? String(body.und) : body.unit ? String(body.unit) : null,
      status: normalizeStatusAtivo(body.status),
      rawData: body,
    }),
  },
  'input-applications': {
    model: 'inputApplication', map: mapInputApplicationToLegacy,
    orderBy: [{ applicationDate: 'desc' }, { createdAt: 'desc' }],
    buildData: async (body) => ({
      id: body.id || randomUUID(),
      companyId: await resolveCompanyIdOrThrow(body.companyId),
      inputName: body.descInsumo ? String(body.descInsumo) : null,
      farmCode: body.codFaz ? String(body.codFaz) : null,
      fieldCode: body.talhao ? String(body.talhao) : null,
      operation: body.deOperacao ? String(body.deOperacao) : null,
      dose: toDecimal(body.doseAplic),
      area: toDecimal(body.haAplic),
      applicationDate: body.dtHistoricoIso ? new Date(body.dtHistoricoIso) : null,
      rawData: body,
    }),
  },
  production: {
    model: 'agriculturalProduction', map: mapProductionToLegacy,
    orderBy: [{ harvestDate: 'desc' }, { createdAt: 'desc' }],
    buildData: async (body) => {
      const raw = normalizePlanilhaRow(body || {});
      const dtUltCorte = firstValue(raw.DT_ULTCORTE, body.dtUltCorteIso, body.dtUltCorte, body['DT_ULTCORTE']);
      return {
        id: body.id || randomUUID(),
        companyId: await resolveCompanyIdOrThrow(body.companyId),
        farmCode: firstValue(raw.COD_FAZ, body.codFaz) ? String(firstValue(raw.COD_FAZ, body.codFaz)) : null,
        fieldCode: firstValue(raw.TALHAO, body.talhao) ? String(firstValue(raw.TALHAO, body.talhao)) : null,
        varietyName: firstValue(raw.VARIEDADE, body.variedade) ? String(firstValue(raw.VARIEDADE, body.variedade)) : null,
        cutArea: toDecimal(firstValue(body.areaHa, body.AREA_HA, raw.AREA_HA)),
        realTon: toDecimal(firstValue(body.tonFechada, body.TON_FECHADA, raw.TON_FECHADA)),
        realTch: toDecimal(firstValue(body.tchFechado, body.TCH_FECHADO, raw.TCH_FECHADO)),
        atr: toDecimal(firstValue(body.atrReal, body.ATR_REAL, raw.ATR_REAL)),
        harvestDate: parseCadastroDate(dtUltCorte),
        rawData: { ...body, ...raw },
      };
    },
  },
  protocols: {
    model: 'protocol', map: mapProtocolToLegacy,
    orderBy: [{ name: 'asc' }],
    buildData: async (body) => ({
      id: body.id || randomUUID(),
      companyId: await resolveCompanyIdOrThrow(body.companyId),
      name: String(body.nome ?? body.name ?? 'Protocolo'),
      description: body.observacoesTecnicas ?? body.description ?? null,
      status: normalizeStatusAtivo(body.status),
      rawData: body,
    }),
  },
  professionals: {
    model: 'professional', map: mapProfessionalToLegacy,
    orderBy: [{ name: 'asc' }],
    buildData: async (body) => ({
      id: body.id || body.uuid || randomUUID(),
      companyId: await resolveCompanyIdOrThrow(body.companyId),
      name: String(body.nomeCompleto ?? body.name ?? 'Profissional'),
      cpf: body.cpf ? String(body.cpf) : null,
      phone: body.telefone ? String(body.telefone) : null,
      registration: body.matricula ? String(body.matricula) : null,
      role: body.funcao ? String(body.funcao) : null,
      team: body.equipe ? String(body.equipe) : null,
      unit: body.unidade ? String(body.unidade) : null,
      notes: body.observacoes ? String(body.observacoes) : null,
      status: body.status ? String(body.status) : 'ativo',
      rawData: body,
    }),
  },
};


function buildExtraWhere(resourceKey, query = {}) {
  const extra = {};

  if (resourceKey === 'fields' && query.farmId) {
    const farmRef = String(query.farmId);
    extra.OR = [
      { farmId: farmRef },
      { farm: { code: farmRef } },
      { farm: { name: farmRef } },
      { rawData: { path: ['COD_FAZ'], equals: farmRef } },
      { rawData: { path: ['codFaz'], equals: farmRef } },
      { rawData: { path: ['fundo_agricola'], equals: Number.isFinite(Number(farmRef)) ? Number(farmRef) : farmRef } },
    ];
  }

  const search = String(query.search || '').trim();
  if (resourceKey === 'professionals' && search) {
    extra.OR = [
      { registration: { contains: search, mode: 'insensitive' } },
      { name: { contains: search, mode: 'insensitive' } },
      { cpf: { contains: search, mode: 'insensitive' } },
      { rawData: { path: ['matricula'], string_contains: search } },
      { rawData: { path: ['nomeCompleto'], string_contains: search } },
    ];
  }

  const status = String(query.status || '').trim();
  if (status) {
    if (['farms', 'fields', 'varieties', 'operations', 'inputs', 'protocols'].includes(resourceKey)) {
      extra.status = normalizeStatusAtivo(status);
    } else if (resourceKey === 'professionals') {
      extra.status = status;
    }
  }

  const dtInicialIso = String(query.dtInicialIso || '').trim();
  const dtFinalIso = String(query.dtFinalIso || '').trim();
  if ((resourceKey === 'production' || resourceKey === 'input-applications') && (dtInicialIso || dtFinalIso)) {
    const field = resourceKey === 'production' ? 'harvestDate' : 'applicationDate';
    extra[field] = {};
    if (dtInicialIso) extra[field].gte = new Date(`${dtInicialIso}T00:00:00.000Z`);
    if (dtFinalIso) extra[field].lte = new Date(`${dtFinalIso}T23:59:59.999Z`);
  }

  return extra;
}

function mergeWhere(base, extra) {
  if (!extra || Object.keys(extra).length === 0) return base;
  if (!base || Object.keys(base).length === 0) return extra;
  return { AND: [base, extra] };
}

function getResource(req, res) {
  const resource = resources[req.params.resource];
  if (!resource) {
    res.status(404).json({ success: false, message: 'Cadastro não suportado.' });
    return null;
  }
  return resource;
}

export async function listCadastro(req, res) {
  try {
    const resource = getResource(req, res);
    if (!resource) return;
    const { page, limit, skip } = parsePagination(req.query);
    const prismaModel = prisma[resource.model];
    const companyWhere = await buildCompanyWhere(req.query.companyId);
    const extraWhere = buildExtraWhere(req.params.resource, req.query);
    const where = mergeWhere(companyWhere, extraWhere);
    const search = String(req.query.search || '').trim().toLowerCase();

    if (req.params.resource === 'farms') {
      const fieldWhere = await buildCompanyWhere(req.query.companyId);
      const fieldRows = await prisma.field.findMany({
        where: fieldWhere,
        take: 10000,
        include: { farm: { select: { id: true, code: true, name: true, rawData: true } } },
        orderBy: [{ code: 'asc' }],
      });

      const byCode = new Map();
      for (const field of fieldRows) {
        const raw = normalizePlanilhaRow({ ...(field.farm?.rawData || {}), ...(fromRaw(field) || {}) });
        const codFaz = String(firstValue(raw.COD_FAZ, field.farm?.code)).trim();
        const desFazenda = String(firstValue(raw.DES_FAZENDA, field.farm?.name, codFaz)).trim();
        if (!codFaz || looksLikeUuid(codFaz)) continue;
        if (!byCode.has(codFaz)) {
          byCode.set(codFaz, {
            id: codFaz,
            postgresId: field.farm?.id || codFaz,
            companyId: req.query.companyId || raw.companyId || '002',
            COD_FAZ: codFaz,
            DES_FAZENDA: desFazenda,
            codFaz,
            codigo: codFaz,
            code: codFaz,
            desFazenda,
            nome: desFazenda,
            name: desFazenda,
            status: raw.status || 'ATIVO',
            syncStatus: 'synced',
            rawData: raw,
          });
        }
      }

      let data = Array.from(byCode.values()).sort((a, b) => String(a.COD_FAZ).localeCompare(String(b.COD_FAZ), 'pt-BR', { numeric: true }));
      if (search) data = data.filter((item) => JSON.stringify(item).toLowerCase().includes(search));
      const total = data.length;
      data = data.slice(skip, skip + limit);
      return res.json({ success: true, page, limit, total, data });
    }

    const [total, rows] = await Promise.all([
      prismaModel.count({ where }),
      prismaModel.findMany({
        where,
        skip,
        take: limit,
        ...(resource.include ? { include: resource.include } : {}),
        orderBy: resource.orderBy,
      }),
    ]);

    let data = rows.map((row) => resource.map(row, req));
    if (search) {
      data = data.filter((item) => JSON.stringify(item).toLowerCase().includes(search));
    }

    res.json({ success: true, page, limit, total, data });
  } catch (error) {
    console.error('Erro ao listar cadastro PostgreSQL:', error);
    res.status(500).json({ success: false, message: 'Erro ao listar cadastro PostgreSQL.' });
  }
}

export async function saveCadastro(req, res) {
  try {
    const resource = getResource(req, res);
    if (!resource) return;
    const prismaModel = prisma[resource.model];
    const data = await resource.buildData(req.body || {});
    const id = String(req.params.id || req.body?.id || data.id || randomUUID());

    const saved = await prismaModel.upsert({
      where: { id },
      update: data,
      create: { ...data, id },
    });

    res.json({ success: true, data: resource.map(saved, req) });
  } catch (error) {
    console.error('Erro ao salvar cadastro PostgreSQL:', error);
    res.status(error.status || 500).json({ success: false, message: error.message || 'Erro ao salvar cadastro PostgreSQL.' });
  }
}


function normalizeTextKey(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function resolveVarietyName(row = {}) {
  return String(firstValue(row.VARIEDADE, row.variedade, row.nome, row.name, row.DESCRICAO, row.descricao)).trim();
}

function resolveVarietyCode(row = {}) {
  return String(firstValue(row.CODIGO, row.codigo, row.code, row.COD_VARIEDADE, row.codVariedade)).trim();
}


function normalizeDateFromCadastro(value) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const raw = String(value).trim();
  if (!raw) return null;
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (br) {
    const dd = br[1].padStart(2, '0');
    const mm = br[2].padStart(2, '0');
    let yyyy = br[3];
    if (yyyy.length === 2) yyyy = Number(yyyy) > 50 ? `19${yyyy}` : `20${yyyy}`;
    const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildStableFieldCodeForCadastro(codFaz, talhao) {
  const farm = String(codFaz || '').trim();
  const field = String(talhao || '').trim();
  return farm && field ? `${farm}_${field}` : field || farm || randomUUID();
}

function chunkArray(items = [], size = 1000) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function replaceFarmsAndFieldsForCompany(rows = [], companyIdRef) {
  const companyId = await resolveCompanyIdOrThrow(companyIdRef || rows[0]?.companyId);
  const farmsByCode = new Map();
  const fieldsByCode = new Map();

  for (const inputRow of rows) {
    const raw = buildCadastroGeralRaw({ ...inputRow, companyId });
    const codFaz = String(firstValue(raw.COD_FAZ, inputRow.codFaz, inputRow.codigo, inputRow.fazendaId, inputRow.farmId)).trim();
    const talhao = String(firstValue(raw.TALHAO, inputRow.talhao, inputRow.talhaoNome, inputRow.name)).trim();
    if (!codFaz || !talhao) continue;

    const desFazenda = String(firstValue(raw.DES_FAZENDA, inputRow.desFazenda, inputRow.nome, inputRow.name, codFaz)).trim();
    if (!farmsByCode.has(codFaz)) {
      farmsByCode.set(codFaz, {
        id: randomUUID(),
        companyId,
        code: codFaz,
        name: desFazenda || codFaz,
        area: null,
        rawData: { ...raw, companyId, COD_FAZ: codFaz, DES_FAZENDA: desFazenda || codFaz },
      });
    }

    const fieldCode = buildStableFieldCodeForCadastro(codFaz, talhao);
    if (fieldsByCode.has(fieldCode)) continue;
    fieldsByCode.set(fieldCode, {
      id: randomUUID(),
      companyId,
      farmCode: codFaz,
      code: fieldCode,
      name: talhao,
      area: toPostgresDecimal(raw.AREA_TALHAO ?? inputRow.areaTalhao ?? inputRow.area ?? inputRow.AREA ?? inputRow.areaHa, 12, 2),
      stage: raw.ESTAGIO !== undefined && raw.ESTAGIO !== null && String(raw.ESTAGIO).trim() !== '' ? String(raw.ESTAGIO) : null,
      spacing: toPostgresDecimal(raw.DE_ESPACAMENTO ?? inputRow.spacing, 8, 2),
      plantingDate: normalizeDateFromCadastro(raw.DT_PLANTIO),
      lastCutDate: normalizeDateFromCadastro(raw.DT_ULTCORTE),
      rawData: { ...raw, companyId, COD_FAZ: codFaz, DES_FAZENDA: desFazenda || codFaz, TALHAO: talhao },
    });
  }

  const farmsToCreate = Array.from(farmsByCode.values());
  const farmIdByCode = new Map(farmsToCreate.map((farm) => [farm.code, farm.id]));
  const fieldsToCreate = Array.from(fieldsByCode.values()).map(({ farmCode, ...field }) => ({
    ...field,
    farmId: farmIdByCode.get(farmCode) || null,
  }));

  await prisma.$transaction(async (tx) => {
    await tx.estimate.updateMany({ where: { companyId }, data: { fieldId: null, farmId: null } });
    await tx.cutOrder.updateMany({ where: { companyId }, data: { farmId: null } });

    const existingFields = await tx.field.findMany({ where: { companyId }, select: { id: true } });
    const fieldIds = existingFields.map((f) => f.id);
    for (const ids of chunkArray(fieldIds, 1000)) {
      await tx.cutOrderField.updateMany({ where: { fieldId: { in: ids } }, data: { fieldId: null } });
      await tx.serviceOrderField.updateMany({ where: { fieldId: { in: ids } }, data: { fieldId: null } });
    }

    await tx.field.deleteMany({ where: { companyId } });
    await tx.farm.deleteMany({ where: { companyId } });

    for (const farmsChunk of chunkArray(farmsToCreate, 1000)) {
      if (farmsChunk.length) await tx.farm.createMany({ data: farmsChunk });
    }

    for (const fieldsChunk of chunkArray(fieldsToCreate, 1000)) {
      if (fieldsChunk.length) await tx.field.createMany({ data: fieldsChunk });
    }
  }, {
    maxWait: 20000,
    timeout: 120000,
  });

  return { farms: farmsByCode.size, fields: fieldsByCode.size };
}

async function replaceVarietiesForCompany(rows = [], companyIdRef) {
  const companyId = await resolveCompanyIdOrThrow(companyIdRef || rows[0]?.companyId);
  const uniqueRows = [];
  const seen = new Set();

  for (const row of rows) {
    const name = resolveVarietyName(row);
    if (!name) continue;
    const key = normalizeTextKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueRows.push({ ...row, companyId, VARIEDADE: name, CODIGO: resolveVarietyCode(row) });
  }

  await prisma.$transaction(async (tx) => {
    if (tx.field) {
      await tx.field.updateMany({ where: { companyId }, data: { varietyId: null } });
    }
    if (tx.estimate) {
      await tx.estimate.updateMany({ where: { companyId }, data: { varietyId: null } });
    }
    await tx.variety.deleteMany({ where: { companyId } });

    for (const row of uniqueRows) {
      const data = await resources.varieties.buildData(row);
      const id = String(row.id && !looksLikeUuid(row.id) ? randomUUID() : row.id || randomUUID());
      await tx.variety.create({ data: { ...data, id } });
    }
  });

  return uniqueRows.length;
}

export async function bulkSaveCadastro(req, res) {
  try {
    const resource = getResource(req, res);
    if (!resource) return;
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : Array.isArray(req.body) ? req.body : [];

    if (req.params.resource === 'varieties') {
      const total = await replaceVarietiesForCompany(rows, req.body?.companyId || req.query.companyId);
      return res.json({ success: true, total, mode: 'replace' });
    }

    const requestedMode = String(req.body?.mode || req.body?.saveMode || req.query.mode || '').toLowerCase();
    if (req.params.resource === 'fields' && ['replace', 'substituir', 'overwrite'].includes(requestedMode)) {
      const totals = await replaceFarmsAndFieldsForCompany(rows, req.body?.companyId || req.query.companyId);
      return res.json({ success: true, total: totals.fields, farms: totals.farms, fields: totals.fields, mode: 'replace' });
    }

    let saved = 0;
    for (const row of rows) {
      const data = await resource.buildData(row);
      const id = String(row.id || data.id || randomUUID());
      await prisma[resource.model].upsert({ where: { id }, update: data, create: { ...data, id } });
      saved += 1;
    }

    res.json({ success: true, total: saved });
  } catch (error) {
    console.error('Erro ao salvar cadastro em massa PostgreSQL:', error);
    res.status(error.status || 500).json({ success: false, message: error.message || 'Erro ao salvar cadastro em massa PostgreSQL.' });
  }
}

export async function inactivateCadastro(req, res) {
  try {
    const resource = getResource(req, res);
    if (!resource) return;
    const prismaModel = prisma[resource.model];
    const id = String(req.params.id);
    const existing = await prismaModel.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Registro não encontrado.' });

    const raw = fromRaw(existing);
    const statusValue = resource.model === 'professional' ? 'inativo' : 'INATIVO';
    const update = {
      status: statusValue,
      rawData: { ...raw, status: statusValue, updatedAt: new Date().toISOString() },
    };

    const saved = await prismaModel.update({ where: { id }, data: update });
    res.json({ success: true, data: resource.map(saved, req) });
  } catch (error) {
    console.error('Erro ao inativar cadastro PostgreSQL:', error);
    res.status(500).json({ success: false, message: 'Erro ao inativar cadastro PostgreSQL.' });
  }
}
