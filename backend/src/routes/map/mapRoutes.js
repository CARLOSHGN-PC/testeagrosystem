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

router.use(authenticateRequest, requireModuleAccess('mapas'), enforceCompanyScope);

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

function normalizeActiveMapModule(value) {
    const raw = String(value || 'estimativa').trim().toLowerCase();
    if (['ordem-corte','ordem_corte','ordemcorte'].includes(raw)) return 'ordemCorte';
    if (['planejamento-safra','planejamento_safra','planejamentosafra'].includes(raw)) return 'planejamentoSafra';
    if (['tratos-culturais','tratos_culturais','tratosculturais'].includes(raw)) return 'tratosCulturais';
    if (['planejamento-tratos-culturais','planejamento_tratos_culturais','planejamentotratosculturais'].includes(raw)) return 'planejamentoTratosCulturais';
    return value || 'estimativa';
}

function normalizeMapStatusBackend(value) {
    const raw = String(value || '').trim().toUpperCase();
    if (!raw) return 'Aguardando';
    if (raw.includes('ANALISTA')) return 'Aguardando Analista';
    if (raw.includes('APROVAC')) return 'Aguardando Aprovação';
    if (raw.includes('FINAL') || raw.includes('FECH') || raw.includes('EXECUT') || raw.includes('ENCERR')) return 'Fechada';
    if (raw.includes('ABERT') || raw.includes('OPEN') || raw.includes('LIBER')) return 'Aberta';
    return 'Aguardando';
}

