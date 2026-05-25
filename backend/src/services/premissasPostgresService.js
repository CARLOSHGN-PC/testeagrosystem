import { prisma } from '../lib/prisma.js';
import { resolveCompanyIds, normalizeText } from '../controllers/postgres/postgresControllerUtils.js';

const DEFAULT_PREMISSAS_COLHEITA_NAME = 'premissas_colheita';
const DEFAULT_DIRETRIZ_VINHACA_NAME = 'premissas_tratos_vinhaca';

const MONTH_KEYS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function toNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const str = String(value).trim();
  if (!str) return fallback;
  const commaIndex = str.lastIndexOf(',');
  const dotIndex = str.lastIndexOf('.');
  let normalized = str;
  if (commaIndex > -1 && dotIndex > -1) {
    normalized = commaIndex > dotIndex ? str.replace(/\./g, '').replace(',', '.') : str.replace(/,/g, '');
  } else if (commaIndex > -1) {
    normalized = str.replace(',', '.');
  }
  const number = Number(normalized);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeStatus(value) {
  return String(value || '').toUpperCase() === 'INATIVO' ? 'INATIVO' : 'ATIVO';
}

function buildDefaultMetasMensais() {
  return MONTH_KEYS.reduce((acc, key) => {
    acc[key] = { metaMes: 0, atr: 0, broca: 0 };
    return acc;
  }, {});
}

const MONTH_ALIASES = {
  jan: ['jan', 'janeiro', '01', '1'], fev: ['fev', 'fevereiro', '02', '2'], mar: ['mar', 'marco', 'março', '03', '3'], abr: ['abr', 'abril', '04', '4'],
  mai: ['mai', 'maio', '05', '5'], jun: ['jun', 'junho', '06', '6'], jul: ['jul', 'julho', '07', '7'], ago: ['ago', 'agosto', '08', '8'],
  set: ['set', 'setembro', '09', '9'], out: ['out', 'outubro', '10'], nov: ['nov', 'novembro', '11'], dez: ['dez', 'dezembro', '12'],
};

function normalizeMonthKey(value) {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  for (const [key, aliases] of Object.entries(MONTH_ALIASES)) {
    if (aliases.map(normalizeText).includes(normalized)) return key;
  }
  return MONTH_KEYS.includes(normalized) ? normalized : '';
}

function pickMonthlyNumber(source = {}, names = [], fallback = 0) {
  for (const name of names) {
    if (source?.[name] !== undefined && source?.[name] !== null && source?.[name] !== '') {
      return toNumber(source[name], fallback);
    }
  }
  return toNumber(fallback, 0);
}

function normalizeMonthlyTargets(raw = {}, fallbackMetaMes = 0, fallbackAtr = 0, fallbackBroca = 0) {
  const defaults = buildDefaultMetasMensais();
  MONTH_KEYS.forEach((key) => {
    defaults[key] = { metaMes: toNumber(fallbackMetaMes, 0), atr: toNumber(fallbackAtr, 0), broca: toNumber(fallbackBroca, 0) };
  });

  if (!raw || typeof raw !== 'object') return defaults;

  if (Array.isArray(raw)) {
    raw.forEach((item = {}, index) => {
      const key = normalizeMonthKey(item.mes ?? item.month ?? item.nome ?? item.label ?? item.key ?? item.mesReferencia) || MONTH_KEYS[index];
      if (!key) return;
      defaults[key] = {
        metaMes: pickMonthlyNumber(item, ['metaMes', 'meta', 'meta_mensal', 'metaMensal', 'moagemPrevista', 'moagem', 'volume', 'toneladas'], defaults[key].metaMes),
        atr: pickMonthlyNumber(item, ['atr', 'ATR', 'atrMeta', 'metaAtr'], defaults[key].atr),
        broca: pickMonthlyNumber(item, ['broca', 'Broca', 'brocaMeta', 'metaBroca'], defaults[key].broca),
      };
    });
    return defaults;
  }

  MONTH_KEYS.forEach((key) => {
    const aliases = MONTH_ALIASES[key] || [key];
    let current = null;
    for (const alias of aliases) {
      if (raw[alias] && typeof raw[alias] === 'object') { current = raw[alias]; break; }
      const normalizedAlias = normalizeText(alias);
      const foundKey = Object.keys(raw).find((k) => normalizeText(k) === normalizedAlias);
      if (foundKey && raw[foundKey] && typeof raw[foundKey] === 'object') { current = raw[foundKey]; break; }
    }
    if (!current) return;
    defaults[key] = {
      metaMes: pickMonthlyNumber(current, ['metaMes', 'meta', 'meta_mensal', 'metaMensal', 'moagemPrevista', 'moagem', 'volume', 'toneladas'], defaults[key].metaMes),
      atr: pickMonthlyNumber(current, ['atr', 'ATR', 'atrMeta', 'metaAtr'], defaults[key].atr),
      broca: pickMonthlyNumber(current, ['broca', 'Broca', 'brocaMeta', 'metaBroca'], defaults[key].broca),
    };
  });

  return defaults;
}

