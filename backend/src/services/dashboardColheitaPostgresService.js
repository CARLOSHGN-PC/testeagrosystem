import { prisma } from '../lib/prisma.js';
import { getColheitaPremissasPostgres } from './premissasPostgresService.js';
import { getDashboardOperacional } from './dadosDashboardAdminService.js';

function normText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function num(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value?.toNumber === 'function') {
    const n = value.toNumber();
    return Number.isFinite(n) ? n : fallback;
  }
  const n = Number(String(value).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

function dateKey(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const str = String(value || '').trim();
  if (!str) return '';
  const br = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return '';
}

function hourKey(value) {
  const str = String(value || '').trim();
  const m = str.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '00:00';
  return `${String(Math.min(23, Math.max(0, Number(m[1])))).padStart(2, '0')}:00`;
}

const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MONTH_KEYS = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

function monthLabelFromDate(value) {
  const dk = dateKey(value);
  if (!dk) return '';
  const idx = Number(dk.slice(5, 7)) - 1;
  return MONTHS[idx] || '';
}

function formatBR(dk) {
  if (!dk) return '';
  const [y, m, d] = dk.split('-');
  return `${d}/${m}/${y}`;
}

function frontKey(frente) {
  return `f${String(frente || '0').replace(/[^0-9a-zA-Z]+/g, '_')}`;
}

function paletteForIndex(index) {
  // Mesma paleta usada no dashboard em produção. Não alterar ordem sem validar com produção.
  const colors = ['#21d6a0', '#5b8fff', '#f0a83a', '#bb86fc', '#f87171', '#2dd4bf', '#f59e0b', '#60a5fa'];
  return colors[index % colors.length];
}

async function companyCandidates(companyId) {
  const raw = String(companyId || '').trim();
  const normalized = normText(raw);
  const set = new Set([raw, raw.toLowerCase()].filter(Boolean));
  const companies = await prisma.company.findMany({ select: { id: true, code: true, name: true } }).catch(() => []);
  const found = companies.find((c) => c.id === raw || String(c.code) === raw || normText(c.code) === normalized || normText(c.name) === normalized || normText(c.name).includes(normalized));
  if (found) {
    set.add(found.id);
    if (found.code) set.add(String(found.code));
    if (found.name) set.add(String(found.name));
  }
  if (normalized === '002' || normalized === 'usinacacu' || normText(found?.name).includes('usinacacu')) {
    set.add('002');
    set.add('usinacacu');
    const usina = companies.find((c) => String(c.code) === '002' || normText(c.name).includes('usinacacu'));
    if (usina) { set.add(usina.id); if (usina.code) set.add(String(usina.code)); }
  }
  if (normalized === '001' || normalized === 'agrosystem' || normalized === 'agrosystemtestes' || raw.toLowerCase() === 'agro-system') {
    set.add('001');
    set.add('agro-system');
    const agro = companies.find((c) => String(c.code) === '001' || normText(c.name).includes('agrosystem'));
    if (agro) { set.add(agro.id); if (agro.code) set.add(String(agro.code)); }
  }
  return Array.from(set).filter(Boolean);
}

async function whereCompany(companyId) {
  const c = await companyCandidates(companyId);
  return { OR: c.flatMap((v) => [{ companyId: v }, { companyCode: v }]) };
}

function applyBaseFilters(rows, filters = {}) {
  const safra = filters.safra && filters.safra !== 'todas' ? String(filters.safra) : '';
  const frente = filters.frente && filters.frente !== 'todas' ? String(filters.frente) : '';
  const descricao = filters.descricao && filters.descricao !== 'todas' ? String(filters.descricao) : '';
  const ini = dateKey(filters.dataInicio);
  const fim = dateKey(filters.dataFim);
  return rows.filter((row) => {
    if (safra && String(row.safra || '') !== safra) return false;
    if (frente && String(row.frente || '') !== frente) return false;
    if (descricao && String(row.descricao || '') !== descricao) return false;
    const dk = dateKey(row.data);
    if (ini && dk < ini) return false;
    if (fim && dk > fim) return false;
    return true;
  });
}

async function loadDashboardData(companyId) {
  const where = await whereCompany(companyId);
  const [records, impurities, atrFarm, atrMonthly, mineralShift, vegetalShift, brocaRows, stoppages, dashboardPremise, operational] = await Promise.all([
    prisma.dashboardColheitaRegistro.findMany({ where, orderBy: [{ date: 'asc' }, { time: 'asc' }] }),
    prisma.dashboardColheitaImpureza.findMany({ where, orderBy: [{ date: 'asc' }, { time: 'asc' }] }),
    prisma.dashboardColheitaAtrFazenda.findMany({ where, orderBy: [{ date: 'asc' }, { farmLabel: 'asc' }] }),
    prisma.dashboardColheitaAtrMensal.findMany({ where, orderBy: [{ date: 'asc' }] }),
    prisma.dashboardColheitaImpurezaMineralTurno.findMany({ where, orderBy: [{ date: 'asc' }, { front: 'asc' }] }),
    prisma.dashboardColheitaImpurezaVegetalTurno.findMany({ where, orderBy: [{ date: 'asc' }, { front: 'asc' }] }),
    Promise.resolve([]),
    prisma.dashboardColheitaParada.findMany({ where, orderBy: [{ date: 'asc' }, { startTime: 'asc' }] }),
    prisma.dashboardColheitaPremissa.findFirst({ where }),
    prisma.dashboardColheitaOperacional.findFirst({ where, orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }] }),
  ]);

  const premissasColheita = await loadPremissasColheitaPreferModule(companyId, dashboardPremise);

  return {
    records: records.map((r) => ({ ...(r.rawData || {}), id: r.id, companyId: r.companyCode || r.companyId, safra: r.harvestYear || r.rawData?.safra || '', data: dateKey(r.date), hora: r.time || '', dataHora: r.dateTime ? r.dateTime.toISOString().slice(0, 19) : '', frente: r.front || '', descricao: r.description || 'N/A', entrega: num(r.delivery), densidadeMedia: num(r.densityAverage), metaPeriodo: num(r.targetPeriod), entreguePercentual: num(r.deliveredPercent), mediaEntrega: num(r.deliveryAverage), mediaMeta: num(r.targetAverage), diferenca: num(r.difference) })),
    impurities: impurities.map((r) => ({ ...(r.rawData || {}), id: r.id, companyId: r.companyCode || r.companyId, safra: r.harvestYear || r.rawData?.safra || '', data: dateKey(r.date), hora: r.time || '', dataHora: r.dateTime ? r.dateTime.toISOString().slice(0, 19) : '', impurezaMineral: num(r.mineral), impurezaVegetal: num(r.vegetal) })),
    atrFarm: atrFarm.map((r) => ({ ...(r.rawData || {}), id: r.id, companyId: r.companyCode || r.companyId, safra: r.harvestYear || '', data: dateKey(r.date), fazenda: r.farmLabel || r.farmName || r.farmCode || '', fundoAgricola: r.farmLabel || r.farmName || '', atr: num(r.atr) })),
    atrMonthly: atrMonthly.map((r) => ({ ...(r.rawData || {}), id: r.id, companyId: r.companyCode || r.companyId, safra: r.harvestYear || '', data: dateKey(r.date), atr: num(r.atr), acumulado: num(r.accumulated) })),
    shifts: [...mineralShift.map((r) => ({ ...r, type: 'mineral' })), ...vegetalShift.map((r) => ({ ...r, type: 'vegetal' }))].map((r) => ({ ...(r.rawData || {}), id: r.id, tipo: r.type, companyId: r.companyCode || r.companyId, safra: r.harvestYear || '', data: dateKey(r.date), frente: r.front || '', frenteLabel: r.frontLabel || `F - ${r.front || ''}`, turnoA: num(r.shiftA), turnoB: num(r.shiftB), turnoC: num(r.shiftC) })),
    broca: [],
    stoppages: stoppages.map((r) => ({ ...(r.rawData || {}), id: r.id, companyId: r.companyCode || r.companyId, data: dateKey(r.date), tipo: r.type || r.rawData?.tipo || '', horaInicio: r.startTime || r.rawData?.horaInicio || '', horaFim: r.endTime || r.rawData?.horaFim || '', observacao: r.observation || r.rawData?.observacao || '' })),
    premissas: premissasColheita,
    operacional: operational ? { ...(operational.rawData || {}), companyId: operational.companyCode || operational.companyId, rotacaoMoenda: num(operational.millRotation), rotacao: num(operational.millRotation), estoqueCarretas: num(operational.cartStock), estoque: num(operational.cartStock) } : {},
  };
}

