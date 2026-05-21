
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { firebaseStorage } from '../config/firebaseAdmin.js';

const FECHAMENTO_OC_PLANEJAMENTO_CACHE = new Map();
const FECHAMENTO_OC_PLANEJAMENTO_CACHE_MS = Number(process.env.FECHAMENTO_OC_PLANEJAMENTO_CACHE_MS || 5 * 60 * 1000);
const FECHAMENTO_OC_DASHBOARD_CACHE = new Map();
const FECHAMENTO_OC_DASHBOARD_CACHE_MS = Number(process.env.FECHAMENTO_OC_DASHBOARD_CACHE_MS || 2 * 60 * 1000);
const FECHAMENTO_OC_TIPO_PROPRIEDADE_CACHE = new Map();
const FECHAMENTO_OC_TIPO_PROPRIEDADE_CACHE_MS = Number(process.env.FECHAMENTO_OC_TIPO_PROPRIEDADE_CACHE_MS || 10 * 60 * 1000);



// PostgreSQL helpers for Dashboard Colheita / Entrada de Cana.
// Mantemos o shape antigo esperado pelo frontend, mas a origem agora é Prisma/PostgreSQL.
function decimalToNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value?.toNumber === 'function') {
    const n = value.toNumber();
    return Number.isFinite(n) ? n : fallback;
  }
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

function dateToLegacy(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return normalizeDateKey(value);
  return normalizeDateKey(value);
}

function dateTimeToLegacy(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 19);
  return String(value || '');
}

function normalizeTextKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}


async function carregarGeojsonMaisRecenteMapa(companyId) {
  // Fonte real da camada de mapas: arquivo processado no Firebase Storage.
  // A camada Ordem de Corte vem no SHP/GeoJSON com as colunas ECORTE e AREA.
  try {
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || 'agrosystem-e484e.firebasestorage.app';
    const bucket = firebaseStorage.bucket(bucketName);
    const candidates = await getDashboardCompanyCandidates(companyId);
    const normalized = normalizeTextKey(companyId);
    if (normalized === '002' || normalized.includes('usinacacu')) candidates.push('usinacacu');
    if (normalized === '001' || normalized.includes('agrosystem')) candidates.push('agro-system');

    const prefixes = Array.from(new Set(candidates.map((v) => String(v || '').trim()).filter(Boolean)));
    let latest = null;
    let latestPrefix = '';

    for (const candidate of prefixes) {
      const prefix = `${candidate}/mapas/processados/geojson_`;
      const [files] = await bucket.getFiles({ prefix });
      const mapFiles = (files || [])
        .map((file) => ({ file, timestamp: Number((file.name.match(/geojson_(\d+)\.json/) || [])[1] || 0) }))
        .filter((item) => item.timestamp > 0)
        .sort((a, b) => b.timestamp - a.timestamp);
      if (mapFiles.length && (!latest || mapFiles[0].timestamp > latest.timestamp)) {
        latest = mapFiles[0];
        latestPrefix = prefix;
      }
    }

    if (!latest) return { features: [], source: 'storage:none' };
    const [buffer] = await latest.file.download();
    const geojson = JSON.parse(buffer.toString('utf-8'));
    return { features: Array.isArray(geojson?.features) ? geojson.features : [], source: `storage:${latestPrefix}` };
  } catch (error) {
    console.warn('[FechamentoOC] Não foi possível ler GeoJSON do mapa para área planejada:', error?.message || error);
    return { features: [], source: 'storage:error' };
  }
}

async function getDashboardCompanyCandidates(companyId) {
  const raw = String(companyId || '').trim();
  const rawLower = raw.toLowerCase();
  const normalized = normalizeTextKey(raw);
  const candidates = new Set([raw, rawLower].filter(Boolean));

  const companies = await prisma.company.findMany({
    select: { id: true, code: true, name: true },
  }).catch(() => []);

  const found = companies.find((c) => {
    const code = String(c.code || '').trim();
    const name = String(c.name || '').trim();
    return c.id === raw || code === raw || normalizeTextKey(code) === normalized || normalizeTextKey(name) === normalized || normalizeTextKey(name).includes(normalized);
  });

  if (found) {
    candidates.add(found.id);
    if (found.code) candidates.add(String(found.code).trim());
    if (found.name) candidates.add(String(found.name).trim());
  }

  if (normalized === '002' || normalized === 'usinacacu' || normalizeTextKey(found?.name).includes('usinacacu')) {
    candidates.add('002');
    candidates.add('usinacacu');
    const usina = companies.find((c) => normalizeTextKey(c.name).includes('usinacacu') || String(c.code) === '002');
    if (usina) {
      candidates.add(usina.id);
      candidates.add(String(usina.code || ''));
    }
  }

  if (normalized === '001' || normalized === 'agrosystem' || normalized === 'agrosystemtestes' || rawLower === 'agro-system') {
    candidates.add('001');
    candidates.add('agro-system');
    const agro = companies.find((c) => normalizeTextKey(c.name).includes('agrosystem') || String(c.code) === '001');
    if (agro) {
      candidates.add(agro.id);
      candidates.add(String(agro.code || ''));
    }
  }

  return Array.from(candidates).filter(Boolean);
}

async function getDashboardCompanyWhere(companyId) {
  const candidates = await getDashboardCompanyCandidates(companyId);
  return {
    OR: candidates.flatMap((value) => [
      { companyId: value },
      { companyCode: value },
    ]),
  };
}

function pgRecordToLegacy(row = {}) {
  return {
    ...(row.rawData || {}),
    id: row.id,
    companyId: row.companyCode || row.companyId,
    safra: row.harvestYear || row.rawData?.safra || '',
    data: dateToLegacy(row.date),
    hora: row.time || row.rawData?.hora || '',
    dataHora: dateTimeToLegacy(row.dateTime),
    frente: row.front || '',
    descricao: row.description || 'N/A',
    entrega: decimalToNumber(row.delivery),
    densidadeMedia: decimalToNumber(row.densityAverage),
    metaPeriodo: decimalToNumber(row.targetPeriod),
    entreguePercentual: decimalToNumber(row.deliveredPercent),
    mediaEntrega: decimalToNumber(row.deliveryAverage),
    mediaMeta: decimalToNumber(row.targetAverage),
    diferenca: decimalToNumber(row.difference),
  };
}

function pgImpurityToLegacy(row = {}) {
  return {
    ...(row.rawData || {}),
    id: row.id,
    companyId: row.companyCode || row.companyId,
    safra: row.harvestYear || '',
    data: dateToLegacy(row.date),
    hora: row.time || '',
    dataHora: dateTimeToLegacy(row.dateTime),
    impurezaMineral: decimalToNumber(row.mineral),
    impurezaVegetal: decimalToNumber(row.vegetal),
  };
}

function pgAtrFarmToLegacy(row = {}) {
  return {
    ...(row.rawData || {}),
    id: row.id,
    companyId: row.companyCode || row.companyId,
    safra: row.harvestYear || '',
    data: dateToLegacy(row.date),
    fazenda: row.farmLabel || [row.farmCode, row.farmName].filter(Boolean).join(' - ') || row.rawData?.fazenda || '',
    fundoAgricola: row.farmLabel || [row.farmCode, row.farmName].filter(Boolean).join(' - ') || row.rawData?.fundoAgricola || '',
    fornecedor: row.supplier || '',
    propriedade: row.property || '',
    nome: row.name || '',
    atr: decimalToNumber(row.atr),
  };
}

function pgAtrMonthlyToLegacy(row = {}) {
  return {
    ...(row.rawData || {}),
    id: row.id,
    companyId: row.companyCode || row.companyId,
    safra: row.harvestYear || '',
    data: dateToLegacy(row.date),
    atr: decimalToNumber(row.atr),
    acumulado: decimalToNumber(row.accumulated),
  };
}

function pgImpurityShiftToLegacy(row = {}) {
  const raw = row.rawData || {};
  const rawShiftA = raw.turnoA ?? raw['Turno A'] ?? raw.A ?? raw.turno_a;
  const rawShiftB = raw.turnoB ?? raw['Turno B'] ?? raw.B ?? raw.turno_b;
  const rawShiftC = raw.turnoC ?? raw['Turno C'] ?? raw.C ?? raw.turno_c;
  const rawFront = String(raw.frente ?? raw.Frente ?? '').trim().replace(/^F\s*-?\s*/i, '');
  const front = String(row.front || rawFront || '').trim().replace(/^F\s*-?\s*/i, '');
  return {
    ...raw,
    id: row.id,
    companyId: row.companyCode || row.companyId,
    tipo: row.type || raw.tipo || '',
    safra: row.harvestYear || raw.safra || '',
    data: dateToLegacy(row.date) || normalizeDateKey(raw.data || raw.Data),
    frente: front,
    frenteLabel: row.frontLabel || raw.frenteLabel || (front ? `F - ${front}` : ''),
    turnoA: decimalToNumber(row.shiftA, decimalToNumber(rawShiftA)),
    turnoB: decimalToNumber(row.shiftB, decimalToNumber(rawShiftB)),
    turnoC: decimalToNumber(row.shiftC, decimalToNumber(rawShiftC)),
  };
}

function pgPremiseToLegacy(row = {}) {
  const raw = row.rawData || {};
  return {
    ...DEFAULT_PREMISSAS,
    ...raw,
    companyId: row.companyCode || row.companyId,
    moagemPrevista: decimalToNumber(row.projectedCrushing, raw.moagemPrevista ?? 0),
    metaReprojetada: decimalToNumber(row.reprojectedGoal, raw.metaReprojetada ?? 0),
    metaDia: decimalToNumber(row.dayGoal, raw.metaDia ?? 0),
    metaSemana: decimalToNumber(row.weekGoal, raw.metaSemana ?? 0),
    metaMes: decimalToNumber(row.monthGoal, raw.metaMes ?? 0),
    metaHora: decimalToNumber(row.hourGoal, raw.metaHora ?? 0),
    atr: decimalToNumber(row.atr, raw.atr ?? 0),
    tah: decimalToNumber(row.tah, raw.tah ?? 0),
    tch: decimalToNumber(row.tch, raw.tch ?? 0),
    broca: decimalToNumber(row.broca, raw.broca ?? 0),
    impurezaVegetal: decimalToNumber(row.vegetalImpurity, raw.impurezaVegetal ?? 0),
    impurezaMineral: decimalToNumber(row.mineralImpurity, raw.impurezaMineral ?? 0),
    metasMensais: row.monthlyGoals || raw.metasMensais || buildDefaultMetasMensais(),
  };
}

function pgOperationalToLegacy(row = {}) {
  const raw = row.rawData || {};
  return {
    ...DEFAULT_OPERACIONAL,
    ...raw,
    companyId: row.companyCode || row.companyId,
    rotacaoMoenda: decimalToNumber(row.millRotation, raw.rotacaoMoenda ?? raw.rotacao ?? 0),
    estoqueCarretas: decimalToNumber(row.cartStock, raw.estoqueCarretas ?? raw.estoque ?? 0),
    estoque: decimalToNumber(row.cartStock, raw.estoque ?? 0),
  };
}