export const DEFAULT_FECHAMENTO_OC_ATR_TCH_CONFIG = {
  tchDivisao: 75,
  atrDivisao: 127,
  quadrantes: {
    baixoAtrBaixoTch: { label: 'Baixo ATR / Baixo TCH', color: '#cd3c37', tchMin: 0, tchMax: 75, atrMin: 0, atrMax: 127 },
    altoAtrBaixoTch: { label: 'Alto ATR / Baixo TCH', color: '#555fd7', tchMin: 0, tchMax: 75, atrMin: 127, atrMax: 999 },
    baixoAtrAltoTch: { label: 'Baixo ATR / Alto TCH', color: '#e1a823', tchMin: 75, tchMax: 999, atrMin: 0, atrMax: 127 },
    altoAtrAltoTch: { label: 'Alto ATR / Alto TCH', color: '#22aa58', tchMin: 75, tchMax: 999, atrMin: 127, atrMax: 999 },
  },
};

const DEFAULT_COLHEITA_PREMISSAS = {
  anoSafra: String(new Date().getFullYear()),
  dataInicioSafra: '',
  dataFimSafra: '',
  horasProdutivas: 14,
  tiroMedio: 600,
  numeroLinhas: 1,
  capacidadeTransbordo: 16.5,
  manobra: '01:00',
  aguardando: '00:30',
  velocidadeIda: 28,
  velocidadeVolta: 26,
  densidadeCarga: 75,
  numeroColhedoras: 4,
  numeroTratores: 7,
  raioMedio: 14,
  metaHora: 0,
  metaDia: 0,
  metaSemana: 0,
  metaMes: 0,
  moagemPrevista: 0,
  metaReprojetada: 0,
  atr: 0,
  tch: 0,
  tah: 0,
  broca: 0,
  impurezaMineral: 0,
  impurezaVegetal: 0,
  metaDensidade: 0,
  rotacaoMoenda: 0,
  estoque: 0,
  metasMensais: buildDefaultMetasMensais(),
  fechamentoOcAtrTchConfig: DEFAULT_FECHAMENTO_OC_ATR_TCH_CONFIG,
  idadeIdealMeses: 12,
};

function sanitizeAtrTchConfig(value = {}) {
  const source = value || {};
  const base = DEFAULT_FECHAMENTO_OC_ATR_TCH_CONFIG;
  const quadrantes = {};
  Object.entries(base.quadrantes).forEach(([key, defaults]) => {
    const item = source?.quadrantes?.[key] || {};
    quadrantes[key] = {
      label: String(item.label ?? defaults.label),
      color: String(item.color ?? defaults.color),
      tchMin: toNumber(item.tchMin, defaults.tchMin),
      tchMax: toNumber(item.tchMax, defaults.tchMax),
      atrMin: toNumber(item.atrMin, defaults.atrMin),
      atrMax: toNumber(item.atrMax, defaults.atrMax),
    };
  });
  return {
    tchDivisao: toNumber(source.tchDivisao, base.tchDivisao),
    atrDivisao: toNumber(source.atrDivisao, base.atrDivisao),
    quadrantes,
  };
}

function sanitizeColheitaPremissas(data = {}) {
  const raw = data?.rawData && typeof data.rawData === 'object' ? { ...data.rawData, ...data } : data || {};
  const anoSafraConfig = raw.anoSafraConfig || {};
  const sanitized = {
    ...DEFAULT_COLHEITA_PREMISSAS,
    ...raw,
    anoSafra: String(raw.anoSafra ?? raw.safra ?? anoSafraConfig.anoSafra ?? DEFAULT_COLHEITA_PREMISSAS.anoSafra),
    dataInicioSafra: String(raw.dataInicioSafra ?? anoSafraConfig.dataInicioSafra ?? ''),
    dataFimSafra: String(raw.dataFimSafra ?? anoSafraConfig.dataFimSafra ?? ''),
    metasMensais: normalizeMonthlyTargets(raw.metasMensais || raw.monthlyGoals || raw.metas_mensais || raw.metas || raw.meses, raw.metaMes, raw.atr, raw.broca),
    fechamentoOcAtrTchConfig: sanitizeAtrTchConfig(raw.fechamentoOcAtrTchConfig),
  };

  for (const key of Object.keys(DEFAULT_COLHEITA_PREMISSAS)) {
    if (['anoSafra', 'dataInicioSafra', 'dataFimSafra', 'metasMensais', 'fechamentoOcAtrTchConfig', 'manobra', 'aguardando'].includes(key)) continue;
    sanitized[key] = toNumber(raw[key], DEFAULT_COLHEITA_PREMISSAS[key]);
  }

  return sanitized;
}

