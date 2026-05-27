
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { apiRequest, apiDownloadBlob } from './apiClient';
import { postgresReadService, usePostgresReads } from './postgresReadService';


const DASHBOARD_REGISTROS_COLLECTION = 'dashboard_colheita_registros';
const DASHBOARD_ATR_FAZENDA_COLLECTION = 'dashboard_colheita_atr_fazenda';
const DASHBOARD_ATR_MENSAL_COLLECTION = 'dashboard_colheita_atr_mensal';
const DASHBOARD_IMPUREZA_MINERAL_TURNO_COLLECTION = 'dashboard_colheita_impureza_mineral_turno';
const DASHBOARD_IMPUREZA_VEGETAL_TURNO_COLLECTION = 'dashboard_colheita_impureza_vegetal_turno';
const DASHBOARD_PARADAS_COLLECTION = 'dashboard_colheita_paradas';
const DASHBOARD_FECHAMENTO_OC_COLLECTION = 'dashboard_fechamento_oc_registros';
function getImpurezaTurnoCollection(tipo) {
  return tipo === 'vegetal' ? DASHBOARD_IMPUREZA_VEGETAL_TURNO_COLLECTION : DASHBOARD_IMPUREZA_MINERAL_TURNO_COLLECTION;
}
const BRAZIL_TIME_ZONE = 'America/Sao_Paulo';

function normalizeDateKey(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') {
    const br = excelDateToString(value);
    const [d, m, y] = br.split('/');
    return y && m && d ? `${y}-${m}-${d}` : '';
  }
  const str = String(value).trim();
  let match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  return '';
}

function todayISOInBrazil() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BRAZIL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date()).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function previousDateISO(dateISO) {
  const key = normalizeDateKey(dateISO);
  if (!key) return '';
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getRegistroDateKey(item = {}) {
  return normalizeDateKey(item?.data ?? item?.Data ?? item?.date);
}

function getRegistroEntrega(item = {}) {
  return normalizeNumber(
    item?.entrega
    ?? item?.Entrega
    ?? item?.total
    ?? item?.Total
    ?? item?.TOTAL
    ?? item?.['Total']
    ?? item?.['Entrega']
    ?? item?.entrada
    ?? item?.Entrada
    ?? item?.moagem
    ?? item?.Moagem
  );
}

async function calculateMoagemDiaAnteriorLegacy() { throw new Error('Rotina legada removida. Use API PostgreSQL.'); }


async function calculateAtrDiaAnteriorLegacy() { throw new Error('Rotina legada removida. Use API PostgreSQL.'); }
function normalizeFilterValue(value) {
  const str = String(value ?? '').trim();
  return !str || str.toLowerCase() === 'todas' || str.toLowerCase() === 'todos' ? '' : str;
}

function getRegistroFrente(item = {}) {
  return String(
    item?.frente
    ?? item?.Frente
    ?? item?.frenteServico
    ?? item?.frenteServiço
    ?? item?.frenteDeServico
    ?? item?.frenteDeServiço
    ?? item?.['Frente de Serviço']
    ?? item?.['Frente Serviço']
    ?? item?.FRENTE
    ?? ''
  ).trim();
}

function getRegistroDescricao(item = {}) {
  return String(item?.descricao ?? item?.Descrição ?? item?.descricaoFrente ?? '').trim();
}

function getRegistroSafra(item = {}) {
  return String(item?.safra ?? item?.Safra ?? '').trim();
}

function getRegistroDensidade(item = {}) {
  return normalizeNumber(
    item?.densidadeMedia
    ?? item?.densidade
    ?? item?.densidadeCarga
    ?? item?.mediaEntrega
    ?? item?.['Densidade Média']
    ?? item?.['Densidade']
    ?? item?.['Densid. (t/cam)']
    ?? item?.['Media Entrega']
  );
}

function getRegistroHoraKey(item = {}) {
  const hora = normalizeHour(item?.hora ?? item?.Hora ?? item?.hour ?? '00:00');
  const match = String(hora || '').match(/^(\d{1,2}):(\d{2})/);
  return match ? `${String(match[1]).padStart(2, '0')}:${match[2]}` : '00:00';
}

function getRegistroDateTimeSortKey(item = {}) {
  return `${getRegistroDateKey(item) || '0000-00-00'}T${getRegistroHoraKey(item)}`;
}

async function calculateDensidadePorFrenteLegacy() { throw new Error('Rotina legada removida. Use API PostgreSQL.'); }

async function calculateImpurezaTurnoLegacy() { throw new Error('Rotina legada removida. Use API PostgreSQL.'); }

async function calculateDensidadeMediaDiaEntregaLegacy() { throw new Error('Rotina legada removida. Use API PostgreSQL.'); }

function minutesFromHour(value) {
  const str = String(value || '').trim();
  const match = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const h = Math.min(23, Math.max(0, Number(match[1])));
  const m = Math.min(59, Math.max(0, Number(match[2])));
  return h * 60 + m;
}

function dateAddDaysISO(dateISO, days) {
  const key = normalizeDateKey(dateISO);
  if (!key) return '';
  const [year, month, day] = key.split('-').map(Number);
  const d = new Date(year, month - 1, day, 12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateBRFromISO(dateISO) {
  const key = normalizeDateKey(dateISO);
  if (!key) return '';
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
}

function splitParadaByDay(row = {}) {
  const data = normalizeDateKey(row.data);
  const inicio = minutesFromHour(row.horaInicio);
  const fim = minutesFromHour(row.horaFim);
  if (!data || inicio === null || fim === null) return [];
  if (fim > inicio) return [{ data, minutos: fim - inicio }];
  if (fim === inicio) return [];
  const nextDay = dateAddDaysISO(data, 1);
  return [
    { data, minutos: 1440 - inicio },
    { data: nextDay, minutos: fim }
  ].filter((item) => item.data && item.minutos > 0);
}

async function calculateParadasDashboardLegacy() { throw new Error('Rotina legada removida. Use API PostgreSQL.'); }

async function calculateMoagemDiaDiaLegacy() { throw new Error('Rotina legada removida. Use API PostgreSQL.'); }

export const COLHEITA_TEMPLATE_HEADERS = [
  'Data',
  'Hora',
  'Safra',
  'Frente',
  'Descrição',
  'Media Meta',
  'Meta Periodo',
  'Media Entrega',
  'Entrega',
  'Diferença',
  'Entregue %'
];
export const IMPUREZAS_TEMPLATE_HEADERS = ['Safra', 'Data', 'Hora', 'Imp. Mineral', 'Imp. Vegetal'];
export const ATR_FAZENDA_TEMPLATE_HEADERS = ['Safra', 'Data', 'Fundo Agrícola', 'ATR'];
export const ATR_MENSAL_TEMPLATE_HEADERS = ['Safra', 'Data', 'ATR', 'Acumulado'];
export const IMPUREZA_TURNO_TEMPLATE_HEADERS = ['Data', 'Safra', 'Frente', 'Turno A', 'Turno B', 'Turno C'];
export const FECHAMENTO_OC_TEMPLATE_HEADERS = ['Fazenda','Vazio','Quadra','Vazio 1','Parte','Estágio','Variedade','Espac.','Plantio','DM','Liberada','Cortada','T/Ha Prev.','Prod. Prev.','T/Ha Real.','Prod. Real','Var. %','Atr','Atr/Ha Real.','Abertura','Encerramento','Idade','Tempo','Cortes'];

export const BROCA_TEMPLATE_HEADERS = [
  'Safra',
  'Propriedade',
  'vazio',
  'Fazenda',
  'Talhão',
  'Vazio 1',
  'Área Pla',
  'Variedade',
  'Data',
  'Seq.',
  'Corte',
  'Tip Corte',
  'Cana Ex',
  'Cana Br',
  '%',
  'Entre Exa',
  'Entre Br',
  '%2',
  'An Crt'
];

export function downloadColheitaTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    COLHEITA_TEMPLATE_HEADERS,
    ['15/04/2026', '12:54', '2026', '0', 'FRENTE NÃO CONFIGURADA', 0, 0, 113, 68, 68, '0%']
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Modelo');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([out], { type: 'application/octet-stream' }), 'modelo-dashboard-colheita.xlsx');
}

export function downloadImpurezasTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    IMPUREZAS_TEMPLATE_HEADERS,
    ['2026', '15/04/2026', '12:54', 1.5, 6.4]
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Modelo Impurezas');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([out], { type: 'application/octet-stream' }), 'modelo-dashboard-impurezas.xlsx');
}


export function downloadAtrFazendaTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ATR_FAZENDA_TEMPLATE_HEADERS,
    ['2026', '15/04/2026', 'FAZ PAULO MINEIRO', 126.28]
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Modelo ATR Fazenda');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([out], { type: 'application/octet-stream' }), 'modelo-dashboard-atr-fazenda.xlsx');
}

