import { randomUUID } from "crypto";
import { prisma } from "../../lib/prisma.js";
import { buildCompanyWhere as buildResolvedCompanyWhere } from "./postgresControllerUtils.js";

function parsePagination(query) {
  const page = Math.max(Number(query.page || 1), 1);
  const limit = Math.min(Math.max(Number(query.limit || 50), 1), 500);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

async function buildCompanyWhere(companyId) {
  return buildResolvedCompanyWhere(companyId);
}

export async function getFarms(req, res) {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const where = await buildCompanyWhere(req.query.companyId);

    const [total, data] = await Promise.all([
      prisma.farm.count({ where }),
      prisma.farm.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ code: "asc" }, { name: "asc" }],
      }),
    ]);

    res.json({ success: true, page, limit, total, data });
  } catch (error) {
    console.error("Erro ao buscar fazendas no PostgreSQL:", error);
    res.status(500).json({ success: false, message: "Erro ao buscar fazendas no PostgreSQL" });
  }
}

export async function getFields(req, res) {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { companyId, farmId } = req.query;

    const where = {
      ...(await buildCompanyWhere(companyId)),
      ...(farmId ? { farmId: String(farmId) } : {}),
    };

    const [total, data] = await Promise.all([
      prisma.field.count({ where }),
      prisma.field.findMany({
        where,
        skip,
        take: limit,
        include: {
          farm: { select: { id: true, code: true, name: true } },
          variety: { select: { id: true, code: true, name: true } },
        },
        orderBy: [{ code: "asc" }],
      }),
    ]);

    res.json({ success: true, page, limit, total, data });
  } catch (error) {
    console.error("Erro ao buscar talhões no PostgreSQL:", error);
    res.status(500).json({ success: false, message: "Erro ao buscar talhões no PostgreSQL" });
  }
}

export async function getVarieties(req, res) {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const where = await buildCompanyWhere(req.query.companyId);

    const [total, data] = await Promise.all([
      prisma.variety.count({ where }),
      prisma.variety.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ name: "asc" }],
      }),
    ]);

    res.json({ success: true, page, limit, total, data });
  } catch (error) {
    console.error("Erro ao buscar variedades no PostgreSQL:", error);
    res.status(500).json({ success: false, message: "Erro ao buscar variedades no PostgreSQL" });
  }
}

export async function getEstimates(req, res) {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { companyId, harvestYear, round, farmId, fieldId } = req.query;

    const where = {
      ...(await buildCompanyWhere(companyId)),
      ...(harvestYear ? { harvestYear: String(harvestYear) } : {}),
      ...(round ? { round: String(round) } : {}),
      ...(farmId ? { farmId: String(farmId) } : {}),
      ...(fieldId ? { fieldId: String(fieldId) } : {}),
    };

    const [total, data] = await Promise.all([
      prisma.estimate.count({ where }),
      prisma.estimate.findMany({
        where,
        skip,
        take: limit,
        include: {
          farm: { select: { id: true, code: true, name: true } },
          field: { select: { id: true, code: true, name: true } },
          variety: { select: { id: true, code: true, name: true } },
        },
        orderBy: [{ updatedAt: "desc" }],
      }),
    ]);

    res.json({ success: true, page, limit, total, data });
  } catch (error) {
    console.error("Erro ao buscar estimativas no PostgreSQL:", error);
    res.status(500).json({ success: false, message: "Erro ao buscar estimativas no PostgreSQL" });
  }
}

export async function getCutOrders(req, res) {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { companyId, status } = req.query;

    const where = {
      ...(await buildCompanyWhere(companyId)),
      ...(status ? { status: String(status) } : {}),
    };

    const [total, data] = await Promise.all([
      prisma.cutOrder.count({ where }),
      prisma.cutOrder.findMany({
        where,
        skip,
        take: limit,
        include: {
          company: { select: { id: true, code: true, name: true } },
          farm: { select: { id: true, code: true, name: true } },
          fields: {
            include: {
              field: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  area: true,
                  farmId: true,
                  farm: { select: { id: true, code: true, name: true } },
                },
              },
            },
          },
        },
        orderBy: [{ openingDate: "desc" }, { createdAt: "desc" }],
      }),
    ]);

    res.json({ success: true, page, limit, total, data });
  } catch (error) {
    console.error("Erro ao buscar ordens de corte no PostgreSQL:", error);
    res.status(500).json({ success: false, message: "Erro ao buscar ordens de corte no PostgreSQL" });
  }
}

