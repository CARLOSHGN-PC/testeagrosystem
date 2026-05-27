import express from 'express';
import { firebaseStorage } from '../../config/firebaseAdmin.js';
import dotenv from 'dotenv';
import { authenticateRequest } from '../../middlewares/authMiddleware.js';
import { enforceCompanyScope, requireModuleAccess } from '../../middlewares/permissionMiddleware.js';
import { getTile } from '../../controllers/map/mapTileController.js';
import { prisma } from '../../lib/prisma.js';
import { buildCompanyWhere } from '../../controllers/postgres/postgresControllerUtils.js';
import { getOrdemCorteMapState } from '../../services/mapLayerCacheService.js';
dotenv.config();

const router = express.Router();

function normalizeText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase();
}

async function resolveStorageCompanyPrefixes(companyId) {
    const raw = String(companyId || '').trim();
    const prefixes = new Set();

    if (raw) prefixes.add(raw);

    // Compatibilidade PostgreSQL -> Storage de mapas:
    // No PostgreSQL a Usina Caçu pode aparecer como code "002", mas no Storage
    // os mapas antigos foram gravados com o tenant legado "usinacacu".
    try {
        const { prisma } = await import('../../lib/prisma.js');
        const normalized = normalizeText(raw);
        const company = await prisma.company.findFirst({
            where: {
                OR: [
                    { id: raw },
                    { code: raw },
                    { name: { equals: raw, mode: 'insensitive' } },
                ],
            },
        });

        if (company) {
            if (company.id) prefixes.add(company.id);
            if (company.code) prefixes.add(company.code);
            if (company.name) prefixes.add(normalizeText(company.name));

            const normalizedName = normalizeText(company.name);
            const normalizedCode = normalizeText(company.code);

            if (normalizedName.includes('usinacacu') || normalizedCode === '002' || normalized === '002') {
                prefixes.add('usinacacu');
            }

            if (normalizedName.includes('agrosystem') || normalizedCode === '001' || normalized === '001') {
                prefixes.add('agro-system');
            }
        }
    } catch (error) {
        console.warn('[mapRoutes] Não foi possível resolver empresa no PostgreSQL. Tentando prefixo original.', error?.message || error);
    }

    // Fallbacks conhecidos do projeto durante a migração.
    if (raw === '002' || normalizeText(raw).includes('usinacacu')) prefixes.add('usinacacu');
    if (raw === '001' || normalizeText(raw).includes('agrosystem')) prefixes.add('agro-system');

    return Array.from(prefixes).filter(Boolean);
}

/**
 * Endpoint para obter GeoJSON mapeado, otimizado e simplificado
 * GET /api/map/talhoes
 * Query params:
 * - companyId (obrigatorio)
 * - fazendaId (opcional)
 */
/**
 * Endpoint para obter configuração inicial do mapa (View state e config fixa)
 * GET /api/map/config
 */
router.get('/config', (req, res) => {
    res.json({
        success: true,
        data: {
            initialViewState: {
                longitude: -49.35,
                latitude: -18.25,
                zoom: 8.4
            },
            mapStyle: "mapbox://styles/mapbox/satellite-v9",
            minZoom: 5,
            maxZoom: 22
        }
    });
});


router.get('/companies/:companyId/tiles/:layer/:z/:x/:y.pbf', authenticateRequest, requireModuleAccess('mapas'), getTile);


const rawGeoJsonCache = new Map();
const RAW_GEOJSON_CACHE_TTL_MS = 5 * 60 * 1000;
const projectedMapResponseCache = new Map();
const PROJECTED_MAP_RESPONSE_CACHE_TTL_MS = 45 * 1000;

function firstText(...values) {
    for (const value of values) {
        if (value === undefined || value === null) continue;
        const text = String(value).trim();
        if (text) return text;
    }
    return '';
}

function normalizeId(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim().replace(/\.0+$/, '').replace(/^0+/, '').replace(/\s+/g, '').toUpperCase();
}

function normalizeCorteBackend(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    const number = raw.match(/\d+/)?.[0];
    return number ? `${number}º corte` : raw;
}

function normalizeStableKeyPart(value) {
    if (value === undefined || value === null) return '';
    return String(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .replace(/\s+/g, ' ')
        .toUpperCase();
}

function normalizeTalhaoStable(value) {
    const text = normalizeStableKeyPart(value);
    if (!text) return '';
    const noLeading = text.replace(/^0+/, '');
    return noLeading || '0';
}

function normalizeFarmNameForMap(value) {
    const raw = firstText(value);
    if (!raw) return '';
    const noPrefix = raw.replace(/^\s*\d+\s*-\s*/i, '');
    return normalizeStableKeyPart(noPrefix);
}

function normalizeFarmFilter(value) {
    return String(value || '')
        .trim()
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/^\d+\s*-\s*/, '')
        .replace(/\s+/g, ' ');
}

function extractFarmCode(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const match = raw.match(/^(\d+)\s*-/);
    return match?.[1] || '';
}

function extractTalhaoReal(input) {
    const raw = firstText(input);
    if (!raw) return '';
    const normalized = normalizeStableKeyPart(raw);
    if (!normalized || normalized === 'ESTIMATIVA') return '';

    const seqMatch = String(raw).match(/_([0-9]+)_SEQ/i);
    if (seqMatch?.[1]) {
        const talhaoSeq = normalizeTalhaoStable(seqMatch[1]);
        if (talhaoSeq && talhaoSeq !== 'ESTIMATIVA') return talhaoSeq;
    }

    if (/^\d+$/.test(normalized)) {
        const talhaoNumero = normalizeTalhaoStable(normalized);
        if (talhaoNumero && talhaoNumero !== 'ESTIMATIVA') return talhaoNumero;
    }

    return '';
}

function extractRealTalhaoFromOc(vinculo = {}, ordemPai = {}) {
    const raw = vinculo.rawData || {};
    const candidatos = [
        vinculo.fieldCode,
        vinculo.fieldName,
        vinculo.field?.code,
        vinculo.field?.name,
        raw.TALHAO,
        raw.talhao,
        raw.CD_TALHAO,
        raw.COD_TALHAO,
        raw.talhaoId,
        raw.talhaoNumero,
        raw.numeroTalhao,
        vinculo.talhaoNome,
    ];

    const talhoesNomes = Array.isArray(ordemPai.talhoesNomes) ? ordemPai.talhoesNomes : [];
    const talhaoIds = Array.isArray(ordemPai.talhaoIds) ? ordemPai.talhaoIds : [];
    candidatos.push(...talhoesNomes);
    candidatos.push(...talhaoIds);

    for (const candidato of candidatos) {
        const talhao = extractTalhaoReal(candidato);
        if (talhao) return talhao;
    }
    return '';
}

function buildStableMapKeys(input = {}, context = {}, options = {}) {
    const companyId = normalizeStableKeyPart(context.companyId || input.companyId);
    const safra = normalizeStableKeyPart(context.safra || input.safra);
    const cod = normalizeStableKeyPart(input.COD ?? input.cod);
    const fundoAgr = normalizeStableKeyPart(input.FUNDO_AGR ?? input.fundoAgricola ?? input.fundo_agricola);
    const fazenda = normalizeStableKeyPart(input.FAZENDA ?? input.fazenda ?? input.fazendaNome ?? input.nome_fazenda);

    const talhaoSource = options.useRealTalhao
        ? firstText(input.TALHAO, input.talhao, input.talhaoNumero, input.numeroTalhao, input.fieldCode, input.CD_TALHAO, input.COD_TALHAO, input.TALHAO_ID)
        : firstText(input.TALHAO, input.talhao, input.talhaoId, input.fieldId, input.fieldCode, input.CD_TALHAO, input.COD_TALHAO, input.TALHAO_ID);

    const talhaoReal = options.useRealTalhao ? extractTalhaoReal(talhaoSource) : normalizeTalhaoStable(talhaoSource);
    const talhoes = [talhaoReal].filter((value) => value && value !== 'ESTIMATIVA');

    const keys = new Set();
    for (const talhao of talhoes) {
        const attempts = [
            [companyId, safra, cod, talhao],
            [companyId, safra, fundoAgr, fazenda, talhao],
            [fundoAgr, fazenda, talhao],
            [fazenda, talhao],
            [cod, talhao],
        ];
        for (const parts of attempts) {
            if (parts.every(Boolean)) keys.add(parts.join('|'));
        }
    }
    return Array.from(keys);
}

function normalizeOcStatus(value) {
    const text = normalizeStableKeyPart(value);
    if (['ABERTO', 'ABERTA', 'LIBERADO', 'LIBERADA'].includes(text)) return 'Aberto';
    if (['FECHADO', 'FECHADA', 'FINALIZADO', 'FINALIZADA', 'EXECUTADO', 'EXECUTADA', 'ENCERRADO', 'ENCERRADA'].includes(text)) return 'Fechado';
    if (['PENDENTE', 'AGUARDANDO', 'PENDENTEAGUARDANDO', 'PENDENTEAPROVACAO'].includes(text)) return 'Pendente/Aguardando';
    return normalizeMapStatusBackend(value);
}