export function downloadAtrMensalTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ATR_MENSAL_TEMPLATE_HEADERS,
    ['2026', '15/04/2026', 124.15, 126.28]
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Modelo ATR Mensal');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([out], { type: 'application/octet-stream' }), 'modelo-dashboard-atr-mensal.xlsx');
}

export function downloadImpurezaTurnoTemplate(tipo = 'mineral') {
  const titulo = tipo === 'vegetal' ? 'Impureza Vegetal por Frente e Turno' : 'Impureza Mineral por Frente e Turno';
  const ws = XLSX.utils.aoa_to_sheet([
    IMPUREZA_TURNO_TEMPLATE_HEADERS,
    ['15/04/2026', '2026', '1', 2.1, 1.8, 2.4],
    ['15/04/2026', '2026', '2', 1.7, 2.0, 1.9]
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, titulo.slice(0, 31));
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([out], { type: 'application/octet-stream' }), tipo === 'vegetal' ? 'modelo-impureza-vegetal-turno.xlsx' : 'modelo-impureza-mineral-turno.xlsx');
}

export function downloadBrocaTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    BROCA_TEMPLATE_HEADERS,
    ['2026', 'Fazenda Modelo', '', 'Fazenda A', 'T01', '', 12.5, 'RB966928', '15/04/2026', '1', '3', 'MEC', 80, 72, '10%', 150, 18, '12%', '2026']
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Modelo Broca');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([out], { type: 'application/octet-stream' }), 'modelo-dashboard-broca.xlsx');
}

function excelDateToString(serial) {
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400;
  const dateInfo = new Date(utcValue * 1000);
  const day = String(dateInfo.getUTCDate()).padStart(2, '0');
  const month = String(dateInfo.getUTCMonth() + 1).padStart(2, '0');
  const year = dateInfo.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function normalizeDate(value) {
  if (typeof value === 'number') return excelDateToString(value);
  const str = String(value || '').trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y,m,d] = str.split('-');
    return `${d}/${m}/${y}`;
  }
  return str;
}

function normalizeHour(value) {
  if (typeof value === 'number') {
    const totalSeconds = Math.round(value * 24 * 60 * 60);
    const h = String(Math.floor(totalSeconds / 3600) % 24).padStart(2, '0');
    const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    return `${h}:${m}`;
  }
  const str = String(value || '').trim();
  const match = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return str;
  return `${String(match[1]).padStart(2, '0')}:${match[2]}`;
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value;
  const str = String(value).trim().replace('%', '');
  if (!str) return 0;
  const commaIndex = str.lastIndexOf(',');
  const dotIndex = str.lastIndexOf('.');
  let normalized = str;
  if (commaIndex > -1 && dotIndex > -1) {
    normalized = commaIndex > dotIndex
      ? str.replace(/\./g, '').replace(',', '.')
      : str.replace(/,/g, '');
  } else if (commaIndex > -1) {
    normalized = str.replace(',', '.');
  }
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}


function normalizeCompanyKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function getFechamentoOcCompanyKey(item = {}) {
  return normalizeCompanyKey(
    item.companyId ?? item.empresaId ?? item.company_id ?? item.empresa_id ?? item.company ?? item.empresa ?? item.raw?.companyId ?? item.raw?.empresaId
  );
}

function getFechamentoOcField(item = {}, aliases = []) {
  for (const key of aliases) {
    if (item?.[key] !== undefined && item?.[key] !== null && String(item[key]).trim() !== '') return item[key];
    if (item?.raw?.[key] !== undefined && item?.raw?.[key] !== null && String(item.raw[key]).trim() !== '') return item.raw[key];
  }
  return undefined;
}

function normalizeFechamentoOcRecord(item = {}) {
  return {
    ...item,
    companyId: getFechamentoOcField(item, ['companyId','empresaId','company_id','empresa_id']) || item.companyId,
    safra: String(getFechamentoOcField(item, ['safra','Safra','anoSafra','Ano Safra']) || '').trim(),
    fazenda: String(getFechamentoOcField(item, ['fazenda','Fazenda']) || '').trim(),
    quadra: String(getFechamentoOcField(item, ['quadra','Quadra']) || '').trim(),
    variedade: String(getFechamentoOcField(item, ['variedade','Variedade']) || 'Outras').trim(),
    abertura: normalizeDateKey(getFechamentoOcField(item, ['abertura','Abertura'])),
    encerramento: normalizeDateKey(getFechamentoOcField(item, ['encerramento','Encerramento'])),
    cortada: normalizeNumber(getFechamentoOcField(item, ['cortada','Cortada'])),
    liberada: normalizeNumber(getFechamentoOcField(item, ['liberada','Liberada'])),
    tHaPrev: normalizeNumber(getFechamentoOcField(item, ['tHaPrev','T/Ha Prev.','T/Ha Prev','tchPrevisto','tchPrev'])),
    prodPrev: normalizeNumber(getFechamentoOcField(item, ['prodPrev','Prod. Prev.','Prod Prev'])),
    tHaReal: normalizeNumber(getFechamentoOcField(item, ['tHaReal','T/Ha Real.','T/Ha Real','tchReal'])),
    prodReal: normalizeNumber(getFechamentoOcField(item, ['prodReal','Prod. Real','Prod Real'])),
    varPercent: normalizeNumber(getFechamentoOcField(item, ['varPercent','Var. %','Var %'])),
    atr: normalizeNumber(getFechamentoOcField(item, ['atr','Atr','ATR'])),
    atrHaReal: normalizeNumber(getFechamentoOcField(item, ['atrHaReal','Atr/Ha Real.','ATR/Ha Real','Atr/Ha Real'])),
    idade: normalizeNumber(getFechamentoOcField(item, ['idade','Idade'])),
    tempo: normalizeNumber(getFechamentoOcField(item, ['tempo','Tempo'])),
    cortes: normalizeNumber(getFechamentoOcField(item, ['cortes','Cortes']))
  };
}

