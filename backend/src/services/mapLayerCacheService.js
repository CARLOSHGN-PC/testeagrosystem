import { prisma } from '../lib/prisma.js';
import { buildCompanyWhere } from '../controllers/postgres/postgresControllerUtils.js';

const cache = new Map();
const CACHE_TTL_MS = 60 * 1000;

function firstText(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

function normalizeStatus(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return 'ABERTA';
  if (raw.includes('FINAL') || raw.includes('FECH') || raw.includes('ENCERR')) return 'FINALIZADA';
  if (raw.includes('AGUARD') || raw.includes('PEND')) return 'AGUARDANDO';
  if (raw.includes('CANCEL')) return 'CANCELADA';
  if (raw === 'ABERTO' || raw === 'OPEN') return 'ABERTA';
  return raw;
}

function sameSafra(order, safra) {
  if (!safra || String(safra) === 'todas') return true;
  const raw = order.rawData || {};
  return String(firstText(raw.safra, order.harvestYear)) === String(safra);
}

function serializeOrder(order) {
  const raw = order.rawData || {};
  const farm = order.farm || null;
  const companyId = firstText(raw.companyId, order.company?.code, order.companyId);
  const safra = firstText(raw.safra, raw.harvestYear);
  const status = normalizeStatus(raw.status || order.status);
  const codigo = firstText(raw.codigo, raw.ordemCodigo, raw.sequencial);
  const numeroEmpresa = firstText(raw.numeroEmpresa, raw.numero, order.number);
  const farmCode = firstText(raw.fundoAgricola, raw.fundo_agricola, raw.fazenda, farm?.code);
  const farmName = firstText(raw.fazendaNome, raw.nome_fazenda, raw.fazendaDescricao, farm?.name, farmCode);
  const farmId = firstText(raw.fazendaId, raw.id_fazenda, farm?.id, farmCode);

  return {
    ...raw,
    id: order.id,
    companyId,
    safra,
    codigo,
    ordemCodigo: firstText(raw.ordemCodigo, codigo),
    sequencial: Number(raw.sequencial || String(codigo).replace(/\D/g, '')) || null,
    numeroEmpresa,
    status,
    openedAt: raw.openedAt || raw.createdAt || order.openingDate || order.createdAt || null,
    closedAt: raw.closedAt || order.closingDate || null,
    updatedAt: order.updatedAt || raw.updatedAt || new Date().toISOString(),
    fazendaId: farmId,
    id_fazenda: farmId,
    fazendaNome: farmName,
    nome_fazenda: farmName,
    fundoAgricola: farmCode,
    fundo_agricola: farmCode,
    fazendaDescricao: firstText(raw.fazendaDescricao, farm?.name, farmName),
    syncStatus: 'synced',
    source: 'postgres-cache',
  };
}

function serializeLink(relation, order, ordem) {
  const relRaw = relation.rawData || {};
  const field = relation.field || null;
  const fieldFarm = field?.farm || order.farm || null;
  const orderRaw = order.rawData || {};
  const talhaoId = firstText(relRaw.talhaoId, relRaw.idTalhao, field?.code, relation.fieldCode, field?.id);
  if (!talhaoId) return null;
  const status = normalizeStatus(relRaw.status || orderRaw.status || order.status);
  const farmCode = firstText(relRaw.fundoAgricola, relRaw.fundo_agricola, fieldFarm?.code, ordem.fundoAgricola);
  const farmName = firstText(relRaw.fazendaNome, relRaw.nome_fazenda, relRaw.fazendaDescricao, fieldFarm?.name, ordem.fazendaNome);
  const farmId = firstText(relRaw.fazendaId, relRaw.id_fazenda, fieldFarm?.id, ordem.fazendaId, farmCode);

  return {
    ...relRaw,
    id: firstText(relRaw.id, relation.id, `${order.id}_${talhaoId}`),
    companyId: ordem.companyId,
    safra: ordem.safra,
    ordemCorteId: firstText(relRaw.ordemCorteId, order.id),
    cutOrderId: order.id,
    talhaoId,
    talhaoNome: firstText(relRaw.talhaoNome, relRaw.nomeTalhao, field?.name, talhaoId),
    status,
    sequencial: ordem.sequencial,
    codigo: ordem.codigo,
    ordemCodigo: ordem.ordemCodigo,
    numeroEmpresa: firstText(relRaw.numeroEmpresa, ordem.numeroEmpresa),
    openedAt: relRaw.openedAt || ordem.openedAt,
    closedAt: relRaw.closedAt || ordem.closedAt || null,
    fazendaId: farmId,
    id_fazenda: farmId,
    fazendaNome: farmName,
    nome_fazenda: farmName,
    fundoAgricola: farmCode,
    fundo_agricola: farmCode,
    fazendaDescricao: firstText(relRaw.fazendaDescricao, fieldFarm?.name, farmName),
    area: relRaw.area ?? relation.area ?? field?.area ?? null,
    field,
    fieldCode: field?.code ?? null,
    fieldName: field?.name ?? null,
    fieldFarmCode: fieldFarm?.code ?? null,
    fieldFarmName: fieldFarm?.name ?? null,
    estimatedTon: relRaw.estimatedTon ?? relation.estimatedTon ?? null,
    realTon: relRaw.realTon ?? relation.realTon ?? null,
    syncStatus: 'synced',
    source: 'postgres-cache',
    updatedAt: relation.updatedAt || relRaw.updatedAt || ordem.updatedAt,
  };
}

export function invalidateMapLayerCache({ companyId, safra } = {}) {
  for (const key of cache.keys()) {
    if (!companyId || key.includes(`:${companyId}:`)) {
      if (!safra || key.endsWith(`:${safra}`) || key.endsWith(':all')) cache.delete(key);
    }
  }
}

export async function getOrdemCorteMapState(companyId, safra) {
  if (!companyId) throw new Error('companyId é obrigatório.');
  const cacheKey = `ordem-corte:${companyId}:${safra || 'all'}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) return { ...cached.payload, cached: true };

  const where = await buildCompanyWhere(companyId);
  const orders = await prisma.cutOrder.findMany({
    where,
    select: {
      id: true,
      companyId: true,
      number: true,
      status: true,
      openingDate: true,
      closingDate: true,
      rawData: true,
      createdAt: true,
      updatedAt: true,
      company: { select: { id: true, code: true, name: true } },
      farm: { select: { id: true, code: true, name: true } },
      fields: {
        select: {
          id: true,
          cutOrderId: true,
          fieldId: true,
          area: true,
          estimatedTon: true,
          realTon: true,
          rawData: true,
          updatedAt: true,
          field: { select: { id: true, code: true, name: true, area: true, farm: { select: { id: true, code: true, name: true } } } },
        },
      },
    },
    orderBy: [{ updatedAt: 'desc' }],
  });

  const ordens = [];
  const vinculos = [];
  for (const order of orders) {
    if (!sameSafra(order, safra)) continue;
    const ordem = serializeOrder(order);
    ordens.push(ordem);
    for (const rel of order.fields || []) {
      const vinculo = serializeLink(rel, order, ordem);
      if (vinculo) vinculos.push(vinculo);
    }
  }

  const payload = {
    success: true,
    data: { ordens, vinculos, generatedAt: new Date().toISOString() },
  };
  cache.set(cacheKey, { createdAt: Date.now(), payload });
  return payload;
}