function getEstimativaVisualProps(feature = {}, isVisible = true) {
    const props = feature.properties || {};
    const ecorte = normalizeCorteBackend(props.ECORTE);
    const corteColorMap = {
        '1º corte': '#ff0000',
        '2º corte': '#00ff00',
        '3º corte': '#ffe600',
        '4º corte': '#01206e',
        '5º corte': '#ff6a00',
        '6º corte': '#9500ff',
        '7º corte': '#00d0ff',
        '8º corte': '#ea00ff',
        '9º corte': '#b3ff00',
        '10º corte': '#ff005d',
        '11º corte': '#00ffff',
    };

    const visible = Boolean(isVisible);

    return {
        _layer_visible: visible,
        _map_fill_color: visible ? (corteColorMap[ecorte] || '#6e6e6e') : 'rgba(0,0,0,0)',
        _map_stroke_color: visible ? '#ffffff' : 'rgba(0,0,0,0)',
        _map_fill_opacity: visible ? 0.85 : 0,
        _map_line_width: visible ? 1 : 0,
        _map_label: `${firstText(props.FAZENDA, props.fazendaNome, props.nome_fazenda) || firstText(props.FUNDO_AGR, props.fundoAgricola)} / ${firstText(props.TALHAO, props.talhaoId, props.CD_TALHAO)}`.trim(),
    };
}

function getFazendaNameBackend(props = {}) {
    const fundo = firstText(props.FUNDO_AGR, props.fundoAgricola, props.fundo_agricola);
    const fazenda = firstText(props.FAZENDA, props.fazendaNome, props.nome_fazenda, props.fazendaDescricao);
    if (fundo && fazenda) return `${fundo} - ${fazenda}`;
    return fazenda || fundo;
}