function defaultPremissas(base = {}) {
  const metasMensais = {};
  MONTH_KEYS.forEach((key) => { metasMensais[key] = { metaMes: 0, atr: 0, broca: 0, ...(base.metasMensais?.[key] || {}) }; });
  return { moagemPrevista: 0, metaReprojetada: 0, metaDia: 0, metaSemana: 0, metaMes: 0, metaHora: 0, atr: 0, tah: 0, tch: 0, broca: 0, impurezaVegetal: 0, impurezaMineral: 0, ...base, metasMensais };
}

const MONTH_ALIASES = {
  jan: ['jan', 'janeiro', '01', '1'],
  fev: ['fev', 'fevereiro', '02', '2'],
  mar: ['mar', 'marco', 'março', '03', '3'],
  abr: ['abr', 'abril', '04', '4'],
  mai: ['mai', 'maio', '05', '5'],
  jun: ['jun', 'junho', '06', '6'],
  jul: ['jul', 'julho', '07', '7'],
  ago: ['ago', 'agosto', '08', '8'],
  set: ['set', 'setembro', '09', '9'],
  out: ['out', 'outubro', '10'],
  nov: ['nov', 'novembro', '11'],
  dez: ['dez', 'dezembro', '12'],
};

function normalizeMonthKey(value) {
  const normalized = normText(value);
  if (!normalized) return '';
  for (const [key, aliases] of Object.entries(MONTH_ALIASES)) {
    if (aliases.map(normText).includes(normalized)) return key;
  }
  return MONTH_KEYS.includes(normalized) ? normalized : '';
}

function pickMonthlyNumber(source = {}, names = [], fallback = 0) {
  for (const name of names) {
    if (source?.[name] !== undefined && source?.[name] !== null && source?.[name] !== '') {
      const value = num(source[name], NaN);
      if (Number.isFinite(value)) return value;
    }
  }
  return num(fallback);
}

