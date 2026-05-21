
import express from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { buildCompanyWhere } from '../controllers/postgres/postgresControllerUtils.js';
import { authenticateRequest } from '../middlewares/authMiddleware.js';
import { requireModuleAccess, requireWriteAccess, enforceCompanyScope, resolveScopedCompanyId } from '../middlewares/permissionMiddleware.js';

import {
  getColheitaPostgresSummary,
  getColheitaPostgresAtrDashboard,
  getColheitaPostgresParadas,
  saveColheitaPostgresParada,
  getColheitaPostgresFilterOptions,
  getColheitaPostgresPremissas,
  getColheitaPostgresOperacional,
} from '../services/dashboardColheitaPostgresService.js';
import { gerarDashboardCttPdf } from '../services/dashboardCttPdfService.js';
import { gerarDashboardCttRenderedPdf } from '../services/dashboardCttRenderedPdfService.js';

import {
  getColheitaSummary,
  getColheitaAtrDashboard,
  importColheitaChunk,
  importImpurezasChunk,
  importBrocaChunk,
  importAtrFazendaChunk,
  importAtrMensalChunk,
  importImpurezaTurnoChunk,
  listColheitaFilterOptions,
  getDashboardPremissas,
  saveDashboardPremissas,
  getDashboardOperacional,
  saveDashboardOperacional,
  importFechamentoOcChunk,
  getFechamentoOcDashboard
} from '../services/dadosDashboardAdminService.js';

const router = express.Router();


async function anexarCardsEntradaCanaFechamentoOc(companyId, query = {}, data = {}) {
  // Os 3 cards de moagem do Fechamento OC devem espelhar a Entrada de Cana.
  // Fechamento OC continua usando seus agregados para tabelas/gráficos, mas estes KPIs vêm do módulo oficial de Entrada.
  try {
    const entradaQuery = { ...(query || {}) };
    delete entradaQuery.dashboardType;
    const entrada = await getColheitaPostgresSummary(companyId, entradaQuery);
    const c = entrada?.cards || {};
    const moagemPrevista = Number(c.moagemPrevista || 0);
    const moagemRealizada = Number(c.moagemRealizada || 0);
    const saldoMoagem = Number.isFinite(Number(c.saldoMoagem)) ? Number(c.saldoMoagem) : moagemPrevista - moagemRealizada;
    return {
      ...(data || {}),
      cards: {
        ...((data && data.cards) || {}),
        moagemPrevistaEntrada: moagemPrevista,
        moagemRealizadaEntrada: moagemRealizada,
        saldoMoagemEntrada: saldoMoagem,
        // aliases para componentes que já esperam os nomes do Dashboard Entrada de Cana
        moagemPrevista,
        moagemRealizada,
        saldoMoagem,
      },
      entradaCanaCards: {
        moagemPrevista,
        moagemRealizada,
        saldoMoagem,
        fonte: 'dashboard_entrada_cana'
      }
    };
  } catch (error) {
    console.warn('[FechamentoOC] Não foi possível anexar cards da Entrada de Cana:', error?.message || error);
    return data;
  }
}

function resolveCompanyId(req, source = {}) {
  return String(resolveScopedCompanyId(req, source)).trim().toLowerCase();
}


router.use(authenticateRequest, requireModuleAccess('dados_dashboard'), enforceCompanyScope);