const DEFAULT_DIRETRIZ_VINHACA = {
  fatorN: 0.8,
  fatorK2O: 1.5,
  mapHa: 50,
  cortes: [
    { corte: 1, tchObjetivo: 130 },
    { corte: 2, tchObjetivo: 120 },
    { corte: 3, tchObjetivo: 110 },
    { corte: 4, tchObjetivo: 100 },
    { corte: 5, tchObjetivo: 95 },
    { corte: 6, tchObjetivo: 90 },
    { corte: 7, tchObjetivo: 85 },
    { corte: 8, tchObjetivo: 80 },
    { corte: 9, tchObjetivo: 75 },
    { corte: 10, tchObjetivo: 70 },
    { corte: 11, tchObjetivo: 65 },
  ],
};

function sanitizeDiretrizVinhaca(data = {}) {
  const raw = data?.rawData && typeof data.rawData === 'object' ? { ...data.rawData, ...data } : data || {};
  const cortesSource = Array.isArray(raw.cortes) && raw.cortes.length > 0 ? raw.cortes : DEFAULT_DIRETRIZ_VINHACA.cortes;
  return {
    fatorN: toNumber(raw.fatorN, DEFAULT_DIRETRIZ_VINHACA.fatorN),
    fatorK2O: toNumber(raw.fatorK2O, DEFAULT_DIRETRIZ_VINHACA.fatorK2O),
    mapHa: toNumber(raw.mapHa, DEFAULT_DIRETRIZ_VINHACA.mapHa),
    cortes: cortesSource.map((item, index) => ({
      corte: index + 1,
      tchObjetivo: toNumber(item?.tchObjetivo, DEFAULT_DIRETRIZ_VINHACA.cortes[index]?.tchObjetivo ?? 0),
    })),
  };
}

async function resolveCompanyCandidates(companyRef) {
  const raw = String(companyRef || '').trim();
  const aliases = { '002': 'usinacacu', '2': 'usinacacu', usinacacu: 'usinacacu' };
  const normalized = normalizeText(raw);
  const searchRef = aliases[normalized] || raw || 'usinacacu';
  const set = new Set([raw, searchRef, raw.toLowerCase(), '002', normalized === '002' ? 'usinacacu' : ''].filter(Boolean));

  try {
    const ids = await resolveCompanyIds(searchRef);
    (ids || []).forEach((id) => id && set.add(String(id)));
  } catch {}

  try {
    const companies = await prisma.company.findMany({ select: { id: true, code: true, name: true } });
    companies.forEach((company) => {
      if (
        company.id === raw ||
        String(company.code || '') === raw ||
        normalizeText(company.code) === normalized ||
        normalizeText(company.name).includes(normalized) ||
        (normalized === '002' && normalizeText(company.name).includes('usinacacu'))
      ) {
        set.add(company.id);
        if (company.code) set.add(String(company.code));
        if (company.name) set.add(String(company.name));
      }
    });
  } catch {}

  const candidates = Array.from(set).filter(Boolean);
  if (!candidates.length) throw new Error(`Empresa não encontrada para premissas: ${companyRef || 'vazio'}`);
  return candidates;
}

async function resolveCompanyIdOrThrow(companyRef) {
  const candidates = await resolveCompanyCandidates(companyRef);
  return candidates[0];
}

async function findAssumption(companyIdOrCandidates, name) {
  const normalizedName = normalizeText(name);
  const candidates = Array.isArray(companyIdOrCandidates) ? companyIdOrCandidates : [companyIdOrCandidates];
  const rows = await prisma.harvestAssumption.findMany({
    where: { companyId: { in: candidates.filter(Boolean) } },
    orderBy: [{ updatedAt: 'desc' }],
  });

  return rows.find((row) => {
    const raw = row.rawData || {};
    const candidates = [
      row.id,
      row.name,
      raw.id,
      raw.nome,
      raw.name,
      raw.tipo,
      raw.collection,
      raw.collectionName,
      raw.modulo,
    ].filter(Boolean).map(normalizeText);

    return candidates.some((candidate) => (
      candidate === normalizedName ||
      candidate.includes(normalizedName) ||
      normalizedName.includes(candidate)
    ));
  }) || null;
}