function getUniqueTalhaoIdBackend(feature = {}) {
    const p = feature.properties || {};
    const fundoRaw = firstText(p.FUNDO_AGR, p.fundoAgricola, p.fundo_agricola);
    const fazendaRaw = firstText(p.FAZENDA, p.fazenda, p.fazendaNome, p.nome_fazenda);
    const talhaoRaw = firstText(p.TALHAO, p.talhaoId, p.TALHAO_ID, p.CD_TALHAO, p.COD_TALHAO, feature.id);
    const seq = firstText(p.featureId, feature.id);

    // Mesmo formato usado no frontend em getUniqueTalhaoId para evitar que a
    // projeção backend marque `_is_estimated=false` e as camadas sumam.
    if (fundoRaw && fazendaRaw && talhaoRaw && seq !== '') {
        return `${fundoRaw}_${fazendaRaw}_${talhaoRaw}_SEQ${seq}`.replace(/\//g, '-').replace(/ /g, '_').toUpperCase();
    }

    const fundo = normalizeId(fundoRaw);
    const talhao = normalizeId(talhaoRaw);
    if (fundo && talhao) return `${fundo}_${talhao}`;
    return normalizeId(firstText(feature.id, p.featureId, p.id, p.talhaoId, p.TALHAO_ID, p.CD_TALHAO, p.COD_TALHAO));
}



function parseLocaleNumber(value) {
    if (value === undefined || value === null || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    let raw = String(value).trim();
    if (!raw) return 0;
    raw = raw.replace(/\s+/g, '');
    if (raw.includes(',') && raw.includes('.')) {
        const lastComma = raw.lastIndexOf(',');
        const lastDot = raw.lastIndexOf('.');
        if (lastComma > lastDot) {
            raw = raw.replace(/\./g, '').replace(',', '.');
        } else {
            raw = raw.replace(/,/g, '');
        }
    } else if (raw.includes(',')) {
        raw = raw.replace(/\./g, '').replace(',', '.');
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
}

function pickFirstNumeric(...values) {
    for (const value of values) {
        const parsed = parseLocaleNumber(value);
        if (parsed > 0) return parsed;
    }
    return 0;
}

function normalizeComparableText(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim().replace(/\s+/g, '').toUpperCase();
}

function addIdVariants(target, value) {
    if (value === undefined || value === null || value === '') return;
    const text = String(value).trim();
    if (!text) return;
    target.add(text);
    target.add(text.toUpperCase());
    target.add(normalizeComparableText(text));
    target.add(normalizeId(text));
}

function splitQueryList(value) {
    if (Array.isArray(value)) return value.filter(Boolean).map(String);
    return String(value || '').split(',').map(v => v.trim()).filter(Boolean);
}

function normalizeMapStatusBackend(value) {
    const raw = String(value || '').trim().toUpperCase();
    if (!raw) return 'Aguardando';
    if (raw.includes('FINAL') || raw.includes('FECH') || raw.includes('EXECUT') || raw.includes('ENCERR')) return 'Fechada';
    if (raw.includes('ABERT') || raw.includes('OPEN') || raw.includes('LIBER')) return 'Aberta';
    return 'Aguardando';
}

async function loadEstimativaMapState(companyId, safra) {
    const estimativaByKey = new Map();
    const sampleEstimativaKeys = [];
    const debug = {
        companyIdReceived: companyId,
        cleanCompanyId: String(companyId || '').split(':')[0],
        safraReceived: safra || null,
        safraUsed: null,
        whereUsed: null,
        usedFallbackWithoutSafra: false,
        usedFallbackByCompanyRelation: false,
        usedFallbackBroadSearch: false,
        totalLoadedBeforeMemoryFilter: 0,
    };

    const estimateSelect = {
        id: true,
        companyId: true,
        harvestYear: true,
        round: true,
        rawData: true,
        company: { select: { id: true, code: true, name: true } },
        field: { select: { code: true, name: true } },
        farm: { select: { code: true, name: true } },
    };

    async function resolveCompanyIdsForMap(companyIdOrCode) {
        const received = String(companyIdOrCode || '').trim();
        if (!received) return { ids: [], companies: [] };

        const uniqueCompanies = new Map();
        const registerCompanies = (companies = []) => {
            for (const company of companies) {
                if (!company?.id) continue;
                if (!uniqueCompanies.has(company.id)) uniqueCompanies.set(company.id, company);
            }
        };

        const findByWhere = async (where, label) => {
            try {
                const rows = await prisma.company.findMany({
                    where,
                    select: { id: true, code: true, name: true },
                    take: 200,
                });
                registerCompanies(rows);
            } catch (error) {
                console.warn(`[mapRoutes][estimativa] resolveCompanyIdsForMap ignorou busca ${label}:`, error?.message || error);
            }
        };

        await findByWhere({ id: received }, 'id');
        await findByWhere({ code: received }, 'code');
        await findByWhere({ name: { equals: received, mode: 'insensitive' } }, 'name');

        const companies = Array.from(uniqueCompanies.values());
        const ids = companies.map((c) => c.id).filter(Boolean);
        return { ids, companies };
    }

    const companyMatches = (est) => {
        const requested = [
            debug.cleanCompanyId,
            String(companyId || '').trim(),
            normalizeStableKeyPart(debug.cleanCompanyId),
            normalizeStableKeyPart(companyId),
        ].filter(Boolean);
        if (!requested.length) return true;

        const companyValues = [
            est?.companyId,
            est?.company?.id,
            est?.company?.code,
            est?.company?.name,
            est?.rawData?.companyId,
            est?.rawData?.company_id,
            est?.rawData?.COMPANY_ID,
            est?.rawData?.empresa,
            est?.rawData?.EMPRESA,
            est?.rawData?.companyCode,
            est?.rawData?.codigoEmpresa,
        ].filter(Boolean);

        const normalizedValues = companyValues.map((value) => normalizeStableKeyPart(value)).filter(Boolean);
        return requested.some((req) => {
            const normalizedReq = normalizeStableKeyPart(req);
            return normalizedValues.some((value) =>
                value === normalizedReq ||
                value.includes(normalizedReq) ||
                normalizedReq.includes(value)
            );
        });
    };

    const safraMatches = (est, safraVariants) => {
        if (!safraVariants.length) return true;
        const values = [
            est?.harvestYear,
            est?.rawData?.harvestYear,
            est?.rawData?.safra,
            est?.rawData?.SAFRA,
            est?.rawData?.anoSafra,
            est?.rawData?.ANO_SAFRA,
        ].filter(Boolean);
        return values.some((value) => {
            const text = String(value || '').trim();
            const year = text.split(/[/-]/)[0];
            const dash = text.replace(/\//g, '-');
            return safraVariants.includes(text) || safraVariants.includes(dash) || safraVariants.includes(year);
        });
    };

    try {
        const resolvedCompany = await resolveCompanyIdsForMap(debug.cleanCompanyId || companyId);
        const resolvedCompanyIds = resolvedCompany.ids;
        const resolvedCompaniesSample = resolvedCompany.companies.slice(0, 5);
        const safeSafra = String(safra || '').trim();
        const shouldFilterSafra = Boolean(safeSafra && safeSafra.toLowerCase() !== 'todas');
        const safraVariants = shouldFilterSafra
            ? Array.from(new Set([
                safeSafra,
                safeSafra.replace(/\//g, '-'),
                safeSafra.split(/[/-]/)[0],
            ].filter(Boolean)))
            : [];

        let where = {};
        if (resolvedCompanyIds.length > 0) {
            where.companyId = { in: resolvedCompanyIds };
        }
        if (safraVariants.length > 0) {
            where.harvestYear = { in: safraVariants };
        }
        const estimateWhereUsed = { ...where };
        debug.safraUsed = safraVariants.length ? safraVariants : null;
        debug.whereUsed = estimateWhereUsed;
        console.log('[mapRoutes][estimativa] query debug', {
            ...debug,
            resolvedCompanyIds,
            resolvedCompaniesSample,
            estimateWhereUsed,
        });

        if (resolvedCompanyIds.length === 0) {
            console.error('[mapRoutes][estimativa] resolveCompanyIdsForMap não encontrou IDs internos para companyId recebido', {
                companyIdReceived: debug.companyIdReceived,
                cleanCompanyId: debug.cleanCompanyId,
            });
        }

        let estimates = await prisma.estimate.findMany({
            where: estimateWhereUsed,
            select: estimateSelect,
            take: 50000,
        });
        console.log('[mapRoutes][estimativa] resultado consulta principal', {
            companyIdReceived: debug.companyIdReceived,
            resolvedCompanyIds,
            resolvedCompaniesSample,
            estimateWhereUsed,
            totalEstimativasBanco: estimates.length,
        });

        if (estimates.length === 0 && shouldFilterSafra) {
            debug.usedFallbackWithoutSafra = true;
            console.warn('[mapRoutes][estimativa] fallback sem filtro rígido de safra (query zerada)', {
                companyIdReceived: debug.companyIdReceived,
                cleanCompanyId: debug.cleanCompanyId,
                safraReceived: debug.safraReceived,
                safraVariants,
            });
            const estimatesNoSafra = await prisma.estimate.findMany({
                where: resolvedCompanyIds.length > 0 ? { companyId: { in: resolvedCompanyIds } } : {},
                select: estimateSelect,
                take: 50000,
            });
            estimates = estimatesNoSafra.filter((est) => safraMatches(est, safraVariants));
        }

        if (estimates.length === 0) {
            debug.usedFallbackByCompanyRelation = true;
            const companyRef = String(debug.cleanCompanyId || companyId || '').trim();
            const companyWhere = companyRef
                ? {
                    OR: [
                        { companyId: companyRef },
                        { company: { is: { id: companyRef } } },
                        { company: { is: { code: companyRef } } },
                        { company: { is: { name: companyRef } } },
                    ],
                }
                : {};
            const relationWhere = { ...companyWhere };
            if (safraVariants.length === 1) relationWhere.harvestYear = safraVariants[0];
            if (safraVariants.length > 1) relationWhere.harvestYear = { in: safraVariants };

            try {
                estimates = await prisma.estimate.findMany({
                    where: relationWhere,
                    select: estimateSelect,
                    take: 50000,
                });
            } catch (relationError) {
                console.warn('[mapRoutes][estimativa] fallback por relação de empresa falhou:', relationError?.message || relationError);
                estimates = [];
            }
        }

        if (estimates.length === 0) {
            debug.usedFallbackBroadSearch = true;
            const broadWhere = {};
            if (safraVariants.length === 1) broadWhere.harvestYear = safraVariants[0];
            if (safraVariants.length > 1) broadWhere.harvestYear = { in: safraVariants };

            let broadEstimates = await prisma.estimate.findMany({
                where: broadWhere,
                select: estimateSelect,
                take: 50000,
            });

            if (broadEstimates.length === 0 && shouldFilterSafra) {
                broadEstimates = await prisma.estimate.findMany({
                    where: {},
                    select: estimateSelect,
                    take: 50000,
                });
            }

            debug.totalLoadedBeforeMemoryFilter = broadEstimates.length;
            estimates = broadEstimates.filter((est) => companyMatches(est) && safraMatches(est, safraVariants));
        }

        const totalEstimatesLoaded = estimates.length;
        let totalEstimatesIndexed = 0;
        console.log('[mapRoutes][estimativa] estimates sample before index', estimates.slice(0, 5).map(e => ({
            id: e.id,
            companyId: e.companyId,
            harvestYear: e.harvestYear,
            round: e.round,
            farm: e.farm,
            field: e.field,
            rawData: e.rawData
        })));

        let loggedMissingTalhaoSample = false;
        for (const est of estimates) {
            const raw = est.rawData || {};
            const talhaoCandidates = [
                raw.talhaoId,
                raw.TALHAO_ID,
                raw.TALHAO,
                raw.talhao,
                raw.talhaoNumero,
                raw.numeroTalhao,
                raw.CD_TALHAO,
                raw.COD_TALHAO,
                raw.fieldCode,
                raw.FIELD_CODE,
                est.field?.code,
                est.field?.name,
            ].filter(Boolean);
            const talhaoReal = talhaoCandidates.map((candidate) => extractTalhaoReal(candidate)).find(Boolean) || '';
            if (!talhaoReal || talhaoReal === 'ESTIMATIVA') continue;
            const fundoRaw = firstText(raw.fundo_agricola, raw.FUNDO_AGR, raw.fundoAgr);
            const fazendaRaw = firstText(raw.fazenda, raw.FAZENDA);
            const fundoKey = normalizeStableKeyPart(fundoRaw);
            const fazendaKey = normalizeStableKeyPart(fazendaRaw);
            const fazendaLimpaKey = normalizeFarmNameForMap(fazendaRaw);
            const talhaoKey = normalizeTalhaoStable(talhaoReal);
            const companyKey = normalizeStableKeyPart(debug.cleanCompanyId || companyId);
            const safraKey = normalizeStableKeyPart(safra || est.harvestYear || raw.safra || raw.SAFRA);
            const keysSet = new Set();
            const attempts = [
                [companyKey, safraKey, fundoKey, fazendaKey, talhaoKey],
                [companyKey, safraKey, fundoKey, fazendaLimpaKey, talhaoKey],
                [fundoKey, fazendaKey, talhaoKey],
                [fundoKey, fazendaLimpaKey, talhaoKey],
                [fazendaKey, talhaoKey],
                [fazendaLimpaKey, talhaoKey],
            ];
            for (const parts of attempts) {
                if (parts.every(Boolean)) keysSet.add(parts.join('|'));
            }
            const keys = Array.from(keysSet);
            if (!keys.length) {
                if (!loggedMissingTalhaoSample) {
                    loggedMissingTalhaoSample = true;
                    console.warn('[mapRoutes][estimativa] estimativa sem chave estável (amostra única)', {
                        estimateId: est?.id,
                        companyId: est?.companyId,
                        harvestYear: est?.harvestYear,
                        round: est?.round,
                        farm: est?.farm,
                        field: est?.field,
                        rawDataSample: raw,
                        talhaoCandidates,
                    });
                }
                continue;
            }
            totalEstimatesIndexed += 1;
            for (const key of keys) {
                if (!estimativaByKey.has(key)) estimativaByKey.set(key, est);
                if (sampleEstimativaKeys.length < 5) sampleEstimativaKeys.push(key);
            }
        }
        debug.totalEstimativasBanco = totalEstimatesLoaded;
        debug.totalEstimativasIndexadas = totalEstimatesIndexed;
        debug.totalChavesEstimativa = estimativaByKey.size;
        console.log('[mapRoutes][estimativa] index summary', {
            totalEstimatesLoaded,
            totalEstimatesIndexed,
            totalKeysIndexed: estimativaByKey.size,
            sampleEstimativaKeys,
        });
    } catch (error) {
        console.warn('[mapRoutes] Falha ao montar estimativas por chave estável:', error?.message || error);
    }
    return { estimativaByKey, sampleEstimativaKeys, debug };
}

function buildOrdemState(vinculos = [], ordens = [], ordemCorteId = '', context = {}) {
    const statusById = new Map();
    const statusByKey = new Map();
    const frenteById = new Map();
    const idsByOrdem = new Map();
    const ordemById = new Map();

    for (const ordem of ordens) {
        ordemById.set(String(ordem.id), ordem);
        if (ordem.cutOrderId) ordemById.set(String(ordem.cutOrderId), ordem);
        if (ordem.ordemCorteId) ordemById.set(String(ordem.ordemCorteId), ordem);
    }

    for (const vinculo of vinculos) {
        const ordemId = firstText(vinculo.ordemCorteId, vinculo.cutOrderId);
        const ordemPai = ordemById.get(String(ordemId)) || {};
        const raw = vinculo.rawData || {};
        const statusResolved = normalizeOcStatus(
            vinculo.status ||
            vinculo.statusOrdem ||
            vinculo.cutOrderStatus ||
            vinculo.rawData?.status ||
            vinculo.rawData?.statusOrdem ||
            vinculo.rawData?.situacao ||
            ordemPai.status ||
            ordemPai.rawData?.status ||
            ordemPai.rawData?.situacao ||
            'Pendente/Aguardando'
        );
        const status = statusResolved || 'Pendente/Aguardando';
        const ids = new Set();
        [
            vinculo.talhaoId,
            vinculo.fieldId,
            vinculo.id,
            raw.talhaoId,
            raw.idTalhao,
            raw.fieldCode,
            raw.id,
            raw.TALHAO,
            raw.CD_TALHAO,
            raw.COD_TALHAO,
        ].forEach((value) => {
            const alias = firstText(value);
            if (!alias) return;
            ids.add(alias);
            ids.add(alias.toUpperCase());
            const normalized = normalizeId(alias);
            if (normalized) ids.add(normalized);
        });

        const fundo = firstText(
            vinculo.fieldFarmCode,
            vinculo.fundoAgricola,
            vinculo.fundo_agricola,
            vinculo.rawData?.fundoAgricola,
            vinculo.rawData?.fundo_agricola,
            vinculo.rawData?.FUNDO_AGR,
            vinculo.field?.farm?.code,
            ordemPai.fundoAgricola,
            ordemPai.fundo_agricola,
            ordemPai.rawData?.fundoAgricola,
            ordemPai.rawData?.fundo_agricola
        );
        const fazendaOriginal = firstText(
            vinculo.fieldFarmName,
            vinculo.fazendaNome,
            vinculo.nome_fazenda,
            vinculo.rawData?.fazendaNome,
            vinculo.rawData?.nome_fazenda,
            vinculo.rawData?.fazenda,
            vinculo.rawData?.FAZENDA,
            vinculo.field?.farm?.name,
            ordemPai.fazendaNome,
            ordemPai.nome_fazenda,
            ordemPai.rawData?.fazendaNome,
            ordemPai.rawData?.nome_fazenda,
            ordemPai.rawData?.fazenda
        );
        const talhao = extractRealTalhaoFromOc(vinculo, ordemPai);

        const companyKey = normalizeStableKeyPart(firstText(context.companyId, raw.companyId, raw.company_id, raw.empresa, raw.companyCode, vinculo.companyId));
        const safraKey = normalizeStableKeyPart(firstText(context.safra, raw.safra, raw.SAFRA, raw.harvestYear, vinculo.safra));
        const codKey = normalizeStableKeyPart(firstText(vinculo.cod, vinculo.COD, raw.cod, raw.COD, raw.fieldCode, raw.codigo, vinculo.fieldCode, vinculo.field?.code));
        const fundoKey = normalizeStableKeyPart(fundo);
        const fazendaOriginalKey = normalizeStableKeyPart(fazendaOriginal);
        const fazendaLimpaKey = normalizeFarmNameForMap(fazendaOriginal);
        const talhaoKey = normalizeTalhaoStable(talhao);

        if (talhaoKey && talhaoKey !== 'ESTIMATIVA') {
            const fazendaKeys = [fazendaOriginalKey, fazendaLimpaKey].filter(Boolean);
            const ocKeys = [
                [companyKey, safraKey, fundoKey, fazendaLimpaKey, talhaoKey],
                [companyKey, safraKey, fundoKey, fazendaOriginalKey, talhaoKey],
                [companyKey, safraKey, codKey, talhaoKey],
                [fundoKey, fazendaLimpaKey, talhaoKey],
                [fundoKey, fazendaOriginalKey, talhaoKey],
                [codKey, talhaoKey],
            ].filter((parts) => parts.every(Boolean)).map((parts) => parts.join('|'));
            for (const fazendaKey of fazendaKeys) {
                ocKeys.push([fundoKey, fazendaKey, talhaoKey].filter(Boolean).join('|'));
                ocKeys.push([fazendaKey, talhaoKey].filter(Boolean).join('|'));
            }
            for (const key of ocKeys) statusByKey.set(key, status);
        }

        for (const id of ids) {
            statusById.set(id, status);
            if (vinculo.frenteServico || raw.frenteServico || raw.frente) {
                frenteById.set(id, firstText(vinculo.frenteServico, raw.frenteServico, raw.frente));
            }
            if (ordemId) {
                if (!idsByOrdem.has(ordemId)) idsByOrdem.set(ordemId, new Set());
                idsByOrdem.get(ordemId).add(id);
            }
        }
    }

    console.log('[mapRoutes][OC] buildOrdemState debug', {
        totalOrdens: ordens.length,
        totalVinculos: vinculos.length,
        totalStatusById: statusById.size,
        totalStatusByKey: statusByKey.size,
        sampleOrdens: ordens.slice(0, 3),
        sampleVinculos: vinculos.slice(0, 3).map(v => ({
            id: v.id,
            ordemCorteId: v.ordemCorteId,
            talhaoId: v.talhaoId,
            fieldId: v.fieldId,
            status: v.status,
            fundoAgricola: v.fundoAgricola || v.fundo_agricola,
            fazendaNome: v.fazendaNome || v.nome_fazenda,
            rawData: v.rawData
        })),
        sampleStatusById: Array.from(statusById.entries()).slice(0, 10),
        sampleStatusByKey: Array.from(statusByKey.entries()).slice(0, 10)
    });

    return { statusById, statusByKey, frenteById, idsByOrdem, activeOrderIds: ordemCorteId ? idsByOrdem.get(ordemCorteId) : null };
}



async function buildPlanningContexts(companyId, safra) {
    const planningById = new Map();
    const planningStatusById = new Map();
    const planningSeqById = new Map();
    const planningOperacaoById = new Map();
    const planningOperacoes = new Set();

    try {
        const where = await buildCompanyWhere(companyId);
        if (safra && safra !== 'todas') where.harvestYear = safra;

        const [plans, protocolos] = await Promise.all([
            prisma.harvestPlan.findMany({ where, select: { id: true, rawData: true, front: true, sequence: true } , take: 50000 }),
            prisma.protocol.findMany({ where: { companyId: where.companyId || companyId }, select: { id: true, name: true, rawData: true, status: true }, take: 5000 }).catch(() => [])
        ]);

        for (const protocolo of protocolos || []) {
            if (String(protocolo.status || 'ATIVO').toUpperCase() === 'INATIVO') continue;
            const raw = protocolo.rawData || {};
            const label = firstText(protocolo.name, raw.nome, raw.nomeDoProtocolo, raw.nome_protocolo, protocolo.id);
            if (label) planningOperacoes.add(label);
        }

        for (const plan of plans || []) {
            const raw = plan.rawData || {};
            const status = String(firstText(raw.statusPlanejamento, raw.status, 'Planejado')).trim();
            const sequencia = firstText(raw.sequencia, plan.sequence);
            const operacao = firstText(raw.protocoloNome, raw.planningOperacao, raw.operacao, raw.operation, raw.protocoloId);
            const ids = new Set();
            [raw.talhaoId, raw.fieldId, raw.fieldCode, raw.TALHAO_ID, raw.CD_TALHAO, raw.id].forEach(v => addIdVariants(ids, v));
            const farmCode = firstText(raw.fundoAgricola, raw.fundo_agricola, raw.FUNDO_AGR, raw.fazenda);
            const talhaoCode = firstText(raw.talhaoId, raw.fieldId, raw.fieldCode, raw.TALHAO_ID, raw.CD_TALHAO, raw.TALHAO, raw.id);
            if (farmCode && talhaoCode) addIdVariants(ids, `${normalizeId(farmCode)}_${normalizeId(talhaoCode)}`);

            ids.forEach((id) => {
                planningById.set(id, { statusPlanejamento: status, sequencia, planningOperacao: operacao, frenteColheita: firstText(raw.frenteColheita, plan.front) });
                if (status) planningStatusById.set(id, status);
                if (sequencia !== undefined && sequencia !== null && sequencia !== '') planningSeqById.set(id, String(sequencia));
                if (operacao) planningOperacaoById.set(id, String(operacao));
            });
        }
    } catch (error) {
        console.warn('[mapRoutes] Falha ao montar contexto de planejamento no backend:', error?.message || error);
    }

    return { planningById, planningStatusById, planningSeqById, planningOperacaoById, planningOperacoes };
}

function featureHasAnyId(feature, set) {
    if (!set || set.size === 0) return false;
    const p = feature.properties || {};

    const talhaoBase = firstText(p.TALHAO, p.COD_TALHAO, p.CD_TALHAO, p.TALHAO_ID, p.talhaoId);
    const fundoBase = firstText(p.FUNDO_AGR, p.fundoAgricola, p.fundo_agricola);
    const fazendaBase = firstText(p.FAZENDA, p.fazenda, p.fazendaNome, p.nome_fazenda);

    const candidates = [
        feature.id,
        p.featureId,
        p.id,
        p.talhaoId,
        p.TALHAO_ID,
        p.CD_TALHAO,
        p.COD_TALHAO,
        p.TALHAO,
        getUniqueTalhaoIdBackend(feature),
        (p.FUNDO_AGR && p.FAZENDA && p.TALHAO && (p.featureId !== undefined || feature.id !== undefined)) ? `${p.FUNDO_AGR}_${p.FAZENDA}_${p.TALHAO}_SEQ${p.featureId ?? feature.id}`.replace(/\//g, '-').replace(/ /g, '_').toUpperCase() : null,
        (fundoBase && talhaoBase) ? `${fundoBase}_${talhaoBase}` : null,
        (fundoBase && firstText(p.COD_TALHAO, p.CD_TALHAO, p.TALHAO_ID, p.talhaoId)) ? `${fundoBase}_${firstText(p.COD_TALHAO, p.CD_TALHAO, p.TALHAO_ID, p.talhaoId)}` : null,
        (fazendaBase && talhaoBase) ? `${fazendaBase}_${talhaoBase}` : null,
        (fazendaBase && firstText(p.COD_TALHAO, p.CD_TALHAO, p.TALHAO_ID, p.talhaoId)) ? `${fazendaBase}_${firstText(p.COD_TALHAO, p.CD_TALHAO, p.TALHAO_ID, p.talhaoId)}` : null,
    ];

    return candidates.some((value) => {
        const text = String(value ?? '').trim();
        if (!text) return false;
        const comparable = normalizeComparableText(text);
        return set.has(text) || set.has(text.toUpperCase()) || set.has(comparable) || set.has(normalizeId(text));
    });
}

function findStatusForFeature(feature, statusById) {
    const p = feature.properties || {};
    const candidates = [feature.id, p.featureId, p.id, p.talhaoId, p.TALHAO_ID, p.CD_TALHAO, getUniqueTalhaoIdBackend(feature)];
    for (const value of candidates) {
        const text = String(value ?? '').trim();
        if (!text) continue;
        if (statusById.has(text)) return statusById.get(text);
        if (statusById.has(text.toUpperCase())) return statusById.get(text.toUpperCase());
        const norm = normalizeId(text);
        if (statusById.has(norm)) return statusById.get(norm);
    }
    return 'Aguardando';
}

function collectStatusesForFeature(feature, statusById) {
    const p = feature.properties || {};
    const talhaoBase = firstText(p.TALHAO, p.COD_TALHAO, p.CD_TALHAO, p.TALHAO_ID, p.talhaoId);
    const fundoBase = firstText(p.FUNDO_AGR, p.fundoAgricola, p.fundo_agricola);
    const fazendaBase = firstText(p.FAZENDA, p.fazenda, p.fazendaNome, p.nome_fazenda);
    const featureId = firstText(p.featureId, feature.id);
    const cod = firstText(p.COD, p.cod);
    const candidates = [
        feature.id,
        featureId,
        p.TALHAO,
        (fundoBase && talhaoBase) ? `${fundoBase}_${talhaoBase}` : null,
        (fazendaBase && talhaoBase) ? `${fazendaBase}_${talhaoBase}` : null,
        (fundoBase && fazendaBase && talhaoBase && featureId) ? `${fundoBase}_${fazendaBase}_${talhaoBase}_SEQ${featureId}` : null,
        cod,
        (cod && talhaoBase) ? `${cod}_${talhaoBase}` : null,
        p.id,
        p.talhaoId,
        p.TALHAO_ID,
        p.CD_TALHAO,
        p.COD_TALHAO,
        getUniqueTalhaoIdBackend(feature),
    ];

    const matched = new Set();
    for (const value of candidates) {
        const text = String(value ?? '').trim();
        if (!text) continue;
        const keys = [text, text.toUpperCase(), normalizeComparableText(text), normalizeId(text)];
        for (const key of keys) {
            if (statusById.has(key)) matched.add(statusById.get(key));
        }
    }
    return matched;
}

function collectStatusesForStableKeys(stableKeys = [], statusByKey = new Map()) {
    const matched = new Set();
    for (const key of stableKeys) {
        if (statusByKey.has(key)) matched.add(statusByKey.get(key));
    }
    return matched;
}

function backendFilterFeature(feature, filters, activeMapModule, ordemState, planningContext, estimatedFilterEnabled = true, estimativaState = null) {
    const p = feature.properties || {};
    const isEstimated = Boolean(p._is_estimated);
    const osStatus = p._os_status || 'Aguardando';

    if (activeMapModule === 'estimativa') {
        if (estimatedFilterEnabled && estimativaState?.debug?.totalChavesEstimativa) {
            if (p._layer_visible !== true) return false;
        }
    }
    if (
        estimatedFilterEnabled &&
        ['planejamentoSafra', 'tratosCulturais', 'planejamentoTratosCulturais'].includes(activeMapModule) &&
        !isEstimated
    ) return false;

    if (activeMapModule === 'ordemCorte' && filters.ordemCorteId && ordemState.activeOrderIds && !featureHasAnyId(feature, ordemState.activeOrderIds)) return false;

    const statusFilters = splitQueryList(filters.ordemCorteStatus);
    if (['ordemCorte', 'tratosCulturais', 'planejamentoTratosCulturais'].includes(activeMapModule) && statusFilters.length && !statusFilters.includes(osStatus)) return false;

    if (filters.fazenda && filters.fazenda !== 'all') {
        const featureFarmFull = getFazendaNameBackend(p);
        const featureFarmClean = normalizeFarmFilter(featureFarmFull);
        const filterFarmClean = normalizeFarmFilter(filters.fazenda);
        const featureCode = normalizeId(firstText(p.FUNDO_AGR, p.fundoAgricola, p.fundo_agricola, extractFarmCode(featureFarmFull)));
        const filterCode = normalizeId(extractFarmCode(filters.fazenda));
        const featureCodPrefix = normalizeId(firstText(p.COD, p.cod));
        const farmMatches = (
            (featureFarmClean && filterFarmClean && featureFarmClean === filterFarmClean) ||
            (featureCode && filterCode && featureCode === filterCode) ||
            (featureCodPrefix && filterCode && featureCodPrefix === filterCode)
        );
        if (!farmMatches) return false;
    }
    if (filters.frente && filters.frente !== 'all') {
        const frente = activeMapModule === 'ordemCorte' ? String(p._frente_ordem_corte || '').trim() : String(p.FRENTE || '').trim();
        if (frente !== filters.frente) return false;
    }
    if (filters.variedade && filters.variedade !== 'all' && String(p.VARIEDADE || '').trim() !== filters.variedade) return false;
    if (filters.corte && filters.corte !== 'all' && String(p.ECORTE || '').trim() !== filters.corte) return false;
    if (filters.talhao && filters.talhao !== 'all' && String(p.TALHAO || '').trim() !== filters.talhao) return false;

    const statusPlanejamentoFilters = splitQueryList(filters.statusPlanejamento);
    if (statusPlanejamentoFilters.length && activeMapModule === 'planejamentoSafra') {
        const statusPlan = String(p._status_planejamento || "").trim();
        if (!statusPlanejamentoFilters.includes(statusPlan)) return false;
    }

    const sequenciasFilters = splitQueryList(filters.sequenciasPlanejamento);
    if (sequenciasFilters.length && activeMapModule === 'planejamentoSafra') {
        const seqPlan = String(p._sequencia_planejamento || "").trim();
        if (!sequenciasFilters.includes(seqPlan)) return false;
    }

    if (filters.planningOperacao && String(filters.planningOperacao).trim() && activeMapModule === 'planejamentoTratosCulturais') {
        const oper = String(p._planning_operacao || "").trim();
        if (oper !== String(filters.planningOperacao).trim()) return false;
    }

    const tipoFilters = splitQueryList(filters.tipoPropriedade);
    if (tipoFilters.length && !tipoFilters.includes(String(p._tipo_propriedade || 'PROPRIA').trim().toUpperCase())) return false;

    return true;
}

function buildFilterOptions(features, activeMapModule) {
    const fazendas = new Set();
    const frentes = new Set();
    const variedades = new Set();
    const cortes = new Set();
    const talhoes = new Set();
    const status = new Set();
    const tipos = new Set();
    const statusPlanejamento = new Set();
    const sequenciasPlanejamento = new Set();
    const planningOperacoes = new Set();
    for (const feature of features || []) {
        const p = feature.properties || {};
        const faz = getFazendaNameBackend(p);
        if (faz) fazendas.add(faz);
        const frente = activeMapModule === 'ordemCorte' ? p._frente_ordem_corte : p.FRENTE;
        if (frente) frentes.add(String(frente).trim());
        if (p.VARIEDADE) variedades.add(String(p.VARIEDADE).trim());
        if (p.ECORTE) {
            const corteRaw = String(p.ECORTE).trim();
            const corteNormalized = normalizeCorteBackend(corteRaw);
            if (corteRaw && corteNormalized !== 'estimativa') cortes.add(corteRaw);
        }
        if (p.TALHAO) talhoes.add(String(p.TALHAO).trim());
        if (p._os_status) status.add(p._os_status);
        if (p._tipo_propriedade) tipos.add(p._tipo_propriedade);
        if (p._status_planejamento) statusPlanejamento.add(String(p._status_planejamento).trim());
        if (p._sequencia_planejamento !== undefined && p._sequencia_planejamento !== null && p._sequencia_planejamento !== "") sequenciasPlanejamento.add(String(p._sequencia_planejamento).trim());
        if (p._planning_operacao) planningOperacoes.add(String(p._planning_operacao).trim());
    }
    const sort = (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true });
    return {
        fazendas: Array.from(fazendas).sort(sort),
        frentes: Array.from(frentes).sort(sort),
        variedades: Array.from(variedades).sort(sort),
        cortes: Array.from(cortes).sort(sort),
        talhoes: Array.from(talhoes).sort(sort),
        ordensCorteStatus: Array.from(status).sort(sort),
        tiposPropriedade: Array.from(tipos).sort(sort),
        statusPlanejamento: Array.from(statusPlanejamento).sort(sort),
        sequenciasPlanejamento: Array.from(sequenciasPlanejamento).sort((a, b) => Number(a) - Number(b)),
        planningOperacoes: Array.from(planningOperacoes).sort(sort),
    };
}

function computeGeoJsonBounds(features = []) {
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;

    const visit = (coords) => {
        if (!Array.isArray(coords)) return;
        if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
            const lng = coords[0];
            const lat = coords[1];
            if (Number.isFinite(lng) && Number.isFinite(lat)) {
                minLng = Math.min(minLng, lng);
                minLat = Math.min(minLat, lat);
                maxLng = Math.max(maxLng, lng);
                maxLat = Math.max(maxLat, lat);
            }
            return;
        }
        coords.forEach(visit);
    };

    for (const feature of features) {
        visit(feature?.geometry?.coordinates);
    }

    if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return null;
    return [minLng, minLat, maxLng, maxLat];
}

function calculateGeoJsonBounds(features = []) {
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;

    function processCoords(coords) {
        if (!Array.isArray(coords)) return;

        if (
            typeof coords[0] === 'number' &&
            typeof coords[1] === 'number'
        ) {
            const [lng, lat] = coords;
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;

            if (lng < minLng) minLng = lng;
            if (lat < minLat) minLat = lat;
            if (lng > maxLng) maxLng = lng;
            if (lat > maxLat) maxLat = lat;
            return;
        }

        coords.forEach(processCoords);
    }

    for (const feature of features) {
        processCoords(feature?.geometry?.coordinates);
    }

    if (
        !Number.isFinite(minLng) ||
        !Number.isFinite(minLat) ||
        !Number.isFinite(maxLng) ||
        !Number.isFinite(maxLat)
    ) {
        return null;
    }

    return { minLng, minLat, maxLng, maxLat };
}

function computeBoundsMeta(features = []) {
    const bbox = computeGeoJsonBounds(features);
    if (!bbox) return { bbox: null, center: null, zoomHint: null };
    const [minLng, minLat, maxLng, maxLat] = bbox;
    const lngSpan = Math.abs(maxLng - minLng);
    const latSpan = Math.abs(maxLat - minLat);
    const maxSpan = Math.max(lngSpan, latSpan);
    let zoomHint = 13;
    if (maxSpan > 2) zoomHint = 8;
    else if (maxSpan > 1) zoomHint = 9;
    else if (maxSpan > 0.5) zoomHint = 10;
    else if (maxSpan > 0.2) zoomHint = 11;
    else if (maxSpan > 0.08) zoomHint = 12;
    return {
        bbox,
        center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2],
        zoomHint,
    };
}

router.get('/talhoes', async (req, res, next) => {
    try {
        const {
            companyId,
            fazendaId,
            safra,
            activeMapModule = 'estimativa',
            fazenda,
            frente,
            variedade,
            corte,
            talhao,
            ordemCorteStatus,
            ordemCorteId,
            tipoPropriedade,
            statusPlanejamento,
            sequenciasPlanejamento,
            planningOperacao,
        } = req.query;

        if (!companyId) {
            return res.status(400).json({ success: false, message: 'companyId is required' });
        }

        const bucketName = process.env.FIREBASE_STORAGE_BUCKET || "agrosystem-e484e.firebasestorage.app";
        const bucket = firebaseStorage.bucket(bucketName);
        const cleanCompanyId = String(companyId).split(':')[0];
        const prefixCandidates = await resolveStorageCompanyPrefixes(cleanCompanyId);

        let files = [];
        let usedPrefix = null;

        for (const candidate of prefixCandidates) {
            const prefix = `${candidate}/mapas/processados/geojson_`;
            const [candidateFiles] = await bucket.getFiles({ prefix });
            if (candidateFiles && candidateFiles.length > 0) {
                files = candidateFiles;
                usedPrefix = prefix;
                break;
            }
        }

        if (!files || files.length === 0) {
            return res.status(404).json({
                success: false,
                message: `Nenhum mapa encontrado no servidor para ${companyId}.`,
                triedPrefixes: prefixCandidates.map((candidate) => `${candidate}/mapas/processados/geojson_`),
            });
        }

        const latestFile = files.map(file => {
            const match = file.name.match(/geojson_(\d+)\.json/);
            return { file, timestamp: match ? parseInt(match[1], 10) : 0 };
        }).sort((a, b) => b.timestamp - a.timestamp)[0];

        const rawCacheKey = `${cleanCompanyId}:${usedPrefix}:${latestFile.timestamp}`;
        let geojson = null;
        const cachedRaw = rawGeoJsonCache.get(rawCacheKey);
        if (cachedRaw && Date.now() - cachedRaw.createdAt < RAW_GEOJSON_CACHE_TTL_MS) {
            geojson = cachedRaw.geojson;
        } else {
            const [buffer] = await latestFile.file.download();
            geojson = JSON.parse(buffer.toString('utf-8'));
            rawGeoJsonCache.set(rawCacheKey, { createdAt: Date.now(), geojson });
        }

        const filters = { fazenda: fazenda || fazendaId, frente, variedade, corte, talhao, ordemCorteStatus, ordemCorteId, tipoPropriedade, statusPlanejamento, sequenciasPlanejamento, planningOperacao };
        console.log('[mapRoutes] filtros recebidos', {
            companyId: cleanCompanyId,
            activeMapModule,
            safra,
            fazenda,
            fazendaId,
            frente,
            variedade,
            corte,
            talhao
        });
        const shouldProject = Boolean(activeMapModule || safra || fazenda || fazendaId || frente || variedade || corte || talhao || ordemCorteStatus || ordemCorteId || tipoPropriedade || statusPlanejamento || sequenciasPlanejamento || planningOperacao);
        const responseCacheKey = JSON.stringify({
            companyId: cleanCompanyId,
            safra: String(safra || ''),
            activeMapModule: String(activeMapModule || 'estimativa'),
            filters,
            mapTimestamp: latestFile.timestamp
        });
        const cachedResponse = projectedMapResponseCache.get(responseCacheKey);
        if (cachedResponse && (Date.now() - cachedResponse.createdAt) < PROJECTED_MAP_RESPONSE_CACHE_TTL_MS) {
            return res.json(cachedResponse.payload);
        }

        let features = Array.isArray(geojson.features) ? geojson.features : [];
        let ordemState = { statusById: new Map(), statusByKey: new Map(), frenteById: new Map(), idsByOrdem: new Map(), activeOrderIds: null };
        let estimativaByKey = new Map();
        let sampleEstimativaKeys = [];
        let estimativaState = {
            estimativaByKey: new Map(),
            sampleEstimativaKeys: [],
            debug: {
                totalEstimativasBanco: 0,
                totalEstimativasIndexadas: 0,
                totalChavesEstimativa: 0
            }
        };
        let planningContext = { planningById: new Map(), planningOperacoes: new Set() };
        let ordemPayloadStats = { totalOrdens: 0, totalVinculos: 0 };

        if (shouldProject) {
            estimativaState = await loadEstimativaMapState(cleanCompanyId, safra);
            estimativaByKey = estimativaState.estimativaByKey;
            sampleEstimativaKeys = estimativaState.sampleEstimativaKeys;
            if (activeMapModule === 'estimativa') {
                console.log('[mapRoutes][estimativa] load state debug', estimativaState.debug);
            }
            planningContext = await buildPlanningContexts(cleanCompanyId, safra);
            try {
                const ordemPayload = await getOrdemCorteMapState(cleanCompanyId, safra);
                ordemPayloadStats = {
                    totalOrdens: Array.isArray(ordemPayload?.data?.ordens) ? ordemPayload.data.ordens.length : 0,
                    totalVinculos: Array.isArray(ordemPayload?.data?.vinculos) ? ordemPayload.data.vinculos.length : 0,
                };
                ordemState = buildOrdemState(
                    ordemPayload?.data?.vinculos || [],
                    ordemPayload?.data?.ordens || [],
                    ordemCorteId || '',
                    { companyId: cleanCompanyId, safra }
                );
            } catch (error) {
                console.warn('[mapRoutes] Falha ao carregar estado da OC para camada backend:', error?.message || error);
            }
        }

        const estimatedFilterEnabled = shouldProject && estimativaByKey.size > 0;

        const estimativaVisibilityStats = { estimatedTotal: 0, removedOpen: 0, removedWaiting: 0, removedClosed: 0, matchedEstimativas: 0, sampleGeojsonKeys: [], sampleShpKeys: [], sampleOCKeys: [] };
        const projectedFeatures = features.map((feature, i) => {
            const id = feature.properties?.featureId ?? i;
            const stableKeys = activeMapModule === 'estimativa'
                ? buildStableMapKeys(feature.properties || {}, { companyId: cleanCompanyId, safra }, { useRealTalhao: true })
                : buildStableMapKeys(feature.properties || {}, { companyId: cleanCompanyId, safra });
            if (stableKeys.length && estimativaVisibilityStats.sampleShpKeys.length < 10) {
                estimativaVisibilityStats.sampleShpKeys.push(stableKeys[0]);
            }
            if (stableKeys.length && estimativaVisibilityStats.sampleGeojsonKeys.length < 5) estimativaVisibilityStats.sampleGeojsonKeys.push(stableKeys[0]);
            const matchedStableKey = stableKeys.find((k) => estimativaByKey.has(k));
            const estimativa = matchedStableKey ? estimativaByKey.get(matchedStableKey) : null;
            const isEstimated = shouldProject ? Boolean(estimativa) : Boolean(feature.properties?._is_estimated);
            if (isEstimated) estimativaVisibilityStats.matchedEstimativas += 1;
            const matchedStatuses = shouldProject
                ? new Set([
                    ...collectStatusesForFeature(feature, ordemState.statusById),
                    ...collectStatusesForStableKeys(stableKeys, ordemState.statusByKey),
                ])
                : new Set();
            if (shouldProject && estimativaVisibilityStats.sampleOCKeys.length < 5) {
                const keys = Array.from(matchedStatuses);
                if (keys.length) estimativaVisibilityStats.sampleOCKeys.push(`${stableKeys[0] || 'SEM_CHAVE'}:${keys.join('|')}`);
            }
            if (activeMapModule === 'estimativa' && i === 0) {
                console.log('[mapRoutes][OC] compare keys sample', {
                    sampleShpKeys: stableKeys.slice(0, 10),
                    sampleStatusByKey: Array.from(ordemState.statusByKey.entries()).slice(0, 10),
                    sampleStatusById: Array.from(ordemState.statusById.entries()).slice(0, 10)
                });
            }
            const hasOpenOc = matchedStatuses.has('Aberto');
            const hasClosedOc = matchedStatuses.has('Fechado');
            const hasWaitingOc = matchedStatuses.has('Pendente/Aguardando');
            const hasOcInEstimativa = hasOpenOc || hasClosedOc || hasWaitingOc;
            const ordemStatus = shouldProject
                ? (hasClosedOc ? 'Fechado' : (hasOpenOc ? 'Aberto' : (hasWaitingOc ? 'Pendente/Aguardando' : '')))
                : (feature.properties?._ordem_status || '');
            const osStatus = shouldProject
                ? (ordemStatus || findStatusForFeature(feature, ordemState.statusById))
                : (feature.properties?._os_status || 'Aguardando');
            const estimativaVisible = !hasOcInEstimativa;
            if (activeMapModule === 'estimativa' && isEstimated) {
                estimativaVisibilityStats.estimatedTotal += 1;
                if (hasOpenOc) estimativaVisibilityStats.removedOpen += 1;
                if (hasWaitingOc) estimativaVisibilityStats.removedWaiting += 1;
                if (hasClosedOc) estimativaVisibilityStats.removedClosed += 1;
            }
            const frenteOc = shouldProject ? (ordemState.frenteById.get(String(id)) || ordemState.frenteById.get(normalizeId(id)) || '') : (feature.properties?._frente_ordem_corte || '');
            const plan = planningContext.planningById.get(String(id)) || planningContext.planningById.get(normalizeId(id)) || planningContext.planningById.get(getUniqueTalhaoIdBackend(feature)) || null;
            const rawEstimativa = estimativa?.rawData || {};
            const estimatedTon = parseLocaleNumber(rawEstimativa?.toneladas);
            const estimatedArea = parseLocaleNumber(rawEstimativa?.area);
            const estimatedTch = parseLocaleNumber(rawEstimativa?.tch);
            return {
                ...feature,
                id,
                properties: {
                    ...(feature.properties || {}),
                    featureId: feature.properties?.featureId ?? id,
                    ECORTE: feature.properties?.ECORTE,
                    _normalized_ecorte: isEstimated
                        ? normalizeCorteBackend(feature.properties?.ECORTE)
                        : 'Sem estágio',
                    _is_estimated: isEstimated,
                    _estimated_tch: estimatedTch,
                    _estimated_ton: estimatedTon,
                    _estimated_area: estimatedArea,
                    _os_status: osStatus,
                    _ordem_status: ordemStatus,
                    _has_open_ordem: ordemStatus === 'Aberto',
                    _is_aguardando_ordem: ordemStatus === 'Pendente/Aguardando',
                    _is_closed_ordem: ordemStatus === 'Fechado',
                    _ordem_codigo: feature.properties?._ordem_codigo || '',
                    _tipo_propriedade: String(feature.properties?._tipo_propriedade || feature.properties?.TIPO_PROPRIEDADE || 'PROPRIA').trim().toUpperCase(),
                    _frente_ordem_corte: frenteOc,
                    _status_planejamento: plan?.statusPlanejamento || feature.properties?._status_planejamento || '',
                    _sequencia_planejamento: plan?.sequencia ?? feature.properties?._sequencia_planejamento ?? '',
                    _planning_operacao: plan?.planningOperacao || feature.properties?._planning_operacao || '',
                    ...(activeMapModule === 'ordemCorte'
                        ? {
                            _layer_visible: true,
                            _map_fill_color: hasClosedOc ? '#ff0000' : (hasOpenOc ? '#00aa00' : (hasWaitingOc ? '#ffd400' : 'rgba(0,0,0,0)')),
                            _map_stroke_color: '#ffffff',
                            _map_fill_opacity: hasClosedOc || hasOpenOc || hasWaitingOc ? 0.65 : 0,
                            _map_line_width: 1,
                            _map_label: `${firstText(feature.properties?.FAZENDA, feature.properties?.fazendaNome, feature.properties?.nome_fazenda) || firstText(feature.properties?.FUNDO_AGR, feature.properties?.fundoAgricola)} / ${firstText(feature.properties?.TALHAO, feature.properties?.talhaoId, feature.properties?.CD_TALHAO)}`.trim(),
                        }
                        : (isEstimated
                            ? getEstimativaVisualProps(feature, estimativaVisible)
                            : {
                                _layer_visible: estimativaVisible,
                                _map_fill_color: '#6e6e6e',
                                _map_stroke_color: estimativaVisible ? '#ffffff' : 'rgba(0,0,0,0)',
                                _map_fill_opacity: estimativaVisible ? 0.25 : 0,
                                _map_line_width: estimativaVisible ? 1 : 0,
                                _map_label: `${firstText(feature.properties?.FAZENDA, feature.properties?.fazendaNome, feature.properties?.nome_fazenda) || firstText(feature.properties?.FUNDO_AGR, feature.properties?.fundoAgricola)} / ${firstText(feature.properties?.TALHAO, feature.properties?.talhaoId, feature.properties?.CD_TALHAO)}`.trim(),
                            })),
                },
            };
        });
        if (activeMapModule === 'estimativa') {
            const validation = {
                totalEstimativasBancoGtZero: estimativaByKey.size > 0,
                sampleEstimativaKeysNotEmpty: sampleEstimativaKeys.length > 0,
                matchedEstimativasGtZero: estimativaVisibilityStats.matchedEstimativas > 0,
            };
            if (estimativaVisibilityStats.matchedEstimativas === 0) {
                console.warn('[mapRoutes][estimativa] sem match - amostras diagnostico', {
                    estimativasRawDataSample: Array.from(estimativaByKey.values()).slice(0, 3).map((e) => e?.rawData || {}),
                    shpPropertiesSample: projectedFeatures.slice(0, 3).map((f) => f?.properties || {}),
                });
            }
            console.log('[mapRoutes][estimativa] debug cruzamento', {
                totalFeaturesGeojson: features.length,
                totalEstimativasBanco: estimativaState.debug?.totalEstimativasBanco ?? 0,
                totalEstimativasIndexadas: estimativaState.debug?.totalEstimativasIndexadas ?? 0,
                totalChavesEstimativa: estimativaByKey.size,
                totalOrdensCorteBanco: ordemState.statusById.size,
                totalStatusByKey: ordemState.statusByKey.size,
                matchedEstimativas: estimativaVisibilityStats.matchedEstimativas,
                estimatedTotal: estimativaVisibilityStats.estimatedTotal,
                removedOpen: estimativaVisibilityStats.removedOpen,
                removedWaiting: estimativaVisibilityStats.removedWaiting,
                removedClosed: estimativaVisibilityStats.removedClosed,
                visibleTotal: projectedFeatures.filter((f) => f.properties?._layer_visible === true).length,
                sampleGeojsonKeys: estimativaVisibilityStats.sampleGeojsonKeys,
                sampleEstimativaKeys,
                sampleOCKeys: estimativaVisibilityStats.sampleOCKeys,
                sampleStatusByKey: Array.from(ordemState.statusByKey.entries()).slice(0, 10),
                validation,
            });
        }

        const filteredFeatures = shouldProject
            ? projectedFeatures.filter((feature) => backendFilterFeature(feature, filters, activeMapModule, ordemState, planningContext, estimatedFilterEnabled, estimativaState))
            : projectedFeatures;

        const visibleFeatures = filteredFeatures.filter((f) => f?.properties?._layer_visible !== false);
        const bounds = calculateGeoJsonBounds(visibleFeatures);
        const mapView = bounds
            ? {
                bounds: [
                    [bounds.minLng, bounds.minLat],
                    [bounds.maxLng, bounds.maxLat]
                ],
                center: [
                    (bounds.minLng + bounds.maxLng) / 2,
                    (bounds.minLat + bounds.maxLat) / 2
                ],
                visibleFeaturesCount: visibleFeatures.length,
                recommendedZoom: visibleFeatures.length === 1 ? 15 : undefined
            }
            : null;
        console.log('[mapRoutes] mapView debug', {
            visibleFeaturesCount: visibleFeatures.length,
            bounds,
            center: mapView?.center
        });

        const boundsMeta = computeBoundsMeta(filteredFeatures);
        const filterOptions = {
            ...buildFilterOptions(filteredFeatures, activeMapModule),
            planningOperacoes: Array.from(planningContext.planningOperacoes || []).sort((a, b) => String(a).localeCompare(String(b), "pt-BR", { numeric: true })),
        };
        if (activeMapModule === 'ordemCorte') {
            filterOptions.statusOrdemCorte = filterOptions.ordensCorteStatus || [];
        }
        const totalTalhoes = visibleFeatures.length;
        const estimados = visibleFeatures.filter((feature) => feature?.properties?._is_estimated === true).length;
        const pendentes = Math.max(totalTalhoes - estimados, 0);
        let areaFiltrada = 0;
        let toneladas = 0;
        let areaEstimativa = 0;
        let weightedTchNumerator = 0;
        let weightedTchArea = 0;

        for (const feature of visibleFeatures) {
            const props = feature?.properties || {};
            areaFiltrada += pickFirstNumeric(props.AREA, props.area, props.areaHa, props.area_ha);
            if (props._is_estimated !== true) continue;
            const ton = pickFirstNumeric(props._estimated_ton, props.toneladas);
            const estArea = pickFirstNumeric(props._estimated_area);
            const estTch = pickFirstNumeric(props._estimated_tch);
            toneladas += ton;
            areaEstimativa += estArea;
            if (estArea > 0 && estTch > 0) { weightedTchNumerator += estTch * estArea; weightedTchArea += estArea; }
        }

        let tch = 0;
        if (areaEstimativa > 0) {
            tch = toneladas / areaEstimativa;
        } else if (weightedTchNumerator > 0 && weightedTchArea > 0) {
            tch = weightedTchNumerator / weightedTchArea;
        }

        const sampleEstimatedProps = visibleFeatures
            .filter((feature) => feature?.properties?._is_estimated === true)
            .slice(0, 3)
            .map((feature) => ({
                _estimated_tch: feature?.properties?._estimated_tch,
                _estimated_ton: feature?.properties?._estimated_ton,
                _estimated_area: feature?.properties?._estimated_area,
                toneladas: feature?.properties?.toneladas,
                AREA: feature?.properties?.AREA,
            }));

        const visibleFeaturesSample = visibleFeatures.slice(0, 5).map((f) => ({
            COD: f.properties?.COD,
            FUNDO_AGR: f.properties?.FUNDO_AGR,
            FAZENDA: f.properties?.FAZENDA,
            TALHAO: f.properties?.TALHAO,
            AREA: f.properties?.AREA,
            _is_estimated: f.properties?._is_estimated,
            _estimated_ton: f.properties?._estimated_ton,
            _estimated_area: f.properties?._estimated_area,
            _estimated_tch: f.properties?._estimated_tch,
            stableKeys: buildStableMapKeys(f.properties || {}, { companyId: cleanCompanyId, safra }, { useRealTalhao: true })
        }));

        console.log('[mapRoutes][estimativa] summary debug', {
            totalTalhoes,
            estimados,
            pendentes,
            areaFiltrada,
            areaEstimativa,
            toneladas,
            tch,
            sampleEstimatedProps,
            visibleFeaturesSample
        });

        let summary = {
            totalTalhoes,
            talhoes: totalTalhoes,
            areaFiltrada,
            area: areaFiltrada,
            estimados,
            pendentes,
            toneladas,
            tch,
            totalFeatures: features.length,
            filteredFeatures: filteredFeatures.length,
            visibleFeatures: visibleFeatures.length,
            activeMapModule,
            safra: safra || null
        };
        if (activeMapModule === 'ordemCorte') {
            const abertos = visibleFeatures.filter((f) => f?.properties?._has_open_ordem === true).length;
            const aguardando = visibleFeatures.filter((f) => f?.properties?._is_aguardando_ordem === true).length;
            const fechados = visibleFeatures.filter((f) => f?.properties?._is_closed_ordem === true).length;
            const estimadosSemOC = visibleFeatures.filter((f) => f?.properties?._is_estimated === true && !f?.properties?._ordem_status).length;
            const matchedOC = visibleFeatures.filter((f) => Boolean(f?.properties?._ordem_status)).length;
            summary = { totalTalhoes, areaFiltrada, abertos, aguardando, fechados, estimadosSemOC };
            console.log("[mapRoutes][ordemCorte] debug", {
                totalFeaturesGeojson: features.length,
                totalEstimados: projectedFeatures.filter((f) => f?.properties?._is_estimated === true).length,
                totalOrdens: ordemPayloadStats.totalOrdens,
                totalVinculos: ordemPayloadStats.totalVinculos,
                totalStatusByKey: ordemState.statusByKey.size,
                matchedOC,
                abertos,
                aguardando,
                fechados,
                estimadosSemOC,
                visibleTotal: visibleFeatures.length,
                sampleShpKeys: estimativaVisibilityStats.sampleShpKeys,
                sampleOCKeys: estimativaVisibilityStats.sampleOCKeys,
                sampleFeatureProps: visibleFeatures.slice(0, 3).map((f) => f?.properties || {}),
            });
        }
        const finalGeojson = {
            ...geojson,
            features: filteredFeatures,
            bbox: boundsMeta.bbox || geojson.bbox || null,
            _serverBbox: boundsMeta.bbox,
            _serverCenter: boundsMeta.center,
            _serverZoomHint: boundsMeta.zoomHint,
            _serverMapView: mapView,
            _serverSummary: summary,
            _serverFilterOptions: filterOptions,
        };

        const payload = {
            success: true,
            data: finalGeojson,
            mapView,
            summary,
            timestamp: latestFile.timestamp,
            storagePrefix: usedPrefix,
            source: shouldProject ? 'backend-filtered-cache' : 'backend-cache',
            featureCount: filteredFeatures.length,
            totalFeatureCount: features.length,
            bbox: boundsMeta.bbox,
            center: boundsMeta.center,
            zoomHint: boundsMeta.zoomHint,
            filterOptions,
        };

        projectedMapResponseCache.set(responseCacheKey, {
            createdAt: Date.now(),
            payload
        });
        res.json(payload);

    } catch (error) {
        console.error('Error serving map data:', error);
        next(error);
    }
});

export default router;