function normalizeMonthlyTargets(raw = {}, fallbackMetaMes = 0, fallbackAtr = 0, fallbackBroca = 0) {
  const result = {};
  MONTH_KEYS.forEach((key) => {
    result[key] = { metaMes: num(fallbackMetaMes), atr: num(fallbackAtr), broca: num(fallbackBroca) };
  });

  if (!raw || typeof raw !== 'object') return result;

  if (Array.isArray(raw)) {
    raw.forEach((item = {}, index) => {
      const key = normalizeMonthKey(item.mes ?? item.month ?? item.nome ?? item.label ?? item.key ?? item.mesReferencia) || MONTH_KEYS[index];
      if (!key) return;
      result[key] = {
        metaMes: pickMonthlyNumber(item, ['metaMes', 'meta', 'meta_mensal', 'metaMensal', 'moagemPrevista', 'moagem', 'volume', 'toneladas'], result[key].metaMes),
        atr: pickMonthlyNumber(item, ['atr', 'ATR', 'atrMeta', 'metaAtr'], result[key].atr),
        broca: pickMonthlyNumber(item, ['broca', 'Broca', 'brocaMeta', 'metaBroca'], result[key].broca),
      };
    });
    return result;
  }

  MONTH_KEYS.forEach((key) => {
    const aliases = MONTH_ALIASES[key] || [key];
    let current = null;
    for (const alias of aliases) {
      if (raw[alias] && typeof raw[alias] === 'object') { current = raw[alias]; break; }
      const normalizedAlias = normText(alias);
      const foundKey = Object.keys(raw).find((k) => normText(k) === normalizedAlias);
      if (foundKey && raw[foundKey] && typeof raw[foundKey] === 'object') { current = raw[foundKey]; break; }
    }
    if (!current) return;
    result[key] = {
      metaMes: pickMonthlyNumber(current, ['metaMes', 'meta', 'meta_mensal', 'metaMensal', 'moagemPrevista', 'moagem', 'volume', 'toneladas'], result[key].metaMes),
      atr: pickMonthlyNumber(current, ['atr', 'ATR', 'atrMeta', 'metaAtr'], result[key].atr),
      broca: pickMonthlyNumber(current, ['broca', 'Broca', 'brocaMeta', 'metaBroca'], result[key].broca),
    };
  });

  return result;
}

function getMonthlySource(base = {}) {
  return base.metasMensais || base.monthlyGoals || base.metas_mensais || base.metas || base.meses || {};
}

function registroSortKey(row = {}) {
  return `${dateKey(row.data) || '0000-00-00'}T${hourKey(row.hora || row.Hora || row.hour || '00:00')}|${String(row.importedAt || row.importadoEm || row.id || '')}`;
}

function calculateDensidadeMediaUltimasCargas(rows = []) {
  const byFrente = new Map();
  rows.forEach((row) => {
    const frente = String(row.frente || '').trim();
    const entrega = num(row.entrega);
    if (!frente || entrega <= 0) return;
    const current = byFrente.get(frente) || [];
    current.push({ ...row, densidade: entrega });
    byFrente.set(frente, current);
  });
  const medias = Array.from(byFrente.values())
    .map((items) => items.sort((a, b) => registroSortKey(b).localeCompare(registroSortKey(a))).slice(0, 4))
    .map((items) => items.length ? items.reduce((sum, item) => sum + num(item.densidade), 0) / items.length : 0)
    .filter((value) => value > 0);
  return medias.length ? medias.reduce((sum, value) => sum + value, 0) / medias.length : 0;
}

function calculateDensidadeMediaDia(rows = []) {
  // Regra solicitada para o card da Moagem Horária Efetiva:
  // média simples da coluna Entrega somente do dia selecionado/base.
  const entregas = rows.map((row) => num(row.entrega)).filter((value) => value > 0);
  if (!entregas.length) return 0;
  return entregas.reduce((sum, value) => sum + value, 0) / entregas.length;
}

function normalizePremissasFromModule(raw = {}) {
  const base = raw?.rawData && typeof raw.rawData === 'object' ? { ...raw.rawData, ...raw } : { ...(raw || {}) };
  const normalizedMonthly = normalizeMonthlyTargets(getMonthlySource(base), base.metaMes, base.atr, base.broca);
  return defaultPremissas({
    ...base,
    moagemPrevista: num(base.moagemPrevista ?? base.projectedCrushing ?? base.moagem_prevista),
    metaReprojetada: num(base.metaReprojetada ?? base.reprojectedGoal ?? base.meta_reprojetada),
    metaDia: num(base.metaDia ?? base.dayGoal ?? base.meta_dia),
    metaSemana: num(base.metaSemana ?? base.weekGoal ?? base.meta_semana),
    metaMes: num(base.metaMes ?? base.monthGoal ?? base.meta_mes),
    metaHora: num(base.metaHora ?? base.hourGoal ?? base.meta_hora),
    atr: num(base.atr),
    tah: num(base.tah),
    tch: num(base.tch),
    broca: num(base.broca),
    impurezaVegetal: num(base.impurezaVegetal ?? base.vegetalImpurity ?? base.impureza_vegetal),
    impurezaMineral: num(base.impurezaMineral ?? base.mineralImpurity ?? base.impureza_mineral),
    metasMensais: normalizedMonthly,
  });
}

async function loadPremissasColheitaPreferModule(companyId, dashboardPremise = null) {
  // Fonte oficial pós-migração: módulo Premissas > Colheita (HarvestAssumption).
  // dashboard_colheita_premissas fica apenas como fallback para instalações antigas.
  try {
    const modulePremissas = await getColheitaPremissasPostgres(companyId);
    const normalized = normalizePremissasFromModule(modulePremissas);
    const hasUsefulModulePremissas = [
      normalized.moagemPrevista,
      normalized.metaDia,
      normalized.metaSemana,
      normalized.metaMes,
      normalized.metaHora,
      ...MONTH_KEYS.map((key) => normalized.metasMensais?.[key]?.metaMes),
    ].some((value) => num(value) > 0);

    if (hasUsefulModulePremissas) return normalized;
  } catch (error) {
    console.warn('[DashboardColheita] Falha ao carregar premissas_colheita do módulo Premissas; usando fallback do dashboard:', error?.message || error);
  }

  if (dashboardPremise) {
    return normalizePremissasFromModule({
      ...(dashboardPremise.rawData || {}),
      companyId: dashboardPremise.companyCode || dashboardPremise.companyId,
      moagemPrevista: num(dashboardPremise.projectedCrushing),
      metaReprojetada: num(dashboardPremise.reprojectedGoal),
      metaDia: num(dashboardPremise.dayGoal),
      metaSemana: num(dashboardPremise.weekGoal),
      metaMes: num(dashboardPremise.monthGoal),
      metaHora: num(dashboardPremise.hourGoal),
      atr: num(dashboardPremise.atr),
      tah: num(dashboardPremise.tah),
      tch: num(dashboardPremise.tch),
      broca: num(dashboardPremise.broca),
      impurezaVegetal: num(dashboardPremise.vegetalImpurity),
      impurezaMineral: num(dashboardPremise.mineralImpurity),
      metasMensais: dashboardPremise.monthlyGoals || dashboardPremise.rawData?.metasMensais || {},
    });
  }

  return defaultPremissas();
}