router.post('/colheita/import-chunk', requireWriteAccess('dados_dashboard'), async (req, res) => {
  const companyId = resolveCompanyId(req, req.body);
  const rawImportType = String(req.body.importType || req.body.dashboardType || req.query.importType || req.query.dashboardType || req.get('x-import-type') || '').trim();
  const importType = rawImportType.toLowerCase().replace(/[^a-z0-9]/g, '');
  const rows = req.body.rows || [];
  const firstRow = Array.isArray(rows) && rows.length ? rows[0] : {};
  const looksLikeFechamentoOc = !!(firstRow && (firstRow.quadra || firstRow.Quadra) && (firstRow.fazenda || firstRow.Fazenda) && (firstRow.tHaPrev || firstRow['T/Ha Prev.'] || firstRow.prodReal || firstRow['Prod. Real']));
  try {
    const options = { replaceDates: req.body.replaceDates || [], replaceAll: req.body.replaceAll === true };

    // Rota unificada: evita 404 nos importadores novos usando o endpoint principal
    // que ja existe no servidor. O importType define a colecao correta.
    if (importType === 'atrfazenda') {
      const result = await importAtrFazendaChunk(companyId, rows, req.authUser.uid, options);
      return res.json({ success: true, data: result });
    }

    if (importType === 'atrmensal') {
      const result = await importAtrMensalChunk(companyId, rows, req.authUser.uid, options);
      return res.json({ success: true, data: result });
    }

    if (importType === 'fechamentooc' || looksLikeFechamentoOc) {
      const result = await importFechamentoOcChunk(companyId, rows, req.authUser.uid, options);
      return res.json({ success: true, data: result });
    }

    if (importType === 'impurezaturno') {
      const result = await importImpurezaTurnoChunk(companyId, req.body.tipo || 'mineral', rows, req.authUser.uid, options);
      return res.json({ success: true, data: result });
    }

    const result = await importColheitaChunk(companyId, rows, req.authUser.uid, options);
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error('[dadosDashboardRoutes] Erro import-chunk:', { importType: rawImportType, normalizedImportType: importType, looksLikeFechamentoOc, companyId, rows: Array.isArray(rows) ? rows.length : 0, message: error?.message });
    res.status(400).json({ success: false, message: error.message || 'Erro ao importar lote.' });
  }
});

router.post('/colheita/impurezas/import-chunk', requireWriteAccess('dados_dashboard'), async (req, res) => {
  try {
    const companyId = resolveCompanyId(req, req.body);
    const result = await importImpurezasChunk(companyId, req.body.rows || [], req.authUser.uid, { replaceDates: req.body.replaceDates || [], replaceAll: req.body.replaceAll === true });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Erro ao importar lote de impurezas.' });
  }
});

router.post('/colheita/broca/import-chunk', requireWriteAccess('dados_dashboard'), async (req, res) => {
  try {
    const companyId = resolveCompanyId(req, req.body);
    const result = await importBrocaChunk(companyId, req.body.rows || [], req.authUser.uid, { replaceDates: req.body.replaceDates || [], replaceAll: req.body.replaceAll === true });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Erro ao importar lote de broca.' });
  }
});


async function handleImportAtrFazenda(req, res) {
  try {
    const companyId = resolveCompanyId(req, req.body);
    const result = await importAtrFazendaChunk(companyId, req.body.rows || [], req.authUser.uid, { replaceDates: req.body.replaceDates || [], replaceAll: req.body.replaceAll === true });
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('[dadosDashboardRoutes] Erro ATR Fazenda:', error);
    return res.status(400).json({ success: false, message: error.message || 'Erro ao importar lote de ATR por fazenda.' });
  }
}

async function handleImportAtrMensal(req, res) {
  try {
    const companyId = resolveCompanyId(req, req.body);
    const result = await importAtrMensalChunk(companyId, req.body.rows || [], req.authUser.uid, { replaceDates: req.body.replaceDates || [], replaceAll: req.body.replaceAll === true });
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('[dadosDashboardRoutes] Erro ATR Mensal:', error);
    return res.status(400).json({ success: false, message: error.message || 'Erro ao importar lote de ATR mensal.' });
  }
}