function normalizePercent(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value > 1 ? value / 100 : value;
  const str = String(value).trim();
  if (str.endsWith('%')) return normalizeNumber(str) / 100;
  const num = normalizeNumber(str);
  return num > 1 ? num / 100 : num;
}

function isBlankRow(row = {}) {
  return Object.values(row).every((value) => String(value ?? '').trim() === '');
}


function getFirstValue(row = {}, headers = []) {
  for (const header of headers) {
    if (row[header] !== undefined && row[header] !== null && String(row[header]).trim() !== '') return row[header];
  }
  return '';
}

function assertAnyHeader(headers = [], aliases = [], label = '') {
  const found = aliases.some((alias) => headers.includes(alias));
  if (!found) throw new Error(`Coluna obrigatória ausente: ${label || aliases[0]}`);
}


export async function parseColheitaFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const headers = Object.keys(rows[0] || {});
  const requiredHeaders = COLHEITA_TEMPLATE_HEADERS;
  const missing = requiredHeaders.filter((header) => !headers.includes(header));
  if (missing.length) {
    throw new Error(`Colunas obrigatórias ausentes: ${missing.join(', ')}`);
  }

  return rows.map((row, index) => {
    const item = {
      data: normalizeDate(row['Data']),
      hora: normalizeHour(row['Hora']),
      safra: String(row['Safra'] || '').trim(),
      frente: String(row['Frente'] ?? '').trim(),
      descricao: String(row['Descrição'] || '').trim(),
      mediaMeta: normalizeNumber(row['Media Meta']),
      metaPeriodo: normalizeNumber(row['Meta Periodo']),
      mediaEntrega: normalizeNumber(row['Media Entrega']),
      // A planilha do relatório pode vir com a coluna como "Entrega" ou "Total".
      // O card Densidade Média usa a média diária desse valor salvo em entrega.
      entrega: normalizeNumber(row['Entrega'] ?? row['Total']),
      densidadeMedia: normalizeNumber(row['Entrega'] ?? row['Total'] ?? row['Media Entrega']),
      diferenca: normalizeNumber(row['Diferença']),
      entreguePercentual: normalizePercent(row['Entregue %'])
    };

    if (!item.data || !item.hora || !item.safra) {
      throw new Error(`Linha ${index + 2} inválida. Data, Hora e Safra são obrigatórias.`);
    }
    return item;
  });
}

export async function parseImpurezasFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const headers = Object.keys(rows[0] || {});
  const missing = IMPUREZAS_TEMPLATE_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) {
    throw new Error(`Colunas obrigatórias ausentes: ${missing.join(', ')}`);
  }

  const validRows = rows.filter((row) => !isBlankRow(row));
  if (!validRows.length) throw new Error('A planilha não possui linhas válidas para importação.');

  return validRows.map((row, index) => {
    const item = {
      safra: String(row['Safra'] || '').trim(),
      data: normalizeDate(row['Data']),
      hora: normalizeHour(row['Hora']),
      impurezaMineral: normalizeNumber(row['Imp. Mineral']),
      impurezaVegetal: normalizeNumber(row['Imp. Vegetal'])
    };
    if (!item.safra || !item.data || !item.hora) {
      throw new Error(`Linha ${index + 2} inválida. Safra, Data e Hora são obrigatórias.`);
    }
    return item;
  });
}


function sanitizeDocIdPart(value) {
  return String(value ?? 'sem-valor').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'sem-valor';
}

function shouldUseLegacyPath() { return false; }

async function deleteExistingAtrRows() { return null; }

async function importAtrFazendaRowsLegacy() { throw new Error('Rotina legada removida. Use API PostgreSQL.'); }

async function deleteExistingImpurezaTurnoRows() { return null; }

async function importImpurezaTurnoRowsLegacy() { throw new Error('Rotina legada removida. Use API PostgreSQL.'); }

async function importAtrMensalRowsLegacy() { throw new Error('Rotina legada removida. Use API PostgreSQL.'); }

export async function parseAtrFazendaFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const headers = Object.keys(rows[0] || {});
  assertAnyHeader(headers, ['Safra'], 'Safra');
  assertAnyHeader(headers, ['Data'], 'Data');
  assertAnyHeader(headers, ['Fundo Agrícola', 'Fundo Agricola', 'Fazenda', 'Propriedade'], 'Fundo Agrícola/Fazenda');
  assertAnyHeader(headers, ['ATR', 'Atr'], 'ATR');
  const validRows = rows.filter((row) => !isBlankRow(row));
  if (!validRows.length) throw new Error('A planilha não possui linhas válidas para importação.');
  return validRows.map((row, index) => {
    const item = {
      safra: String(row['Safra'] || '').trim(),
      data: normalizeDate(row['Data']),
      fazenda: String(getFirstValue(row, ['Fundo Agrícola', 'Fundo Agricola', 'Fazenda', 'Propriedade']) || '').trim(),
      fundoAgricola: String(getFirstValue(row, ['Fundo Agrícola', 'Fundo Agricola']) || '').trim(),
      fornecedor: String(row['Fornecedor'] || '').trim(),
      nome: String(row['Nome'] || '').trim(),
      propriedade: String(row['Propriedade'] || '').trim(),
      atr: normalizeNumber(getFirstValue(row, ['ATR', 'Atr'])),
      raw: row
    };
    if (!item.safra || !item.data || !item.fazenda) throw new Error(`Linha ${index + 2} inválida. Safra, Data e Fazenda/Fundo Agrícola são obrigatórias.`);
    return item;
  });
}

export async function parseAtrMensalFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const headers = Object.keys(rows[0] || {});
  const missing = ATR_MENSAL_TEMPLATE_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`Colunas obrigatórias ausentes: ${missing.join(', ')}`);
  const validRows = rows.filter((row) => !isBlankRow(row));
  if (!validRows.length) throw new Error('A planilha não possui linhas válidas para importação.');
  return validRows.map((row, index) => {
    const item = {
      safra: String(row['Safra'] || '').trim(),
      data: normalizeDate(row['Data']),
      atr: normalizeNumber(row['ATR']),
      acumulado: normalizeNumber(row['Acumulado'])
    };
    if (!item.safra || !item.data) throw new Error(`Linha ${index + 2} inválida. Safra e Data são obrigatórias.`);
    return item;
  });
}