export async function getColheitaPostgresFilterOptions(companyId) {
  const data = await loadDashboardData(companyId);
  return {
    safras: Array.from(new Set(data.records.map((r) => r.safra).filter(Boolean))).sort(),
    frentes: Array.from(new Set(data.records.map((r) => String(r.frente || '')).filter(Boolean))).sort((a, b) => Number(a) - Number(b)),
    descricoes: Array.from(new Set(data.records.map((r) => r.descricao).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
  };
}

export async function getColheitaPostgresPremissas(companyId) {
  const data = await loadDashboardData(companyId);
  return defaultPremissas(data.premissas);
}

export async function getColheitaPostgresOperacional(companyId) {
  const operacional = await getDashboardOperacional(companyId);
  return { rotacaoMoenda: 0, estoqueCarretas: 0, ...operacional };
}

export async function getColheitaPostgresAtrDashboard(companyId, filters = {}) {
  const data = await loadDashboardData(companyId);
  const safra = filters.safra && filters.safra !== 'todas' ? String(filters.safra) : '';
  const ini = dateKey(filters.dataInicio);
  const fim = dateKey(filters.dataFim);
  const filter = (r) => (!safra || String(r.safra) === safra) && (!ini || r.data >= ini) && (!fim || r.data <= fim);
  const atrFarm = data.atrFarm.filter(filter);
  const latestDate = atrFarm.map((r) => r.data).filter(Boolean).sort().pop();
  const atrFazendaData = (latestDate ? atrFarm.filter((r) => r.data === latestDate) : atrFarm).filter((r) => r.atr > 0).sort((a, b) => String(a.fazenda).localeCompare(String(b.fazenda), 'pt-BR', { numeric: true }));
  const atrMensal = data.atrMonthly.filter(filter);
  const latest = atrMensal.slice().sort((a, b) => String(b.data).localeCompare(String(a.data)))[0];
  const monthly = new Map();
  atrMensal.forEach((r) => { const mes = monthLabelFromDate(r.data); if (mes) monthly.set(mes, { mes, atr: r.atr, acumulado: r.acumulado, data: r.data }); });
  return { atrFazendaData, atrDiaAnterior: latest?.atr || 0, atrMensalData: Array.from(monthly.values()), atrReal: latest?.acumulado || latest?.atr || 0 };
}


function minutesFromHHMM(value) {
  const m = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return h * 60 + min;
}

function addDaysISO(dk, days) {
  if (!dk) return '';
  const d = new Date(`${dk}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayISOInBrazil() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function stoppageMinutes(row = {}) {
  const ini = minutesFromHHMM(row.horaInicio);
  const fim = minutesFromHHMM(row.horaFim);
  if (ini === null || fim === null) return 0;
  let diff = fim - ini;
  if (diff < 0) diff += 24 * 60;
  return Math.max(0, diff);
}

function splitStoppageByDay(row = {}) {
  const data = dateKey(row.data);
  const ini = minutesFromHHMM(row.horaInicio);
  const fim = minutesFromHHMM(row.horaFim);
  if (!data || ini === null || fim === null) return [];
  if (fim > ini) return [{ data, minutos: fim - ini }];
  if (fim === ini) return [];
  const nextDay = addDaysISO(data, 1);
  return [
    { data, minutos: 1440 - ini },
    { data: nextDay, minutos: fim },
  ].filter((item) => item.data && item.minutos > 0);
}

function absoluteMinuteFromDateTime(data, minutoDoDia = 0) {
  const dk = dateKey(data);
  if (!dk) return null;
  const d = new Date(`${dk}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor(d.getTime() / 60000) + Math.max(0, Number(minutoDoDia || 0));
}

function absoluteMinuteFromRecord(row = {}) {
  const dk = dateKey(row.data);
  if (!dk) return null;
  const minuto = minutesFromHHMM(row.hora) ?? minutesFromHHMM(row.horario) ?? minutesFromHHMM(row.createdAt) ?? 0;
  return absoluteMinuteFromDateTime(dk, minuto);
}


function getBrazilNowParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(new Date()).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour || 0),
    minute: Number(parts.minute || 0),
    second: Number(parts.second || 0),
  };
}

function elapsedEffectiveHoursForDate(selectedDate, stoppages = []) {
  const now = getBrazilNowParts();
  let elapsedMinutes = 1;

  if (selectedDate === now.date) {
    elapsedMinutes = Math.min(1440, Math.max(1, (now.hour * 60) + now.minute + (now.second / 60)));
  } else if (selectedDate && selectedDate < now.date) {
    elapsedMinutes = 1440;
  }

  let stoppedMinutes = 0;
  (Array.isArray(stoppages) ? stoppages : []).forEach((row) => {
    splitStoppageByDay(row).forEach((parte) => {
      if (parte.data !== selectedDate) return;
      const inicio = minutesFromHHMM(row.horaInicio) ?? 0;
      const parteInicio = row.data && dateKey(row.data) !== selectedDate ? 0 : inicio;
      const parteFim = Math.min(elapsedMinutes, parteInicio + Number(parte.minutos || 0));
      if (parteFim > parteInicio) stoppedMinutes += parteFim - parteInicio;
    });
  });

  return Math.max(0.01, (elapsedMinutes - stoppedMinutes) / 60);
}