router.post('/colheita/atr-fazenda/import-chunk', requireWriteAccess('dados_dashboard'), handleImportAtrFazenda);
router.post('/colheita/atr-mensal/import-chunk', requireWriteAccess('dados_dashboard'), handleImportAtrMensal);
router.post('/colheita/atr-fazenda/import', requireWriteAccess('dados_dashboard'), handleImportAtrFazenda);
router.post('/colheita/atr-mensal/import', requireWriteAccess('dados_dashboard'), handleImportAtrMensal);

router.get('/colheita/atr-api-status', async (req, res) => {
  res.json({ success: true, data: { atrApi: true, version: '2026-04-28-atr-api' } });
});


router.post('/colheita/fechamento-oc/import-chunk', requireWriteAccess('dados_dashboard'), async (req, res) => {
  try {
    const companyId = resolveCompanyId(req, req.body);
    const result = await importFechamentoOcChunk(companyId, req.body.rows || [], req.authUser.uid, { replaceDates: req.body.replaceDates || [], replaceAll: req.body.replaceAll === true });
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[dadosDashboardRoutes] Erro Fechamento OC:', { companyId: req.body?.companyId || req.authUser?.companyId, rows: Array.isArray(req.body?.rows) ? req.body.rows.length : 0, message: error?.message });
    res.status(400).json({ success: false, message: error.message || 'Erro ao importar Fechamento OC.' });
  }
});