export async function getServiceOrders(req, res) {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { companyId, status } = req.query;

    const where = {
      ...(await buildCompanyWhere(companyId)),
      ...(status ? { status: String(status) } : {}),
    };

    const [total, data] = await Promise.all([
      prisma.serviceOrder.count({ where }),
      prisma.serviceOrder.findMany({
        where,
        skip,
        take: limit,
        include: {
          fields: {
            include: {
              field: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  area: true,
                  farmId: true,
                  farm: { select: { id: true, code: true, name: true } },
                },
              },
            },
          },
        },
        orderBy: [{ openingDate: "desc" }, { createdAt: "desc" }],
      }),
    ]);

    res.json({ success: true, page, limit, total, data });
  } catch (error) {
    console.error("Erro ao buscar ordens de serviço no PostgreSQL:", error);
    res.status(500).json({ success: false, message: "Erro ao buscar ordens de serviço no PostgreSQL" });
  }
}


function toDashboardNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value).replace(/\./g, '').replace(',', '.').replace(/[^\d.\-]/g, '');
  const n = Number.parseFloat(text);
  return Number.isFinite(n) ? n : 0;
}

function withClosureBackendCalculations(record) {
  const raw = record?.rawData && typeof record.rawData === 'object' ? record.rawData : {};

  const pickRaw = (...keys) => {
    for (const key of keys) {
      if (raw?.[key] !== undefined && raw?.[key] !== null && String(raw[key]).trim() !== '') return raw[key];
    }
    return undefined;
  };

  const cutArea = toDashboardNumber(pickRaw('Cortada', 'cortada', 'AREA CORTADA', 'Area Cortada', 'Área Cortada') ?? record.cutArea);
  const prevTon = toDashboardNumber(pickRaw('Prod. Prev.', 'prodPrev', 'PROD. PREV.', 'Prod Prev', 'PROD PREV') ?? record.prevTon);
  const realTon = toDashboardNumber(pickRaw('Prod. Real', 'prodReal', 'PROD. REAL', 'Prod Real', 'PROD REAL') ?? record.realTon);
  const atr = toDashboardNumber(pickRaw('Atr', 'atr', 'ATR') ?? record.atr);

  const prevTchCalc = cutArea > 0 ? prevTon / cutArea : 0;
  const realTchCalc = cutArea > 0 ? realTon / cutArea : 0;
  const atrPrevNumerator = prevTon > 0 && atr > 0 ? prevTon * atr : 0;
  const atrRealNumerator = realTon > 0 && atr > 0 ? realTon * atr : 0;

  const calculated = {
    cutAreaCalc: cutArea,
    prevTonCalc: prevTon,
    realTonCalc: realTon,
    atrBaseCalc: atr,
    prevTchCalc,
    realTchCalc,
    atrPrevNumerator,
    atrPrevWeight: prevTon,
    atrRealNumerator,
    atrRealWeight: realTon,
  };

  return {
    ...record,
    prevTch: prevTchCalc,
    realTch: realTchCalc,
    calculated,
    rawData: {
      ...raw,
      tHaPrev: prevTchCalc,
      tHaReal: realTchCalc,
      prevTchCalc,
      realTchCalc,
      atrPrevNumerator,
      atrPrevWeight: prevTon,
      atrRealNumerator,
      atrRealWeight: realTon,
    },
  };
}