export async function getColheitaPremissasPostgres(companyRef) {
  const companyCandidates = await resolveCompanyCandidates(companyRef);
  const companyId = companyCandidates[0];
  const row = await findAssumption(companyCandidates, DEFAULT_PREMISSAS_COLHEITA_NAME);
  const base = row?.rawData || row || {};
  return sanitizeColheitaPremissas({ ...base, id: row?.id, companyId: row?.companyId || companyId });
}

export async function saveColheitaPremissasPostgres(companyRef, payload = {}, actorUid = null) {
  const companyCandidates = await resolveCompanyCandidates(companyRef);
  const companyId = companyCandidates[0];
  const sanitized = sanitizeColheitaPremissas(payload);
  const existing = await findAssumption(companyCandidates, DEFAULT_PREMISSAS_COLHEITA_NAME);
  const id = existing?.id || `${DEFAULT_PREMISSAS_COLHEITA_NAME}_${companyId}`;
  const rawData = {
    ...sanitized,
    companyId: companyRef || companyId,
    safra: sanitized.anoSafra,
    anoSafraConfig: {
      anoSafra: sanitized.anoSafra,
      dataInicioSafra: sanitized.dataInicioSafra,
      dataFimSafra: sanitized.dataFimSafra,
    },
    updatedBy: actorUid || 'postgres-auth',
    updatedAt: new Date().toISOString(),
  };

  const row = await prisma.harvestAssumption.upsert({
    where: { id },
    update: {
      companyId,
      harvestYear: sanitized.anoSafra,
      name: DEFAULT_PREMISSAS_COLHEITA_NAME,
      status: normalizeStatus(payload.status),
      dailyGoal: sanitized.metaDia,
      weeklyGoal: sanitized.metaSemana,
      monthlyGoal: sanitized.metaMes,
      hourlyGoal: sanitized.metaHora,
      rawData,
    },
    create: {
      id,
      companyId,
      harvestYear: sanitized.anoSafra,
      name: DEFAULT_PREMISSAS_COLHEITA_NAME,
      status: normalizeStatus(payload.status),
      dailyGoal: sanitized.metaDia,
      weeklyGoal: sanitized.metaSemana,
      monthlyGoal: sanitized.metaMes,
      hourlyGoal: sanitized.metaHora,
      rawData,
    },
  });

  return sanitizeColheitaPremissas({ ...row.rawData, id: row.id, companyId });
}

export async function getDiretrizVinhacaPostgres(companyRef) {
  const companyCandidates = await resolveCompanyCandidates(companyRef);
  const companyId = companyCandidates[0];
  const row = await findAssumption(companyCandidates, DEFAULT_DIRETRIZ_VINHACA_NAME);
  return sanitizeDiretrizVinhaca({ ...(row?.rawData || {}), id: row?.id, companyId: row?.companyId || companyId });
}

export async function saveDiretrizVinhacaPostgres(companyRef, payload = {}, actorUid = null) {
  const companyCandidates = await resolveCompanyCandidates(companyRef);
  const companyId = companyCandidates[0];
  const sanitized = sanitizeDiretrizVinhaca(payload);
  const existing = await findAssumption(companyCandidates, DEFAULT_DIRETRIZ_VINHACA_NAME);
  const id = existing?.id || `${DEFAULT_DIRETRIZ_VINHACA_NAME}_${companyId}`;
  const rawData = {
    ...sanitized,
    companyId: companyRef || companyId,
    nome: DEFAULT_DIRETRIZ_VINHACA_NAME,
    tipo: DEFAULT_DIRETRIZ_VINHACA_NAME,
    status: 'ATIVO',
    updatedBy: actorUid || 'postgres-auth',
    updatedAt: new Date().toISOString(),
  };

  const row = await prisma.harvestAssumption.upsert({
    where: { id },
    update: {
      companyId,
      name: DEFAULT_DIRETRIZ_VINHACA_NAME,
      status: 'ATIVO',
      rawData,
    },
    create: {
      id,
      companyId,
      name: DEFAULT_DIRETRIZ_VINHACA_NAME,
      status: 'ATIVO',
      rawData,
    },
  });

  return sanitizeDiretrizVinhaca({ ...row.rawData, id: row.id, companyId });
}