async function readDashboardPostgresData(companyId) {
  const where = await getDashboardCompanyWhere(companyId);
  const [records, impurities, atrFarm, atrMonthly, impurityMineralShift, impurityVegetalShift] = await Promise.all([
    prisma.dashboardColheitaRegistro.findMany({ where, orderBy: [{ date: 'asc' }, { time: 'asc' }] }),
    prisma.dashboardColheitaImpureza.findMany({ where, orderBy: [{ date: 'asc' }, { time: 'asc' }] }),
    prisma.dashboardColheitaAtrFazenda.findMany({ where, orderBy: [{ date: 'asc' }, { farmLabel: 'asc' }] }),
    prisma.dashboardColheitaAtrMensal.findMany({ where, orderBy: [{ date: 'asc' }] }),
    prisma.dashboardColheitaImpurezaMineralTurno.findMany({ where, orderBy: [{ date: 'asc' }, { front: 'asc' }] }),
    prisma.dashboardColheitaImpurezaVegetalTurno.findMany({ where, orderBy: [{ date: 'asc' }, { front: 'asc' }] }),
  ]);
  return {
    records: records.map(pgRecordToLegacy),
    impurities: impurities.map(pgImpurityToLegacy),
    atrFarm: atrFarm.map(pgAtrFarmToLegacy),
    atrMonthly: atrMonthly.map(pgAtrMonthlyToLegacy),
    impurityMineralShift: impurityMineralShift.map(pgImpurityShiftToLegacy),
    impurityVegetalShift: impurityVegetalShift.map(pgImpurityShiftToLegacy),
  };
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const str = String(value).trim();
  if (!str) return fallback;
  const commaIndex = str.lastIndexOf(',');
  const dotIndex = str.lastIndexOf('.');
  let normalizedString = str;

  if (commaIndex > -1 && dotIndex > -1) {
    normalizedString = commaIndex > dotIndex
      ? str.replace(/\./g, '').replace(',', '.')
      : str.replace(/,/g, '');
  } else if (commaIndex > -1) {
    normalizedString = str.replace(',', '.');
  } else {
    normalizedString = str;
  }

  const normalized = Number(normalizedString);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function parseNumber(value, fallback = 0) {
  return toNumber(value, fallback);
}


function parseDbDate(value) {
  const key = normalizeDateKey(value);
  if (!key) return null;
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function parseDbDateTime(value) {
  if (!value) return null;
  const str = String(value);
  const date = new Date(str);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function resolveDashboardCompanyIdentity(companyId) {
  const canonical = normalizeCompanyId(companyId);
  if (!canonical) throw new Error('companyId é obrigatório.');
  const key = normalizeCompanyKey(canonical);
  const company = await prisma.company.findFirst({
    where: {
      OR: [
        { id: canonical },
        { code: canonical },
        { name: { equals: canonical, mode: 'insensitive' } },
      ],
    },
    select: { id: true, code: true, name: true },
  }).catch(() => null);

  if (company) {
    return {
      companyId: company.id,
      companyCode: company.code || canonical,
      companyKey: normalizeCompanyKey(company.code || company.id || canonical),
    };
  }

  return { companyId: canonical, companyCode: canonical, companyKey: key };
}


async function getFarmNameMapForDashboard(companyId) {
  const identity = await resolveDashboardCompanyIdentity(companyId);
  const companyIds = [identity.companyId, identity.companyCode, normalizeCompanyId(companyId)].filter(Boolean);
  const farms = await prisma.farm.findMany({
    where: { companyId: { in: [...new Set(companyIds)] } },
    select: { code: true, name: true, rawData: true },
  }).catch(() => []);

  const map = {};
  for (const farm of farms) {
    const code = String(farm.code || farm.rawData?.FUNDO_AGR || farm.rawData?.COD_FAZ || '').trim();
    const name = String(farm.name || farm.rawData?.FAZENDA || farm.rawData?.DES_FAZENDA || '').trim();
    if (code && name) {
      map[code] = name;
      map[normalizeCompanyKey(code)] = name;
    }
  }
  return map;
}

async function deleteByCompanyDatesPrisma(model, identity, dates = []) {
  const uniqueDates = [...new Set((dates || []).map((date) => normalizeDateKey(date)).filter(Boolean))];
  if (!uniqueDates.length) return { deleted: 0 };

  let deleted = 0;
  for (const data of uniqueDates) {
    const dbDate = parseDbDate(data);
    if (!dbDate) continue;
    const nextDate = new Date(dbDate.getTime() + 24 * 60 * 60 * 1000);
    const result = await model.deleteMany({
      where: {
        OR: [
          { companyId: identity.companyId },
          { companyCode: identity.companyCode },
        ],
        date: { gte: dbDate, lt: nextDate },
      },
    });
    deleted += result.count || 0;
  }
  return { deleted };
}

function safeJson(value) {
  try { return JSON.parse(JSON.stringify(value || {})); } catch { return {}; }
}

function stableImportIdPart(value) {
  return crypto
    .createHash('sha1')
    .update(JSON.stringify(safeJson(value)))
    .digest('hex')
    .slice(0, 16);
}

async function deleteAllByCompanyPrisma(model, identity) {
  const result = await model.deleteMany({
    where: {
      OR: [
        { companyId: identity.companyId },
        { companyCode: identity.companyCode },
      ],
    },
  });
  return { deleted: result.count || 0 };
}

async function deleteByCompanyDatesOrAllPrisma(model, identity, dates = [], replaceAll = false) {
  if (replaceAll === true) return deleteAllByCompanyPrisma(model, identity);
  return deleteByCompanyDatesPrisma(model, identity, dates);
}


async function deleteClosureDashboardByCompanyClosingDates(identity, dates = []) {
  const uniqueDates = [...new Set((dates || []).map((date) => normalizeDateKey(date)).filter(Boolean))];
  if (!uniqueDates.length) return { deleted: 0 };

  let deleted = 0;
  for (const data of uniqueDates) {
    const dbDate = parseDbDate(data);
    if (!dbDate) continue;
    const nextDate = new Date(dbDate.getTime() + 24 * 60 * 60 * 1000);
    const result = await prisma.closureDashboardRecord.deleteMany({
      where: {
        companyId: { in: [identity.companyId, identity.companyCode].filter(Boolean) },
        closingDate: { gte: dbDate, lt: nextDate },
      },
    });
    deleted += result.count || 0;
  }
  return { deleted };
}


function normalizeCompanyId(value) {
  return value?.toString().trim().toLowerCase();
}

function normalizeCompanyKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}


function getOcField(item = {}, aliases = []) {
  for (const key of aliases) {
    // Para Fechamento OC, o valor mais confiável é o JSON original importado.
    // Ele preserva as colunas reais do relatório: Cortada, Prod. Prev., Prod. Real e Atr.
    if (item?.raw?.[key] !== undefined && item?.raw?.[key] !== null && String(item.raw[key]).trim() !== '') return item.raw[key];
    if (item?.[key] !== undefined && item?.[key] !== null && String(item[key]).trim() !== '') return item[key];
  }
  return undefined;
}

function getOcRawOrStored(row = {}, raw = {}, rawAliases = [], storedValue = undefined) {
  for (const key of rawAliases) {
    if (raw?.[key] !== undefined && raw?.[key] !== null && String(raw[key]).trim() !== '') return raw[key];
  }
  return storedValue;
}

function getOcCompanyKey(item = {}) {
  return normalizeCompanyKey(getOcField(item, ['companyId','empresaId','company_id','empresa_id','company','empresa']));
}

function normalizeOcRegistro(item = {}) {
  return {
    ...item,
    companyId: getOcField(item, ['companyId','empresaId','company_id','empresa_id']) || item.companyId,
    safra: String(getOcField(item, ['safra','Safra','anoSafra','Ano Safra']) || '').trim(),
    fazenda: String(getOcField(item, ['fazenda','Fazenda']) || '').trim(),
    quadra: String(getOcField(item, ['quadra','Quadra']) || '').trim(),
    variedade: String(getOcField(item, ['variedade','Variedade']) || 'Outras').trim(),
    abertura: normalizeDateKey(getOcField(item, ['abertura','Abertura'])),
    encerramento: normalizeDateKey(getOcField(item, ['encerramento','Encerramento'])),
    cortada: parseNumber(getOcField(item, ['cortada','Cortada','AREA CORTADA','Area Cortada','Área Cortada'])),
    liberada: parseNumber(getOcField(item, ['liberada','Liberada'])),
    tHaPrev: parseNumber(getOcField(item, ['tHaPrev','T/Ha Prev.','T/Ha Prev','tchPrevisto','tchPrev'])),
    prodPrev: parseNumber(getOcField(item, ['prodPrev','Prod. Prev.','Prod Prev','PROD. PREV.','PROD PREV'])),
    tHaReal: parseNumber(getOcField(item, ['tHaReal','T/Ha Real.','T/Ha Real','tchReal'])),
    prodReal: parseNumber(getOcField(item, ['prodReal','Prod. Real','Prod Real','PROD. REAL','PROD REAL'])),
    varPercent: parseNumber(getOcField(item, ['varPercent','Var. %','Var %'])),
    atr: parseNumber(getOcField(item, ['atr','Atr','ATR'])),
    atrHaReal: parseNumber(getOcField(item, ['atrHaReal','Atr/Ha Real.','ATR/Ha Real','Atr/Ha Real'])),
    idade: parseNumber(getOcField(item, ['idade','Idade'])),
    tempo: parseNumber(getOcField(item, ['tempo','Tempo'])),
    cortes: parseNumber(getOcField(item, ['cortes','Cortes']))
  };
}

function normalizeAtrFarmName(value = '') { return String(value || '').trim().toUpperCase(); }
function isAtrAcumuladoRow(value = '') { return normalizeAtrFarmName(value).includes('ACUMULADO'); }
function getFundoAgricolaOrder(value = '') {
  if (isAtrAcumuladoRow(value)) return Number.MAX_SAFE_INTEGER;
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER - 1;
}
function sortAtrFazendaByFundoAgricola(a, b) {
  const aName = a?.fazenda || a?.fundoAgricola || '';
  const bName = b?.fazenda || b?.fundoAgricola || '';
  const aAccum = isAtrAcumuladoRow(aName);
  const bAccum = isAtrAcumuladoRow(bName);
  if (aAccum !== bAccum) return aAccum ? 1 : -1;
  const aOrder = getFundoAgricolaOrder(aName);
  const bOrder = getFundoAgricolaOrder(bName);
  if (aOrder !== bOrder) return aOrder - bOrder;
  return String(aName).localeCompare(String(bName), 'pt-BR', { numeric: true, sensitivity: 'base' });
}
function filterAtrRowsByLatestDate(rows = []) {
  const validRows = (Array.isArray(rows) ? rows : []).filter((item) => getRegistroDateKey(item));
  const latestDate = validRows.reduce((latest, item) => {
    const date = getRegistroDateKey(item);
    return !latest || date > latest ? date : latest;
  }, '');
  return latestDate ? validRows.filter((item) => getRegistroDateKey(item) === latestDate) : [];
}
function findAtrDiaAnteriorFromMensalRows(rows = [], referenceDate = '') {
  const validRows = (Array.isArray(rows) ? rows : [])
    .map((item) => ({
      ...item,
      data: getRegistroDateKey(item),
      atr: parseNumber(item.atr ?? item.ATR ?? item.Atr)
    }))
    .filter((item) => item.data && item.atr > 0)
    .sort((a, b) => b.data.localeCompare(a.data));

  if (!validRows.length) return 0;

  const currentDate = referenceDate || validRows[0].data;
  const previousDate = validRows.find((item) => item.data < currentDate)?.data;
  if (!previousDate) return 0;

  const previousRow = validRows.find((item) => item.data === previousDate);
  return previousRow ? previousRow.atr : 0;
}

function parsePercent(value) {
  if (value === null || value === undefined || value === '') return 0;
  const str = String(value).trim();
  if (str.endsWith('%')) return toNumber(str.slice(0, -1), 0) / 100;
  const num = Number(str.replace(',', '.'));
  if (!Number.isFinite(num)) return 0;
  return num > 1 ? num / 100 : num;
}

function normalizeDateKey(value) {
  if (value === null || value === undefined || value === '') return '';

  const formatDateParts = (year, month, day) => {
    const yyyy = Number(year);
    const mm = Number(month);
    const dd = Number(day);
    if (!Number.isInteger(yyyy) || !Number.isInteger(mm) || !Number.isInteger(dd)) return '';
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return '';
    return `${String(yyyy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  };

  const excelSerialToDateKey = (serialValue) => {
    const serial = Number(serialValue);
    if (!Number.isFinite(serial)) return '';
    // Relatórios XLSX importados pelo navegador geralmente chegam como serial do Excel.
    // Ex.: 46140 = 28/04/2026. Não tratar isso como timestamp JS (senão cai em 1969/1970 e joga tudo em DEZ).
    if (serial < 20000 || serial > 80000) return '';
    const utc = Date.UTC(1899, 11, 30) + Math.floor(serial) * 24 * 60 * 60 * 1000;
    const date = new Date(utc);
    if (Number.isNaN(date.getTime())) return '';
    return formatDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  };

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return formatDateParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value?.toDate === 'function') {
    const date = value.toDate();
    if (date instanceof Date && !Number.isNaN(date.getTime())) {
      return formatDateParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
    }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const excelDate = excelSerialToDateKey(value);
    if (excelDate) return excelDate;

    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return formatDateISOInTimeZone(date, 'America/Sao_Paulo');
    }
  }

  const str = String(value || '').trim();
  if (!str) return '';

  const numericSerial = str.match(/^\d{5}(?:[\.,]\d+)?$/);
  if (numericSerial) {
    const excelDate = excelSerialToDateKey(str.replace(',', '.'));
    if (excelDate) return excelDate;
  }

  const brDate = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if (brDate) return formatDateParts(brDate[3], brDate[2], brDate[1]);

  const isoDate = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if (isoDate) return formatDateParts(isoDate[1], isoDate[2], isoDate[3]);

  const isoPrefix = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})T/);
  if (isoPrefix) return formatDateParts(isoPrefix[1], isoPrefix[2], isoPrefix[3]);

  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return formatDateParts(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
  }

  return '';
}

function normalizeDate(value) {
  return normalizeDateKey(value);
}

function normalizeHour(value) {
  const str = String(value || '').trim();
  const match = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return '';
  const hh = String(Math.min(23, Math.max(0, Number(match[1])))).padStart(2, '0');
  const mm = String(Math.min(59, Math.max(0, Number(match[2])))).padStart(2, '0');
  return `${hh}:${mm}`;
}

function monthLabel(month) {
  return ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][month] || '';
}
const MONTH_LABELS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MONTH_KEYS = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];


// Defaults usados pelas rotas antigas do dashboard. Sem isso, qualquer leitura sem
// registro no PostgreSQL quebrava com "DEFAULT_PREMISSAS is not defined" e retornava 400.
const DEFAULT_OC_ATR_TCH_PREMISSAS_CONFIG = {
  tchDivisao: 75,
  atrDivisao: 127,
  quadrantes: {
    baixoAtrBaixoTch: { label: 'Baixo ATR / Baixo TCH', color: '#cd3c37', tchMin: 0, tchMax: 75, atrMin: 0, atrMax: 127 },
    altoAtrBaixoTch: { label: 'Alto ATR / Baixo TCH', color: '#555fd7', tchMin: 0, tchMax: 75, atrMin: 127, atrMax: 999 },
    baixoAtrAltoTch: { label: 'Baixo ATR / Alto TCH', color: '#e1a823', tchMin: 75, tchMax: 999, atrMin: 0, atrMax: 127 },
    altoAtrAltoTch: { label: 'Alto ATR / Alto TCH', color: '#22aa58', tchMin: 75, tchMax: 999, atrMin: 127, atrMax: 999 },
  },
};

const DEFAULT_PREMISSAS = {
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
  impurezaVegetal: 0,
  impurezaMineral: 0,
  metaDensidade: 0,
  metasMensais: buildDefaultMetasMensais(),
  fechamentoOcAtrTchConfig: DEFAULT_OC_ATR_TCH_PREMISSAS_CONFIG,
};

const DEFAULT_OPERACIONAL = {
  rotacaoMoenda: 0,
  rotacao: 0,
  estoqueCarretas: 0,
  estoque: 0,
  updatedBy: 'system',
};

function buildDefaultMetasMensais() {
  return MONTH_KEYS.reduce((acc, key) => {
    acc[key] = { metaMes: 0, atr: 0, broca: 0 };
    return acc;
  }, {});
}

function normalizeMonthlyTargets(raw = {}, fallbackMetaMes = 0, fallbackAtr = 0, fallbackBroca = 0) {
  const defaults = buildDefaultMetasMensais();
  MONTH_KEYS.forEach((key) => {
    const current = raw?.[key] || {};
    defaults[key] = {
      metaMes: toNumber(current.metaMes, toNumber(fallbackMetaMes)),
      atr: toNumber(current.atr, toNumber(fallbackAtr)),
      broca: toNumber(current.broca, toNumber(fallbackBroca))
    };
  });
  return defaults;
}

function monthKeyFromIndex(monthIndex) {
  return MONTH_KEYS[monthIndex] || null;
}

function dayLabel(date) {
  return ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][date.getDay()] || '';
}

function parseLocalDate(value) {
  const normalized = normalizeDateKey(value);
  if (!normalized) return null;
  const [year, month, day] = normalized.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function formatDateBR(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatDateISO(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateISOInTimeZone(date, timeZone = 'America/Sao_Paulo') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function previousDateISO(dateISO) {
  const parsed = parseLocalDate(dateISO);
  if (!parsed) return ''; 
  parsed.setDate(parsed.getDate() - 1);
  return formatDateISO(parsed);
}

function startOfWeekMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeekSunday(date) {
  const d = startOfWeekMonday(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function paletteForIndex(index) {
  return ['#21d6a0', '#5b8fff', '#f0a83a', '#bb86fc', '#f87171', '#2dd4bf', '#f59e0b', '#60a5fa'][index % 8];
}

function frontKey(frente) {
  return `f${String(frente || '0').replace(/[^0-9a-zA-Z]+/g, '_')}`;
}

function getRegistroDateKey(item = {}) {
  return normalizeDateKey(item?.data ?? item?.Data);
}

function getRegistroFrente(item = {}) {
  return String(item?.frente ?? item?.Frente ?? '').trim();
}

function getRegistroEntrega(item = {}) {
  return parseNumber(item?.entrega ?? item?.Entrega);
}

function getRegistroSafra(item = {}) {
  return String(item?.safra ?? item?.Safra ?? '').trim();
}

function getRegistroDescricao(item = {}) {
  return String(item?.descricao ?? item?.Descrição ?? item?.Descricao ?? '').trim();
}


function getRegistroDensidadeValue(item = {}) {
  const candidates = [
    item.densidadeMedia,
    item.densidade_media,
    item.densidade,
    item.densidadeCarga,
    item.mediaEntrega,
    item.media_entrega,
    item.pesoCarga,
    item.peso_carga,
    item.tonCarga,
    item.ton_carga,
    item.toneladas,
    item.pesoLiquido,
    item.peso_liquido,
    item['Densidade Média'],
    item['Densidade Media'],
    item['Densidade média'],
    item['Densidade'],
    item['Densid. (t/cam)'],
    item['Densid (t/cam)'],
    item['Densid.'],
    item['Media Entrega'],
    item['Média Entrega'],
    item['Peso Carga'],
    item['Peso Líquido'],
    item['Peso Liquido'],
    item.entrega,
    item['Entrega']
  ];

  for (const candidate of candidates) {
    const value = parseNumber(candidate);
    if (value > 0) return value;
  }
  return 0;
}

function registroTimestampKey(item = {}) {
  const data = normalizeDateKey(item.data || item.Data) || '';
  const hora = normalizeHour(item.hora || item.Hora) || '00:00';
  const importedAt = item.importedAt?.toDate ? item.importedAt.toDate().toISOString() : String(item.importedAt || '');
  const id = String(item.id || '');
  return `${data}T${hora}:00|${importedAt}|${id}`;
}

function calculateDensidadeMediaUltimasCargas(items = []) {
  const byFrente = new Map();

  items.forEach((item) => {
    const frente = getRegistroFrente(item);
    if (!frente) return;

    // Regra do card: usar exclusivamente a coluna Entrega.
    const entrega = getRegistroEntrega(item);
    if (entrega <= 0) return;

    const current = byFrente.get(frente) || [];
    current.push({ ...item, densidade: entrega });
    byFrente.set(frente, current);
  });

  const mediasPorFrente = Array.from(byFrente.values())
    .map((rows) => rows
      .sort((a, b) => registroTimestampKey(b).localeCompare(registroTimestampKey(a)))
      .slice(0, 4)
    )
    .map((rows) => {
      const total = rows.reduce((sum, item) => sum + parseNumber(item.densidade), 0);
      return rows.length ? total / rows.length : 0;
    })
    .filter((value) => value > 0);

  if (!mediasPorFrente.length) return 0;
  return mediasPorFrente.reduce((sum, value) => sum + value, 0) / mediasPorFrente.length;
}

function sanitizeRegistro(row = {}, actorUid = null) {
  const data = normalizeDateKey(row.data || row.Data);
  const hora = normalizeHour(row.hora || row.Hora);
  const safra = String(row.safra || row.Safra || '').trim();
  const frente = String(row.frente || row.Frente || '').trim();
  const descricao = String(row.descricao || row.Descrição || row.Descricao || '').trim();

  if (!data || !hora || !safra) {
    throw new Error('Linha inválida: Data, Hora e Safra são obrigatórias.');
  }

  const dataHora = `${data}T${hora}:00`;

  return {
    companyId: null,
    data,
    hora,
    dataHora,
    safra,
    frente,
    descricao,
    mediaMeta: parseNumber(row.mediaMeta ?? row['Media Meta']),
    metaPeriodo: parseNumber(row.metaPeriodo ?? row['Meta Periodo']),
    mediaEntrega: parseNumber(row.mediaEntrega ?? row['Media Entrega']),
    densidadeMedia: getRegistroDensidadeValue(row),
    entrega: parseNumber(row.entrega ?? row['Entrega']),
    diferenca: parseNumber(row.diferenca ?? row['Diferença'] ?? row['Diferenca']),
    entreguePercentual: parsePercent(row.entreguePercentual ?? row['Entregue %']),
    importedAt: new Date(),
    importedBy: actorUid || 'system'
  };
}

function docIdFromRegistro(item) {
  const desc = (item.descricao || 'sem-descricao')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);

  return `${item.safra}_${item.data}_${item.hora}_${item.frente || '0'}_${desc}`;
}

function sanitizeImpurezaRegistro(row = {}, actorUid = null) {
  const safra = String(row.safra || row.Safra || '').trim();
  const data = normalizeDateKey(row.data || row.Data);
  const hora = normalizeHour(row.hora || row.Hora);
  if (!safra || !data || !hora) {
    throw new Error('Linha inválida: Safra, Data e Hora são obrigatórias.');
  }

  return {
    companyId: null,
    safra,
    data,
    hora,
    dataHora: `${data}T${hora}:00`,
    impurezaMineral: parseNumber(row.impurezaMineral ?? row['Imp. Mineral']),
    impurezaVegetal: parseNumber(row.impurezaVegetal ?? row['Imp. Vegetal']),
    importedAt: new Date(),
    importedBy: actorUid || 'system'
  };
}


function pickField(row = {}, names = []) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null && String(row[name]).trim() !== '') return row[name];
  }
  return '';
}

function sanitizeDocIdPart(value, fallback = 'sem-info') {
  const cleaned = String(value || fallback)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return cleaned || fallback;
}

function sanitizeImpurezaTurnoRegistro(row = {}, tipo = 'mineral', actorUid = null) {
  const safra = String(pickField(row, ['safra', 'Safra']) || '').trim();
  const data = normalizeDateKey(pickField(row, ['data', 'Data']));
  const frente = String(pickField(row, ['frente', 'Frente']) || '').trim().replace(/^F\s*-?\s*/i, '');
  if (!safra || !data || !frente) throw new Error('Linha inválida: Data, Safra e Frente são obrigatórias.');
  return {
    companyId: null,
    tipo: tipo === 'vegetal' ? 'vegetal' : 'mineral',
    safra,
    data,
    frente,
    frenteLabel: /^F\s*-/i.test(frente) ? frente : 'F - ' + frente,
    turnoA: parseNumber(pickField(row, ['turnoA', 'Turno A'])),
    turnoB: parseNumber(pickField(row, ['turnoB', 'Turno B'])),
    turnoC: parseNumber(pickField(row, ['turnoC', 'Turno C'])),
    raw: row.raw || row,
    importedAt: new Date(),
    importedBy: actorUid || 'system'
  };
}

function sanitizeAtrFazendaRegistro(row = {}, actorUid = null) {
  const safra = String(pickField(row, ['safra', 'Safra']) || '').trim();
  const data = normalizeDateKey(pickField(row, ['data', 'Data']));
  const fazenda = String(pickField(row, ['fazenda', 'Fazenda', 'fundoAgricola', 'Fundo Agrícola', 'Fundo Agricola', 'propriedade', 'Propriedade']) || '').trim();
  const atr = parseNumber(pickField(row, ['atr', 'ATR', 'Atr']));
  if (!safra || !data || !fazenda) throw new Error('Linha inválida: Safra, Data e Fazenda/Fundo Agrícola são obrigatórios.');
  return {
    companyId: null,
    safra,
    data,
    fazenda,
    fundoAgricola: String(pickField(row, ['fundoAgricola', 'Fundo Agrícola', 'Fundo Agricola']) || fazenda).trim(),
    fornecedor: String(pickField(row, ['fornecedor', 'Fornecedor']) || '').trim(),
    nome: String(pickField(row, ['nome', 'Nome']) || '').trim(),
    propriedade: String(pickField(row, ['propriedade', 'Propriedade']) || '').trim(),
    atr,
    raw: row.raw || row,
    importedAt: new Date(),
    importedBy: actorUid || 'system'
  };
}

function sanitizeAtrMensalRegistro(row = {}, actorUid = null) {
  const safra = String(pickField(row, ['safra', 'Safra']) || '').trim();
  const data = normalizeDateKey(pickField(row, ['data', 'Data']));
  if (!safra || !data) throw new Error('Linha inválida: Safra e Data são obrigatórias.');
  return {
    companyId: null,
    safra,
    data,
    atr: parseNumber(pickField(row, ['atr', 'ATR', 'Atr'])),
    acumulado: parseNumber(pickField(row, ['acumulado', 'Acumulado'])),
    importedAt: new Date(),
    importedBy: actorUid || 'system'
  };
}

function sanitizeBrocaRegistro(row = {}, actorUid = null) {
  const safra = String(row.safra || row.Safra || '').trim();
  const data = normalizeDateKey(row.data || row.Data);
  if (!safra || !data) {
    throw new Error('Linha inválida: Safra e Data são obrigatórias.');
  }

  const entreExa = parseNumber(row.entreExa ?? row['Entre Exa']);
  const entreBr = parseNumber(row.entreBr ?? row['Entre Br']);
  const percentualCalculado = entreExa > 0 ? (entreBr / entreExa) * 100 : 0;

  return {
    companyId: null,
    safra,
    propriedade: String(row.propriedade ?? row['Propriedade'] ?? '').trim(),
    vazio: String(row.vazio ?? row['vazio'] ?? '').trim(),
    fazenda: String(row.fazenda ?? row['Fazenda'] ?? '').trim(),
    talhao: String(row.talhao ?? row['Talhão'] ?? '').trim(),
    vazio1: String(row.vazio1 ?? row['Vazio 1'] ?? '').trim(),
    areaPla: toNumber(row.areaPla ?? row['Área Pla']),
    variedade: String(row.variedade ?? row['Variedade'] ?? '').trim(),
    data,
    seq: String(row.seq ?? row['Seq.'] ?? '').trim(),
    corte: String(row.corte ?? row['Corte'] ?? '').trim(),
    tipCorte: String(row.tipCorte ?? row['Tip Corte'] ?? '').trim(),
    canaEx: toNumber(row.canaEx ?? row['Cana Ex']),
    canaBr: toNumber(row.canaBr ?? row['Cana Br']),
    percentual: parsePercent(row.percentual ?? row['%']),
    entreExa,
    entreBr,
    percentual2: parsePercent(row.percentual2 ?? row['%2']),
    anCrt: String(row.anCrt ?? row['An Crt'] ?? '').trim(),
    percentualCalculado,
    importedAt: new Date(),
    importedBy: actorUid || 'system'
  };
}

export async function importColheitaChunk(companyId, rows = [], actorUid = null, options = {}) {
  const identity = await resolveDashboardCompanyIdentity(companyId);
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Nenhum registro informado.');

  const replaceDates = Array.isArray(options.replaceDates) ? options.replaceDates : [];
  const deleteResult = await deleteByCompanyDatesOrAllPrisma(prisma.dashboardColheitaRegistro, identity, replaceDates, options.replaceAll === true);

  const data = rows.map((row) => {
    const item = sanitizeRegistro(row, actorUid);
    return {
      id: `${identity.companyCode}_${docIdFromRegistro(item)}`,
      companyId: identity.companyId,
      companyCode: identity.companyCode,
      harvestYear: item.safra,
      date: parseDbDate(item.data),
      time: item.hora,
      dateTime: parseDbDateTime(item.dataHora),
      front: item.frente,
      description: item.descricao || 'N/A',
      delivery: item.entrega,
      densityAverage: item.densidadeMedia,
      targetPeriod: item.metaPeriodo,
      deliveredPercent: item.entreguePercentual,
      deliveryAverage: item.mediaEntrega,
      targetAverage: item.mediaMeta,
      difference: item.diferenca,
      importedBy: actorUid || 'system',
      importedAt: new Date(),
      rawData: safeJson(row.raw || row),
    };
  });

  await prisma.dashboardColheitaRegistro.createMany({ data, skipDuplicates: true });
  return { processed: data.length, deleted: deleteResult.deleted };
}

export async function importImpurezasChunk(companyId, rows = [], actorUid = null, options = {}) {
  const identity = await resolveDashboardCompanyIdentity(companyId);
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Nenhum registro informado.');

  const replaceDates = Array.isArray(options.replaceDates) ? options.replaceDates : [];
  const deleteResult = await deleteByCompanyDatesOrAllPrisma(prisma.dashboardColheitaImpureza, identity, replaceDates, options.replaceAll === true);

  const data = rows.map((row, index) => {
    const item = sanitizeImpurezaRegistro(row, actorUid);
    return {
      id: `${identity.companyCode}_${item.safra}_${item.data}_${item.hora}_${stableImportIdPart(row.raw || row)}_${index}`,
      companyId: identity.companyId,
      companyCode: identity.companyCode,
      harvestYear: item.safra,
      date: parseDbDate(item.data),
      time: item.hora,
      dateTime: parseDbDateTime(item.dataHora),
      mineral: item.impurezaMineral,
      vegetal: item.impurezaVegetal,
      importedBy: actorUid || 'system',
      importedAt: new Date(),
      rawData: safeJson(row.raw || row),
    };
  });

  await prisma.dashboardColheitaImpureza.createMany({ data, skipDuplicates: true });
  return { processed: data.length, deleted: deleteResult.deleted };
}

export async function importBrocaChunk(companyId, rows = [], actorUid = null, options = {}) {
  // Broca ainda não está ativa na migração SQL desta etapa.
  return { processed: 0, deleted: 0, skipped: Array.isArray(rows) ? rows.length : 0, message: 'Importação de broca desativada temporariamente.' };
}

export async function importImpurezaTurnoChunk(companyId, tipo = 'mineral', rows = [], actorUid = null, options = {}) {
  const identity = await resolveDashboardCompanyIdentity(companyId);
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Nenhum registro informado.');

  const normalizedTipo = tipo === 'vegetal' ? 'vegetal' : 'mineral';
  const model = normalizedTipo === 'vegetal'
    ? prisma.dashboardColheitaImpurezaVegetalTurno
    : prisma.dashboardColheitaImpurezaMineralTurno;

  const replaceDates = Array.isArray(options.replaceDates) ? options.replaceDates : [];
  const deleteResult = await deleteByCompanyDatesOrAllPrisma(model, identity, replaceDates, options.replaceAll === true);

  const data = rows.map((row, index) => {
    const item = sanitizeImpurezaTurnoRegistro(row, normalizedTipo, actorUid);
    return {
      id: `${identity.companyCode}_${normalizedTipo}_${item.safra}_${item.data}_${item.frente}_${stableImportIdPart(row.raw || row)}_${index}`,
      companyId: identity.companyId,
      companyCode: identity.companyCode,
      harvestYear: item.safra,
      date: parseDbDate(item.data),
      front: item.frente,
      frontLabel: item.frenteLabel,
      shiftA: item.turnoA,
      shiftB: item.turnoB,
      shiftC: item.turnoC,
      rawData: safeJson(row.raw || row),
    };
  });

  await model.createMany({ data, skipDuplicates: true });
  return { processed: data.length, deleted: deleteResult.deleted };
}

export async function importAtrFazendaChunk(companyId, rows = [], actorUid = null, options = {}) {
  const identity = await resolveDashboardCompanyIdentity(companyId);
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Nenhum registro informado.');

  const replaceDates = Array.isArray(options.replaceDates) ? options.replaceDates : [];
  const deleteResult = await deleteByCompanyDatesOrAllPrisma(prisma.dashboardColheitaAtrFazenda, identity, replaceDates, options.replaceAll === true);

  const data = rows.map((row, index) => {
    const item = sanitizeAtrFazendaRegistro(row, actorUid);
    return {
      id: `${identity.companyCode}_${item.safra}_${item.data}_${sanitizeDocIdPart(item.fazenda)}_${stableImportIdPart(row.raw || row)}_${index}`,
      companyId: identity.companyId,
      companyCode: identity.companyCode,
      harvestYear: item.safra,
      date: parseDbDate(item.data),
      farmCode: String(item.fazenda || '').match(/\d+/)?.[0] || null,
      farmName: item.nome || null,
      farmLabel: item.fazenda || item.fundoAgricola || '',
      supplier: item.fornecedor || '',
      property: item.propriedade || '',
      name: item.nome || '',
      atr: item.atr,
      importedBy: actorUid || 'system',
      importedAt: new Date(),
      rawData: safeJson(row.raw || row),
    };
  });

  await prisma.dashboardColheitaAtrFazenda.createMany({ data, skipDuplicates: true });
  return { processed: data.length, deleted: deleteResult.deleted };
}

export async function importAtrMensalChunk(companyId, rows = [], actorUid = null, options = {}) {
  const identity = await resolveDashboardCompanyIdentity(companyId);
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Nenhum registro informado.');

  const replaceDates = Array.isArray(options.replaceDates) ? options.replaceDates : [];
  const deleteResult = await deleteByCompanyDatesOrAllPrisma(prisma.dashboardColheitaAtrMensal, identity, replaceDates, options.replaceAll === true);

  const data = rows.map((row) => {
    const item = sanitizeAtrMensalRegistro(row, actorUid);
    return {
      id: `${identity.companyCode}_${item.safra}_${item.data}`,
      companyId: identity.companyId,
      companyCode: identity.companyCode,
      harvestYear: item.safra,
      date: parseDbDate(item.data),
      atr: item.atr,
      accumulated: item.acumulado,
      importedBy: actorUid || 'system',
      importedAt: new Date(),
      rawData: safeJson(row.raw || row),
    };
  });

  await prisma.dashboardColheitaAtrMensal.createMany({ data, skipDuplicates: true });
  return { processed: data.length, deleted: deleteResult.deleted };
}

export async function listColheitaFilterOptions(companyId) {
  const { records } = await readDashboardPostgresData(companyId);
  const safras = new Set();
  const frentes = new Set();
  const descricoes = new Set();

  records.forEach((item = {}) => {
    if (item.safra) safras.add(String(item.safra));
    if (item.frente !== undefined && item.frente !== null && item.frente !== '') frentes.add(String(item.frente));
    if (item.descricao) descricoes.add(String(item.descricao));
  });

  return {
    safras: Array.from(safras).sort(),
    frentes: Array.from(frentes).sort((a, b) => Number(a) - Number(b)),
    descricoes: Array.from(descricoes).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  };
}

export async function getDashboardPremissas(companyId) {
  const where = await getDashboardCompanyWhere(companyId);
  const row = await prisma.dashboardColheitaPremissa.findFirst({ where, orderBy: { updatedAt: 'desc' } });
  const base = row ? pgPremiseToLegacy(row) : { ...DEFAULT_PREMISSAS };
  return {
    ...base,
    metasMensais: normalizeMonthlyTargets(base.metasMensais, base.metaMes, base.atr, base.broca)
  };
}

export async function saveDashboardPremissas(companyId, payload = {}, actorUid = null) {
  const candidates = await getDashboardCompanyCandidates(companyId);
  const canonical = candidates[0] || normalizeCompanyId(companyId);
  const rawCompany = String(companyId || '').trim().toLowerCase();
  const sanitized = {
    anoSafra: String(payload.anoSafra ?? payload.safra ?? '').trim(),
    dataInicioSafra: normalizeDateKey(payload.dataInicioSafra),
    dataFimSafra: normalizeDateKey(payload.dataFimSafra),
    metaHora: toNumber(payload.metaHora),
    metaDia: toNumber(payload.metaDia),
    metaSemana: toNumber(payload.metaSemana),
    metaMes: toNumber(payload.metaMes),
    moagemPrevista: toNumber(payload.moagemPrevista),
    metaReprojetada: toNumber(payload.metaReprojetada),
    atr: toNumber(payload.atr),
    tch: toNumber(payload.tch),
    tah: toNumber(payload.tah),
    broca: toNumber(payload.broca),
    impurezaMineral: toNumber(payload.impurezaMineral),
    impurezaVegetal: toNumber(payload.impurezaVegetal),
    metaDensidade: toNumber(payload.metaDensidade),
    metasMensais: normalizeMonthlyTargets(payload.metasMensais, payload.metaMes, payload.atr, payload.broca),
    updatedBy: actorUid || 'system'
  };

  await prisma.dashboardColheitaPremissa.upsert({
    where: { id: rawCompany || canonical },
    update: {
      companyId: canonical,
      companyCode: rawCompany || canonical,
      projectedCrushing: sanitized.moagemPrevista,
      reprojectedGoal: sanitized.metaReprojetada,
      dayGoal: sanitized.metaDia,
      weekGoal: sanitized.metaSemana,
      monthGoal: sanitized.metaMes,
      hourGoal: sanitized.metaHora,
      atr: sanitized.atr,
      tah: sanitized.tah,
      tch: sanitized.tch,
      broca: sanitized.broca,
      vegetalImpurity: sanitized.impurezaVegetal,
      mineralImpurity: sanitized.impurezaMineral,
      monthlyGoals: sanitized.metasMensais,
      rawData: { companyId: rawCompany || canonical, ...sanitized },
    },
    create: {
      id: rawCompany || canonical,
      companyId: canonical,
      companyCode: rawCompany || canonical,
      projectedCrushing: sanitized.moagemPrevista,
      reprojectedGoal: sanitized.metaReprojetada,
      dayGoal: sanitized.metaDia,
      weekGoal: sanitized.metaSemana,
      monthGoal: sanitized.metaMes,
      hourGoal: sanitized.metaHora,
      atr: sanitized.atr,
      tah: sanitized.tah,
      tch: sanitized.tch,
      broca: sanitized.broca,
      vegetalImpurity: sanitized.impurezaVegetal,
      mineralImpurity: sanitized.impurezaMineral,
      monthlyGoals: sanitized.metasMensais,
      rawData: { companyId: rawCompany || canonical, ...sanitized },
    }
  });
  return sanitized;
}

export async function getDashboardOperacional(companyId) {
  const where = await getDashboardCompanyWhere(companyId);
  const row = await prisma.dashboardColheitaOperacional.findFirst({
    where,
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }]
  });
  return row ? pgOperationalToLegacy(row) : { ...DEFAULT_OPERACIONAL };
}

export async function saveDashboardOperacional(companyId, payload = {}, actorUid = null) {
  const candidates = await getDashboardCompanyCandidates(companyId);
  const canonical = candidates[0] || normalizeCompanyId(companyId);
  const rawCompany = String(companyId || '').trim().toLowerCase();
  const sanitized = {
    companyId: rawCompany || canonical,
    rotacaoMoenda: toNumber(payload.rotacaoMoenda),
    estoqueCarretas: toNumber(payload.estoqueCarretas ?? payload.estoque),
    updatedBy: actorUid || 'system'
  };

  await prisma.dashboardColheitaOperacional.upsert({
    where: { id: rawCompany || canonical },
    update: {
      companyId: canonical,
      companyCode: rawCompany || canonical,
      type: 'operacional',
      millRotation: sanitized.rotacaoMoenda,
      cartStock: sanitized.estoqueCarretas,
      rawData: { ...sanitized, tipo: 'operacional' },
    },
    create: {
      id: rawCompany || canonical,
      companyId: canonical,
      companyCode: rawCompany || canonical,
      type: 'operacional',
      millRotation: sanitized.rotacaoMoenda,
      cartStock: sanitized.estoqueCarretas,
      rawData: { ...sanitized, tipo: 'operacional' },
    }
  });
  return sanitized;
}

export async function getColheitaAtrDashboard(companyId, filters = {}) {
  if (!companyId) throw new Error('companyId é obrigatório.');

  const safraFiltro = filters.safra && filters.safra !== 'todas' ? String(filters.safra) : '';
  const filterDataInicio = normalizeDateKey(filters.dataInicio);
  const filterDataFim = normalizeDateKey(filters.dataFim);
  const { atrFarm, atrMonthly } = await readDashboardPostgresData(companyId);

  const filterAtrItem = (item = {}) => {
    const data = getRegistroDateKey(item);
    if (!data) return false;
    if (filterDataInicio && data < filterDataInicio) return false;
    if (filterDataFim && data > filterDataFim) return false;
    if (safraFiltro && String(item.safra || '') !== safraFiltro) return false;
    return true;
  };

  const atrFazendaRows = atrFarm
    .filter(filterAtrItem)
    .map((item) => ({
      fazenda: String(item.fazenda || item.fundoAgricola || item['Fundo Agrícola'] || 'Sem fazenda'),
      atr: parseNumber(item.atr),
      data: getRegistroDateKey(item),
      safra: String(item.safra || '')
    }))
    .filter((item) => item.fazenda && item.atr > 0);
  const latestAtrFazendaRows = filterAtrRowsByLatestDate(atrFazendaRows);
  const atrFazendaData = latestAtrFazendaRows.slice().sort(sortAtrFazendaByFundoAgricola);
  const atrMensalBaseRows = atrMonthly
    .filter((item) => {
      const data = getRegistroDateKey(item);
      if (!data) return false;
      if (safraFiltro && String(item.safra || '') !== safraFiltro) return false;
      return true;
    })
    .map((item) => ({
      data: getRegistroDateKey(item),
      safra: String(item.safra || ''),
      atr: parseNumber(item.atr ?? item.ATR ?? item.Atr),
      acumulado: parseNumber(item.acumulado ?? item.Acumulado),
      companyId: String(item.companyId || '')
    }))
    .filter((item) => item.data);

  const atrMensalRows = atrMensalBaseRows.filter((item) => {
    if (filterDataInicio && item.data < filterDataInicio) return false;
    if (filterDataFim && item.data > filterDataFim) return false;
    return true;
  });

  const atrMensalByMonth = new Map();
  atrMensalRows.forEach((item) => {
    const parsedDate = parseLocalDate(item.data);
    if (!parsedDate) return;
    const mes = monthLabel(parsedDate.getMonth());
    const current = atrMensalByMonth.get(mes);
    if (!current || item.data >= current.data) {
      atrMensalByMonth.set(mes, { mes, data: item.data, safra: item.safra, atr: item.atr, acumulado: item.acumulado });
    }
  });

  const atrMensalData = Array.from(atrMensalByMonth.values())
    .sort((a, b) => MONTH_LABELS.indexOf(a.mes) - MONTH_LABELS.indexOf(b.mes));

  const latestAtrMensal = atrMensalRows.slice().sort((a, b) => b.data.localeCompare(a.data))[0]
    || atrMensalBaseRows.slice().sort((a, b) => b.data.localeCompare(a.data))[0];
  const referenciaAtrDiaAnterior = normalizeDateKey(filters.dataFim)
    || normalizeDateKey(filters.dataInicio)
    || latestAtrMensal?.data
    || '';
  const atrDiaAnterior = findAtrDiaAnteriorFromMensalRows(atrMensalBaseRows, referenciaAtrDiaAnterior);

  return {
    atrFazendaData,
    atrDiaAnterior,
    atrMensalData,
    atrReal: latestAtrMensal ? latestAtrMensal.acumulado : 0
  };
}

export async function getColheitaSummary(companyId, filters = {}) {
  if (!companyId) throw new Error('companyId é obrigatório.');
  const premissas = await getDashboardPremissas(companyId);
  const operacional = await getDashboardOperacional(companyId);
  const dashboardData = await readDashboardPostgresData(companyId);
  const items = dashboardData.records.map((data, index) => ({ id: data?.id || String(index), ...data }));
  const impurezasItems = dashboardData.impurities;
  const brocaItems = []; // ainda não há tabela PostgreSQL de broca nesta etapa
  const atrFazendaItems = dashboardData.atrFarm;
  const impurezaTurnoItems = [
    ...dashboardData.impurityMineralShift.map((item) => ({ ...item, tipo: 'mineral' })),
    ...dashboardData.impurityVegetalShift.map((item) => ({ ...item, tipo: 'vegetal' })),
  ];
  const atrMensalItems = dashboardData.atrMonthly;

  const filteredSemPeriodo = items.filter((item) => {
    if (filters.safra && filters.safra !== 'todas' && getRegistroSafra(item) !== String(filters.safra)) return false;
    if (filters.frente && filters.frente !== 'todas' && getRegistroFrente(item) !== String(filters.frente)) return false;
    if (filters.descricao && filters.descricao !== 'todas' && getRegistroDescricao(item) !== String(filters.descricao)) return false;
    return true;
  });

  const filterDataInicio = normalizeDateKey(filters.dataInicio || premissas.dataInicioSafra);
  const filterDataFim = normalizeDateKey(filters.dataFim || premissas.dataFimSafra);

  const filtered = filteredSemPeriodo.filter((item) => {
    const data = getRegistroDateKey(item);
    if (!data) return false;
    if (filterDataInicio && data < filterDataInicio) return false;
    if (filterDataFim && data > filterDataFim) return false;
    return true;
  });
  const filterByDateRange = (item) => {
    const data = getRegistroDateKey(item);
    if (!data) return false;
    if (filterDataInicio && data < filterDataInicio) return false;
    if (filterDataFim && data > filterDataFim) return false;
    return true;
  };
  const currentSafra = String(new Date().getFullYear());
  const safraFiltro = filters.safra && filters.safra !== 'todas' ? String(filters.safra) : '';
  const impurezasFiltered = impurezasItems.filter((item) => (
    filterByDateRange(item) && (!safraFiltro || String(item.safra || '') === safraFiltro)
  ));
  const brocaFiltered = brocaItems.filter((item) => (
    filterByDateRange(item) && (!safraFiltro || String(item.safra || '') === safraFiltro)
  ));
  const atrFazendaFiltered = atrFazendaItems.filter((item) => (
    filterByDateRange(item) && (!safraFiltro || String(item.safra || '') === safraFiltro)
  ));
  const atrMensalBase = atrMensalItems.filter((item) => (
    getRegistroDateKey(item) && (!safraFiltro || String(item.safra || '') === safraFiltro)
  ));
  const atrMensalFiltered = atrMensalBase.filter((item) => filterByDateRange(item));
  const impurezaTurnoBase = impurezaTurnoItems.filter((item) => (!safraFiltro || String(item.safra || '') === safraFiltro));
  const selectedDateForDailyCharts = filterDataFim || filterDataInicio || impurezaTurnoBase
    .map((item) => getRegistroDateKey(item))
    .filter(Boolean)
    .sort()
    .pop() || '';
  const impurezaTurnoFiltered = impurezaTurnoBase.filter((item) => {
    const itemData = getRegistroDateKey(item);
    if (selectedDateForDailyCharts && itemData !== selectedDateForDailyCharts) return false;
    return true;
  });

  const totalRealizado = filtered.reduce((sum, item) => sum + getRegistroEntrega(item), 0);
  const totalMetaPeriodo = filtered.reduce((sum, item) => sum + parseNumber(item.metaPeriodo), 0);

  const allFronts = Array.from(new Set(filtered.map((item) => getRegistroFrente(item)).filter(Boolean)))
    .sort((a, b) => Number(a) - Number(b));

  const frontConfigs = allFronts.map((frente, index) => ({
    key: frontKey(frente),
    frente,
    label: `F - ${frente}`,
    fill: paletteForIndex(index)
  }));

  const now = new Date();
  const todayDate = formatDateISOInTimeZone(now, 'America/Sao_Paulo');
  const latestFilteredDate = filtered
    .map((item) => parseLocalDate(getRegistroDateKey(item)))
    .filter(Boolean)
    .sort((a, b) => b - a)[0];
  const latestFilteredDateISO = latestFilteredDate ? formatDateISO(latestFilteredDate) : '';
  // Sem filtro explícito de data, o dashboard semanal deve sempre refletir a semana atual.
  // Antes ele usava a última data encontrada nos registros, o que fazia a semana ficar "presa"
  // no passado quando ainda não existiam lançamentos para a semana nova.
  const referenceDate = parseLocalDate(filters.dataFim) || parseLocalDate(filters.dataInicio) || now;
  // Para o gráfico horário/card diário, usa a data filtrada quando existir; senão usa hoje em São Paulo.
  // Se ainda não houver lançamento hoje, cai para a última data importada para não deixar os cards zerados.
  const currentDate = normalizeDateKey(filters.dataFim) || normalizeDateKey(filters.dataInicio) || (filtered.some((item) => getRegistroDateKey(item) === todayDate) ? todayDate : latestFilteredDateISO || todayDate);

  const hourMap = new Map();
  for (let h = 0; h < 24; h += 1) {
    const hh = String(h).padStart(2, '0') + ':00';
    hourMap.set(hh, { hora: hh, realizado: 0, meta: premissas.metaHora || 0 });
  }
  const registrosHoje = filtered.filter((item) => getRegistroDateKey(item) === currentDate);
  registrosHoje.forEach((item) => {
    const key = `${String(item.hora || '').slice(0, 2).padStart(2, '0')}:00`;
    const entry = hourMap.get(key) || { hora: key, realizado: 0, meta: premissas.metaHora || 0 };
    entry.realizado += getRegistroEntrega(item);
    hourMap.set(key, entry);
  });
  const hourlyData = Array.from(hourMap.values());
  const totalRealizadoHoje = registrosHoje.reduce((sum, item) => sum + getRegistroEntrega(item), 0);
  const realizadoUltimaHora = [...hourMap.values()].reverse().find((item) => parseNumber(item.realizado) > 0)?.realizado || 0;
  const registrosBaseCards = filteredSemPeriodo;
  // O card "Moagem Dia Anterior" usa o dia anterior no fuso do Brasil.
  // Sem filtro, calcula ontem em America/Sao_Paulo; com filtro, calcula o dia anterior da data filtrada.
  const selectedDateForPreviousDay = filterDataFim || filterDataInicio || todayDate;
  const yesterdayDate = selectedDateForPreviousDay ? previousDateISO(selectedDateForPreviousDay) : '';
  const moagemDiaAnterior = yesterdayDate
    ? registrosBaseCards
      .filter((item) => getRegistroDateKey(item) === yesterdayDate)
      .reduce((sum, item) => sum + getRegistroEntrega(item), 0)
    : 0;

  const densidadeMediaUltimasCargas = calculateDensidadeMediaUltimasCargas(registrosBaseCards);

  const rotacaoMoendaAtual = toNumber(operacional.rotacaoMoenda);
  const estoqueCarretasAtual = toNumber(operacional.estoqueCarretas);

  const monthOrder = [...MONTH_LABELS];
  const metasMensais = normalizeMonthlyTargets(premissas.metasMensais, premissas.metaMes, premissas.atr, premissas.broca);
  const monthlyMap = new Map();
  filtered.forEach((item) => {
    const itemDate = parseLocalDate(getRegistroDateKey(item));
    if (!itemDate) return;
    const monthIndex = itemDate.getMonth();
    const key = monthLabel(monthIndex);
    const monthKey = monthKeyFromIndex(monthIndex);
    const monthTarget = monthKey ? metasMensais[monthKey] : null;
    const entry = monthlyMap.get(key) || {
      mes: key,
      entrada: 0,
      meta: monthTarget?.metaMes || 0,
      atr: 0,
      atrMeta: monthTarget?.atr || 0,
      broca: 0,
      brocaMeta: monthTarget?.broca || 0,
      vegetal: 0,
      mineral: 0
    };
    entry.entrada += getRegistroEntrega(item);
    if (!entry.meta) {
      entry.meta = parseNumber(item.metaPeriodo);
    }
    monthlyMap.set(key, entry);
  });
  monthOrder.forEach((label, index) => {
    if (monthlyMap.has(label)) return;
    const monthKey = monthKeyFromIndex(index);
    const monthTarget = monthKey ? metasMensais[monthKey] : null;
    monthlyMap.set(label, {
      mes: label,
      entrada: 0,
      meta: monthTarget?.metaMes || 0,
      atr: 0,
      atrMeta: monthTarget?.atr || 0,
      broca: 0,
      brocaMeta: monthTarget?.broca || 0,
      vegetal: 0,
      mineral: 0
    });
  });
  const impurezaMonthlyMap = new Map();
  impurezasFiltered.forEach((item) => {
    const itemDate = parseLocalDate(getRegistroDateKey(item));
    if (!itemDate) return;
    const key = monthLabel(itemDate.getMonth());
    const current = impurezaMonthlyMap.get(key) || { vegetalSum: 0, mineralSum: 0, count: 0 };
    current.vegetalSum += parseNumber(item.impurezaVegetal);
    current.mineralSum += parseNumber(item.impurezaMineral);
    current.count += 1;
    impurezaMonthlyMap.set(key, current);
  });
  const brocaMonthlyMap = new Map();
  brocaFiltered.forEach((item) => {
    const itemDate = parseLocalDate(getRegistroDateKey(item));
    if (!itemDate) return;
    const key = monthLabel(itemDate.getMonth());
    const current = brocaMonthlyMap.get(key) || { entreBrSum: 0, entreExaSum: 0 };
    current.entreBrSum += parseNumber(item.entreBr);
    current.entreExaSum += parseNumber(item.entreExa);
    brocaMonthlyMap.set(key, current);
  });
  monthOrder.forEach((label) => {
    const monthlyEntry = monthlyMap.get(label);
    if (!monthlyEntry) return;
    const impurezaAgg = impurezaMonthlyMap.get(label);
    if (impurezaAgg?.count) {
      monthlyEntry.vegetal = impurezaAgg.vegetalSum / impurezaAgg.count;
      monthlyEntry.mineral = impurezaAgg.mineralSum / impurezaAgg.count;
    }
    const brocaAgg = brocaMonthlyMap.get(label);
    if (brocaAgg) {
      monthlyEntry.broca = brocaAgg.entreExaSum > 0
        ? (brocaAgg.entreBrSum / brocaAgg.entreExaSum) * 100
        : 0;
    }
  });
  const monthlyData = Array.from(monthlyMap.values()).sort((a, b) => monthOrder.indexOf(a.mes) - monthOrder.indexOf(b.mes));
  const atrMensalByMonth = new Map();
  atrMensalFiltered.forEach((item) => {
    const itemDate = parseLocalDate(getRegistroDateKey(item));
    if (!itemDate) return;
    const key = monthLabel(itemDate.getMonth());
    const current = atrMensalByMonth.get(key) || { lastData: '', atr: 0, acumulado: 0 };
    const dataKey = getRegistroDateKey(item);
    if (!current.lastData || dataKey >= current.lastData) {
      current.lastData = dataKey;
      current.atr = parseNumber(item.atr);
      current.acumulado = parseNumber(item.acumulado);
    }
    atrMensalByMonth.set(key, current);
  });
  monthlyData.forEach((entry) => {
    const atrEntry = atrMensalByMonth.get(entry.mes);
    if (atrEntry) {
      // ATR Mensal deve exibir o ACUMULADO do mês. A coluna ATR continua
      // preservada no registro importado, mas o gráfico/card mensal usam
      // preferencialmente a coluna Acumulado da planilha.
      entry.atrDia = atrEntry.atr;
      entry.acumulado = atrEntry.acumulado;
      entry.atr = atrEntry.acumulado || atrEntry.atr;
    }
  });
  const latestAtrMensal = atrMensalFiltered
    .slice()
    .sort((a, b) => getRegistroDateKey(b).localeCompare(getRegistroDateKey(a)))[0];
  const atrRealFromMensal = latestAtrMensal ? parseNumber(latestAtrMensal.acumulado) : 0;
  const atrFazendaRows = atrFazendaFiltered
    .map((item) => ({ fazenda: String(item.fazenda || item.fundoAgricola || 'Sem fazenda'), atr: parseNumber(item.atr), data: getRegistroDateKey(item), safra: item.safra }))
    .filter((item) => item.fazenda && item.atr > 0);
  const latestAtrFazendaRows = filterAtrRowsByLatestDate(atrFazendaRows);
  const atrFazendaData = latestAtrFazendaRows.slice().sort(sortAtrFazendaByFundoAgricola);
  const referenciaAtrDiaAnterior = normalizeDateKey(filters.dataFim)
    || normalizeDateKey(filters.dataInicio)
    || (latestAtrMensal ? getRegistroDateKey(latestAtrMensal) : '');
  const atrDiaAnterior = findAtrDiaAnteriorFromMensalRows(atrMensalBase, referenciaAtrDiaAnterior);

  const currentMonthLabel = monthLabel(now.getMonth());
  const currentMonthEntry = monthlyData.find((item) => item.mes === currentMonthLabel) || null;
  const selectedMonthIndex = referenceDate.getMonth();
  const selectedMonthKey = monthKeyFromIndex(selectedMonthIndex);
  const selectedMonthTargets = selectedMonthKey ? metasMensais[selectedMonthKey] : { metaMes: 0, atr: 0, broca: 0 };
  const totalMetaMensalPeriodo = monthlyData.reduce((sum, item) => sum + toNumber(item.meta), 0);

  const weekStart = startOfWeekMonday(referenceDate);
  const weekEnd = endOfWeekSunday(referenceDate);
  const orderedWeekdays = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
  const weeklyFrontData = [];
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    const row = { dia: orderedWeekdays[i], data: day.toISOString().slice(0, 10) };
    frontConfigs.forEach((front) => {
      row[front.key] = 0;
    });
    weeklyFrontData.push(row);
  }
  filtered.forEach((item) => {
    const itemDate = parseLocalDate(getRegistroDateKey(item));
    if (!itemDate || itemDate < weekStart || itemDate > weekEnd) return;
    const diffDays = Math.floor((itemDate - weekStart) / 86400000);
    const row = weeklyFrontData[diffDays];
    if (!row) return;
    const key = frontKey(getRegistroFrente(item));
    row[key] = (row[key] || 0) + getRegistroEntrega(item);
  });
  const weeklyTotal = weeklyFrontData.reduce((sum, row) => sum + frontConfigs.reduce((acc, front) => acc + parseNumber(row[front.key]), 0), 0);

  const frontTotals = frontConfigs.map((front) => ({
    ...front,
    total: filtered.filter((item) => getRegistroFrente(item) === String(front.frente)).reduce((sum, item) => sum + getRegistroEntrega(item), 0)
  }));
  const frontVolumeData = frontTotals.map((front) => ({
    frente: front.label,
    total: front.total,
    fill: front.fill,
    key: front.key
  }));

  // Densidade por Frente: sempre considera somente as frentes com entrega
  // na data de referência diária. Sem filtro manual, a referência é HOJE
  // no fuso America/Sao_Paulo; com filtro manual, respeita a data filtrada.
  const densidadeDataReferencia = normalizeDateKey(filters.dataFim) || normalizeDateKey(filters.dataInicio) || todayDate;
  const registrosDensidadeDia = filteredSemPeriodo.filter((item) => {
    if (getRegistroDateKey(item) !== densidadeDataReferencia) return false;
    if (filterDataInicio && densidadeDataReferencia < filterDataInicio) return false;
    if (filterDataFim && densidadeDataReferencia > filterDataFim) return false;
    return true;
  });
  const frentesDensidadeDia = Array.from(new Set(registrosDensidadeDia.map((item) => getRegistroFrente(item)).filter(Boolean)))
    .sort((a, b) => Number(String(a).match(/\d+/)?.[0] || 9999) - Number(String(b).match(/\d+/)?.[0] || 9999));
  const densidadeFrenteData = frentesDensidadeDia
    .map((frente, index) => {
      const ultimasEntregas = registrosDensidadeDia
        .filter((item) => getRegistroFrente(item) === String(frente))
        .map((item) => ({
          entrega: getRegistroEntrega(item),
          sortKey: `${getRegistroDateKey(item) || '0000-00-00'}T${normalizeHour(item.hora ?? item.Hora ?? item.hour ?? '00:00') || '00:00'}`
        }))
        .filter((row) => Number.isFinite(row.entrega) && row.entrega > 0)
        .sort((a, b) => String(b.sortKey).localeCompare(String(a.sortKey)))
        .slice(0, 4);
      const totalEntrega = ultimasEntregas.reduce((sum, row) => sum + row.entrega, 0);
      return {
        frente: `F - ${frente}`,
        frenteOriginal: String(frente),
        densidade: ultimasEntregas.length ? totalEntrega / ultimasEntregas.length : 0,
        quantidade: ultimasEntregas.length,
        fill: paletteForIndex(index),
        key: frontKey(frente),
        data: densidadeDataReferencia
      };
    })
    .filter((item) => item.quantidade > 0);

  const buildImpurezaTurnoData = (tipo) => impurezaTurnoFiltered
    .filter((item) => (item.tipo === tipo))
    .map((item) => ({
      frente: item.frenteLabel || ('F - ' + String(item.frente || '').replace(/^F\s*-?\s*/i, '')),
      frenteOriginal: String(item.frente || '').replace(/^F\s*-?\s*/i, ''),
      turnoA: parseNumber(item.turnoA),
      turnoB: parseNumber(item.turnoB),
      turnoC: parseNumber(item.turnoC),
      data: item.data,
      safra: item.safra
    }))
    .sort((a, b) => Number(String(a.frenteOriginal).match(/\d+/)?.[0] || 9999) - Number(String(b.frenteOriginal).match(/\d+/)?.[0] || 9999));
  const impurezaMineralTurnoData = buildImpurezaTurnoData('mineral');
  const impurezaVegetalTurnoData = buildImpurezaTurnoData('vegetal');

  return {
    densidadeMedia: densidadeMediaUltimasCargas,
    moagemDiaAnterior,
    densidadeMediaUltimasCargas,
    realizadoDiaAnterior: moagemDiaAnterior,
    cards: {
      moagemPrevista: premissas.moagemPrevista || selectedMonthTargets.metaMes || totalMetaMensalPeriodo || totalMetaPeriodo,
      moagemRealizada: totalRealizado,
      saldoMoagem: (premissas.moagemPrevista || selectedMonthTargets.metaMes || totalMetaMensalPeriodo || totalMetaPeriodo) - totalRealizado,
      atrReal: atrRealFromMensal || selectedMonthTargets.atr || premissas.atr || 0,
      atrDiaAnterior,
      brocaReal: parseNumber(currentMonthEntry?.broca, selectedMonthTargets.broca || premissas.broca || 0),
      metaDia: premissas.metaDia || 0,
      metaHora: premissas.metaHora || 0,
      realizadoDia: totalRealizadoHoje,
      realizadoUltimaHora,
      moagemDiaAnterior,
      realizadoDiaAnterior: moagemDiaAnterior,
      densidadeMedia: densidadeMediaUltimasCargas,
      densidadeMediaUltimasCargas,
      saldoDia: (premissas.metaDia || 0) - totalRealizadoHoje,
      metaAcumulada: totalMetaMensalPeriodo || totalMetaPeriodo,
      saldoMensal: (totalMetaMensalPeriodo || totalMetaPeriodo) - totalRealizado,
      metaSemana: premissas.metaSemana || (premissas.metaDia ? premissas.metaDia * 7 : 0),
      realizadoSemana: weeklyTotal,
      saldoSemana: (premissas.metaSemana || (premissas.metaDia ? premissas.metaDia * 7 : 0)) - weeklyTotal,
      metaReprojetada: premissas.metaReprojetada || 0,
      metaReprojetadaSemana: premissas.metaReprojetada || 0,
      atrMetaMesAtual: selectedMonthTargets.atr || premissas.atr || 0,
      brocaMetaMesAtual: selectedMonthTargets.broca || premissas.broca || 0,
      metaMesAtual: selectedMonthTargets.metaMes || premissas.metaMes || 0,
      rotacaoMoenda: rotacaoMoendaAtual,
      estoqueCarretas: estoqueCarretasAtual
    },
    premissas: {
      ...premissas,
      metasMensais
    },
    hourlyData,
    monthlyData,
    atrFazendaData,
    weeklyFrontData,
    frontMonthlyData: frontVolumeData,
    frontVolumeData,
    densidadeFrenteData,
    impurezaMineralTurnoData,
    impurezaVegetalTurnoData,
    frontTotals,
    frontConfigs,
    weekRange: {
      start: weekStart.toISOString().slice(0, 10),
      end: weekEnd.toISOString().slice(0, 10),
      label: `Semana de ${formatDateBR(weekStart)} a ${formatDateBR(weekEnd)}`
    },
    currentMonthLabel,
    totalRegistros: filtered.length
  };
}


function getOcSafraFromDate(dateKey = '') { const year = Number(String(dateKey).slice(0, 4)); return year ? String(year) : ''; }
function sanitizeFechamentoOcRegistro(row = {}, actorUid = null) {
  const abertura = normalizeDateKey(row.abertura || row.Abertura || row['Abertura']);
  const encerramento = normalizeDateKey(row.encerramento || row.Encerramento || row['Encerramento']);
  return {
    fazenda: String(row.fazenda ?? row.Fazenda ?? '').trim(), vazio: String(row.vazio ?? row.Vazio ?? '').trim(), quadra: String(row.quadra ?? row.Quadra ?? '').trim(), vazio1: String(row.vazio1 ?? row['Vazio 1'] ?? '').trim(), parte: String(row.parte ?? row.Parte ?? '').trim(), estagio: String(row.estagio ?? row.estágio ?? row['Estágio'] ?? '').trim(), variedade: String(row.variedade ?? row.Variedade ?? '').trim(),
    espac: parseNumber(row.espac ?? row['Espac.']), plantio: normalizeDateKey(row.plantio ?? row.Plantio), dm: parseNumber(row.dm ?? row.DM), liberada: parseNumber(row.liberada ?? row.Liberada), cortada: parseNumber(row.cortada ?? row.Cortada ?? row['AREA CORTADA'] ?? row['Area Cortada'] ?? row['Área Cortada']), tHaPrev: parseNumber(row.tHaPrev ?? row['T/Ha Prev.']), prodPrev: parseNumber(row.prodPrev ?? row['Prod. Prev.'] ?? row['PROD. PREV.'] ?? row['Prod Prev'] ?? row['PROD PREV']), tHaReal: parseNumber(row.tHaReal ?? row['T/Ha Real.']), prodReal: parseNumber(row.prodReal ?? row['Prod. Real'] ?? row['PROD. REAL'] ?? row['Prod Real'] ?? row['PROD REAL']), varPercent: parseNumber(row.varPercent ?? row['Var. %']), atr: parseNumber(row.atr ?? row.Atr ?? row.ATR), atrHaReal: parseNumber(row.atrHaReal ?? row['Atr/Ha Real.']), abertura, encerramento, idade: parseNumber(row.idade ?? row.Idade), tempo: parseNumber(row.tempo ?? row.Tempo), cortes: parseNumber(row.cortes ?? row.Cortes), safra: String(row.safra ?? row.Safra ?? getOcSafraFromDate(encerramento || abertura)).trim(), raw: row, updatedBy: actorUid || null, updatedAt: new Date()
  };
}
export async function importFechamentoOcChunk(companyId, rows = [], actorUid = null, options = {}) {
  const identity = await resolveDashboardCompanyIdentity(companyId);
  if (!Array.isArray(rows) || !rows.length) return { imported: 0, deleted: 0 };

  const replaceKeys = Array.isArray(options.replaceDates)
    ? options.replaceDates.map(normalizeDateKey).filter(Boolean)
    : [];

  let deleteResult = { deleted: 0 };
  if (options.replaceAll === true) {
    deleteResult = await prisma.closureDashboardRecord.deleteMany({
      where: { companyId: { in: [identity.companyId, identity.companyCode, normalizeCompanyId(companyId)].filter(Boolean) } },
    });
  } else {
    deleteResult = await deleteClosureDashboardByCompanyClosingDates(identity, replaceKeys);
  }

  const now = new Date();
  const data = [];
  rows.forEach((row, index) => {
    const item = sanitizeFechamentoOcRegistro(row, actorUid);
    if (!item.fazenda || !item.quadra) return;

    data.push({
      id: `${identity.companyCode}_${sanitizeDocIdPart(item.safra)}_${sanitizeDocIdPart(item.fazenda)}_${sanitizeDocIdPart(item.quadra)}_${sanitizeDocIdPart(item.parte)}_${sanitizeDocIdPart(item.encerramento || item.abertura)}_${stableImportIdPart(row.raw || row)}_${index}`,
      companyId: identity.companyId,
      harvestYear: item.safra || null,
      farmCode: String(item.fazenda || '').trim() || null,
      fieldCode: String(item.quadra || '').trim() || null,
      part: String(item.parte || '').trim() || null,
      varietyName: String(item.variedade || '').trim() || null,
      stage: String(item.estagio || '').trim() || null,
      openingDate: parseDbDate(item.abertura),
      closingDate: parseDbDate(item.encerramento),
      plantingDate: parseDbDate(item.plantio),
      releasedArea: item.liberada,
      cutArea: item.cortada,
      prevTon: item.prodPrev,
      realTon: item.prodReal,
      prevTch: item.cortada > 0 ? item.prodPrev / item.cortada : 0,
      realTch: item.cortada > 0 ? item.prodReal / item.cortada : 0,
      atr: item.atr,
      atrHaReal: item.atrHaReal,
      age: item.idade,
      cuts: item.cortes,
      spacing: item.espac,
      dm: Number.isFinite(Number(item.dm)) ? Math.trunc(Number(item.dm)) : null,
      timeDays: item.tempo,
      variationPercent: item.varPercent,
      rawData: safeJson(row.raw || row),
      createdAt: now,
      updatedAt: now,
    });
  });

  for (let i = 0; i < data.length; i += 1000) {
    await prisma.closureDashboardRecord.createMany({ data: data.slice(i, i + 1000), skipDuplicates: true });
  }

  return { imported: data.length, processed: data.length, deleted: deleteResult.deleted };
}

function avgOc(items, field) { const vals = items.map((x) => parseNumber(x[field])).filter((v) => Number.isFinite(v)); return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0; }
function sumOc(items, field) { return items.reduce((acc, x) => acc + parseNumber(x[field]), 0); }
function pctOc(part, total) { return total ? (part / total) * 100 : 0; }
function gapPctOc(realizado, previsto) { return previsto ? ((realizado / previsto) * 100) - 100 : 0; }

function cortePlanejamentoKey(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const match = text.match(/\d+/);
  if (!match) return '';
  const n = Number(match[0]);
  return Number.isFinite(n) && n > 0 ? String(n) : '';
}

function pickJsonValue(source = {}, aliases = []) {
  const raw = source && typeof source === 'object' ? source : {};
  const normalized = new Map();
  Object.entries(raw).forEach(([key, value]) => {
    normalized.set(String(key).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ''), value);
  });
  for (const alias of aliases) {
    const direct = raw?.[alias];
    if (direct !== undefined && direct !== null && String(direct).trim() !== '') return direct;
    const key = String(alias).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    const value = normalized.get(key);
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return undefined;
}

const PLANEJAMENTO_AREA_ALIASES = [
  // Modelo real do SHP/camada Ordem de Corte do mapa: AREA = área planejada.
  // Manter AREA/area como prioridade antes de campos genéricos.
  'AREA', 'area', 'Area',
  'areaPlanejada', 'AREA_PLANEJADA', 'area_plan', 'AREA PLAN.', 'AREA PLAN', 'areaPlan',
  'areaHa', 'AREA_HA', 'AREA HA', 'ha', 'HA',
  'areaTotal', 'AREA_TOTAL', 'areaTalhao', 'AREA_TALHAO', 'areaOC', 'AREA_OC',
  'areaCorte', 'AREA_CORTE', 'areaProgramada', 'AREA_PROGRAMADA'
];

const PLANEJAMENTO_CORTE_ALIASES = [
  // Modelo real do SHP/camada Ordem de Corte do mapa: ECORTE = estágio/corte.
  // Manter ECORTE como prioridade absoluta.
  'ECORTE', 'ecorte', 'E_CORTE', 'eCorte', 'E Corte',
  'estagio', 'ESTAGIO', 'Estágio', 'ESTÁGIO', 'estagioCorte', 'ESTAGIO_CORTE', 'ESTÁGIO_CORTE',
  'corte', 'CORTE', 'Corte', 'CORTES', 'cortes', 'cut', 'CUT', 'cutNumber', 'CUT_NUMBER',
  'numeroCorte', 'NUMERO_CORTE', 'numCorte', 'NUM_CORTE', 'ordemCorte', 'ORDEM_CORTE',
  'idadeCorte', 'IDADE_CORTE', 'estagioAtual', 'ESTAGIO_ATUAL', 'corteAtual', 'CORTE_ATUAL'
];


const PLANEJAMENTO_VARIEDADE_ALIASES = [
  // Modelo real do SHP/camada Ordem de Corte: VARIEDADE = variedade planejada do talhão.
  'VARIEDADE', 'variedade', 'Variedade', 'VARIED', 'varied', 'var', 'VAR',
  'CULTIVAR', 'cultivar', 'nomeVariedade', 'NOME_VARIEDADE', 'descVariedade', 'DESC_VARIEDADE'
];

function pickPlanejamentoArea(rel = {}, order = {}) {
  const rawRel = rel.rawData && typeof rel.rawData === 'object' ? rel.rawData : {};
  const rawField = rel.field?.rawData && typeof rel.field.rawData === 'object' ? rel.field.rawData : {};
  const rawOrder = order.rawData && typeof order.rawData === 'object' ? order.rawData : {};

  // Ordem correta para planejamento do quadro:
  // 1) rawData do vínculo/talhão da Ordem de Corte, vindo do SHP/importação (AREA)
  // 2) rawData do cadastro do talhão, quando o vínculo não trouxe AREA
  // 3) coluna normalizada rel.area, só como fallback
  // 4) rawData da ordem principal, último fallback
  return parseNumber(
    pickJsonValue(rawRel, PLANEJAMENTO_AREA_ALIASES) ??
    pickJsonValue(rawField, PLANEJAMENTO_AREA_ALIASES) ??
    rel.area ??
    rel.field?.area ??
    pickJsonValue(rawOrder, PLANEJAMENTO_AREA_ALIASES)
  );
}

function pickPlanejamentoCorte(rel = {}, order = {}) {
  const rawRel = rel.rawData && typeof rel.rawData === 'object' ? rel.rawData : {};
  const rawField = rel.field?.rawData && typeof rel.field.rawData === 'object' ? rel.field.rawData : {};
  const rawOrder = order.rawData && typeof order.rawData === 'object' ? order.rawData : {};

  // Ordem correta para planejamento do quadro:
  // ECORTE do SHP/importação é a fonte principal do estágio/corte.
  return cortePlanejamentoKey(
    pickJsonValue(rawRel, PLANEJAMENTO_CORTE_ALIASES) ??
    pickJsonValue(rawField, PLANEJAMENTO_CORTE_ALIASES) ??
    rel.field?.stage ??
    pickJsonValue(rawOrder, PLANEJAMENTO_CORTE_ALIASES)
  );
}


function pickPlanejamentoVariedade(rel = {}, order = {}) {
  const rawRel = rel.rawData && typeof rel.rawData === 'object' ? rel.rawData : {};
  const rawField = rel.field?.rawData && typeof rel.field.rawData === 'object' ? rel.field.rawData : {};
  const rawOrder = order.rawData && typeof order.rawData === 'object' ? order.rawData : {};
  const value = pickJsonValue(rawRel, PLANEJAMENTO_VARIEDADE_ALIASES)
    ?? pickJsonValue(rawField, PLANEJAMENTO_VARIEDADE_ALIASES)
    ?? rel.field?.varietyName
    ?? rel.field?.variety?.name
    ?? pickJsonValue(rawOrder, PLANEJAMENTO_VARIEDADE_ALIASES);
  return String(value ?? '').trim().toUpperCase();
}

function isCutOrderPlanejamentoAtivo(order = {}) {
  const status = String(order.status ?? order.rawData?.status ?? order.rawData?.Status ?? order.rawData?.situacao ?? order.rawData?.Situacao ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!status) return true;
  return !/(cancel|exclu|inativ|rascunho|delet|delete)/.test(status);
}

async function getAreaPlanejadaOrdemCortePorCorte(companyId, filters = {}) {
  const canonicalCompanyId = normalizeCompanyId(companyId);
  const cacheKey = `${canonicalCompanyId}|${String(filters.safra || 'todas').trim() || 'todas'}`;
  const cached = FECHAMENTO_OC_PLANEJAMENTO_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < FECHAMENTO_OC_PLANEJAMENTO_CACHE_MS) return cached.data;
  const identity = await resolveDashboardCompanyIdentity(canonicalCompanyId);
  const companyIds = Array.from(new Set([
    identity.companyId,
    identity.companyCode,
    canonicalCompanyId,
    ...(await getDashboardCompanyCandidates(canonicalCompanyId)),
  ].filter(Boolean).map((v) => String(v).trim())));
  const safraFiltro = String(filters.safra || '').trim();

  const porCorte = {};
  const porVariedade = {};
  const usadosPorTalhao = new Map();
  let totalAreaPlanejada = 0;
  let linhasUsadas = 0;

  const normalizeSafraLoose = (value) => String(value ?? '').trim().replace(/[^0-9/.-]/g, '');
  const shouldUseOrderForSafra = (order = {}) => {
    if (!safraFiltro || safraFiltro === 'todas') return true;
    const raw = order.rawData && typeof order.rawData === 'object' ? order.rawData : {};
    const orderSafra = normalizeSafraLoose(pickJsonValue(raw, ['safra', 'Safra', 'SAFRA', 'anoSafra', 'Ano Safra', 'harvestYear', 'HARVEST_YEAR']) || '');
    if (!orderSafra) return true;
    return orderSafra === normalizeSafraLoose(safraFiltro);
  };

  const normalizeTalhaoKey = (value) => String(value ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '');

  const talhaoPlanejamentoKey = (rel = {}, order = {}, corte = '') => {
    const rawRel = rel.rawData && typeof rel.rawData === 'object' ? rel.rawData : {};
    const rawOrder = order.rawData && typeof order.rawData === 'object' ? order.rawData : {};
    const field = rel.field || {};
    const farm = field.farm || order.farm || {};
    const faz = pickJsonValue(rawRel, ['COD_FAZ', 'codFaz', 'COD FAZ', 'fazendaId', 'id_fazenda', 'fundoAgricola', 'fundo_agricola', 'FUNDO_AGR'])
      ?? pickJsonValue(rawOrder, ['COD_FAZ', 'codFaz', 'COD FAZ', 'fazendaId', 'id_fazenda', 'fundoAgricola', 'fundo_agricola', 'FUNDO_AGR'])
      ?? farm.code
      ?? farm.id
      ?? '';
    const tal = pickJsonValue(rawRel, ['TALHAO', 'Talhao', 'Talhão', 'talhao', 'talhaoId', 'talhaoNome', 'fieldCode', 'CD_TALHAO'])
      ?? field.code
      ?? field.name
      ?? rel.fieldId
      ?? rel.id
      ?? '';
    // A chave precisa deduplicar o mesmo talhão entre sincronizações, mas não pode matar cortes diferentes.
    return [normalizeTalhaoKey(faz), normalizeTalhaoKey(tal), cortePlanejamentoKey(corte)].join('|');
  };

  const addPlanejamento = (corte, area, key, updatedAt = 0, variedade = '') => {
    const corteKey = cortePlanejamentoKey(corte);
    const areaNumber = parseNumber(area);
    const variedadeKey = String(variedade || '').trim().toUpperCase();
    if (!corteKey || !(areaNumber > 0)) return;
    const safeKey = key || `sem-chave|${corteKey}|${variedadeKey}|${linhasUsadas}`;
    const previous = usadosPorTalhao.get(safeKey);
    if (previous) {
      if (updatedAt && previous.updatedAt && updatedAt <= previous.updatedAt) return;
      porCorte[previous.corteKey] = Math.max(0, (porCorte[previous.corteKey] || 0) - previous.area);
      if (previous.variedadeKey) porVariedade[previous.variedadeKey] = Math.max(0, (porVariedade[previous.variedadeKey] || 0) - previous.area);
      totalAreaPlanejada = Math.max(0, totalAreaPlanejada - previous.area);
    } else {
      linhasUsadas += 1;
    }
    usadosPorTalhao.set(safeKey, { corteKey, variedadeKey, area: areaNumber, updatedAt });
    porCorte[corteKey] = (porCorte[corteKey] || 0) + areaNumber;
    if (variedadeKey) porVariedade[variedadeKey] = (porVariedade[variedadeKey] || 0) + areaNumber;
    totalAreaPlanejada += areaNumber;
  };

  const processRel = (rel = {}, order = {}) => {
    if (!order || !isCutOrderPlanejamentoAtivo(order)) return;
    if (!shouldUseOrderForSafra(order)) return;

    // Fonte principal do mapa/camada Ordem de Corte: ECORTE + AREA.
    const corte = pickPlanejamentoCorte(rel, order);
    const area = pickPlanejamentoArea(rel, order);
    const variedade = pickPlanejamentoVariedade(rel, order);
    if (!corte || !(area > 0)) return;

    const updatedAt = new Date(rel.updatedAt || rel.rawData?.updatedAt || order.updatedAt || order.rawData?.updatedAt || 0).getTime() || 0;
    addPlanejamento(corte, area, talhaoPlanejamentoKey(rel, order, corte), updatedAt, variedade);
  };

  // 1) Caminho normal: vínculos da ordem de corte já persistidos no PostgreSQL.
  const rels = await prisma.cutOrderField.findMany({
    where: { cutOrder: { companyId: { in: companyIds } } },
    select: {
      id: true,
      cutOrderId: true,
      fieldId: true,
      area: true,
      rawData: true,
      updatedAt: true,
      cutOrder: {
        select: {
          id: true,
          companyId: true,
          status: true,
          number: true,
          openingDate: true,
          closingDate: true,
          rawData: true,
          updatedAt: true,
          farm: { select: { id: true, code: true, name: true, rawData: true } },
        },
      },
      field: {
        select: {
          id: true,
          code: true,
          name: true,
          area: true,
          stage: true,
          rawData: true,
          farm: { select: { id: true, code: true, name: true, rawData: true } },
        },
      },
    },
  });

  rels.forEach((rel) => processRel(rel, rel.cutOrder || {}));

  // 2) Fallback: algumas versões antigas guardavam os talhões apenas dentro do rawData da OC.
  // Isso cobre arrays como talhoes, talhaoIds/talhoesNomes ou features vindas da camada do mapa.
  const orders = await prisma.cutOrder.findMany({
    where: { companyId: { in: companyIds } },
    select: {
      id: true,
      companyId: true,
      status: true,
      number: true,
      openingDate: true,
      closingDate: true,
      rawData: true,
      updatedAt: true,
      farm: { select: { id: true, code: true, name: true, rawData: true } },
    },
  });

  const extractRawTalhoes = (raw = {}) => {
    const arrays = [raw.talhoes, raw.talhões, raw.fields, raw.itens, raw.items, raw.features, raw.talhoesSelecionados].filter(Array.isArray);
    if (arrays.length) return arrays.flat();
    const ids = Array.isArray(raw.talhaoIds) ? raw.talhaoIds : [];
    const nomes = Array.isArray(raw.talhoesNomes) ? raw.talhoesNomes : [];
    return ids.map((id, index) => ({ talhaoId: id, talhaoNome: nomes[index] || id }));
  };

  orders.forEach((order) => {
    if (!isCutOrderPlanejamentoAtivo(order)) return;
    if (!shouldUseOrderForSafra(order)) return;
    const rawOrder = order.rawData && typeof order.rawData === 'object' ? order.rawData : {};
    extractRawTalhoes(rawOrder).forEach((item, index) => {
      const props = item?.properties && typeof item.properties === 'object' ? item.properties : item;
      if (!props || typeof props !== 'object') return;
      const rel = {
        id: props.id || props.talhaoId || `${order.id}-raw-${index}`,
        rawData: props,
        area: pickJsonValue(props, PLANEJAMENTO_AREA_ALIASES),
        field: { code: props.talhaoId || props.TALHAO || props.talhao || props.CD_TALHAO, name: props.talhaoNome || props.TALHAO || props.talhao, stage: props.ECORTE || props.estagio, rawData: props, farm: order.farm },
        updatedAt: order.updatedAt,
      };
      processRel(rel, order);
    });
  });

  // 3) Fonte direta do SHP/camada do mapa.
  // Essa é a regra que você pediu: somar AREA por ECORTE direto do GeoJSON processado.
  // Não depende de vínculo da OC nem de cadastro de talhão; só precisa das colunas do SHP.
  const geojsonMapa = await carregarGeojsonMaisRecenteMapa(canonicalCompanyId);
  const storageRows = [];
  (geojsonMapa.features || []).forEach((feature, index) => {
    const props = feature?.properties && typeof feature.properties === 'object' ? feature.properties : feature;
    if (!props || typeof props !== 'object') return;

    const corte = cortePlanejamentoKey(pickJsonValue(props, PLANEJAMENTO_CORTE_ALIASES));
    const area = parseNumber(pickJsonValue(props, PLANEJAMENTO_AREA_ALIASES));
    const variedade = String(pickJsonValue(props, PLANEJAMENTO_VARIEDADE_ALIASES) || '').trim().toUpperCase();
    if (!corte || !(area > 0)) return;

    const faz = pickJsonValue(props, ['FUNDO_AGR', 'fundoAgr', 'fundo_agr', 'COD_FAZ', 'codFaz', 'FAZENDA', 'fazenda']);
    const tal = pickJsonValue(props, ['TALHAO', 'Talhao', 'Talhão', 'talhao', 'CD_TALHAO', 'fieldCode']);
    const cod = pickJsonValue(props, ['COD', 'cod', 'id', 'ID']) || feature?.id || index;
    const key = `storage|${normalizeTalhaoKey(faz)}|${normalizeTalhaoKey(tal)}|${normalizeTalhaoKey(cod)}|${corte}|${index}`;
    storageRows.push({ corte, area, variedade, key });
  });

  let linhasStorageUsadas = 0;
  if (storageRows.length > 0) {
    // Quando o SHP/GeoJSON tem ECORTE + AREA, ele é a fonte oficial da área planejada.
    // Zera qualquer fallback anterior para não somar duplicado com cadastro/OC.
    Object.keys(porCorte).forEach((key) => delete porCorte[key]);
    Object.keys(porVariedade).forEach((key) => delete porVariedade[key]);
    usadosPorTalhao.clear();
    totalAreaPlanejada = 0;
    linhasUsadas = 0;
    storageRows.forEach((row) => {
      addPlanejamento(row.corte, row.area, row.key, 0, row.variedade);
      linhasStorageUsadas += 1;
    });
  }

  // Aliases para o frontend: "1", "1º Corte", "1 Corte" e "1° Corte".
  Object.entries({ ...porCorte }).forEach(([corte, area]) => {
    porCorte[`${corte}º Corte`] = area;
    porCorte[`${corte}° Corte`] = area;
    porCorte[`${corte} Corte`] = area;
  });

  // Aliases por variedade para o frontend bater tanto com maiúsculo quanto com o nome original tratado.
  const areaPorVariedade = { ...porVariedade };
  Object.entries({ ...porVariedade }).forEach(([variedade, area]) => {
    if (variedade) areaPorVariedade[String(variedade).trim()] = area;
  });

  const result = { porCorte, porVariedade: areaPorVariedade, areaPorVariedade, totalAreaPlanejada, linhasUsadas, linhasStorageUsadas, fonteStorage: geojsonMapa?.source || null };
  FECHAMENTO_OC_PLANEJAMENTO_CACHE.set(cacheKey, { createdAt: Date.now(), data: result });
  return result;
}

function tchPrevOcFromRows(items = []) { const area = sumOc(items, 'cortada'); return area ? sumOc(items, 'prodPrev') / area : 0; }
function tchRealOcFromRows(items = []) { const area = sumOc(items, 'cortada'); return area ? sumOc(items, 'prodReal') / area : 0; }
function atrPrevOcFromRows(items = []) {
  let sum = 0; let peso = 0;
  items.forEach((x) => { const prod = parseNumber(x.prodPrev); const atr = parseNumber(x.atr); if (prod > 0 && atr > 0) { sum += prod * atr; peso += prod; } });
  return peso ? sum / peso : 0;
}
function atrRealOcFromRows(items = []) {
  let sum = 0; let peso = 0;
  items.forEach((x) => { const prod = parseNumber(x.prodReal); const atr = parseNumber(x.atr); if (prod > 0 && atr > 0) { sum += prod * atr; peso += prod; } });
  return peso ? sum / peso : 0;
}
function statusByGapOc(gapPct) { if (gapPct >= 5) return 'Excelente'; if (gapPct >= 1) return 'Bom'; if (gapPct >= -1) return 'Neutro'; if (gapPct >= -5) return 'Atenção'; return 'Crítico'; }
const DEFAULT_OC_ATR_TCH_CONFIG = {
  tchDivisao: 75,
  atrDivisao: 127,
  quadrantes: {
    baixoAtrBaixoTch: { label: 'Baixo ATR / Baixo TCH', color: '#cd3c37', tchMin: 0, tchMax: 75, atrMin: 0, atrMax: 127 },
    altoAtrBaixoTch: { label: 'Alto ATR / Baixo TCH', color: '#555fd7', tchMin: 0, tchMax: 75, atrMin: 127, atrMax: 999 },
    baixoAtrAltoTch: { label: 'Baixo ATR / Alto TCH', color: '#e1a823', tchMin: 75, tchMax: 999, atrMin: 0, atrMax: 127 },
    altoAtrAltoTch: { label: 'Alto ATR / Alto TCH', color: '#22aa58', tchMin: 75, tchMax: 999, atrMin: 127, atrMax: 999 }
  }
};
async function getOcPremissas(companyId) {
  try {
    return await getDashboardPremissas(companyId);
  } catch {
    return {};
  }
}
function normalizeOcConfig(raw = {}) {
  const base = DEFAULT_OC_ATR_TCH_CONFIG;
  const source = raw?.fechamentoOcAtrTchConfig || raw?.atrTchFechamentoOc || {};
  const quadrantes = {};
  Object.entries(base.quadrantes).forEach(([key, defaults]) => {
    const item = source?.quadrantes?.[key] || {};
    quadrantes[key] = {
      label: String(item.label ?? defaults.label),
      color: String(item.color ?? defaults.color),
      tchMin: parseNumber(item.tchMin ?? defaults.tchMin),
      tchMax: parseNumber(item.tchMax ?? defaults.tchMax),
      atrMin: parseNumber(item.atrMin ?? defaults.atrMin),
      atrMax: parseNumber(item.atrMax ?? defaults.atrMax)
    };
  });
  return { tchDivisao: parseNumber(source.tchDivisao ?? base.tchDivisao), atrDivisao: parseNumber(source.atrDivisao ?? base.atrDivisao), quadrantes };
}
function classifyOcBubble(tch, atr, config) {
  const entries = Object.entries(config.quadrantes || {});
  const found = entries.find(([, q]) => tch >= q.tchMin && tch <= q.tchMax && atr >= q.atrMin && atr <= q.atrMax);
  if (found) return { key: found[0], ...found[1] };
  const key = atr >= config.atrDivisao
    ? (tch >= config.tchDivisao ? 'altoAtrAltoTch' : 'altoAtrBaixoTch')
    : (tch >= config.tchDivisao ? 'baixoAtrAltoTch' : 'baixoAtrBaixoTch');
  return { key, ...(config.quadrantes?.[key] || DEFAULT_OC_ATR_TCH_CONFIG.quadrantes[key]) };
}
async function buildFechamentoOcAggregation(rows = [], { companyId, periodo = {}, atrTchConfig = DEFAULT_OC_ATR_TCH_CONFIG, areaPlanejadaPorCorte = {}, areaPlanejadaPorVariedade = {}, planejamentoMeta = {}, premissas = {} } = {}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  // Regra do Fechamento OC: gráficos mensais somente ABR até DEZ + ACUM.
  const ORDER = ['ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
  const MONTH_KEY = { ABR: 'abr', MAI: 'mai', JUN: 'jun', JUL: 'jul', AGO: 'ago', SET: 'set', OUT: 'out', NOV: 'nov', DEZ: 'dez' };
  const atrMetaPremissa = (mes) => parseNumber(premissas?.metasMensais?.[MONTH_KEY[mes]]?.atr ?? premissas?.atr ?? 0);
  const monthName = (dateKey = '') => {
    const month = Number(String(dateKey).slice(5, 7));
    if (!month) return 'SEM DATA';
    return month >= 4 && month <= 12 ? ORDER[month - 4] : 'SEM DATA';
  };
  const makeBucket = (label = '') => ({
    label,
    count: 0,
    areaCortada: 0,
    prodPrev: 0,
    prodReal: 0,
    atrPrevNumerator: 0,
    atrPrevWeight: 0,
    atrRealNumerator: 0,
    atrRealWeight: 0,
    tempoSum: 0,
    tempoCount: 0,
    idadeSum: 0,
    idadePeso: 0,
    corteSum: 0,
    cortePeso: 0,
  });
  const addRow = (bucket, row) => {
    const area = parseNumber(row.cortada);
    const prodPrev = parseNumber(row.prodPrev);
    const prodReal = parseNumber(row.prodReal);
    const atr = parseNumber(row.atr);
    const tempo = parseNumber(row.tempo);
    const idade = parseNumber(row.idade);
    const corte = parseNumber(row.estagio);
    bucket.count += 1;
    bucket.areaCortada += area;
    bucket.prodPrev += prodPrev;
    bucket.prodReal += prodReal;
    bucket.atrPrevNumerator += prodPrev * atr;
    bucket.atrPrevWeight += prodPrev;
    bucket.atrRealNumerator += prodReal * atr;
    bucket.atrRealWeight += prodReal;
    if (tempo > 0) { bucket.tempoSum += tempo; bucket.tempoCount += 1; }
    if (idade > 0 && area > 0) { bucket.idadeSum += idade * area; bucket.idadePeso += area; }
    if (corte > 0 && area > 0) { bucket.corteSum += corte * area; bucket.cortePeso += area; }
    return bucket;
  };
  const finish = (bucket) => {
    const tchPrev = bucket.areaCortada ? bucket.prodPrev / bucket.areaCortada : 0;
    const tchReal = bucket.areaCortada ? bucket.prodReal / bucket.areaCortada : 0;
    const atrPrev = bucket.atrPrevWeight ? bucket.atrPrevNumerator / bucket.atrPrevWeight : 0;
    const atrReal = bucket.atrRealWeight ? bucket.atrRealNumerator / bucket.atrRealWeight : 0;
    return {
      ...bucket,
      area: bucket.areaCortada,
      areaReal: bucket.areaCortada,
      areaColhida: bucket.areaCortada,
      prev: tchPrev,
      real: tchReal,
      tchPrev,
      tchReal,
      atrPrev,
      atr: atrReal,
      atrReal,
      gap: tchReal - tchPrev,
      gapPct: gapPctOc(bucket.prodReal, bucket.prodPrev),
      gapTchPct: gapPctOc(tchReal, tchPrev),
      gapAtrPct: gapPctOc(atrReal, atrPrev),
      status: statusByGapOc(gapPctOc(tchReal, tchPrev)),
      tempo: bucket.tempoCount ? bucket.tempoSum / bucket.tempoCount : 0,
      idadeMeses: bucket.idadePeso ? bucket.idadeSum / bucket.idadePeso : 0,
      idadeCorte: bucket.cortePeso ? bucket.corteSum / bucket.cortePeso : 0,
    };
  };
  const groupBy = (keyFn) => {
    const map = new Map();
    safeRows.forEach((row) => {
      const key = keyFn(row) || '—';
      if (!map.has(key)) map.set(key, makeBucket(key));
      addRow(map.get(key), row);
    });
    return Array.from(map.entries()).map(([key, bucket]) => ({ key, ...finish(bucket) }));
  };
  const total = finish(safeRows.reduce((bucket, row) => addRow(bucket, row), makeBucket('TOTAL')));
  const mensalMap = new Map(ORDER.map((m) => [m, makeBucket(m)]));
  safeRows.forEach((row) => {
    const mes = monthName(row.encerramento);
    if (!mensalMap.has(mes)) return; // não manda Jan/Fev/Mar para esses 3 gráficos
    addRow(mensalMap.get(mes), row);
  });
  const totalMensal = ORDER.reduce((bucket, mes) => {
    const src = mensalMap.get(mes);
    if (!src) return bucket;
    bucket.count += src.count;
    bucket.areaCortada += src.areaCortada;
    bucket.prodPrev += src.prodPrev;
    bucket.prodReal += src.prodReal;
    bucket.atrPrevNumerator += src.atrPrevNumerator;
    bucket.atrPrevWeight += src.atrPrevWeight;
    bucket.atrRealNumerator += src.atrRealNumerator;
    bucket.atrRealWeight += src.atrRealWeight;
    bucket.tempoSum += src.tempoSum;
    bucket.tempoCount += src.tempoCount;
    bucket.idadeSum += src.idadeSum;
    bucket.idadePeso += src.idadePeso;
    bucket.corteSum += src.corteSum;
    bucket.cortePeso += src.cortePeso;
    return bucket;
  }, makeBucket('ACUM'));
  const mensal = [
    ...Array.from(mensalMap.entries()).map(([mes, bucket]) => ({ mes, ...finish(bucket), metaAtr: atrMetaPremissa(mes) || finish(bucket).atrPrev })),
    { mes: 'ACUM', ...finish(totalMensal), metaAtr: atrMetaPremissa('DEZ') || finish(totalMensal).atrPrev },
  ];
  const fazendaNomes = await getFarmNameMapForDashboard(companyId);
  const nomeFazenda = (cod) => fazendaNomes[String(cod || '').trim()] || fazendaNomes[normalizeCompanyKey(cod)] || String(cod || '').trim();
  const fazendas = groupBy((row) => String(row.fazenda || '').trim()).map((x) => ({
    ...x,
    fazenda: x.key,
    cod: x.key,
    nome: nomeFazenda(x.key),
    label: `${x.key}||${nomeFazenda(x.key)}`,
    n: x.count,
    tonPrev: x.prodPrev,
    tonReal: x.prodReal
  })).sort((a,b) => b.tchReal - a.tchReal);
  const estagios = groupBy((row) => String(row.estagio || '').trim()).map((x) => {
    const corteKey = cortePlanejamentoKey(x.key);
    const areaPlanejada = parseNumber(areaPlanejadaPorCorte[String(x.key).trim()]) || parseNumber(areaPlanejadaPorCorte[corteKey]) || 0;
    const percentualRealizado = areaPlanejada > 0 ? pctOc(x.areaReal || x.areaCortada || x.area || 0, areaPlanejada) : 0;
    return {
      ...x,
      estagio: x.key,
      corteKey,
      n: x.count,
      tonPrev: x.prodPrev,
      tonReal: x.prodReal,
      areaPlanejada,
      areaPlan: areaPlanejada,
      percentualRealizado,
      realPct: percentualRealizado,
      evolucaoPct: Math.max(0, Math.min(100, percentualRealizado)),
    };
  }).sort((a,b) => (parseFloat(String(a.estagio).replace(/\D/g,'')) || 999) - (parseFloat(String(b.estagio).replace(/\D/g,'')) || 999));
  const variedades = groupBy((row) => String(row.variedade || '').trim() || 'Outras').map((x) => {
    const variedadeKey = String(x.key || '').trim().toUpperCase();
    const areaPlanejada = parseNumber(areaPlanejadaPorVariedade[String(x.key || '').trim()]) || parseNumber(areaPlanejadaPorVariedade[variedadeKey]) || 0;
    const percentualRealizado = areaPlanejada > 0 ? pctOc(x.areaReal || x.areaCortada || x.area || 0, areaPlanejada) : 0;
    return {
      ...x,
      variedade: x.key,
      name: x.key,
      value: x.prodReal,
      n: x.count,
      tonPrev: x.prodPrev,
      tonReal: x.prodReal,
      areaPlanejada,
      areaPlan: areaPlanejada,
      percentualRealizado,
      realPct: percentualRealizado,
      evolucaoPct: Math.max(0, Math.min(100, percentualRealizado)),
      pct: total.prodReal ? `${((x.prodReal / total.prodReal) * 100).toFixed(1).replace('.', ',')}%` : '0,0%'
    };
  }).sort((a,b) => b.tonReal - a.tonReal);
  const tipos = groupBy((row) => String(row.tipoPropriedade || row.TIPO_PROPRIEDADE || '').trim() || 'SEM CADASTRO')
    .map((x) => ({ ...x, tipo: x.key, n: x.count }))
    .sort((a, b) => String(a.tipo).localeCompare(String(b.tipo), 'pt-BR'));
  const detalhe = safeRows.map((row) => {
    const area = parseNumber(row.cortada);
    const prodPrev = parseNumber(row.prodPrev);
    const prodReal = parseNumber(row.prodReal);
    const atr = parseNumber(row.atr);
    const tchPrev = area ? prodPrev / area : 0;
    const tchReal = area ? prodReal / area : 0;
    const q = classifyOcBubble(tchReal, atr, atrTchConfig);
    return {
      faz: row.fazenda, COD_FAZ: row.fazenda, nome: nomeFazenda(row.fazenda), FAZENDA: nomeFazenda(row.fazenda), tal: row.quadra, TALHAO: row.quadra, parte: row.parte, estagio: row.estagio, variedade: row.variedade,
      tipoPropriedade: row.tipoPropriedade || row.TIPO_PROPRIEDADE || 'SEM CADASTRO', TIPO_PROPRIEDADE: row.tipoPropriedade || row.TIPO_PROPRIEDADE || 'SEM CADASTRO',
      areaReal: area, area, areaCortada: area, tonPrev: prodPrev, tonReal: prodReal, ton: prodReal, prodReal, prodPrev,
      tchPrev, tchReal, tch: tchReal, prev: tchPrev, gapPct: gapPctOc(tchReal, tchPrev), atr,
      abertura: row.abertura, encerramento: row.encerramento, idade: row.idade, tempo: row.tempo,
      x: tchReal, y: atr, z: Math.max(prodReal, 1), c: q.color, grupo: q.label,
    };
  });
  const rankingGap = [...fazendas].sort((a,b) => a.gapPct - b.gapPct).slice(0, 20);
  const scatterAtr = detalhe.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && (p.x > 0 || p.y > 0));

  const faixasGapConfig = [
    { label: '< -15%', min: -Infinity, max: -15, color: '#ef4444' },
    { label: '-15% a -10%', min: -15, max: -10, color: '#f97316' },
    { label: '-10% a -5%', min: -10, max: -5, color: '#eab308' },
    { label: '-5% a 0%', min: -5, max: 0, color: '#84cc16' },
    { label: '0% a +5%', min: 0, max: 5, color: '#22c55e' },
    { label: '+5% a +10%', min: 5, max: 10, color: '#10b981' },
    { label: '> +10%', min: 10, max: Infinity, color: '#06b6d4' },
  ];
  const faixaGap = faixasGapConfig.map((f) => {
    const items = detalhe.filter((x) => x.prev > 0 && x.gapPct > f.min && x.gapPct <= f.max);
    return { ...f, count: items.length, area: items.reduce((acc, x) => acc + parseNumber(x.area), 0) };
  }).filter((x) => x.count > 0);

  const BAND = 0.05;
  const tchMed = total.tchReal || 0;
  const atrMed = total.atrReal || 0;
  const status = { acima: 0, dentro: 0, abaixo: 0, areaAcima: 0, areaDentro: 0, areaAbaixo: 0 };
  const statusAtr = { acima: 0, dentro: 0, abaixo: 0, areaAcima: 0, areaDentro: 0, areaAbaixo: 0, tonAcima: 0, tonDentro: 0, tonAbaixo: 0 };
  detalhe.forEach((x) => {
    if (x.tch > 0 && x.area > 0) {
      const ratio = tchMed > 0 ? x.tch / tchMed : 1;
      if (ratio > 1 + BAND) { status.acima += 1; status.areaAcima += x.area; }
      else if (ratio < 1 - BAND) { status.abaixo += 1; status.areaAbaixo += x.area; }
      else { status.dentro += 1; status.areaDentro += x.area; }
    }
    if (x.atr > 0 && x.area > 0) {
      const ratioAtr = atrMed > 0 ? x.atr / atrMed : 1;
      if (ratioAtr > 1 + BAND) { statusAtr.acima += 1; statusAtr.areaAcima += x.area; statusAtr.tonAcima += x.ton; }
      else if (ratioAtr < 1 - BAND) { statusAtr.abaixo += 1; statusAtr.areaAbaixo += x.area; statusAtr.tonAbaixo += x.ton; }
      else { statusAtr.dentro += 1; statusAtr.areaDentro += x.area; statusAtr.tonDentro += x.ton; }
    }
  });

  const temposPorFazenda = fazendas
    .map((f) => ({ cod: f.fazenda, nome: f.nome || f.fazenda, tempoMedio: f.tempo || 0 }))
    .filter((f) => f.tempoMedio > 0)
    .sort((a, b) => b.tempoMedio - a.tempoMedio)
    .slice(0, 15);

  const mesesIdadeLabels = ['ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
  const idadePorMes = mesesIdadeLabels.map((mes) => {
    const m = mensal.find((x) => x.mes === mes) || {};
    return { mes, idadeMeses: m.idadeMeses || 0, idadeCorte: m.idadeCorte || 0 };
  });
  idadePorMes.push({ mes: 'Acum', idadeMeses: total.idadeMeses || 0, idadeCorte: total.idadeCorte || 0 });

  const analiseDesvio = {
    tahMedio: total.atrReal > 0 && total.tchReal > 0 ? (total.atrReal * total.tchReal) / 1000 : 0,
    status,
    statusAtr,
    faixaGap,
    temposPorFazenda,
    detalhe,
    piorTalhoes: [...detalhe].filter((x) => x.area > 0).sort((a, b) => a.gapPct - b.gapPct),
    pctAcima: detalhe.length ? (status.acima / detalhe.length) * 100 : 0,
    idadePorMes,
    atrData: scatterAtr,
    atrXTch: {
      avgX: scatterAtr.length ? scatterAtr.reduce((acc, x) => acc + x.x, 0) / scatterAtr.length : 0,
      avgY: scatterAtr.length ? scatterAtr.reduce((acc, x) => acc + x.y, 0) / scatterAtr.length : 0,
    },
  };

  const legacyRows = safeRows.map((row) => {
    const area = parseNumber(row.cortada);
    const prodPrev = parseNumber(row.prodPrev);
    const prodReal = parseNumber(row.prodReal);
    const atr = parseNumber(row.atr);
    return {
      COD_FAZ: row.fazenda,
      TALHAO: row.quadra,
      PARTE: row.parte,
      ESTAGIO: row.estagio,
      VARIEDADE: row.variedade || 'Outras',
      TIPO_PROPRIEDADE: row.tipoPropriedade || row.TIPO_PROPRIEDADE || 'SEM CADASTRO',
      ABERTURA: row.abertura,
      ENCERRAMENTO: row.encerramento,
      'AREA CORTADA': area,
      'PROD. PREV.': prodPrev,
      'PROD. REAL': prodReal,
      ATR: atr,
      IDADE: row.idade,
      TEMPO: row.tempo,
      CORTES: row.cortes,
      DM: row.dm,
      'ESPAC.': row.espac,
      safra: row.safra,
      tchPrev: area ? prodPrev / area : 0,
      tchReal: area ? prodReal / area : 0,
      atrPrevNumerator: prodPrev * atr,
      atrPrevWeight: prodPrev,
      atrRealNumerator: prodReal * atr,
      atrRealWeight: prodReal,
      gapPct: gapPctOc(prodReal, prodPrev),
    };
  });
  const totalAreaPlanejada = parseNumber(planejamentoMeta.totalAreaPlanejada) || Object.values(areaPlanejadaPorCorte || {}).reduce((acc, value) => acc + parseNumber(value), 0);
  const totalPercentualRealizado = totalAreaPlanejada > 0 ? pctOc(total.areaReal || total.areaCortada || total.area || 0, totalAreaPlanejada) : 0;
  total.areaPlanejada = totalAreaPlanejada;
  total.areaPlan = totalAreaPlanejada;
  total.percentualRealizado = totalPercentualRealizado;
  total.realPct = totalPercentualRealizado;
  total.evolucaoPct = Math.max(0, Math.min(100, totalPercentualRealizado));

  const headerInfo = {
    safra: periodo.safra || 'todas',
    periodo: periodo.dataInicio && periodo.dataFim ? `${periodo.dataInicio} – ${periodo.dataFim}` : '—',
    atualizadoEm: new Date().toLocaleDateString('pt-BR'),
  };
  const cards = {
    ocsFechadas: safeRows.length,
    ocsParciais: 0,
    ocsCanceladas: safeRows.filter((row) => String(row.estagio || '').toLowerCase().includes('cancel')).length,
    areaColhida: total.areaCortada,
    areaLiberada: 0,
    aderencia: gapPctOc(total.prodReal, total.prodPrev) + 100,
    producaoPrevista: total.prodPrev,
    producaoReal: total.prodReal,
    prodPrev: total.prodPrev,
    prodReal: total.prodReal,
    variacaoPct: gapPctOc(total.prodReal, total.prodPrev),
    tchPrevistoMedio: total.tchPrev,
    tchRealMedio: total.tchReal,
    tchPrev: total.tchPrev,
    tchReal: total.tchReal,
    gapTch: total.tchReal - total.tchPrev,
    gapTchPct: total.gapTchPct,
    atrPrevisto: total.atrPrev,
    atrMedio: total.atrReal,
    atrPrev: total.atrPrev,
    atrReal: total.atrReal,
    atrGap: total.atrReal - total.atrPrev,
    atrGapPct: total.gapAtrPct,
    tempoFechamentoMedio: total.tempo,
    tempoFechamento: total.tempo,
  };
  return {
    serverAggregated: true,
    totalRegistros: safeRows.length,
    options: { safras: [...new Set(safeRows.map((r) => r.safra).filter(Boolean))], fazendas: [...new Set(safeRows.map((r) => r.fazenda).filter(Boolean))] },
    premissas: { fechamentoOcAtrTchConfig: atrTchConfig, idadeIdealMeses: parseNumber(premissas?.idadeIdealMeses ?? premissas?.idadeIdealMediaMeses ?? premissas?.fechamentoOcIdadeIdeal ?? 12) },
    resumo: total,
    cards,
    headerInfo,
    graficos: {
      mensal,
      tchAtrMensal: mensal.map((x) => ({ mes: x.mes, tch: x.tchReal, tchPrev: x.tchPrev, atr: x.atrReal, metaAtr: x.metaAtr || x.atrPrev, ton: x.prodReal, tonPrev: x.prodPrev, area: x.areaCortada })),
      tchPrevistoRealPorFazenda: fazendas,
      rankingFazendasGapTch: rankingGap,
      producaoRealPorVariedade: variedades.slice(0, 15),
      atrMedioPorVariedade: variedades.slice(0, 15),
      atrXTch: scatterAtr,
      idadeXTchReal: detalhe.filter((x) => x.idade > 0).map((x) => ({ x: x.idade, y: x.tchReal, z: Math.max(x.tonReal, 1) })),
      heatmapPerformancePorFazenda: fazendas.map((r) => ({ fazenda: r.fazenda, real: r.tchReal, atr: r.atrReal, gapPct: r.gapPct, tempo: r.tempo, indice: Math.round(Math.max(0, Math.min(100, 50 + r.gapPct * 3))) })),
    },
    agrupamentos: { mensal, fazendas, estagios, variedades, tipos },
    fazendaNomes,
    planejamento: { areaPorCorte: areaPlanejadaPorCorte || {}, areaPorVariedade: areaPlanejadaPorVariedade || {}, totalAreaPlanejada, linhasUsadas: planejamentoMeta.linhasUsadas || 0, linhasStorageUsadas: planejamentoMeta.linhasStorageUsadas || 0, fonteStorage: planejamentoMeta.fonteStorage || null },
    cadastros: { fazendaNomes },
    tabelas: { detalhe, rankingGap, fazendas, estagios, variedades, tipos, piorTalhoes: analiseDesvio.piorTalhoes },
    analiseDesvio,
    meta: { companyId, periodo, totalRegistrosUsados: safeRows.length, avisos: safeRows.length ? [] : ['Nenhum dado encontrado para os filtros selecionados.'] },
    rows: fazendas.slice(0, 12),
    // Não envia milhares de linhas para o React por padrão.
    // O dashboard agora usa os agregados prontos do backend; legacyRows fica só para debug compatível.
    legacyRows: periodo?.includeLegacyRows === true ? legacyRows : [],
    rankingGapTch: rankingGap,
    tempoData: detalhe.filter((x) => parseNumber(x.tempo) > 0).sort((a,b) => parseNumber(b.tempo) - parseNumber(a.tempo)).slice(0, 10).map((x) => ({ oc: `${x.faz}-${x.tal}`, dias: parseNumber(x.tempo) })),
    variedadeData: variedades.slice(0, 5),
    atrVarData: variedades.slice(0, 5),
    scatterAtr,
    scatterIdade: detalhe.filter((x) => x.idade > 0).map((x) => ({ x: x.idade, y: x.tchReal, z: Math.max(x.tonReal, 1) })),
    heat: fazendas.map((r) => ({ fazenda: r.fazenda, real: r.tchReal, atr: r.atrReal, gapPct: r.gapPct, tempo: r.tempo, indice: Math.round(Math.max(0, Math.min(100, 50 + r.gapPct * 3))) })),
  };
}

export async function getFechamentoOcDashboard(companyId, filters = {}) {
  const canonicalCompanyId = normalizeCompanyId(companyId);
  const companyKey = normalizeCompanyKey(canonicalCompanyId);
  const debugMode = String(process.env.DEBUG_FECHAMENTO_OC || '').toLowerCase() === 'true';
  const safraFiltroFast = String(filters.safra || '').trim();
  const dataInicioFast = normalizeDateKey(filters.dataInicio);
  const dataFimFast = normalizeDateKey(filters.dataFim);
  const fazendaFiltroFast = String(filters.fazenda || '').trim();
  const cacheKey = JSON.stringify({
    companyId: canonicalCompanyId,
    safra: safraFiltroFast || 'todas',
    fazenda: fazendaFiltroFast || 'todas',
    dataInicio: dataInicioFast || '',
    dataFim: dataFimFast || '',
  });
  const cached = FECHAMENTO_OC_DASHBOARD_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < FECHAMENTO_OC_DASHBOARD_CACHE_MS) return cached.data;

  const identity = await resolveDashboardCompanyIdentity(canonicalCompanyId);
  const closureCompanyIds = [identity.companyId, identity.companyCode, canonicalCompanyId].filter(Boolean);
  const closureWhere = { companyId: { in: closureCompanyIds } };
  if (safraFiltroFast && safraFiltroFast !== 'todas') closureWhere.harvestYear = safraFiltroFast;
  if (fazendaFiltroFast && fazendaFiltroFast !== 'todas') closureWhere.farmCode = fazendaFiltroFast;
  if (dataInicioFast || dataFimFast) {
    closureWhere.closingDate = {};
    if (dataInicioFast) closureWhere.closingDate.gte = parseLocalDate(dataInicioFast) || new Date(`${dataInicioFast}T00:00:00`);
    if (dataFimFast) closureWhere.closingDate.lte = parseLocalDate(dataFimFast) || new Date(`${dataFimFast}T23:59:59`);
  }

  const closureRows = await prisma.closureDashboardRecord.findMany({
    where: closureWhere,
    orderBy: [{ closingDate: 'desc' }, { farmCode: 'asc' }, { fieldCode: 'asc' }],
  });
  const rawRows = closureRows.map((row) => {
    const raw = row.rawData || {};
    return {
      companyId: canonicalCompanyId,
      companyIdKey: companyKey,
      safra: getOcRawOrStored(row, raw, ['safra','Safra'], row.harvestYear || ''),
      fazenda: getOcRawOrStored(row, raw, ['fazenda','Fazenda','COD_FAZ'], row.farmCode || ''),
      quadra: getOcRawOrStored(row, raw, ['quadra','Quadra','TALHAO','Talhao','Talhão'], row.fieldCode || ''),
      parte: getOcRawOrStored(row, raw, ['parte','Parte','PARTE'], row.part || ''),
      estagio: getOcRawOrStored(row, raw, ['estagio','Estágio','ESTAGIO'], row.stage || ''),
      variedade: getOcRawOrStored(row, raw, ['variedade','Variedade','VARIEDADE'], row.varietyName || ''),
      abertura: normalizeDateKey(getOcRawOrStored(row, raw, ['abertura','Abertura','ABERTURA'], dateToLegacy(row.openingDate))),
      encerramento: normalizeDateKey(getOcRawOrStored(row, raw, ['encerramento','Encerramento','ENCERRAMENTO'], dateToLegacy(row.closingDate))),
      plantio: normalizeDateKey(getOcRawOrStored(row, raw, ['plantio','Plantio','PLANTIO'], dateToLegacy(row.plantingDate))),
      cortada: parseNumber(getOcRawOrStored(row, raw, ['Cortada','cortada','AREA CORTADA','Area Cortada','Área Cortada'], row.cutArea)),
      prodPrev: parseNumber(getOcRawOrStored(row, raw, ['Prod. Prev.','prodPrev','PROD. PREV.','Prod Prev','PROD PREV'], row.prevTon)),
      prodReal: parseNumber(getOcRawOrStored(row, raw, ['Prod. Real','prodReal','PROD. REAL','Prod Real','PROD REAL'], row.realTon)),
      atr: parseNumber(getOcRawOrStored(row, raw, ['Atr','atr','ATR'], row.atr)),
      idade: parseNumber(getOcRawOrStored(row, raw, ['idade','Idade','IDADE'], row.age)),
      cortes: parseNumber(getOcRawOrStored(row, raw, ['cortes','Cortes','CORTES'], row.cuts)),
      espac: parseNumber(getOcRawOrStored(row, raw, ['espac','Espac.','ESPAC.'], row.spacing)),
      dm: parseNumber(getOcRawOrStored(row, raw, ['dm','DM'], row.dm || 0)),
      tempo: parseNumber(getOcRawOrStored(row, raw, ['tempo','Tempo','TEMPO'], row.timeDays)),
      raw,
      updatedAt: row.updatedAt,
      id: row.id,
    };
  });
  const dedupeMap = new Map();
  rawRows.forEach((row) => {
    const key = [row.fazenda, row.quadra, row.parte, row.encerramento, row.prodPrev, row.prodReal, row.cortada, row.atr].map((v) => String(v ?? '').trim()).join('|');
    const previous = dedupeMap.get(key);
    if (!previous || new Date(row.updatedAt || 0).getTime() >= new Date(previous.updatedAt || 0).getTime()) dedupeMap.set(key, row);
  });
  const dedupedRawRows = Array.from(dedupeMap.values());

  const premissasDashboard = await getDashboardPremissas(canonicalCompanyId);
  const atrTchConfig = normalizeOcConfig(premissasDashboard);
  const safraFiltro = safraFiltroFast;
  const fazendaFiltro = fazendaFiltroFast;
  const dataInicio = dataInicioFast;
  const dataFim = dataFimFast;
  const rows = [];
  dedupedRawRows.forEach((rawItem) => {
    const item = normalizeOcRegistro(rawItem || {});
    const data = item.encerramento || '';
    if (companyKey && getOcCompanyKey(item) !== companyKey) return;
    if (safraFiltro && safraFiltro !== 'todas' && String(item.safra || '') !== safraFiltro) return;
    if (fazendaFiltro && fazendaFiltro !== 'todas' && String(item.fazenda || '') !== fazendaFiltro) return;
    if (dataInicio && (!data || data < dataInicio)) return;
    if (dataFim && (!data || data > dataFim)) return;
    rows.push(item);
  });
  const planejamento = await getAreaPlanejadaOrdemCortePorCorte(canonicalCompanyId, { safra: safraFiltro });

  // Enriquecimento do Fechamento OC com Cadastro Geral.
  // A planilha de Fechamento OC traz a fazenda no campo `fazenda`;
  // o Cadastro Geral importado guarda o tipo em `TIPO_PROPRIEDADE` e o código em `COD_FAZ`.
  // Aqui cruzamos FAZENDA/COD_FAZ (+ TALHÃO quando existir) para o resumo por tipo não cair em SEM CADASTRO.
  const normalizeCadastroKeyOc = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const clean = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
    if (!clean) return '';
    const digits = clean.replace(/[^0-9]/g, '');
    return digits ? String(Number(digits)) : clean;
  };
  const firstOcCadastroValue = (...values) => {
    for (const value of values) {
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return '';
  };
  const tipoCacheKey = closureCompanyIds.join('|');
  let cadastroTipoByKey = new Map();
  const tipoCached = FECHAMENTO_OC_TIPO_PROPRIEDADE_CACHE.get(tipoCacheKey);
  if (tipoCached && Date.now() - tipoCached.createdAt < FECHAMENTO_OC_TIPO_PROPRIEDADE_CACHE_MS) {
    cadastroTipoByKey = new Map(tipoCached.entries);
  } else {
  try {
    const cadastroFields = await prisma.field.findMany({
      where: { companyId: { in: closureCompanyIds } },
      take: 20000,
      select: {
        code: true,
        name: true,
        rawData: true,
        farm: { select: { code: true, name: true, rawData: true } },
      },
      orderBy: [{ code: 'asc' }],
    });

    const putTipo = (key, tipo) => {
      const k = normalizeCadastroKeyOc(key);
      const t = String(tipo || '').trim().toUpperCase();
      if (k && t && !cadastroTipoByKey.has(k)) cadastroTipoByKey.set(k, t);
    };

    cadastroFields.forEach((field) => {
      const raw = { ...(field.farm?.rawData || {}), ...(field.rawData || {}) };
      const tipo = firstOcCadastroValue(raw.TIPO_PROPRIEDADE, raw.tipoPropriedade, raw.tipo_propriedade, raw.TIPO_PROP, raw.MOD_ADM, raw.modAdm);
      if (!tipo) return;
      const codFaz = firstOcCadastroValue(raw.COD_FAZ, raw.codFaz, field.farm?.code);
      const nomeFaz = firstOcCadastroValue(raw.DES_FAZENDA, raw.desFazenda, raw.FAZENDA, raw.fazenda, field.farm?.name);
      const talhao = firstOcCadastroValue(raw.TALHAO, raw.talhao, field.name, field.code);

      putTipo(codFaz, tipo);
      putTipo(nomeFaz, tipo);
      if (codFaz && talhao) putTipo(`${codFaz}|${talhao}`, tipo);
      if (nomeFaz && talhao) putTipo(`${nomeFaz}|${talhao}`, tipo);
    });
    FECHAMENTO_OC_TIPO_PROPRIEDADE_CACHE.set(tipoCacheKey, { createdAt: Date.now(), entries: Array.from(cadastroTipoByKey.entries()) });
  } catch (error) {
    console.warn('[FechamentoOC] Não foi possível cruzar tipo de propriedade com Cadastro Geral:', error?.message || error);
  }
  }

  const rowsComTipoPropriedade = rows.map((row) => {
    const fazendaKey = firstOcCadastroValue(row.fazenda, row.COD_FAZ, row.codFaz, row.faz, row.FAZENDA);
    const talhaoKey = firstOcCadastroValue(row.quadra, row.TALHAO, row.talhao, row.tal);
    const tipo = cadastroTipoByKey.get(normalizeCadastroKeyOc(`${fazendaKey}|${talhaoKey}`))
      || cadastroTipoByKey.get(normalizeCadastroKeyOc(fazendaKey))
      || '';
    return { ...row, tipoPropriedade: tipo || 'SEM CADASTRO', TIPO_PROPRIEDADE: tipo || 'SEM CADASTRO' };
  });

  if (debugMode) console.info('[FechamentoOC] relatório importado agregado:', { total: rawRows.length, deduplicado: dedupedRawRows.length, filtrado: rows.length, planejamento, tiposCadastro: cadastroTipoByKey.size });
  const result = await buildFechamentoOcAggregation(rowsComTipoPropriedade, {
    companyId: canonicalCompanyId,
    periodo: { dataInicio: dataInicio || null, dataFim: dataFim || null, safra: safraFiltro || 'todas', includeLegacyRows: String(filters.includeLegacyRows || '').toLowerCase() === 'true' },
    atrTchConfig,
    areaPlanejadaPorCorte: planejamento.porCorte || {},
    areaPlanejadaPorVariedade: planejamento.porVariedade || planejamento.areaPorVariedade || {},
    planejamentoMeta: planejamento,
    premissas: premissasDashboard,
  });
  FECHAMENTO_OC_DASHBOARD_CACHE.set(cacheKey, { createdAt: Date.now(), data: result });
  return result;
}

export async function getDashboardParadas(companyId, filters = {}) {
  const where = await getDashboardCompanyWhere(companyId);
  const selectedDate = normalizeDateKey(filters.data || filters.dataFim || filters.dataInicio);
  const rows = await prisma.dashboardColheitaParada.findMany({
    where,
    orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
  });
  const data = rows.map((row) => ({
    ...(row.rawData || {}),
    id: row.id,
    companyId: row.companyCode || row.companyId,
    data: dateToLegacy(row.date),
    tipo: row.type || '',
    horaInicio: row.startTime || '',
    horaFim: row.endTime || '',
    observacao: row.observation || '',
  }));
  return selectedDate ? data.filter((item) => normalizeDateKey(item.data) === selectedDate) : data;
}

export async function saveDashboardParada(companyId, payload = {}, actorUid = null) {
  const candidates = await getDashboardCompanyCandidates(companyId);
  const canonical = candidates[0] || normalizeCompanyId(companyId);
  const rawCompany = String(companyId || '').trim().toLowerCase();
  const data = normalizeDateKey(payload.data);
  const tipo = String(payload.tipo || '').toLowerCase().includes('agric') ? 'agricola' : 'industria';
  const horaInicio = normalizeHour(payload.horaInicio);
  const horaFim = normalizeHour(payload.horaFim);
  if (!data || !horaInicio || !horaFim) throw new Error('Data, hora inicial e hora final são obrigatórias.');
  const id = `${rawCompany || canonical}_${data}_${tipo}_${horaInicio.replace(':', '')}_${horaFim.replace(':', '')}_${Date.now()}`;
  const doc = {
    companyId: rawCompany || canonical,
    data,
    tipo,
    horaInicio,
    horaFim,
    observacao: String(payload.observacao || '').trim(),
    updatedBy: actorUid || 'system',
  };
  await prisma.dashboardColheitaParada.create({
    data: {
      id,
      companyId: canonical,
      companyCode: rawCompany || canonical,
      date: parseLocalDate(data) || new Date(`${data}T00:00:00`),
      type: tipo,
      startTime: horaInicio,
      endTime: horaFim,
      observation: doc.observacao,
      rawData: doc,
    },
  });
  return { id, ...doc };
}