export async function getClosureDashboardRecords(req, res) {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { companyId, harvestYear, farmCode } = req.query;

    const where = {
      ...(await buildCompanyWhere(companyId)),
      ...(harvestYear ? { harvestYear: String(harvestYear) } : {}),
      ...(farmCode ? { farmCode: String(farmCode) } : {}),
    };

    const [total, data] = await Promise.all([
      prisma.closureDashboardRecord.count({ where }),
      prisma.closureDashboardRecord.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ closingDate: "desc" }, { farmCode: "asc" }, { fieldCode: "asc" }],
      }),
    ]);

    const normalizedData = data.map(withClosureBackendCalculations);

    res.json({ success: true, page, limit, total, data: normalizedData });
  } catch (error) {
    console.error("Erro ao buscar fechamento OC no PostgreSQL:", error);
    res.status(500).json({ success: false, message: "Erro ao buscar fechamento OC no PostgreSQL" });
  }
}

export async function getHarvestPlans(req, res) {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { companyId, harvestYear, front, sequence } = req.query;

    const where = {
      ...(await buildCompanyWhere(companyId)),
      ...(harvestYear ? { harvestYear: String(harvestYear) } : {}),
      ...(front ? { front: String(front) } : {}),
      ...(sequence ? { sequence: Number(sequence) } : {}),
    };

    const [total, data] = await Promise.all([
      prisma.harvestPlan.count({ where }),
      prisma.harvestPlan.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { entryDate: "asc" },
          { front: "asc" },
          { sequence: "asc" },
          { createdAt: "asc" },
        ],
      }),
    ]);

    res.json({ success: true, page, limit, total, data });
  } catch (error) {
    console.error("Erro ao buscar planejamento safra no PostgreSQL:", error);
    res.status(500).json({ success: false, message: "Erro ao buscar planejamento safra no PostgreSQL" });
  }
}

function normalizeServicePlanningStatus(status) {
  const value = String(status || '').toUpperCase().trim();
  if (!value) return 'ABERTA';
  if (value.includes('CANCEL')) return 'CANCELADO';
  if (value.includes('EXECUT') || value.includes('FINAL') || value.includes('FECH')) return 'EXECUTADA';
  if (value.includes('APROVACAO') || value.includes('APROVAÇÃO')) return 'PENDENTE_APROVACAO';
  if (value.includes('ANALISTA')) return 'AGUARDANDO_ANALISTA';
  if (value.includes('AGUARD')) return 'AGUARDANDO';
  if (value === 'ABERTO' || value === 'ABERTA') return 'ABERTA';
  return value;
}

function toDecimalOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(String(value).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function toIntOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

async function resolveSingleCompanyId(companyRef) {
  const ids = await buildResolvedCompanyWhere(companyRef);
  if (!ids || !ids.companyId) return null;
  if (Array.isArray(ids.companyId?.in) && ids.companyId.in.length) return ids.companyId.in[0];
  if (typeof ids.companyId === 'string') return ids.companyId;
  return null;
}

export async function getPlanningTreatments(req, res) {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { companyId, harvestYear, status } = req.query;

    const where = {
      ...(await buildCompanyWhere(companyId)),
      ...(harvestYear ? { harvestYear: String(harvestYear) } : {}),
      ...(status ? { status: String(status) } : {}),
    };

    const [total, masters] = await Promise.all([
      prisma.planningTreatment.count({ where }),
      prisma.planningTreatment.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { sequential: 'desc' }],
      }),
    ]);

    const ids = masters.map((item) => item.id);
    const fields = ids.length
      ? await prisma.planningTreatmentField.findMany({
          where: { planningTreatmentId: { in: ids } },
          orderBy: [{ createdAt: 'asc' }],
        })
      : [];

    const fieldsByMaster = new Map();
    for (const field of fields) {
      const list = fieldsByMaster.get(field.planningTreatmentId) || [];
      list.push(field);
      fieldsByMaster.set(field.planningTreatmentId, list);
    }

    const data = masters.map((item) => ({
      ...item,
      fields: fieldsByMaster.get(item.id) || [],
    }));

    res.json({ success: true, page, limit, total, data });
  } catch (error) {
    console.error('Erro ao buscar planejamento de tratos no PostgreSQL:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar planejamento de tratos no PostgreSQL' });
  }
}