function stoppageAccumulatedStats(rows = [], records = []) {
  // Card acumulado: calcula o índice entre a primeira entrada de cana e a última entrada carregada.
  // Base do percentual = minutos disponíveis desse intervalo real, não somente o dia selecionado.
  const recordMinutes = records
    .map((r) => absoluteMinuteFromRecord(r))
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);

  const firstMinute = recordMinutes[0] ?? null;
  const lastMinute = recordMinutes[recordMinutes.length - 1] ?? null;
  const datasEntrada = records.map((r) => dateKey(r.data)).filter(Boolean).sort();
  const dataInicio = datasEntrada[0] || '';
  const dataFim = datasEntrada[datasEntrada.length - 1] || '';
  const minutos = { industria: 0, agricola: 0 };
  const paradasPeriodo = [];

  if (!dataInicio || !dataFim || firstMinute === null || lastMinute === null) {
    return {
      dataInicio,
      dataFim,
      diasPeriodo: 0,
      paradaIndustriaAcumuladaPercentual: 0,
      paradaAgricolaAcumuladaPercentual: 0,
      paradaIndustriaAcumuladaMinutos: 0,
      paradaAgricolaAcumuladaMinutos: 0,
      paradaAcumuladaTotalMinutos: 0,
      paradas: [],
    };
  }

  rows.forEach((row) => {
    const tipo = normText(row.tipo).includes('agric') || normText(row.tipo).includes('campo') ? 'agricola' : 'industria';
    let minutosNoPeriodo = 0;

    splitStoppageByDay(row).forEach((parte) => {
      const parteInicio = absoluteMinuteFromDateTime(parte.data, 0);
      const parteFim = parteInicio === null ? null : parteInicio + parte.minutos;
      if (parteInicio === null || parteFim === null) return;

      const inicioCortado = Math.max(parteInicio, firstMinute);
      const fimCortado = Math.min(parteFim, Math.max(lastMinute, firstMinute + 1));
      if (fimCortado > inicioCortado) minutosNoPeriodo += fimCortado - inicioCortado;
    });

    if (minutosNoPeriodo > 0) {
      minutos[tipo] += minutosNoPeriodo;
      paradasPeriodo.push({ ...row, minutos: minutosNoPeriodo });
    }
  });

  const diasPeriodo = Math.max(1, Math.round((new Date(`${dataFim}T12:00:00`).getTime() - new Date(`${dataInicio}T12:00:00`).getTime()) / 86400000) + 1);
  const baseMin = Math.max(1, lastMinute - firstMinute);
  const totalMin = minutos.industria + minutos.agricola;

  return {
    dataInicio,
    dataFim,
    diasPeriodo,
    paradaIndustriaAcumuladaPercentual: (minutos.industria / baseMin) * 100,
    paradaAgricolaAcumuladaPercentual: (minutos.agricola / baseMin) * 100,
    paradaIndustriaAcumuladaMinutos: minutos.industria,
    paradaAgricolaAcumuladaMinutos: minutos.agricola,
    paradaAcumuladaTotalMinutos: totalMin,
    paradas: paradasPeriodo,
  };
}

function selectedDashboardDate(filters = {}, records = []) {
  return dateKey(filters.dataFim) || dateKey(filters.dataInicio) || records.map((r) => dateKey(r.data)).filter(Boolean).sort().pop() || todayISOInBrazil();
}

function stoppageStats(rows = [], filters = {}, records = []) {
  // Igual produção: os cards de % parada usam somente o dia selecionado/base, não o acumulado inteiro.
  const selectedDate = selectedDashboardDate(filters, records);
  const minutos = { industria: 0, agricola: 0 };
  const paradasDoDia = [];

  rows.forEach((row) => {
    const tipo = normText(row.tipo).includes('agric') || normText(row.tipo).includes('campo') ? 'agricola' : 'industria';
    let minutosNoDia = 0;
    splitStoppageByDay(row).forEach((parte) => {
      if (parte.data === selectedDate) minutosNoDia += parte.minutos;
    });
    if (minutosNoDia > 0) {
      minutos[tipo] += minutosNoDia;
      paradasDoDia.push({ ...row, minutos: minutosNoDia });
    }
  });

  const totalMin = minutos.industria + minutos.agricola;
  const baseMin = 24 * 60;
  return {
    data: selectedDate,
    paradas: paradasDoDia,
    paradaTotalMinutos: totalMin,
    paradaIndustriaMinutos: minutos.industria,
    paradaAgricolaMinutos: minutos.agricola,
    paradaIndustriaPercentual: baseMin ? (minutos.industria / baseMin) * 100 : 0,
    paradaAgricolaPercentual: baseMin ? (minutos.agricola / baseMin) * 100 : 0,
  };
}