export async function parseImpurezaTurnoFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const headers = Object.keys(rows[0] || {});
  const missing = IMPUREZA_TURNO_TEMPLATE_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`Colunas obrigatórias ausentes: ${missing.join(', ')}`);
  const validRows = rows.filter((row) => !isBlankRow(row));
  if (!validRows.length) throw new Error('A planilha não possui linhas válidas para importação.');
  return validRows.map((row, index) => {
    const item = {
      data: normalizeDate(row['Data']),
      safra: String(row['Safra'] || '').trim(),
      frente: String(row['Frente'] || '').trim().replace(/^F\s*-?\s*/i, ''),
      turnoA: normalizeNumber(row['Turno A']),
      turnoB: normalizeNumber(row['Turno B']),
      turnoC: normalizeNumber(row['Turno C'])
    };
    if (!item.data || !item.safra || !item.frente) throw new Error(`Linha ${index + 2} inválida. Data, Safra e Frente são obrigatórias.`);
    return item;
  });
}

export async function parseBrocaFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const headers = Object.keys(rows[0] || {});
  const missing = BROCA_TEMPLATE_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) {
    throw new Error(`Colunas obrigatórias ausentes: ${missing.join(', ')}`);
  }

  const validRows = rows.filter((row) => !isBlankRow(row));
  if (!validRows.length) throw new Error('A planilha não possui linhas válidas para importação.');

  return validRows.map((row, index) => {
    const item = {
      safra: String(row['Safra'] || '').trim(),
      propriedade: String(row['Propriedade'] || '').trim(),
      vazio: String(row['vazio'] || '').trim(),
      fazenda: String(row['Fazenda'] || '').trim(),
      talhao: String(row['Talhão'] || '').trim(),
      vazio1: String(row['Vazio 1'] || '').trim(),
      areaPla: normalizeNumber(row['Área Pla']),
      variedade: String(row['Variedade'] || '').trim(),
      data: normalizeDate(row['Data']),
      seq: String(row['Seq.'] || '').trim(),
      corte: String(row['Corte'] || '').trim(),
      tipCorte: String(row['Tip Corte'] || '').trim(),
      canaEx: normalizeNumber(row['Cana Ex']),
      canaBr: normalizeNumber(row['Cana Br']),
      percentual: normalizePercent(row['%']),
      entreExa: normalizeNumber(row['Entre Exa']),
      entreBr: normalizeNumber(row['Entre Br']),
      percentual2: normalizePercent(row['%2']),
      anCrt: String(row['An Crt'] || '').trim()
    };
    if (!item.safra || !item.data) {
      throw new Error(`Linha ${index + 2} inválida. Safra e Data são obrigatórias.`);
    }
    return item;
  });
}

export async function importColheitaRows(companyId, rows, onProgress = () => {}) {
  const chunkSize = 500;
  const replaceDates = [...new Set((rows || []).map((row) => row.data).filter(Boolean))];
  let processed = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await apiRequest('/api/dados-dashboard/colheita/import-chunk', {
      method: 'POST',
      body: JSON.stringify({
        companyId,
        rows: chunk,
        // Enviado somente no primeiro lote para apagar do banco os registros antigos
        // da mesma empresa e das mesmas datas antes de gravar a nova planilha.
        replaceDates: i === 0 ? replaceDates : []
      })
    });
    processed += chunk.length;
    onProgress({ processed, total: rows.length, percent: Math.round((processed / rows.length) * 100) });
  }

  return { processed: rows.length };
}

export async function importImpurezasRows(companyId, rows, onProgress = () => {}) {
  const chunkSize = 500;
  const replaceDates = [...new Set((rows || []).map((row) => row.data).filter(Boolean))];
  let processed = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await apiRequest('/api/dados-dashboard/colheita/impurezas/import-chunk', {
      method: 'POST',
      body: JSON.stringify({
        companyId,
        rows: chunk,
        // Enviado somente no primeiro lote para apagar do banco os registros antigos
        // da mesma empresa e das mesmas datas antes de gravar a nova planilha.
        replaceDates: i === 0 ? replaceDates : []
      })
    });
    processed += chunk.length;
    onProgress({ processed, total: rows.length, percent: Math.round((processed / rows.length) * 100) });
  }

  return { processed: rows.length };
}


export async function importAtrFazendaRows(companyId, rows, onProgress = () => {}) {
  const chunkSize = 500;
  const replaceDates = [...new Set((rows || []).map((row) => row.data).filter(Boolean))];
  let processed = 0;
  try {
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      await apiRequest('/api/dados-dashboard/colheita/import-chunk', { method: 'POST', body: JSON.stringify({ importType: 'atrFazenda', companyId, rows: chunk, replaceDates: i === 0 ? replaceDates : [] }) });
      processed += chunk.length;
      onProgress({ processed, total: rows.length, percent: Math.round((processed / rows.length) * 100) });
    }
  } catch (error) {
    if (!shouldUseLegacyPath(error)) throw error;
    processed = 0;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      await importAtrFazendaRowsLegacy(companyId, chunk, i === 0 ? replaceDates : []);
      processed += chunk.length;
      onProgress({ processed, total: rows.length, percent: Math.round((processed / rows.length) * 100) });
    }
  }
  return { processed: rows.length };
}

export async function importAtrMensalRows(companyId, rows, onProgress = () => {}) {
  const chunkSize = 500;
  const replaceDates = [...new Set((rows || []).map((row) => row.data).filter(Boolean))];
  let processed = 0;
  try {
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      await apiRequest('/api/dados-dashboard/colheita/import-chunk', { method: 'POST', body: JSON.stringify({ importType: 'atrMensal', companyId, rows: chunk, replaceDates: i === 0 ? replaceDates : [] }) });
      processed += chunk.length;
      onProgress({ processed, total: rows.length, percent: Math.round((processed / rows.length) * 100) });
    }
  } catch (error) {
    if (!shouldUseLegacyPath(error)) throw error;
    processed = 0;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      await importAtrMensalRowsLegacy(companyId, chunk, i === 0 ? replaceDates : []);
      processed += chunk.length;
      onProgress({ processed, total: rows.length, percent: Math.round((processed / rows.length) * 100) });
    }
  }
  return { processed: rows.length };
}

export async function importImpurezaTurnoRows(companyId, tipo, rows, onProgress = () => {}) {
  const chunkSize = 500;
  const normalizedTipo = tipo === 'vegetal' ? 'vegetal' : 'mineral';
  const replaceDates = [...new Set((rows || []).map((row) => row.data).filter(Boolean))];
  let processed = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await apiRequest('/api/dados-dashboard/colheita/import-chunk', {
      method: 'POST',
      body: JSON.stringify({
        importType: 'impurezaTurno',
        tipo: normalizedTipo,
        companyId,
        rows: chunk,
        replaceDates: i === 0 ? replaceDates : []
      })
    });
    processed += chunk.length;
    onProgress({ processed, total: rows.length, percent: Math.round((processed / rows.length) * 100) });
  }

  return { processed: rows.length };
}