export async function createPlanningTreatment(req, res) {
  try {
    const body = req.body || {};
    const mestre = body.mestre || body.master || body;
    const vinculos = Array.isArray(body.vinculos) ? body.vinculos : Array.isArray(body.fields) ? body.fields : [];

    const companyId = await resolveSingleCompanyId(mestre.companyId);
    if (!companyId) {
      return res.status(400).json({ success: false, message: 'Empresa não encontrada para planejamento de tratos.' });
    }

    const id = String(mestre.id || randomUUID());
    const harvestYear = mestre.safra ? String(mestre.safra) : null;
    const status = normalizeServicePlanningStatus(mestre.status || 'ABERTA');

    const saved = await prisma.$transaction(async (tx) => {
      const master = await tx.planningTreatment.upsert({
        where: { id },
        update: {
          companyId,
          harvestYear,
          sequential: toIntOrNull(mestre.sequencial),
          status,
          operation: mestre.operacao || null,
          protocolOriginalId: mestre.protocoloOriginalId ? String(mestre.protocoloOriginalId) : null,
          protocolName: mestre.protocoloNome ? String(mestre.protocoloNome) : null,
          subProtocol: mestre.subProtocolo ? String(mestre.subProtocolo) : null,
          editedProtocol: Array.isArray(mestre.protocoloEditado) ? mestre.protocoloEditado : null,
          originalCost: toDecimalOrNull(mestre.custoTotalOriginal),
          plannedCost: toDecimalOrNull(mestre.custoTotalPlanejado || mestre.custoTotalOS),
          justification: mestre.justificativaApoio || mestre.justificativaAprovacao || null,
          totalFields: toIntOrNull(mestre.totalTalhoes || vinculos.length),
          totalFarms: toIntOrNull(mestre.totalFazendas),
          farms: mestre.fazendas || mestre.fazendasNomes || null,
          rawData: mestre,
        },
        create: {
          id,
          companyId,
          harvestYear,
          sequential: toIntOrNull(mestre.sequencial),
          status,
          operation: mestre.operacao || null,
          protocolOriginalId: mestre.protocoloOriginalId ? String(mestre.protocoloOriginalId) : null,
          protocolName: mestre.protocoloNome ? String(mestre.protocoloNome) : null,
          subProtocol: mestre.subProtocolo ? String(mestre.subProtocolo) : null,
          editedProtocol: Array.isArray(mestre.protocoloEditado) ? mestre.protocoloEditado : null,
          originalCost: toDecimalOrNull(mestre.custoTotalOriginal),
          plannedCost: toDecimalOrNull(mestre.custoTotalPlanejado || mestre.custoTotalOS),
          justification: mestre.justificativaApoio || mestre.justificativaAprovacao || null,
          totalFields: toIntOrNull(mestre.totalTalhoes || vinculos.length),
          totalFarms: toIntOrNull(mestre.totalFazendas),
          farms: mestre.fazendas || mestre.fazendasNomes || null,
          rawData: mestre,
        },
      });

      await tx.planningTreatmentField.deleteMany({ where: { planningTreatmentId: id } });

      if (vinculos.length) {
        await tx.planningTreatmentField.createMany({
          data: vinculos.map((item, index) => ({
            id: String(item.id || `${id}_${item.talhaoId || index}`),
            planningTreatmentId: id,
            companyId,
            harvestYear: item.safra ? String(item.safra) : harvestYear,
            fieldCode: item.talhaoId ? String(item.talhaoId) : null,
            fieldName: item.talhaoNome ? String(item.talhaoNome) : null,
            farmCode: item.fundoAgricola || item.fundo_agricola || null,
            farmName: item.fazenda || item.fazendaNome || item.nome_fazenda || null,
            cut: item.corte ? String(item.corte) : null,
            area: toDecimalOrNull(item.area),
            status: normalizeServicePlanningStatus(item.status || status),
            rawData: item,
          })),
        });
      }

      return master;
    });

    res.status(201).json({ success: true, data: saved });
  } catch (error) {
    console.error('Erro ao salvar planejamento de tratos no PostgreSQL:', error);
    res.status(500).json({ success: false, message: 'Erro ao salvar planejamento de tratos no PostgreSQL' });
  }
}