async function buildEstimatedIds(companyId, safra) {
    const estimatedIds = new Set();
    try {
        const where = await buildCompanyWhere(companyId);
        if (safra && safra !== 'todas') where.harvestYear = safra;
        const estimates = await prisma.estimate.findMany({
            where,
            select: {
                id: true,
                fieldId: true,
                rawData: true,
                field: { select: { id: true, code: true, name: true, farm: { select: { id: true, code: true, name: true } } } },
                farm: { select: { id: true, code: true, name: true } },
            },
            take: 15000,
        });
        for (const est of estimates) {
            const raw = est.rawData || {};
            const farmCode = firstText(raw.fundoAgricola, raw.fundo_agricola, raw.FUNDO_AGR, raw.fazendaCodigo, raw.fazenda, est.farm?.code, est.field?.farm?.code);
            const fazendaName = firstText(raw.FAZENDA, raw.fazendaNome, raw.nome_fazenda, raw.fazenda, est.farm?.name, est.field?.farm?.name);
            const talhaoCode = firstText(raw.talhaoId, raw.fieldId, raw.fieldCode, raw.TALHAO_ID, raw.CD_TALHAO, raw.COD_TALHAO, raw.TALHAO, est.field?.code, est.field?.name, est.fieldId, raw.id);
            const seq = firstText(raw.featureId, raw.SEQ, raw.sequencia);
            [est.id, est.fieldId, est.field?.id, est.field?.code, est.field?.name, raw.talhaoId, raw.fieldId, raw.fieldCode, raw.TALHAO_ID, raw.CD_TALHAO, raw.COD_TALHAO, raw.TALHAO, raw.id, raw.featureId]
                .forEach((value) => addIdVariants(estimatedIds, value));
            if (farmCode && talhaoCode) addIdVariants(estimatedIds, `${normalizeId(farmCode)}_${normalizeId(talhaoCode)}`);
            if (fazendaName && talhaoCode) addIdVariants(estimatedIds, `${fazendaName}_${talhaoCode}`);
            if (farmCode && fazendaName && talhaoCode && seq !== '') {
                addIdVariants(estimatedIds, `${farmCode}_${fazendaName}_${talhaoCode}_SEQ${seq}`.replace(/\//g, '-').replace(/ /g, '_').toUpperCase());
            }
        }
    } catch (error) {
        console.warn('[mapRoutes] Falha ao montar estimatedIds no backend:', error?.message || error);
    }
    return estimatedIds;
}

function buildOrdemState(vinculos = [], ordemCorteId = '') {
    const statusById = new Map();
    const frenteById = new Map();
    const idsByOrdem = new Map();
    for (const vinculo of vinculos) {
        const status = normalizeMapStatusBackend(vinculo.status);
        const ordemId = firstText(vinculo.ordemCorteId, vinculo.cutOrderId);
        const ids = new Set();
        [vinculo.talhaoId, vinculo.fieldId, vinculo.id, vinculo.rawData?.talhaoId, vinculo.rawData?.fieldCode]
            .forEach((value) => addIdVariants(ids, value));
        for (const id of ids) {
            statusById.set(id, status);
            if (vinculo.frenteServico || vinculo.rawData?.frenteServico || vinculo.rawData?.frente) {
                frenteById.set(id, firstText(vinculo.frenteServico, vinculo.rawData?.frenteServico, vinculo.rawData?.frente));
            }
            if (ordemId) {
                if (!idsByOrdem.has(ordemId)) idsByOrdem.set(ordemId, new Set());
                idsByOrdem.get(ordemId).add(id);
            }
        }
    }
    console.timeEnd("[maps-layer]");
    return { statusById, frenteById, idsByOrdem, activeOrderIds: ordemCorteId ? idsByOrdem.get(ordemCorteId) : null };
}




async function buildServiceOrderState(companyId, safra) {
    const statusById = new Map();
    try {
        const companyWhere = await buildCompanyWhere(companyId);
        const serviceOrderWhere = { ...companyWhere };
        if (safra && safra !== 'todas') {
            serviceOrderWhere.OR = [
                { rawData: { path: ['safra'], equals: safra } },
                { rawData: { path: ['harvestYear'], equals: safra } },
            ];
        }
        const vinculos = await prisma.serviceOrderField.findMany({
            where: {
                serviceOrder: { is: serviceOrderWhere },
            },
            select: {
                id: true,
                fieldId: true,
                rawData: true,
                serviceOrder: { select: { id: true, status: true, rawData: true } },
            },
            take: 15000,
        });

        for (const vinculo of vinculos) {
            const rawV = vinculo.rawData || {};
            const rawS = vinculo.serviceOrder?.rawData || {};
            const status = normalizeMapStatusBackend(firstText(vinculo.serviceOrder?.status, rawV.status, rawS.status));
            const ids = new Set();
            [
                vinculo.id, vinculo.fieldId, rawV.talhaoId, rawV.fieldId, rawV.fieldCode, rawV.TALHAO_ID, rawV.CD_TALHAO, rawV.COD_TALHAO, rawV.TALHAO, rawV.id, rawV.featureId
            ].forEach((value) => addIdVariants(ids, value));
            const farmCode = firstText(rawV.fundoAgricola, rawV.fundo_agricola, rawV.FUNDO_AGR, rawV.fazenda);
            const talhaoCode = firstText(rawV.talhaoId, rawV.fieldId, rawV.fieldCode, rawV.TALHAO_ID, rawV.CD_TALHAO, rawV.COD_TALHAO, rawV.TALHAO);
            if (farmCode && talhaoCode) addIdVariants(ids, `${normalizeId(farmCode)}_${normalizeId(talhaoCode)}`);
            for (const id of ids) statusById.set(id, status);
        }
    } catch (error) {
        console.warn('[mapRoutes] Falha ao montar estado de OS no backend:', error?.message || error);
    }
    console.timeEnd("[maps-layer]");
    return { statusById };
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

function backendFilterFeature(feature, filters, normalizedActiveMapModule, ordemState, planningContext, estimatedFilterEnabled = true) {
    const p = feature.properties || {};
    const fazendaName = getFazendaNameBackend(p);
    const isEstimated = Boolean(p._is_estimated);
    const osStatus = p._os_status || 'Aguardando';

    if (normalizedActiveMapModule === 'estimativa') {
        if (!isEstimated) return false;
        if (osStatus === 'Aberta' || osStatus === 'Fechada') return false;
    }
    if (estimatedFilterEnabled && ['ordemCorte', 'planejamentoSafra', 'tratosCulturais', 'planejamentoTratosCulturais'].includes(activeMapModule) && !isEstimated) return false;

    if (normalizedActiveMapModule === 'ordemCorte' && filters.ordemCorteId && ordemState.activeOrderIds && !featureHasAnyId(feature, ordemState.activeOrderIds)) return false;

    const statusFilters = splitQueryList(filters.ordemCorteStatus);
    if (['ordemCorte', 'tratosCulturais', 'planejamentoTratosCulturais'].includes(activeMapModule) && statusFilters.length && !statusFilters.includes(osStatus)) return false;

    if (filters.fazenda && filters.fazenda !== 'all' && fazendaName !== filters.fazenda) return false;
    if (filters.frente && filters.frente !== 'all') {
        const frente = normalizedActiveMapModule === 'ordemCorte' ? String(p._frente_ordem_corte || '').trim() : String(p.FRENTE || '').trim();
        if (frente !== filters.frente) return false;
    }
    if (filters.variedade && filters.variedade !== 'all' && String(p.VARIEDADE || '').trim() !== filters.variedade) return false;
    if (filters.corte && filters.corte !== 'all' && String(p.ECORTE || '').trim() !== filters.corte) return false;
    if (filters.talhao && filters.talhao !== 'all' && String(p.TALHAO || '').trim() !== filters.talhao) return false;

    const statusPlanejamentoFilters = splitQueryList(filters.statusPlanejamento);
    if (statusPlanejamentoFilters.length && (normalizedActiveMapModule === 'planejamentoSafra' || normalizedActiveMapModule === 'planejamentoTratosCulturais')) {
        const statusPlan = String(p._status_planejamento || "").trim();
        if (!statusPlanejamentoFilters.includes(statusPlan)) return false;
    }

    const sequenciasFilters = splitQueryList(filters.sequenciasPlanejamento);
    if (sequenciasFilters.length && (normalizedActiveMapModule === 'planejamentoSafra' || normalizedActiveMapModule === 'planejamentoTratosCulturais')) {
        const seqPlan = String(p._sequencia_planejamento || "").trim();
        if (!sequenciasFilters.includes(seqPlan)) return false;
    }


    if (['tratosCulturais', 'planejamentoTratosCulturais'].includes(normalizedActiveMapModule)) {
        const refPlanejada = String(p._ref_planejada || '').trim().toUpperCase();
        if (refPlanejada === 'S' || refPlanejada === 'SIM') return false;

        const vencContrato = String(p._venc_contrato || '').trim();
        if (vencContrato) {
            const currentYear = new Date().getFullYear();
            let year = null;
            const parts = vencContrato.split('/');
            if (parts.length === 3) year = parseInt(parts[2], 10);
            else if (vencContrato.includes('-')) year = parseInt(vencContrato.split('-')[0], 10);
            else {
                const match = vencContrato.match(/\d{4}/);
                if (match) year = parseInt(match[0], 10);
            }
            if (year !== null && year <= currentYear) return false;
        }
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
        const frente = normalizedActiveMapModule === 'ordemCorte' ? p._frente_ordem_corte : p.FRENTE;
        if (frente) frentes.add(String(frente).trim());
        if (p.VARIEDADE) variedades.add(String(p.VARIEDADE).trim());
        if (p.ECORTE) cortes.add(String(p.ECORTE).trim());
        if (p.TALHAO) talhoes.add(String(p.TALHAO).trim());
        if (p._os_status) status.add(p._os_status);
        if (p._tipo_propriedade) tipos.add(p._tipo_propriedade);
        if (p._status_planejamento) statusPlanejamento.add(String(p._status_planejamento).trim());
        if (p._sequencia_planejamento !== undefined && p._sequencia_planejamento !== null && p._sequencia_planejamento !== "") sequenciasPlanejamento.add(String(p._sequencia_planejamento).trim());
        if (p._planning_operacao) planningOperacoes.add(String(p._planning_operacao).trim());
    }
    const sort = (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true });
    console.timeEnd("[maps-layer]");
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
    console.timeEnd("[maps-layer]");
    return {
        bbox,
        center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2],
        zoomHint,
    };
}



const ECORTE_COLORS = {
  "1º corte": "#ff0000",
  "2º corte": "#00ff00",
  "3º corte": "#ffe600",
  "4º corte": "#01206e",
  "5º corte": "#ff6a00",
  "6º corte": "#9500ff",
  "7º corte": "#00d0ff",
  "8º corte": "#ea00ff",
  "9º corte": "#b3ff00",
  "10º corte": "#ff005d",
  "11º corte": "#00ffff",
};

const FRENTE_PALETTE = ["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#a855f7", "#ec4899", "#14b8a6", "#f97316", "#8b5cf6", "#06b6d4", "#84cc16", "#f43f5e", "#0ea5e9", "#10b981", "#f59e0b", "#6366f1", "#d946ef", "#14b8a6", "#fb7185", "#38bdf8"];
function normalizeFrenteLabel(value) { return String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase(); }
function getFrenteColor(frente) {
  const normalized = normalizeFrenteLabel(frente);
  if (!normalized) return '#808080';
  const m = normalized.match(/(?:^F\s*|^FRENTE\s*)?(\d+)/);
  if (m) { const n = Number(m[1]); if (Number.isFinite(n) && n > 0) return FRENTE_PALETTE[(n - 1) % FRENTE_PALETTE.length]; }
  let hash = 0; for (let i = 0; i < normalized.length; i += 1) { hash = ((hash << 5) - hash) + normalized.charCodeAt(i); hash |= 0; }
  return FRENTE_PALETTE[Math.abs(hash) % FRENTE_PALETTE.length];
}

function toNumber(value) { const n = Number(String(value ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; }

function buildSummaryData(features = []) {
    const summary = { totalTalhoes: features.length, totalArea: 0, totalEstimados: 0, totalComOC: 0, totalSemOC: 0, totalPlanejados: 0, totalSemPlanejamento: 0, totalOS: 0, totalSemOS: 0, indicadoresPorStatus: {}, indicadoresPorCorte: {}, indicadoresPorFrente: {} };
    for (const f of features) {
        const p = f?.properties || {};
        summary.totalArea += toNumber(p.AREA);
        if (p._is_estimated) summary.totalEstimados += 1;
        const ord = p._ordem_status || p._os_status || 'Sem OC';
        summary.indicadoresPorStatus[ord] = (summary.indicadoresPorStatus[ord] || 0) + 1;
        const corte = p._normalized_ecorte || 'Sem estágio';
        summary.indicadoresPorCorte[corte] = (summary.indicadoresPorCorte[corte] || 0) + 1;
        const frente = p._frente_ordem_corte || p._frente_planejamento || p.FRENTE || 'Sem frente';
        summary.indicadoresPorFrente[frente] = (summary.indicadoresPorFrente[frente] || 0) + 1;
        if (p._ordem_status && p._ordem_status !== 'Sem OC') summary.totalComOC += 1; else summary.totalSemOC += 1;
        if (p._planejamento) summary.totalPlanejados += 1; else summary.totalSemPlanejamento += 1;
        if (p._os_status && p._os_status !== 'Sem OS') summary.totalOS += 1; else summary.totalSemOS += 1;
    }
    return summary;
}

function buildLegendItems(features = [], activeMapModule = 'estimativa') {
    const normalizedActiveMapModule = normalizeActiveMapModule(activeMapModule);
    if (normalizedActiveMapModule === 'ordemCorte') return [
      { key: 'Aberta', color: '#22c55e', label: 'Aberta' },
      { key: 'Fechada', color: '#ef4444', label: 'Fechada' },
      { key: 'Aguardando', color: '#eab308', label: 'Aguardando' },
      { key: 'Sem OC', color: 'rgba(0,0,0,0.2)', label: 'Sem OC' },
    ];
    if (normalizedActiveMapModule === 'planejamentoSafra') return [
      { key: 'Planejado', color: '#3b82f6', label: 'Planejado' },
      { key: 'Não Planejado', color: 'rgba(0,0,0,0.2)', label: 'Não Planejado' },
    ];
    if (normalizedActiveMapModule === 'tratosCulturais' || normalizedActiveMapModule === 'planejamentoTratosCulturais') return [
      { key: 'Executada', color: '#8b5cf6', label: 'Executada/Fechada' },
      { key: 'Aberta', color: '#3b82f6', label: 'Aberta/Liberada' },
      { key: 'Sem OS', color: 'rgba(0,0,0,0.2)', label: 'Sem OS' },
    ];
    const by = new Map();
    for (const f of features) { const st = f?.properties?._normalized_ecorte || 'Sem estágio'; const c = f?.properties?._color || '#d1d5db'; if (!by.has(st)) by.set(st,{key:st,color:c,label:st}); }
    return Array.from(by.values()).sort((a,b)=>String(a.label).localeCompare(String(b.label),'pt-BR',{numeric:true}));
}

async function buildMapLayerResponse(query) {
    const {
        companyId, fazendaId, safra, activeMapModule = 'estimativa', fazenda, frente, variedade, corte, talhao,
        ordemCorteStatus, ordemCorteId, tipoPropriedade, statusPlanejamento, sequenciasPlanejamento, planningOperacao,
    } = query;

    const normalizedActiveMapModule = normalizeActiveMapModule(activeMapModule);

    if (!companyId) throw new Error('companyId is required');

    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || "agrosystem-e484e.firebasestorage.app";
    console.time("[maps-layer] geojson");
    const bucket = firebaseStorage.bucket(bucketName);
    const cleanCompanyId = String(companyId).split(':')[0];
    const prefixCandidates = await resolveStorageCompanyPrefixes(cleanCompanyId);

    let files = [];
    let usedPrefix = null;
    for (const candidate of prefixCandidates) {
        const prefix = `${candidate}/mapas/processados/geojson_`;
        const [candidateFiles] = await bucket.getFiles({ prefix });
        if (candidateFiles && candidateFiles.length > 0) { files = candidateFiles; usedPrefix = prefix; break; }
    }
    if (!files.length) throw new Error(`Nenhum mapa encontrado no servidor para ${companyId}.`);

    const latestFile = files.map(file => { const match = file.name.match(/geojson_(\d+)\.json/); return { file, timestamp: match ? parseInt(match[1], 10) : 0 }; }).sort((a, b) => b.timestamp - a.timestamp)[0];
    const rawCacheKey = `${cleanCompanyId}:${usedPrefix}:${latestFile.timestamp}`;
    let geojson = null;
    const cachedRaw = rawGeoJsonCache.get(rawCacheKey);
    if (cachedRaw && Date.now() - cachedRaw.createdAt < RAW_GEOJSON_CACHE_TTL_MS) geojson = cachedRaw.geojson;
    else { const [buffer] = await latestFile.file.download(); geojson = JSON.parse(buffer.toString('utf-8')); rawGeoJsonCache.set(rawCacheKey, { createdAt: Date.now(), geojson }); }
    const filters = { fazenda: fazenda || fazendaId, frente, variedade, corte, talhao, ordemCorteStatus, ordemCorteId, tipoPropriedade, statusPlanejamento, sequenciasPlanejamento, planningOperacao };
    const shouldProject = true;
    const features = Array.isArray(geojson.features) ? geojson.features : [];

    console.time("[maps-layer] estimativas");
    const estimatedIds = await buildEstimatedIds(cleanCompanyId, safra);
    console.time("[maps-layer] planejamento");
    const planningContext = await buildPlanningContexts(cleanCompanyId, safra);
    let ordemState = { statusById: new Map(), frenteById: new Map(), idsByOrdem: new Map(), activeOrderIds: null };
    try { const ordemPayload = await getOrdemCorteMapState(cleanCompanyId, safra); ordemState = buildOrdemState(ordemPayload?.data?.vinculos || [], ordemCorteId || ''); } catch {}
    console.time("[maps-layer] tratos");
    const serviceOrderState = await buildServiceOrderState(cleanCompanyId, safra);
    const estimatedFilterEnabled = estimatedIds.size > 0;

    const projectedFeatures = features.map((feature, i) => {
        const id = feature.id !== undefined ? feature.id : (feature.properties?.featureId ?? i);
        const isEstimated = featureHasAnyId(feature, estimatedIds);
        const osStatusMap = ['tratosCulturais', 'planejamentoTratosCulturais'].includes(normalizedActiveMapModule) ? serviceOrderState.statusById : ordemState.statusById;
        const osStatus = findStatusForFeature(feature, osStatusMap);
        const frenteOc = ordemState.frenteById.get(String(id)) || ordemState.frenteById.get(normalizeId(id)) || '';
        const plan = planningContext.planningById.get(String(id)) || planningContext.planningById.get(normalizeId(id)) || planningContext.planningById.get(getUniqueTalhaoIdBackend(feature)) || null;
        return { ...feature, id, properties: { ...(feature.properties || {}), featureId: feature.properties?.featureId ?? id, _normalized_ecorte: normalizeCorteBackend(feature.properties?.ECORTE), _is_estimated: isEstimated, _os_status: osStatus, _ordem_status: osStatus, _has_open_ordem: osStatus === 'Aberta', _is_aguardando_ordem: osStatus === 'Aguardando' && featureHasAnyId(feature, ordemState.statusById), _is_closed_ordem: osStatus === 'Fechada', _has_open_os: osStatus === 'Aberta', _is_closed_os: osStatus === 'Fechada', _is_aguardando_analista_os: osStatus === 'Aguardando Analista', _is_aguardando_aprovacao_os: osStatus === 'Aguardando Aprovação', _tipo_propriedade: String(feature.properties?._tipo_propriedade || feature.properties?.TIPO_PROPRIEDADE || 'PROPRIA').trim().toUpperCase(), _ref_planejada: feature.properties?._ref_planejada ?? feature.properties?.REF_PLANEJADA ?? feature.properties?.reforma ?? 'N', _venc_contrato: feature.properties?._venc_contrato ?? feature.properties?.VENC_CONTRATO ?? feature.properties?.vencimentoContrato ?? '', _status_planejamento: plan?.statusPlanejamento || feature.properties?._status_planejamento || '', _planning_status: plan?.statusPlanejamento || feature.properties?._status_planejamento || '', _sequencia_planejamento: plan?.sequencia ?? feature.properties?._sequencia_planejamento ?? '', _planning_operacao: plan?.planningOperacao || feature.properties?._planning_operacao || '', _planejamento: Boolean(plan), _frente_planejamento: plan?.frenteColheita || '', _frente_color: plan?.frenteColheita ? getFrenteColor(plan?.frenteColheita) : (feature.properties?._frente_color || ''), _frente_ordem_corte: frenteOc, } };
    });

    const filteredFeatures = projectedFeatures
        .filter((feature) => feature?.geometry)
        .filter((feature) => backendFilterFeature(feature, filters, normalizedActiveMapModule, ordemState, planningContext, estimatedFilterEnabled));

    for (const feature of filteredFeatures) {
        const p = feature.properties || {};
        let color = p._color || '';

        if (normalizedActiveMapModule === 'estimativa') {
            color = p._is_estimated ? (ECORTE_COLORS[p._normalized_ecorte] || '#6e6e6e') : 'transparent';
        } else if (normalizedActiveMapModule === 'ordemCorte') {
            color = p._ordem_status === 'Fechada' ? '#ef4444' : p._ordem_status === 'Aberta' ? '#22c55e' : p._ordem_status === 'Aguardando' ? '#eab308' : 'rgba(0,0,0,0.2)';
        } else if (normalizedActiveMapModule === 'planejamentoSafra') {
            color = p._planejamento ? (p._frente_color || getFrenteColor(p._frente_planejamento || p.FRENTE)) : 'rgba(0,0,0,0.2)';
        } else if (normalizedActiveMapModule === 'tratosCulturais' || normalizedActiveMapModule === 'planejamentoTratosCulturais') {
            color = p._os_status === 'Fechada' ? '#8b5cf6' : p._os_status === 'Aberta' ? '#3b82f6' : 'rgba(0,0,0,0.2)';
        }

        feature.properties = {
            ...p,
            _ordem_color: normalizedActiveMapModule === 'ordemCorte' ? color : (p._ordem_color || ''),
            _color: color || '#6e6e6e',
            _map_fill_color: color || '#6e6e6e',
            _map_fill_opacity: 0.65,
            _map_source: 'backend',
        };
    }
    const finalFeatures = filteredFeatures.map(applySafeMapFallback);
    const boundsMeta = computeBoundsMeta(finalFeatures);
    if (process.env.NODE_ENV !== 'production' && finalFeatures.length > 0) {
        const sample = finalFeatures[0];
        console.log('[maps-layer] sample feature properties', {
            activeMapModule: normalizedActiveMapModule,
            color: sample?.properties?._color,
            mapFillColor: sample?.properties?._map_fill_color,
            keys: Object.keys(sample?.properties || {}),
        });
    }

    const geojsonOut = { ...geojson, features: finalFeatures, bbox: boundsMeta.bbox || geojson.bbox || null, _serverBbox: boundsMeta.bbox, _serverCenter: boundsMeta.center, _serverZoomHint: boundsMeta.zoomHint };

    console.time("[maps-layer] summary");
    const summaryData = buildSummaryData(finalFeatures);
    const legendItems = buildLegendItems(finalFeatures, normalizedActiveMapModule);
    return {
        data: geojsonOut,
        timestamp: latestFile.timestamp,
        storagePrefix: usedPrefix,
        source: 'backend-filtered-cache',
        featureCount: filteredFeatures.length,
        totalFeatureCount: features.length,
        bbox: boundsMeta.bbox,
        center: boundsMeta.center,
        zoomHint: boundsMeta.zoomHint,
        filterOptions: { ...buildFilterOptions(projectedFeatures.filter((feature) => backendFilterFeature(feature, { ...filters, fazenda: "" }, normalizedActiveMapModule, ordemState, planningContext, estimatedFilterEnabled)), normalizedActiveMapModule), planningOperacoes: Array.from(planningContext.planningOperacoes || []).sort((a, b) => String(a).localeCompare(String(b), "pt-BR", { numeric: true })), },
        layer: { geojson: geojsonOut, filterOptions: { ...buildFilterOptions(projectedFeatures.filter((feature) => backendFilterFeature(feature, { ...filters, fazenda: "" }, normalizedActiveMapModule, ordemState, planningContext, estimatedFilterEnabled)), normalizedActiveMapModule), planningOperacoes: Array.from(planningContext.planningOperacoes || []).sort((a, b) => String(a).localeCompare(String(b), "pt-BR", { numeric: true })) }, summaryData, legendItems, bbox: boundsMeta.bbox || geojson.bbox || null, meta: { source: 'backend', activeMapModule: normalizedActiveMapModule, generatedAt: new Date().toISOString() } }
    };
}

router.get('/talhoes', async (req, res, next) => {
    try {
        const result = await buildMapLayerResponse(req.query);
        const { layer, ...legacy } = result;
        res.json({ success: true, ...legacy });
    } catch (error) {
        console.error('Error serving map data:', error);
        next(error);
    }
});

router.get('/layer', async (req, res, next) => {
    const timerLabel = `[maps-layer:${Date.now()}:${Math.random().toString(36).slice(2)}]`;
    console.time(timerLabel);
    try {
        const result = await buildMapLayerResponse(req.query);
        res.json({ success: true, ...(result.layer || {}) });
    } catch (error) {
        console.error('Error serving map layer:', error);
        next(error);
    } finally {
        console.timeEnd(timerLabel);
    }
});

export default router;