export async function getColheitaPostgresSummary(companyId, filters = {}) {
  const data = await loadDashboardData(companyId);
  const premissas = defaultPremissas(data.premissas);
  const operacional = { rotacaoMoenda: 0, estoqueCarretas: 0, ...data.operacional };
  const recordsAll = data.records;
  // Igual produção: quando o usuário não informa período manual, o Dashboard usa
  // dataInicioSafra/dataFimSafra salvos em Premissas > Colheita.
  const filtrosPeriodoPremissas = {
    ...filters,
    dataInicio: filters.dataInicio || premissas.dataInicioSafra || '',
    dataFim: filters.dataFim || premissas.dataFimSafra || '',
  };
  const filtersSemPeriodo = { ...filters, dataInicio: '', dataFim: '' };
  const recordsSemPeriodo = applyBaseFilters(recordsAll, filtersSemPeriodo);
  const records = applyBaseFilters(recordsAll, filtrosPeriodoPremissas);
  const impurities = applyBaseFilters(data.impurities, filtrosPeriodoPremissas);
  const atrFarm = applyBaseFilters(data.atrFarm, filtrosPeriodoPremissas);
  const atrMonthly = applyBaseFilters(data.atrMonthly, filtrosPeriodoPremissas);
  const shifts = applyBaseFilters(data.shifts, filtrosPeriodoPremissas);
  const brocaFiltered = applyBaseFilters(data.broca || [], filtrosPeriodoPremissas);
  const paradaStats = stoppageStats(data.stoppages, filters, recordsAll);
  const paradaAcumuladaStats = stoppageAccumulatedStats(data.stoppages, records);

  const latestDate = records.map((r) => r.data).filter(Boolean).sort().pop() || todayISOInBrazil();
  const todayBR = todayISOInBrazil();
  const currentDate = dateKey(filters.dataFim) || dateKey(filters.dataInicio) || (records.some((r) => r.data === todayBR) ? todayBR : latestDate);
  const yesterday = (() => { const d = new Date(`${currentDate}T12:00:00`); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();

  const totalRealizado = records.reduce((s, r) => s + num(r.entrega), 0);
  const registrosHoje = records.filter((r) => r.data === currentDate);
  const realizadoDia = registrosHoje.reduce((s, r) => s + num(r.entrega), 0);
  const horaEfetivaAtual = elapsedEffectiveHoursForDate(currentDate, data.stoppages);
  const moagemPrevistaDia24h = horaEfetivaAtual > 0 ? (realizadoDia / horaEfetivaAtual) * 24 : 0;
  const moagemDiaAnterior = recordsAll.filter((r) => r.data === yesterday).reduce((s, r) => s + num(r.entrega), 0);

  const hourMap = new Map();
  for (let h = 0; h < 24; h += 1) hourMap.set(`${String(h).padStart(2, '0')}:00`, { hora: `${String(h).padStart(2, '0')}:00`, realizado: 0, meta: premissas.metaHora || 0 });
  registrosHoje.forEach((r) => { const k = hourKey(r.hora); const row = hourMap.get(k) || { hora: k, realizado: 0, meta: premissas.metaHora || 0 }; row.realizado += num(r.entrega); hourMap.set(k, row); });
  const hourlyData = Array.from(hourMap.values());
  const realizadoUltimaHora = hourlyData.slice().reverse().find((r) => r.realizado > 0)?.realizado || 0;

  const monthlyMap = new Map();
  const metasMensais = normalizeMonthlyTargets(premissas.metasMensais, premissas.metaMes, premissas.atr, premissas.broca);
  MONTHS.forEach((mes, i) => monthlyMap.set(mes, { mes, entrada: 0, meta: num(metasMensais?.[MONTH_KEYS[i]]?.metaMes), atr: 0, atrMeta: num(metasMensais?.[MONTH_KEYS[i]]?.atr), broca: 0, brocaMeta: num(metasMensais?.[MONTH_KEYS[i]]?.broca), vegetal: 0, mineral: 0 }));
  records.forEach((r) => {
    const mes = monthLabelFromDate(r.data);
    if (!mes) return;
    const row = monthlyMap.get(mes);
    row.entrada += num(r.entrega);
    if (!row.meta) row.meta = num(r.metaPeriodo);
  });
  const impurityAgg = new Map();
  impurities.forEach((r) => {
    const mes = monthLabelFromDate(r.data);
    if (!mes || !monthlyMap.has(mes)) return;
    const agg = impurityAgg.get(mes) || { vegetalSum: 0, vegetalCount: 0, mineralSum: 0, mineralCount: 0 };
    const vegetal = num(r.impurezaVegetal, NaN);
    const mineral = num(r.impurezaMineral, NaN);
    if (Number.isFinite(vegetal)) { agg.vegetalSum += vegetal; agg.vegetalCount += 1; }
    if (Number.isFinite(mineral)) { agg.mineralSum += mineral; agg.mineralCount += 1; }
    impurityAgg.set(mes, agg);
  });
  impurityAgg.forEach((agg, mes) => {
    const row = monthlyMap.get(mes);
    row.vegetal = agg.vegetalCount ? agg.vegetalSum / agg.vegetalCount : 0;
    row.mineral = agg.mineralCount ? agg.mineralSum / agg.mineralCount : 0;
  });
  const brocaAgg = new Map();
  brocaFiltered.forEach((r) => {
    const mes = monthLabelFromDate(r.data);
    if (!mes || !monthlyMap.has(mes)) return;
    const agg = brocaAgg.get(mes) || { entreBrSum: 0, entreExaSum: 0 };
    agg.entreBrSum += num(r.entreBr);
    agg.entreExaSum += num(r.entreExa);
    brocaAgg.set(mes, agg);
  });
  brocaAgg.forEach((agg, mes) => {
    const row = monthlyMap.get(mes);
    row.broca = agg.entreExaSum > 0 ? (agg.entreBrSum / agg.entreExaSum) * 100 : 0;
  });
  atrMonthly.forEach((r) => { const mes = monthLabelFromDate(r.data); const row = monthlyMap.get(mes); if (!row) return; row.atrDia = num(r.atr); row.acumulado = num(r.acumulado); row.atr = num(r.acumulado) || num(r.atr); });
  const monthlyData = Array.from(monthlyMap.values());
  const totalMetaMensal = monthlyData.reduce((s, r) => s + num(r.meta), 0);
  const selectedMonthIndex = new Date(`${currentDate}T12:00:00`).getMonth();
  const selectedMonthKey = MONTH_KEYS[selectedMonthIndex];
  const selectedMonthTargets = selectedMonthKey ? (metasMensais?.[selectedMonthKey] || { metaMes: 0, atr: 0, broca: 0 }) : { metaMes: 0, atr: 0, broca: 0 };
  const currentMonthEntry = monthlyData[selectedMonthIndex] || null;

  const fronts = Array.from(new Set(records.map((r) => String(r.frente || '')).filter(Boolean))).sort((a, b) => Number(a) - Number(b));
  const frontConfigs = fronts.map((frente, index) => ({ key: frontKey(frente), frente, label: `F - ${frente}`, fill: paletteForIndex(index) }));
  const frontVolumeData = frontConfigs.map((f) => ({ ...f, total: records.filter((r) => String(r.frente) === String(f.frente)).reduce((s, r) => s + num(r.entrega), 0) }));

  const densidadeDataReferencia = dateKey(filters.dataFim) || dateKey(filters.dataInicio) || todayISOInBrazil();
  const registrosDensidadeDia = recordsSemPeriodo.filter((r) => r.data === densidadeDataReferencia);
  const frentesDensidadeDia = Array.from(new Set(registrosDensidadeDia.map((r) => String(r.frente || '')).filter(Boolean))).sort((a, b) => Number(a) - Number(b));
  const densidadeFrenteData = frentesDensidadeDia.map((frente, index) => {
    const rows = registrosDensidadeDia
      .filter((r) => String(r.frente) === String(frente) && num(r.entrega) > 0)
      .sort((a, b) => registroSortKey(b).localeCompare(registroSortKey(a)))
      .slice(0, 4);
    const densidade = rows.length ? rows.reduce((s, r) => s + num(r.entrega), 0) / rows.length : 0;
    return { frente: `F - ${frente}`, frenteOriginal: frente, densidade, quantidade: rows.length, fill: paletteForIndex(index), key: frontKey(frente), data: densidadeDataReferencia };
  }).filter((r) => r.quantidade > 0);

  const selectedShiftDate = dateKey(filters.dataFim) || dateKey(filters.dataInicio) || shifts.map((r) => r.data).filter(Boolean).sort().pop();
  const shiftRowsForDate = selectedShiftDate ? shifts.filter((r) => r.data === selectedShiftDate) : shifts;
  const impurezaMineralTurnoData = shiftRowsForDate.filter((r) => r.tipo === 'mineral').map((r) => ({ frente: r.frenteLabel || `F - ${r.frente}`, frenteOriginal: r.frente, turnoA: r.turnoA, turnoB: r.turnoB, turnoC: r.turnoC, data: r.data, safra: r.safra }));
  const impurezaVegetalTurnoData = shiftRowsForDate.filter((r) => r.tipo === 'vegetal').map((r) => ({ frente: r.frenteLabel || `F - ${r.frente}`, frenteOriginal: r.frente, turnoA: r.turnoA, turnoB: r.turnoB, turnoC: r.turnoC, data: r.data, safra: r.safra }));

  const latestAtrMonthly = atrMonthly.slice().sort((a, b) => String(b.data).localeCompare(String(a.data)))[0];
  const latestAtrFarmDate = atrFarm.map((r) => r.data).filter(Boolean).sort().pop();
  const atrFazendaData = (latestAtrFarmDate ? atrFarm.filter((r) => r.data === latestAtrFarmDate) : atrFarm).filter((r) => r.atr > 0).sort((a, b) => String(a.fazenda).localeCompare(String(b.fazenda), 'pt-BR', { numeric: true }));

  const weekStart = new Date(`${currentDate}T12:00:00`); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
  const weekDays = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
  const weeklyFrontData = weekDays.map((dia, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); const row = { dia, data: d.toISOString().slice(0, 10) }; frontConfigs.forEach((f) => { row[f.key] = 0; }); return row; });
  records.forEach((r) => { const idx = weeklyFrontData.findIndex((d) => d.data === r.data); if (idx >= 0) weeklyFrontData[idx][frontKey(r.frente)] = (weeklyFrontData[idx][frontKey(r.frente)] || 0) + num(r.entrega); });
  const weeklyTotal = weeklyFrontData.reduce((s, row) => s + frontConfigs.reduce((a, f) => a + num(row[f.key]), 0), 0);

  // Card "Densidade Média" da Moagem Horária Efetiva:
  // média simples da coluna Entrega somente do dia selecionado/base.
  const densidadeMedia = calculateDensidadeMediaDia(registrosHoje);

  // Igual produção: gráfico Moagem Dia a Dia soma entrega por dia no mês selecionado/base.
  const [currentYear, currentMonth] = String(currentDate || todayISOInBrazil()).split('-').map(Number);
  const monthKey = `${String(currentYear).padStart(4, '0')}-${String(currentMonth).padStart(2, '0')}`;
  const lastDay = new Date(currentYear, currentMonth, 0).getDate();
  const dailyTotals = new Map();
  records.forEach((r) => {
    const dk = dateKey(r.data);
    if (!dk || !dk.startsWith(monthKey)) return;
    const entrega = num(r.entrega);
    if (!Number.isFinite(entrega) || entrega <= 0) return;
    dailyTotals.set(dk, (dailyTotals.get(dk) || 0) + entrega);
  });
  const moagemDiaDiaData = Array.from({ length: lastDay }, (_, index) => {
    const day = index + 1;
    const dataDia = `${monthKey}-${String(day).padStart(2, '0')}`;
    return {
      data: dataDia,
      dia: String(day).padStart(2, '0'),
      quinzena: day <= 15 ? '1ª quinzena' : '2ª quinzena',
      moagem: dailyTotals.get(dataDia) || 0,
    };
  });

  return {
    densidadeMedia,
    moagemDiaAnterior,
    densidadeMediaUltimasCargas: densidadeMedia,
    realizadoDiaAnterior: moagemDiaAnterior,
    cards: {
      moagemPrevista: num(premissas.moagemPrevista) || num(selectedMonthTargets.metaMes) || totalMetaMensal,
      moagemRealizada: totalRealizado,
      saldoMoagem: (num(premissas.moagemPrevista) || num(selectedMonthTargets.metaMes) || totalMetaMensal) - totalRealizado,
      atrReal: num(latestAtrMonthly?.acumulado) || num(latestAtrMonthly?.atr) || num(selectedMonthTargets.atr) || num(premissas.atr),
      atrDiaAnterior: num(latestAtrMonthly?.atr),
      brocaReal: num(currentMonthEntry?.broca) || num(selectedMonthTargets.broca) || num(premissas.broca),
      metaDia: num(premissas.metaDia),
      metaHora: num(premissas.metaHora),
      realizadoDia,
      horaEfetivaAtual,
      moagemPrevistaDia24h,
      realizadoUltimaHora,
      moagemDiaAnterior,
      realizadoDiaAnterior: moagemDiaAnterior,
      densidadeMedia,
      densidadeMediaUltimasCargas: densidadeMedia,
      saldoDia: num(premissas.metaDia) - realizadoDia,
      metaAcumulada: totalMetaMensal,
      saldoMensal: totalMetaMensal - totalRealizado,
      metaSemana: num(premissas.metaSemana) || num(premissas.metaDia) * 7,
      realizadoSemana: weeklyTotal,
      saldoSemana: (num(premissas.metaSemana) || num(premissas.metaDia) * 7) - weeklyTotal,
      metaReprojetada: num(premissas.metaReprojetada),
      metaReprojetadaSemana: num(premissas.metaReprojetada),
      atrMetaMesAtual: num(selectedMonthTargets.atr) || num(premissas.atr),
      brocaMetaMesAtual: num(selectedMonthTargets.broca) || num(premissas.broca),
      metaMesAtual: num(selectedMonthTargets.metaMes) || num(premissas.metaMes),
      rotacaoMoenda: num(operacional.rotacaoMoenda),
      estoqueCarretas: num(operacional.estoqueCarretas),
      paradaIndustriaPercentual: paradaStats.paradaIndustriaPercentual,
      paradaAgricolaPercentual: paradaStats.paradaAgricolaPercentual,
      paradaIndustriaMinutos: paradaStats.paradaIndustriaMinutos,
      paradaAgricolaMinutos: paradaStats.paradaAgricolaMinutos,
      paradaTotalMinutos: paradaStats.paradaTotalMinutos,
      paradaIndustriaAcumuladaPercentual: paradaAcumuladaStats.paradaIndustriaAcumuladaPercentual,
      paradaAgricolaAcumuladaPercentual: paradaAcumuladaStats.paradaAgricolaAcumuladaPercentual,
      paradaIndustriaAcumuladaMinutos: paradaAcumuladaStats.paradaIndustriaAcumuladaMinutos,
      paradaAgricolaAcumuladaMinutos: paradaAcumuladaStats.paradaAgricolaAcumuladaMinutos,
      paradaAcumuladaTotalMinutos: paradaAcumuladaStats.paradaAcumuladaTotalMinutos,
      paradaAcumuladaDataInicio: paradaAcumuladaStats.dataInicio,
      paradaAcumuladaDataFim: paradaAcumuladaStats.dataFim,
      paradaAcumuladaDiasPeriodo: paradaAcumuladaStats.diasPeriodo,
    },
    premissas: { ...premissas, metasMensais },
    hourlyData,
    monthlyData,
    moagemDiaDiaData,
    atrFazendaData,
    weeklyFrontData,
    frontMonthlyData: frontVolumeData,
    frontVolumeData,
    densidadeFrenteData,
    impurezaMineralTurnoData,
    impurezaVegetalTurnoData,
    frontTotals: frontVolumeData,
    paradasData: paradaStats.paradas,
    paradasDashboard: paradaStats,
    paradaStats,
    paradaAcumuladaStats,
    frontConfigs,
    weekRange: { start: weekStart.toISOString().slice(0, 10), end: weekEnd.toISOString().slice(0, 10), label: `Semana de ${formatBR(weekStart.toISOString().slice(0, 10))} a ${formatBR(weekEnd.toISOString().slice(0, 10))}` },
    currentMonthLabel: MONTHS[new Date(`${currentDate}T12:00:00`).getMonth()] || '',
    totalRegistros: records.length,
  };
}


export async function getColheitaPostgresParadas(companyId, filters = {}) {
  const data = await loadDashboardData(companyId);
  const selectedDate = dateKey(filters.data);
  const rows = data.stoppages.filter((row) => !selectedDate || dateKey(row.data) === selectedDate);
  return rows.sort((a, b) => String(a.horaInicio || '').localeCompare(String(b.horaInicio || '')));
}

export async function saveColheitaPostgresParada(companyId, payload = {}) {
  const candidates = await companyCandidates(companyId);
  const companyCode = candidates.includes('usinacacu') ? 'usinacacu' : candidates.includes('agro-system') ? 'agro-system' : String(companyId || '');
  const data = dateKey(payload.data) || new Date().toISOString().slice(0, 10);
  const tipo = String(payload.tipo || 'industria').trim().toLowerCase();
  const horaInicio = String(payload.horaInicio || '').trim();
  const horaFim = String(payload.horaFim || '').trim();
  const id = payload.id || `${companyCode}_${data}_${tipo}_${horaInicio.replace(/\D/g, '')}_${horaFim.replace(/\D/g, '')}_${Date.now()}`;
  const rawData = { ...payload, id, companyId: companyCode, data, tipo, horaInicio, horaFim, observacao: payload.observacao || '' };
  const saved = await prisma.dashboardColheitaParada.upsert({
    where: { id },
    update: {
      companyId: companyCode,
      companyCode,
      date: data ? new Date(`${data}T12:00:00`) : null,
      type: tipo,
      startTime: horaInicio,
      endTime: horaFim,
      observation: payload.observacao || '',
      rawData,
    },
    create: {
      id,
      companyId: companyCode,
      companyCode,
      date: data ? new Date(`${data}T12:00:00`) : null,
      type: tipo,
      startTime: horaInicio,
      endTime: horaFim,
      observation: payload.observacao || '',
      rawData,
    },
  });
  return { ...(saved.rawData || rawData), id: saved.id, companyId: saved.companyCode || saved.companyId };
}