export async function importBrocaRows(companyId, rows, onProgress = () => {}) {
  const chunkSize = 500;
  const replaceDates = [...new Set((rows || []).map((row) => row.data).filter(Boolean))];
  let processed = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await apiRequest('/api/dados-dashboard/colheita/broca/import-chunk', {
      method: 'POST',
      body: JSON.stringify({
        companyId,
        rows: chunk,
        // Enviado somente no primeiro lote para apagar do banco os registros antigos
        // da mesma empresa e das mesmas datas antes de gravar a nova planilha.
        replaceDates: i === 0 ? replaceDates : []
      })
    });
    processed += chunk.length;
    onProgress({ processed, total: rows.length, percent: Math.round((processed / rows.length) * 100) });
  }

  return { processed: rows.length };
}


const DASHBOARD_MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function normalizeDashboardFilterValue(value) {
  const str = String(value ?? '').trim();
  return !str || str.toLowerCase() === 'todas' || str.toLowerCase() === 'todos' ? '' : str;
}

function passesAtrDashboardFilters(item = {}, filters = {}) {
  const safraFiltro = normalizeDashboardFilterValue(filters.safra);
  const dataInicio = normalizeDateKey(filters.dataInicio);
  const dataFim = normalizeDateKey(filters.dataFim);
  const itemSafra = String(item.safra ?? item.Safra ?? '').trim();
  const itemData = getRegistroDateKey(item);
  if (safraFiltro && itemSafra !== safraFiltro) return false;
  if (dataInicio && (!itemData || itemData < dataInicio)) return false;
  if (dataFim && (!itemData || itemData > dataFim)) return false;
  return true;
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
      atr: normalizeNumber(item.atr ?? item.ATR ?? item.Atr)
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

function getAtrMonthLabel(item = {}) {
  const dataKey = getRegistroDateKey(item);
  if (!dataKey) return '';
  const month = Number(dataKey.slice(5, 7));
  return DASHBOARD_MONTH_LABELS[month - 1] || '';
}

async function readAtrDashboardDataLegacy() { return null; }

async function readAtrDashboardDataApi(companyId, filters = {}) {
  if (!companyId) return null;
  const queryString = new URLSearchParams({ companyId, ...filters }).toString();
  const result = await apiRequest(`/api/dados-dashboard/colheita/atr-dashboard?${queryString}`);
  const data = result.data || {};
  const atrMensalByMonth = new Map();
  (Array.isArray(data.atrMensalData) ? data.atrMensalData : []).forEach((item) => {
    if (!item?.mes) return;
    atrMensalByMonth.set(item.mes, item);
  });
  return {
    atrFazendaData: filterAtrRowsByLatestDate(Array.isArray(data.atrFazendaData) ? data.atrFazendaData : []).sort(sortAtrFazendaByFundoAgricola),
    atrMensalByMonth,
    atrReal: normalizeNumber(data.atrReal),
    atrDiaAnterior: normalizeNumber(data.atrDiaAnterior)
  };
}

async function readAtrDashboardData(companyId, filters = {}) {
  try {
    return await readAtrDashboardDataApi(companyId, filters);
  } catch (error) {
    console.warn('[Dashboard Colheita] API de ATR indisponível.', error);
    return { monthly: [], farms: [] };
  }
}

function mergeAtrDashboardData(summary = {}, atrData = null) {
  if (!atrData) return summary;
  const monthlyBase = Array.isArray(summary.monthlyData) && summary.monthlyData.length
    ? summary.monthlyData
    : DASHBOARD_MONTH_LABELS.map((mes) => ({ mes, entrada: 0, meta: 0, atr: 0, atrMeta: 0, broca: 0, brocaMeta: 0, vegetal: 0, mineral: 0 }));

  const monthlyData = monthlyBase.map((entry) => {
    const atrEntry = atrData.atrMensalByMonth.get(entry.mes);
    return atrEntry ? { ...entry, atr: atrEntry.atr, acumulado: atrEntry.acumulado } : entry;
  });

  return {
    ...summary,
    monthlyData,
    atrFazendaData: atrData.atrFazendaData,
    cards: {
      ...(summary.cards || {}),
      atrReal: atrData.atrReal || summary.cards?.atrReal || 0,
      atrDiaAnterior: atrData.atrDiaAnterior || summary.cards?.atrDiaAnterior || 0
    }
  };
}

export async function fetchDadosDashboardFilterOptions(companyId) {
  const result = await apiRequest(`/api/dados-dashboard/colheita/filter-options?companyId=${encodeURIComponent(companyId)}`);
  return result.data;
}

export async function fetchColheitaDashboardSummary(companyId, filters = {}) {
  const queryString = new URLSearchParams({ companyId, ...filters }).toString();
  const result = await apiRequest(`/api/dados-dashboard/colheita/summary?${queryString}`);
  return result.data || {};
}

function savePdfBlob(blob) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `dashboard_ctt_entrada_cana_${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

export async function downloadColheitaDashboardPdf(companyId, filters = {}) {
  const queryString = new URLSearchParams({ companyId, ...filters }).toString();
  const blob = await apiDownloadBlob(`/api/dados-dashboard/colheita/ctt-pdf?${queryString}`);
  savePdfBlob(blob);
}

export async function downloadColheitaDashboardRenderedPdf(companyId, filters = {}, sections = []) {
  // POST puro, sem query string. Isso evita cair em rota/fallback errado no Express
  // e mantém companyId/filtros no body protegido pelo token do usuário.
  const blob = await apiDownloadBlob('/api/dados-dashboard/colheita/ctt-pdf-rendered', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, filters, sections })
  });
  savePdfBlob(blob);
}

export async function fetchDashboardColheitaPremissas(companyId) {
  const result = await apiRequest(`/api/dados-dashboard/colheita/premissas?companyId=${encodeURIComponent(companyId)}`);
  return result.data;
}

export async function saveDashboardColheitaPremissas(companyId, payload) {
  const result = await apiRequest('/api/dados-dashboard/colheita/premissas', {
    method: 'POST',
    body: JSON.stringify({ companyId, ...payload })
  });
  return result.data;
}


const DASHBOARD_OPERACIONAL_COLLECTION = 'dashboard_colheita_operacional';
const SAFRA_COLLECTION = 'premissas_colheita';

function operacionalRef() { throw new Error('Rotina legada removida.'); }

function normalizeOperacionalPayload(data = {}) {
  const rotacaoMoenda = Number(data.rotacaoMoenda ?? 0) || 0;
  const estoqueCarretas = Number(data.estoqueCarretas ?? data.estoque ?? 0) || 0;
  return { ...data, rotacaoMoenda, estoqueCarretas };
}

async function fetchDashboardColheitaOperacionalLegacy() { throw new Error('Rotina legada removida. Use API PostgreSQL.'); }

async function saveDashboardColheitaOperacionalLegacy() { throw new Error('Rotina legada removida. Use API PostgreSQL.'); }



export async function saveDashboardColheitaParada(companyId, payload = {}) {
  const result = await apiRequest('/api/dados-dashboard/colheita/paradas', {
    method: 'POST',
    body: JSON.stringify({ companyId, ...payload })
  });
  return result.data || {};
}

export async function fetchDashboardColheitaParadas(companyId, data = '') {
  if (!companyId) return [];
  const selectedDate = normalizeDateKey(data) || todayISOInBrazil();
  const queryString = new URLSearchParams({ companyId, data: selectedDate }).toString();
  const result = await apiRequest(`/api/dados-dashboard/colheita/paradas?${queryString}`);
  return Array.isArray(result.data) ? result.data : [];
}

export async function fetchDashboardColheitaOperacional(companyId) {
  const result = await apiRequest(`/api/dados-dashboard/colheita/operacional?companyId=${encodeURIComponent(companyId)}&_ts=${Date.now()}`);
  return normalizeOperacionalPayload(result.data || {});
}

export async function saveDashboardColheitaOperacional(companyId, payload) {
  const result = await apiRequest('/api/dados-dashboard/colheita/operacional', {
    method: 'POST',
    body: JSON.stringify({ companyId, ...payload })
  });
  return normalizeOperacionalPayload(result.data || {});
}

function safraRef() { throw new Error('Rotina legada removida.'); }

function normalizeSafraPayload(companyId, payload = {}) {
  const anoSafra = String(payload.anoSafra ?? payload.safra ?? '').trim();
  const dataInicioSafra = String(payload.dataInicioSafra ?? payload.inicioSafra ?? '').trim();
  const dataFimSafra = String(payload.dataFimSafra ?? payload.fimSafra ?? '').trim();

  return {
    ...payload,
    companyId: String(companyId),
    anoSafra,
    safra: anoSafra,
    dataInicioSafra,
    dataFimSafra
  };
}

export async function fetchPremissasColheitaSafra(companyId) {
  const result = await apiRequest(`/api/premissas-colheita?companyId=${encodeURIComponent(companyId)}`);
  return result.data || null;
}

export async function savePremissasColheitaSafra(companyId, payload) {
  const result = await apiRequest('/api/premissas-colheita', { method: 'POST', body: JSON.stringify({ companyId, ...payload }) });
  return result.data || {};
}


export function downloadFechamentoOcTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    FECHAMENTO_OC_TEMPLATE_HEADERS,
    ['4010','0','25','','1','5','RB855453','1,5','19/03/21','8','17,66','17,66','75','1324,50','86,64','1530,06','15,52','125,05','10834,33','17/04/26','28/04/26','12.77','10.96','12.33']
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Talhões Fechados');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([out], { type: 'application/octet-stream' }), 'modelo-fechamento-oc.xlsx');
}

export async function parseFechamentoOcFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const headers = Object.keys(rows[0] || {});
  const missing = FECHAMENTO_OC_TEMPLATE_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error('Colunas obrigatórias ausentes: ' + missing.join(', '));
  const validRows = rows.filter((row) => !isBlankRow(row));
  if (!validRows.length) throw new Error('A planilha não possui linhas válidas para importação.');
  return validRows.map((row, index) => {
    const item = {
      fazenda: String(row['Fazenda'] || '').trim(), vazio: String(row['Vazio'] || '').trim(), quadra: String(row['Quadra'] || '').trim(), vazio1: String(row['Vazio 1'] || '').trim(), parte: String(row['Parte'] || '').trim(), estagio: String(row['Estágio'] || '').trim(), variedade: String(row['Variedade'] || '').trim(), espac: normalizeNumber(row['Espac.']), plantio: normalizeDate(row['Plantio']), dm: normalizeNumber(row['DM']), liberada: normalizeNumber(row['Liberada']), cortada: normalizeNumber(row['Cortada']), tHaPrev: normalizeNumber(row['T/Ha Prev.']), prodPrev: normalizeNumber(row['Prod. Prev.']), tHaReal: normalizeNumber(row['T/Ha Real.']), prodReal: normalizeNumber(row['Prod. Real']), varPercent: normalizeNumber(row['Var. %']), atr: normalizeNumber(row['Atr']), atrHaReal: normalizeNumber(row['Atr/Ha Real.']), abertura: normalizeDate(row['Abertura']), encerramento: normalizeDate(row['Encerramento']), idade: normalizeNumber(row['Idade']), tempo: normalizeNumber(row['Tempo']), cortes: normalizeNumber(row['Cortes']), raw: row
    };
    if (!item.fazenda || !item.quadra) throw new Error('Linha ' + (index + 2) + ' inválida. Fazenda e Quadra são obrigatórias.');
    return item;
  });
}


async function deleteExistingFechamentoOcRows() { return 0; }

async function importFechamentoOcRowsLegacy() { throw new Error('Rotina legada removida. Use API PostgreSQL.'); }

export async function importFechamentoOcRows(companyId, rows, onProgress = () => {}) {
  const chunkSize = 400;
  const replaceDates = [...new Set((rows || []).map((row) => normalizeDateKey(row.encerramento || row.Encerramento)).filter(Boolean))];
  let processed = 0;
  try {
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      await apiRequest('/api/dados-dashboard/colheita/fechamento-oc/import-chunk', {
        method: 'POST',
        headers: { 'X-Import-Type': 'fechamentoOc' },
        body: JSON.stringify({
          companyId,
          importType: 'fechamentoOc',
          dashboardType: 'fechamentoOc',
          rows: chunk,
          replaceDates: i === 0 ? replaceDates : [],
          replaceAll: i === 0
        })
      });
      processed = Math.min(i + chunk.length, rows.length);
      onProgress({ processed, total: rows.length, percent: Math.round((processed / rows.length) * 100) });
    }
  } catch (error) {
    if (!shouldUseLegacyPath(error)) throw error;
    processed = 0;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      await importFechamentoOcRowsLegacy(companyId, chunk, i === 0 ? replaceDates : []);
      processed = Math.min(i + chunk.length, rows.length);
      onProgress({ processed, total: rows.length, percent: Math.round((processed / rows.length) * 100) });
    }
  }
  return { processed: rows.length };
}

function avgFechamentoOc(items, field) {
  const values = (items || []).map((item) => normalizeNumber(item?.[field])).filter((value) => Number.isFinite(value));
  return values.length ? values.reduce((acc, value) => acc + value, 0) / values.length : 0;
}
function sumFechamentoOc(items, field) { return (items || []).reduce((acc, item) => acc + normalizeNumber(item?.[field]), 0); }
function pctFechamentoOc(part, total) { return total ? (part / total) * 100 : 0; }
function gapPctFechamentoOc(realizado, previsto) { return previsto ? ((realizado / previsto) * 100) - 100 : 0; }
function tchPrevFechamentoOc(items = []) { const area = sumFechamentoOc(items, 'cortada'); return area ? sumFechamentoOc(items, 'prodPrev') / area : 0; }
function tchRealFechamentoOc(items = []) { const area = sumFechamentoOc(items, 'cortada'); return area ? sumFechamentoOc(items, 'prodReal') / area : 0; }
function atrPrevFechamentoOc(items = []) { let sum = 0; let peso = 0; (items || []).forEach((x) => { const prod = normalizeNumber(x?.prodPrev); const atr = normalizeNumber(x?.atr); if (prod > 0 && atr > 0) { sum += prod * atr; peso += prod; } }); return peso ? sum / peso : 0; }
function atrRealFechamentoOc(items = []) { let sum = 0; let peso = 0; (items || []).forEach((x) => { const prod = normalizeNumber(x?.prodReal); const atr = normalizeNumber(x?.atr); if (prod > 0 && atr > 0) { sum += prod * atr; peso += prod; } }); return peso ? sum / peso : 0; }
function statusGapFechamentoOc(gapPct) { if (gapPct >= 5) return 'Excelente'; if (gapPct >= 1) return 'Bom'; if (gapPct >= -1) return 'Neutro'; if (gapPct >= -5) return 'Atenção'; return 'Crítico'; }
const DEFAULT_FECHAMENTO_OC_ATR_TCH_CONFIG_SERVICE = {
  tchDivisao: 75, atrDivisao: 127,
  quadrantes: {
    baixoAtrBaixoTch: { label: 'Baixo ATR / Baixo TCH', color: '#cd3c37', tchMin: 0, tchMax: 75, atrMin: 0, atrMax: 127 },
    altoAtrBaixoTch: { label: 'Alto ATR / Baixo TCH', color: '#555fd7', tchMin: 0, tchMax: 75, atrMin: 127, atrMax: 999 },
    baixoAtrAltoTch: { label: 'Baixo ATR / Alto TCH', color: '#e1a823', tchMin: 75, tchMax: 999, atrMin: 0, atrMax: 127 },
    altoAtrAltoTch: { label: 'Alto ATR / Alto TCH', color: '#22aa58', tchMin: 75, tchMax: 999, atrMin: 127, atrMax: 999 }
  }
};
function normalizeFechamentoOcAtrTchConfig(raw = {}) {
  const source = raw?.fechamentoOcAtrTchConfig || raw?.atrTchFechamentoOc || {};
  const base = DEFAULT_FECHAMENTO_OC_ATR_TCH_CONFIG_SERVICE;
  const quadrantes = {};
  Object.entries(base.quadrantes).forEach(([key, defaults]) => {
    const item = source?.quadrantes?.[key] || {};
    quadrantes[key] = { label: String(item.label ?? defaults.label), color: String(item.color ?? defaults.color), tchMin: normalizeNumber(item.tchMin ?? defaults.tchMin), tchMax: normalizeNumber(item.tchMax ?? defaults.tchMax), atrMin: normalizeNumber(item.atrMin ?? defaults.atrMin), atrMax: normalizeNumber(item.atrMax ?? defaults.atrMax) };
  });
  return { tchDivisao: normalizeNumber(source.tchDivisao ?? base.tchDivisao), atrDivisao: normalizeNumber(source.atrDivisao ?? base.atrDivisao), quadrantes };
}
function classificarBolhaFechamentoOc(tch, atr, config) {
  const found = Object.entries(config?.quadrantes || {}).find(([, faixa]) => tch >= faixa.tchMin && tch <= faixa.tchMax && atr >= faixa.atrMin && atr <= faixa.atrMax);
  if (found) return { key: found[0], ...found[1] };
  const key = atr >= config.atrDivisao ? (tch >= config.tchDivisao ? 'altoAtrAltoTch' : 'altoAtrBaixoTch') : (tch >= config.tchDivisao ? 'baixoAtrAltoTch' : 'baixoAtrBaixoTch');
  return { key, ...(config.quadrantes?.[key] || DEFAULT_FECHAMENTO_OC_ATR_TCH_CONFIG_SERVICE.quadrantes[key]) };
}
async function fetchFechamentoOcPremissasPostgres(companyId) {
  try {
    const result = await apiRequest(`/api/dados-dashboard/colheita/premissas?companyId=${encodeURIComponent(companyId)}`);
    return result.data || {};
  } catch { return {}; }
}
async function fetchTchPrevistoPorFazendaPostgres(companyId, filters = {}) {
  const result = new Map();
  try {
    const response = await postgresReadService.listAllEstimates({ companyId, harvestYear: filters.safra && filters.safra !== 'todas' ? filters.safra : '', limit: 1000 });
    const latestByTalhao = new Map();
    (response.data || []).forEach((item) => {
      const fazenda = String(item.fazenda || item.fazendaNome || item.farm?.name || item.farm?.code || '').trim();
      const talhao = String(item.talhaoId || item.field?.code || item.fieldId || item.id || '').trim();
      if (!fazenda || !talhao) return;
      const updated = new Date(item.updatedAt || 0).getTime() || 0;
      const key = `${fazenda}__${talhao}`;
      const current = latestByTalhao.get(key);
      if (!current || updated >= current.updated) latestByTalhao.set(key, { item, fazenda, updated });
    });
    latestByTalhao.forEach(({ item, fazenda }) => {
      const area = normalizeNumber(item.area);
      const tch = normalizeNumber(item.tch || item.tchPrevisto || item.estimatedTch);
      const ton = normalizeNumber(item.toneladas || item.estimatedTon) || (area && tch ? area * tch : 0);
      if (!result.has(fazenda)) result.set(fazenda, { area: 0, ton: 0 });
      const acc = result.get(fazenda); acc.area += area || 0; acc.ton += ton || 0;
    });
    result.forEach((acc) => { acc.tchPrevisto = acc.area ? acc.ton / acc.area : 0; });
  } catch { }
  return result;
}

function buildFechamentoOcDashboardFromRows(rows = [], premissasRaw = {}, estimativasPorFazenda = new Map()) {
  const atrTchConfig = normalizeFechamentoOcAtrTchConfig(premissasRaw);
  const totalProdReal = sumFechamentoOc(rows, 'prodReal');
  const totalProdPrev = sumFechamentoOc(rows, 'prodPrev');
  const areaColhida = sumFechamentoOc(rows, 'cortada');
  const mediaTempo = avgFechamentoOc(rows, 'tempo');
  const mediaAtr = atrRealFechamentoOc(rows);
  const mediaAtrPrev = atrPrevFechamentoOc(rows);
  const mediaTchReal = tchRealFechamentoOc(rows);
  const mediaTchPrev = tchPrevFechamentoOc(rows);

  const byFazenda = new Map();
  const byVariedade = new Map();

  rows.forEach((item) => {
    const fazenda = String(item.fazenda || 'Sem fazenda');
    if (!byFazenda.has(fazenda)) byFazenda.set(fazenda, []);
    byFazenda.get(fazenda).push(item);

    const variedade = String(item.variedade || 'Outras');
    if (!byVariedade.has(variedade)) byVariedade.set(variedade, []);
    byVariedade.get(variedade).push(item);
  });

  const fazendaRows = Array.from(byFazenda.entries())
    .map(([fazenda, arr]) => {
      const prodReal = sumFechamentoOc(arr, 'prodReal');
      const prodPrev = sumFechamentoOc(arr, 'prodPrev');
      const area = sumFechamentoOc(arr, 'cortada');
      const real = tchRealFechamentoOc(arr);
      const prev = tchPrevFechamentoOc(arr);
      const atr = atrRealFechamentoOc(arr);
      const atrPrev = atrPrevFechamentoOc(arr);
      const gapPct = gapPctFechamentoOc(real, prev);
      return {
        fazenda,
        prev,
        real,
        gap: real - prev,
        gapPct,
        status: statusGapFechamentoOc(gapPct),
        prodReal,
        prodPrev,
        areaColhida: area,
        atr,
        atrPrev,
        gapAtrPct: gapPctFechamentoOc(atr, atrPrev),
        tempo: avgFechamentoOc(arr, 'tempo'),
      };
    })
    .sort((a, b) => b.gapPct - a.gapPct)
    .slice(0, 12);

  const tempoData = rows
    .slice()
    .sort((a, b) => normalizeNumber(b.tempo) - normalizeNumber(a.tempo))
    .slice(0, 10)
    .map((item) => ({ oc: `${item.fazenda || ''}-${item.quadra || ''}`, dias: normalizeNumber(item.tempo) }));

  const variedadeData = Array.from(byVariedade.entries())
    .map(([name, arr]) => {
      const value = sumFechamentoOc(arr, 'prodReal');
      return { name, value, pct: `${pctFechamentoOc(value, totalProdReal).toFixed(1).replace('.', ',')}%` };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const atrVarData = Array.from(byVariedade.entries())
    .map(([variedade, arr]) => ({ variedade, atr: avgFechamentoOc(arr, 'atr'), atrha: avgFechamentoOc(arr, 'atrHaReal') }))
    .sort((a, b) => b.atr - a.atr)
    .slice(0, 5);

  const scatterAtr = rows
    .map((item) => {
      const x = normalizeNumber(item.tHaReal);
      const y = normalizeNumber(item.atr);
      const q = classificarBolhaFechamentoOc(x, y, atrTchConfig);
      return { x, y, z: Math.max(normalizeNumber(item.prodReal), 1), c: q.color, grupo: q.label, fazenda: item.fazenda, quadra: item.quadra };
    })
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x > 0 && p.y > 0);

  const scatterIdade = rows
    .map((item) => ({ x: normalizeNumber(item.idade), y: normalizeNumber(item.tHaReal), z: Math.max(normalizeNumber(item.prodReal), 1) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x > 0 && p.y > 0);

  const heat = fazendaRows.map((r) => ({
    fazenda: r.fazenda,
    real: r.real,
    atr: r.atr,
    gapPct: r.gapPct,
    tempo: r.tempo,
    indice: Math.round(Math.max(0, Math.min(100, 50 + r.gapPct * 3 + (r.atr - mediaAtr) * 0.4 - (r.tempo - mediaTempo) * 2))),
  }));

  return {
    totalRegistros: rows.length,
    options: {
      safras: [...new Set(rows.map((r) => r.safra).filter(Boolean))],
      fazendas: [...new Set(rows.map((r) => r.fazenda).filter(Boolean))],
    },
    premissas: { fechamentoOcAtrTchConfig: atrTchConfig },
    cards: {
      ocsFechadas: rows.length,
      areaColhida,
      prodReal: totalProdReal,
      prodPrev: totalProdPrev,
      tchReal: mediaTchReal,
      tchPrev: mediaTchPrev,
      atrMedio: mediaAtr,
      atrPrev: mediaAtrPrev,
      tempoFechamento: mediaTempo,
      variacaoPct: gapPctFechamentoOc(totalProdReal, totalProdPrev),
    },
    rows: fazendaRows,
    rankingGapTch: fazendaRows,
    tempoData,
    variedadeData,
    atrVarData,
    scatterAtr,
    scatterIdade,
    heat,
  };
}

async function fetchFechamentoOcDashboardPostgres(companyId, filters = {}) {
  if (!usePostgresReads || !companyId) return null;

  const params = {
    companyId,
    limit: 500,
  };

  const safraFiltro = String(filters.safra || '').trim();
  const fazendaFiltro = String(filters.fazenda || '').trim();
  const dataInicio = normalizeDateKey(filters.dataInicio);
  const dataFim = normalizeDateKey(filters.dataFim);

  if (safraFiltro && safraFiltro !== 'todas') params.harvestYear = safraFiltro;
  if (fazendaFiltro && fazendaFiltro !== 'todas') params.farmCode = fazendaFiltro;

  const [postgresResult, premissasRaw, estimativasPorFazenda] = await Promise.all([
    postgresReadService.listAllClosureDashboardRecords(params),
    fetchFechamentoOcPremissasPostgres(companyId),
    fetchTchPrevistoPorFazendaPostgres(companyId, filters),
  ]);

  const rows = (postgresResult.data || [])
    .map((item) => normalizeFechamentoOcRecord(item))
    .filter((item) => {
      const dataKey = normalizeDateKey(item.encerramento || item.abertura);
      if (dataInicio && (!dataKey || dataKey < dataInicio)) return false;
      if (dataFim && (!dataKey || dataKey > dataFim)) return false;
      return true;
    });

  return buildFechamentoOcDashboardFromRows(rows, premissasRaw, estimativasPorFazenda);
}

async function fetchFechamentoOcDashboardLegacy() { throw new Error('Rotina legada removida. Use API PostgreSQL.'); }
function fechamentoOcDashboardTemDados(data = {}) { return Number(data?.totalRegistros || 0) > 0 || (Array.isArray(data?.rows) && data.rows.length > 0) || (Array.isArray(data?.scatterAtr) && data.scatterAtr.length > 0) || (Array.isArray(data?.variedadeData) && data.variedadeData.length > 0); }
export async function fetchFechamentoOcDashboard(companyId, filters = {}) {
  if (usePostgresReads) {
    try {
      const postgresData = await fetchFechamentoOcDashboardPostgres(companyId, filters);
      if (fechamentoOcDashboardTemDados(postgresData)) return postgresData;
    } catch (error) {
      console.warn('[Talhões Fechados] PostgreSQL indisponível ao buscar fechamento OC.', error?.message || error);
    }
  }

  const queryParams = new URLSearchParams({ dashboardType: 'fechamentoOc', ...filters });
  if (companyId) queryParams.set('companyId', companyId);
  const summaryQuery = queryParams.toString();
  try {
    const summaryResult = await apiRequest('/api/dados-dashboard/colheita/summary?' + summaryQuery);
    const summaryData = summaryResult.data || {};
    if (fechamentoOcDashboardTemDados(summaryData)) return summaryData;
  } catch (error) {
    if (!(error?.status === 404 || String(error?.message || '').includes('404'))) throw error;
  }

  const directParams = new URLSearchParams({ ...filters });
  if (companyId) directParams.set('companyId', companyId);
  const directQuery = directParams.toString();
  try {
    const result = await apiRequest('/api/dados-dashboard/dashboard/fechamento-oc?' + directQuery);
    return result.data || {};
  } catch (error) {
    // Compatibilidade com ambientes onde a rota dedicada ainda não foi publicada.
    if (error?.status === 404 || String(error?.message || '').includes('404')) {
      const fallbackResult = await apiRequest('/api/dados-dashboard/colheita/summary?' + summaryQuery);
      return fallbackResult.data || {};
    }
    throw error;
  }
}