function parseNumberBr(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'object' && typeof value.toString === 'function') value = value.toString();
  let s = String(value).trim();
  if (!s) return 0;
  s = s.replace(/\s/g, '').replace(/[^\d,.-]/g, '');
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (hasComma) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (hasDot) {
    const parts = s.split('.');
    if (parts.length > 2) {
      const dec = parts.pop();
      s = `${parts.join('')}.${dec}`;
    }
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function excelSerialToDate(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 20000 || n > 90000) return null;
  const excelEpoch = Date.UTC(1899, 11, 30);
  const d = new Date(excelEpoch + n * 86400000);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDtUltCorte(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return excelSerialToDate(value);

  const raw = String(value).trim();
  if (!raw) return null;

  const serial = raw.match(/^\d+(?:[.,]\d+)?$/);
  if (serial) {
    const d = excelSerialToDate(Number(raw.replace(',', '.')));
    if (d) return d;
  }

  // Regra principal: igual =ANO() do Excel para data BR: 18/05/2025 => 2025.
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
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    return new Date(Date.UTC(year, month - 1, day));
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function extractYearFromDtUltCorte(value) {
  const d = parseDtUltCorte(value);
  if (d) return d.getUTCFullYear();
  const raw = String(value ?? '').trim();
  const anywhere = raw.match(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/);
  return anywhere ? Number(anywhere[1]) : null;
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function rawPick(raw, names) {
  if (!raw || typeof raw !== 'object') return '';
  for (const name of names) {
    if (raw[name] !== undefined && raw[name] !== null && String(raw[name]).trim() !== '') return raw[name];
  }
  const normalized = new Map();
  for (const [key, value] of Object.entries(raw)) {
    const k = String(key).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (!normalized.has(k)) normalized.set(k, value);
  }
  for (const name of names) {
    const k = String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    const value = normalized.get(k);
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function normalizeProductionForHistorico(row = {}) {
  const raw = row.rawData && typeof row.rawData === 'object' ? row.rawData : {};
  const dtUltCorte = firstDefined(
    rawPick(raw, ['DT_ULTCORTE', 'DT ULT CORTE', 'DT_ULT_CORTE', 'DATA ULT CORTE', 'DATA_ULT_CORTE', 'ULT_CORTE', 'DATA_CORTE', 'dtUltCorte', 'dt_ultcorte', 'dt_ult_corte', 'dataUltCorte', 'data_ult_corte', 'dtUltCorteIso']),
    row.harvestDate
  );
  return {
    codFaz: firstDefined(rawPick(raw, ['COD_FAZ', 'COD FAZ', 'codFaz', 'codigoFazenda', 'fundo_agricola', 'FUNDO_AGR']), row.farmCode),
    talhao: firstDefined(rawPick(raw, ['TALHAO', 'talhao', 'talhão', 'fieldCode']), row.fieldCode),
    corte: firstDefined(rawPick(raw, ['CORTE', 'corte', 'ESTAGIO', 'estagio', 'stage']), row.stage),
    dtUltCorte,
    areaHa: firstDefined(rawPick(raw, ['AREA_HA', 'AREA HA', 'areaHa', 'AREA', 'area']), row.cutArea),
    tonFechada: firstDefined(rawPick(raw, ['TON_FECHADA', 'TON FECHADA', 'tonFechada', 'TON', 'ton']), row.realTon),
    tchFechado: firstDefined(rawPick(raw, ['TCH_FECHADO', 'TCH FECHADO', 'tchFechado', 'TCH']), row.realTch),
    atrReal: firstDefined(rawPick(raw, ['ATR_REAL', 'ATR REAL', 'atrReal', 'ATR']), row.atr),
  };
}

function corteHistoricoKey(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  const n = s.match(/\d+/)?.[0];
  return n ? String(Number(n)) : s;
}

function historicoAnoAnterior() {
  return new Date().getFullYear() - 1;
}

function dateOnlyUtc(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function isoDateOnly(date) {
  const d = dateOnlyUtc(date);
  return d ? d.toISOString().slice(0, 10) : null;
}


function minDateUtc(a, b) {
  const da = dateOnlyUtc(a);
  const db = dateOnlyUtc(b);
  if (!da) return db;
  if (!db) return da;
  return da <= db ? da : db;
}

function maxDateUtc(a, b) {
  const da = dateOnlyUtc(a);
  const db = dateOnlyUtc(b);
  if (!da) return db;
  if (!db) return da;
  return da >= db ? da : db;
}

function dateFromIsoKey(value) {
  const s = String(value ?? '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeOcDateForHistorico(value) {
  const parsed = parseDtUltCorte(value);
  return parsed ? dateOnlyUtc(parsed) : null;
}

function normalizeOcRawDate(row, raw, names, fallback) {
  for (const name of names) {
    const value = raw?.[name];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return fallback;
}

async function getDataReferenciaFechamentoOcAtual(companyId, anoAtual, filters = {}) {
  const companyWhere = await buildCompanyWhere(companyId);
  const rows = await prisma.closureDashboardRecord.findMany({
    where: companyWhere,
    select: {
      closingDate: true,
      farmCode: true,
      harvestYear: true,
      rawData: true,
    },
    orderBy: [{ closingDate: 'desc' }, { updatedAt: 'desc' }],
  });

  const safraFiltro = String(filters.safra || '').trim();
  const fazendaFiltro = String(filters.fazenda || '').trim();
  // A trava do histórico deve vir da última data REAL importada no relatório
  // Fechamento OC do ano atual. Não pode depender do filtro de período da tela,
  // senão o comparativo histórico muda quando o usuário filtra datas.
  const inicioAnoAtual = new Date(Date.UTC(anoAtual, 0, 1));
  const fimAnoAtual = new Date(Date.UTC(anoAtual, 11, 31));
  let ultimaData = null;
  let totalAnoAtual = 0;

  for (const row of rows) {
    const raw = row.rawData && typeof row.rawData === 'object' ? row.rawData : {};
    const safra = String(normalizeOcRawDate(row, raw, ['safra', 'Safra', 'SAFRA'], row.harvestYear || '') || '').trim();
    const fazenda = String(normalizeOcRawDate(row, raw, ['fazenda', 'Fazenda', 'COD_FAZ', 'Fundo Agrícola', 'FUNDO_AGR'], row.farmCode || '') || '').trim();
    const encerramentoRaw = normalizeOcRawDate(row, raw, ['encerramento', 'Encerramento', 'ENCERRAMENTO', 'data', 'Data', 'DATA'], row.closingDate);
    const encerramento = normalizeOcDateForHistorico(encerramentoRaw);
    if (!encerramento) continue;
    if (encerramento < inicioAnoAtual || encerramento > fimAnoAtual) continue;
    if (safraFiltro && safraFiltro !== 'todas' && safra !== safraFiltro) continue;
    if (fazendaFiltro && fazendaFiltro !== 'todas' && fazenda !== fazendaFiltro) continue;
    totalAnoAtual += 1;
    ultimaData = maxDateUtc(ultimaData, encerramento);
  }

  return { data: ultimaData, totalAnoAtual };
}

function sameMonthDayInYear(date, year) {
  const d = dateOnlyUtc(date);
  if (!d || !Number.isInteger(year)) return null;
  // Mantem o mesmo dia/mes do relatorio atual. Se for 29/02 e o ano anterior
  // nao for bissexto, trava em 28/02 para nao virar 01/03.
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  const candidate = new Date(Date.UTC(year, month, day));
  if (candidate.getUTCMonth() !== month) return new Date(Date.UTC(year, month + 1, 0));
  return candidate;
}

async function getHistoricoProducaoAnoAnterior(companyId, anoRef = historicoAnoAnterior(), filters = {}) {
  const anoAtual = anoRef + 1;
  const companyWhere = await buildCompanyWhere(companyId);
  const rows = await prisma.agriculturalProduction.findMany({
    where: companyWhere,
    select: {
      id: true,
      farmCode: true,
      fieldCode: true,
      cutArea: true,
      realTon: true,
      realTch: true,
      atr: true,
      harvestDate: true,
      rawData: true,
    },
  });

  const normalizedRows = rows.map((row) => {
    const r = normalizeProductionForHistorico(row);
    const dt = parseDtUltCorte(r.dtUltCorte);
    return { ...r, dtUltCorteDate: dateOnlyUtc(dt), ano: dt ? dt.getUTCFullYear() : null };
  });

  // Histórico do ano anterior deve respeitar a data de atualização do relatório
  // atual do Fechamento OC. Ex.: relatório atual até 18/05/2026 => histórico
  // busca de 01/01/2025 até 18/05/2025. Não é ano fechado e também não usa
  // dataInicio/dataFim do filtro da tela para não distorcer o comparativo.
  const refAtual = await getDataReferenciaFechamentoOcAtual(companyId, anoAtual, filters);
  const ultimaDataAtual = refAtual.data;
  const periodoInicio = new Date(Date.UTC(anoRef, 0, 1));
  const periodoFim = ultimaDataAtual
    ? sameMonthDayInYear(ultimaDataAtual, anoRef)
    : new Date(Date.UTC(anoRef, 11, 31));

  const agg = new Map();
  const debug = {
    totalBanco: rows.length,
    anoAtual,
    anoRef,
    ultimaDataAtual: isoDateOnly(ultimaDataAtual),
    fonteTrava: ultimaDataAtual ? 'data_atualizacao_fechamento_oc' : 'fallback_ano_anterior_completo_sem_data_atual',
    totalFechamentoOcAnoAtual: refAtual.totalAnoAtual || 0,
    periodoInicio: isoDateOnly(periodoInicio),
    periodoFim: isoDateOnly(periodoFim),
    semData: 0,
    foraAno: 0,
    foraPeriodo: 0,
    semCorte: 0,
    usados: 0,
  };

  for (const r of normalizedRows) {
    if (!r.ano || !r.dtUltCorteDate) { debug.semData += 1; continue; }
    if (r.ano !== anoRef) { debug.foraAno += 1; continue; }
    if (r.dtUltCorteDate < periodoInicio || r.dtUltCorteDate > periodoFim) { debug.foraPeriodo += 1; continue; }

    const key = corteHistoricoKey(r.corte);
    if (!key) { debug.semCorte += 1; continue; }

    const area = parseNumberBr(r.areaHa);
    const tchFechado = parseNumberBr(r.tchFechado);
    const tonFechada = parseNumberBr(r.tonFechada) || (area > 0 && tchFechado > 0 ? area * tchFechado : 0);
    const atr = parseNumberBr(r.atrReal);

    if (area <= 0 && tonFechada <= 0 && tchFechado <= 0) continue;

    const cur = agg.get(key) || { area: 0, ton: 0, atrTon: 0, atrPeso: 0, tchArea: 0, tchAreaPeso: 0, rows: 0 };
    cur.area += area;
    cur.ton += tonFechada;
    cur.rows += 1;
    if (atr > 0 && tonFechada > 0) {
      cur.atrTon += atr * tonFechada;
      cur.atrPeso += tonFechada;
    }
    // Fallback se a planilha tiver TCH_FECHADO mas TON_FECHADA vier vazia.
    if (tchFechado > 0 && area > 0) {
      cur.tchArea += tchFechado * area;
      cur.tchAreaPeso += area;
    }
    agg.set(key, cur);
    debug.usados += 1;
  }

  const tchPorCorte = {};
  const areaPorCorte = {};
  const atrPorCorte = {};
  const linhasPorCorte = {};
  for (const [key, value] of agg.entries()) {
    areaPorCorte[key] = value.area;
    tchPorCorte[key] = value.area > 0 && value.ton > 0
      ? value.ton / value.area
      : (value.tchAreaPeso > 0 ? value.tchArea / value.tchAreaPeso : 0);
    atrPorCorte[key] = value.atrPeso > 0 ? value.atrTon / value.atrPeso : 0;
    linhasPorCorte[key] = value.rows;
  }

  return {
    anoAtual,
    anoRef,
    dataAtualizacaoAtual: isoDateOnly(ultimaDataAtual),
    periodo: { inicio: isoDateOnly(periodoInicio), fim: isoDateOnly(periodoFim) },
    totalRegistrosAno: debug.usados,
    tchPorCorte,
    areaPorCorte,
    atrPorCorte,
    linhasPorCorte,
    debug,
  };
}




async function ensureDashboardNotesTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS dashboard_notes (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      section TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, section)
    )
  `);
}

async function getDashboardNote(companyId, section) {
  const company = String(companyId || '').trim();
  const sec = String(section || '').trim();
  if (!company || !sec) return '';
  await ensureDashboardNotesTable();
  const rows = await prisma.$queryRawUnsafe(
    'SELECT content FROM dashboard_notes WHERE company_id = $1 AND section = $2 LIMIT 1',
    company,
    sec
  );
  return Array.isArray(rows) && rows[0] ? String(rows[0].content || '') : '';
}

async function saveDashboardNote(companyId, section, content) {
  const company = String(companyId || '').trim();
  const sec = String(section || '').trim();
  if (!company || !sec) throw new Error('companyId e section são obrigatórios.');
  await ensureDashboardNotesTable();
  const id = crypto.randomUUID ? crypto.randomUUID() : `${company}-${sec}-${Date.now()}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO dashboard_notes (id, company_id, section, content, created_at, updated_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (company_id, section)
     DO UPDATE SET content = EXCLUDED.content, updated_at = CURRENT_TIMESTAMP`,
    id,
    company,
    sec,
    String(content || '')
  );
  return { section: sec, content: String(content || '') };
}

router.get('/colheita/fechamento-oc/historico-producao-ano-anterior', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req, req.query);
    const anoParam = Number(req.query.anoRef || req.query.ano || 0);
    const anoRef = Number.isInteger(anoParam) && anoParam >= 1900 && anoParam <= 2500 ? anoParam : historicoAnoAnterior();
    const data = await getHistoricoProducaoAnoAnterior(companyId, anoRef, req.query);
    res.json({ success: true, data });
  } catch (error) {
    console.error('[dadosDashboardRoutes] Erro histórico Produção Agrícola ano anterior:', error);
    res.status(400).json({ success: false, message: error.message || 'Erro ao carregar histórico da Produção Agrícola.' });
  }
});

router.get('/colheita/fechamento-oc/dashboard', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req, req.query);
    let data = await getFechamentoOcDashboard(companyId, req.query);
    data = await anexarCardsEntradaCanaFechamentoOc(companyId, req.query, data);
    res.json({ success: true, data });
  } catch (error) {
    console.error('[dadosDashboardRoutes] Erro dashboard Fechamento OC:', error);
    res.status(400).json({ success: false, message: error.message || 'Erro ao carregar Fechamento OC.' });
  }
});

router.get('/dashboard/fechamento-oc', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req, req.query);
    const anoParam = Number(req.query.anoRef || req.query.ano || 0);
    const anoRef = Number.isInteger(anoParam) && anoParam >= 1900 && anoParam <= 2500 ? anoParam : historicoAnoAnterior();
    const [dashboardDataBase, historico, observacoes] = await Promise.all([
      getFechamentoOcDashboard(companyId, req.query),
      getHistoricoProducaoAnoAnterior(companyId, anoRef, req.query).catch((error) => {
        console.warn('[dadosDashboardRoutes] Histórico Fechamento OC indisponível:', error?.message || error);
        return { anoRef, tchPorCorte: {}, areaPorCorte: {}, atrPorCorte: {}, totalRegistrosAno: 0 };
      }),
      getDashboardNote(companyId, 'talhoes_fechados_observacoes').catch(() => ''),
    ]);
    const data = await anexarCardsEntradaCanaFechamentoOc(companyId, req.query, { ...dashboardDataBase, historico, observacoes });
    res.json({ success: true, data });
  } catch (error) {
    console.error('[dadosDashboardRoutes] Erro endpoint /dashboard/fechamento-oc:', error);
    res.status(400).json({ success: false, message: error.message || 'Erro ao carregar dashboard Fechamento OC.' });
  }
});



router.get('/dashboard/fechamento-oc/observacoes', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req, req.query);
    const section = String(req.query.section || 'talhoes_fechados_observacoes');
    const content = await getDashboardNote(companyId, section);
    res.json({ success: true, data: { section, content } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Erro ao carregar observações.' });
  }
});

router.post('/dashboard/fechamento-oc/observacoes', requireWriteAccess('dados_dashboard'), express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const companyId = resolveCompanyId(req, { ...(req.query || {}), ...(req.body || {}) });
    const section = String(req.body.section || req.query.section || 'talhoes_fechados_observacoes');
    const data = await saveDashboardNote(companyId, section, req.body.content || '');
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Erro ao salvar observações.' });
  }
});

router.get('/colheita/filter-options', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req, req.query);
    const data = await getColheitaPostgresFilterOptions(companyId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Erro ao carregar filtros.' });
  }
});


router.get('/colheita/atr-dashboard', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req, req.query);
    const data = await getColheitaPostgresAtrDashboard(companyId, req.query);
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Erro ao carregar ATR do dashboard.' });
  }
});



async function handleCttRenderedPdf(req, res) {
  try {
    const companyId = resolveCompanyId(req, { ...(req.query || {}), ...(req.body || {}) });
    const sections = Array.isArray(req.body?.sections) ? req.body.sections : [];

    if (!sections.length) {
      return res.status(400).json({
        success: false,
        message: 'Nenhuma seção visual foi enviada pelo frontend para montar o PDF.',
      });
    }

    const pdfBuffer = await gerarDashboardCttRenderedPdf({ ...(req.body || {}), companyId, sections });
    const filename = `dashboard_ctt_entrada_cana_${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.end(pdfBuffer);
  } catch (error) {
    console.error('[dadosDashboardRoutes] Erro /colheita/ctt-pdf-rendered:', error);
    return res.status(400).json({ success: false, message: error.message || 'Erro ao montar PDF visual do dashboard CTT.' });
  }
}

// Endpoint visual do PDF do Dashboard CTT. Precisa ser POST porque o frontend envia
// as imagens/base64 dos gráficos renderizados no app para o servidor montar o PDF.
const renderedPdfPaths = [
  '/colheita/ctt-pdf-rendered',
  '/colheita/ctt-pdf-rendered/',
  // Alias defensivo: evita 404 se algum service antigo chamar sem o prefixo /colheita.
  '/ctt-pdf-rendered',
  '/ctt-pdf-rendered/',
  '/dashboard/ctt-pdf-rendered',
  '/dashboard/ctt-pdf-rendered/',
];

router.options(renderedPdfPaths, (req, res) => res.sendStatus(204));
router.post(renderedPdfPaths, express.json({ limit: '300mb' }), handleCttRenderedPdf);

// Diagnóstico quando abrir a URL no navegador: a rota existe, mas PDF visual exige POST com sections no body.
router.get(renderedPdfPaths, (req, res) => {
  return res.status(405).json({
    success: false,
    message: 'Use POST para gerar este PDF. A rota existe, mas precisa receber as imagens dos gráficos no body.',
  });
});

router.get('/colheita/ctt-pdf', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req, req.query);
    const pdfBuffer = await gerarDashboardCttPdf(companyId, req.query);
    const filename = `dashboard_ctt_entrada_cana_${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.end(pdfBuffer);
  } catch (error) {
    console.error('[dadosDashboardRoutes] Erro /colheita/ctt-pdf:', error);
    return res.status(400).json({ success: false, message: error.message || 'Erro ao gerar PDF do dashboard CTT.' });
  }
});

router.get('/colheita/summary', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req, req.query);
    if (String(req.query.dashboardType || '').toLowerCase().replace(/[^a-z0-9]/g, '') === 'fechamentooc') {
      let data = await getFechamentoOcDashboard(companyId, req.query);
      data = await anexarCardsEntradaCanaFechamentoOc(companyId, req.query, data);
      return res.json({ success: true, data });
    }
    const data = await getColheitaPostgresSummary(companyId, req.query);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('[dadosDashboardRoutes] Erro /colheita/summary PostgreSQL:', error);
    res.status(400).json({ success: false, message: error.message || 'Erro ao carregar resumo.' });
  }
});



router.get('/colheita/paradas', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req, req.query);
    const data = await getColheitaPostgresParadas(companyId, req.query);
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Erro ao carregar paradas.' });
  }
});

router.post('/colheita/paradas', requireWriteAccess('dados_dashboard'), async (req, res) => {
  try {
    const companyId = resolveCompanyId(req, req.body);
    const data = await saveColheitaPostgresParada(companyId, req.body);
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Erro ao salvar parada.' });
  }
});

router.get('/colheita/operacional', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req, req.query);
    const data = await getColheitaPostgresOperacional(companyId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Erro ao carregar dados operacionais.' });
  }
});

router.post('/colheita/operacional', requireWriteAccess('dados_dashboard'), async (req, res) => {
  try {
    const companyId = resolveCompanyId(req, req.body);
    const data = await saveDashboardOperacional(companyId, req.body, req.authUser.uid);
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Erro ao salvar dados operacionais.' });
  }
});

router.get('/colheita/premissas', async (req, res) => {
  try {
    const companyId = resolveCompanyId(req, req.query);
    const data = await getColheitaPostgresPremissas(companyId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Erro ao carregar premissas.' });
  }
});

router.post('/colheita/premissas', requireWriteAccess('dados_dashboard'), async (req, res) => {
  try {
    const companyId = resolveCompanyId(req, req.body);
    const data = await saveDashboardPremissas(companyId, req.body, req.authUser.uid);
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Erro ao salvar premissas.' });
  }
});

export default router;
