import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma.js';

function firstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return null;
}

function toDecimal(value, max = 999999999999.99) {
  if (value === undefined || value === null || value === '') return null;
  let text = String(value).trim().replace(/\s/g, '');
  if (!text) return null;
  if (text.includes(',') && text.includes('.')) text = text.replace(/\./g, '').replace(',', '.');
  else if (text.includes(',')) text = text.replace(',', '.');
  const number = Number(text.replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(number) || Math.abs(number) > max) return null;
  return number;
}

function normalizeTextKey(value) {
  return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

async function resolveCompany(companyId) {
  const raw = String(companyId || '').trim();
  if (!raw) throw new Error('companyId é obrigatório.');
  const company = await prisma.company.findFirst({
    where: { OR: [{ id: raw }, { code: raw }, { name: { equals: raw, mode: 'insensitive' } }] },
  });
  if (company) return company;
  const normalized = normalizeTextKey(raw);
  const companies = await prisma.company.findMany();
  const fuzzy = companies.find((c) => normalizeTextKey(c.code) === normalized || normalizeTextKey(c.name) === normalized);
  if (fuzzy) return fuzzy;
  throw new Error(`Empresa não encontrada: ${raw}`);
}

async function findOrCreateFarm(company, row = {}) {
  const code = String(firstValue(row.fundo_agricola, row.fundoAgricola, row.codFaz, row.fazendaCodigo, row.fazenda, row.farmCode, 'SEM_FAZENDA'));
  const name = String(firstValue(row.nome_fazenda, row.desFazenda, row.fazendaNome, row.fazenda, code));
  return prisma.farm.upsert({
    where: { companyId_code: { companyId: company.id, code } },
    update: { name, rawData: row },
    create: { companyId: company.id, code, name, area: toDecimal(row.area), rawData: row },
  });
}

async function findOrCreateField(company, row = {}, farm = null) {
  const code = String(firstValue(row.talhaoId, row.talhao, row.codTalhao, row.fieldCode, row.fieldId, row.id));
  if (!code) return null;
  const targetFarm = farm || await findOrCreateFarm(company, row);
  return prisma.field.upsert({
    where: { companyId_code: { companyId: company.id, code } },
    update: { name: String(firstValue(row.talhaoNome, row.talhao, code)), area: toDecimal(row.area), farmId: targetFarm?.id || null, rawData: row },
    create: { companyId: company.id, code, name: String(firstValue(row.talhaoNome, row.talhao, code)), area: toDecimal(row.area), farmId: targetFarm?.id || null, rawData: row },
  });
}

async function findOrCreateVariety(company, row = {}) {
  const name = firstValue(row.variedade, row.nomeVariedade, row.VARIEDADE);
  if (!name) return null;
  return prisma.variety.upsert({
    where: { companyId_name: { companyId: company.id, name: String(name) } },
    update: { code: firstValue(row.codVariedade, row.codigoVariedade), rawData: row },
    create: { companyId: company.id, name: String(name), code: firstValue(row.codVariedade, row.codigoVariedade), rawData: row },
  });
}

function buildEstimateId(company, safra, rodada, row = {}) {
  const talhaoId = String(firstValue(row.talhaoId, row.talhao, row.fieldCode, row.id, randomUUID()));
  const rodadaKey = String(rodada || 'Estimativa').replace(/\s+/g, '_');
  return String(firstValue(row.id, row.documentId, `${company.code || company.id}_${String(safra || '').replace('/', '-')}_${rodadaKey}_${talhaoId}`));
}

export const estimativaController = {
  importChunk: async (req, res) => {
    try {
      const { companyId, safra, userId, dados, currentBatch, totalBatches } = req.body;
      if (!companyId || !Array.isArray(dados)) {
        return res.status(400).json({ success: false, message: 'companyId e dados (array) são obrigatórios.' });
      }
      if (dados.length === 0) return res.status(200).json({ success: true, quantidade: 0 });

      const company = await resolveCompany(companyId);
      const safeSafra = String(safra || '2026/2027');
      let inserted = 0;

      for (const row of dados) {
        const talhaoId = String(firstValue(row?.talhaoId, row?.talhao, row?.fieldCode, row?.id, '') || '').trim();
        if (!talhaoId) continue;
        const rodada = String(firstValue(row.rodada, row.round, 'Estimativa'));
        const farm = await findOrCreateFarm(company, row);
        const field = await findOrCreateField(company, { ...row, talhaoId }, farm);
        const variety = await findOrCreateVariety(company, row);
        const id = buildEstimateId(company, safeSafra, rodada, { ...row, talhaoId });
        const rawData = { ...row, id, companyId: company.code || company.id, safra: safeSafra, rodada, talhaoId, updatedBy: userId || 'system' };

        await prisma.estimate.upsert({
          where: { id },
          update: {
            companyId: company.id, farmId: farm?.id || null, fieldId: field?.id || null, varietyId: variety?.id || null,
            harvestYear: safeSafra, round: rodada, estimatedTch: toDecimal(firstValue(row.tch, row.estimatedTch), 9999999999.99),
            estimatedTon: toDecimal(firstValue(row.toneladas, row.estimatedTon, row.tonEst), 999999999999.99),
            estimatedAtr: toDecimal(firstValue(row.atr, row.estimatedAtr), 9999999999.99), area: toDecimal(row.area, 9999999999.99),
            source: 'import:postgres', rawData,
          },
          create: {
            id, companyId: company.id, farmId: farm?.id || null, fieldId: field?.id || null, varietyId: variety?.id || null,
            harvestYear: safeSafra, round: rodada, estimatedTch: toDecimal(firstValue(row.tch, row.estimatedTch), 9999999999.99),
            estimatedTon: toDecimal(firstValue(row.toneladas, row.estimatedTon, row.tonEst), 999999999999.99),
            estimatedAtr: toDecimal(firstValue(row.atr, row.estimatedAtr), 9999999999.99), area: toDecimal(row.area, 9999999999.99),
            source: 'import:postgres', rawData,
          },
        });
        await prisma.estimateHistory.create({ data: { estimateId: id, action: 'import', newData: rawData } }).catch(() => null);
        inserted += 1;
      }

      return res.status(200).json({ success: true, quantidade: inserted, message: `Lote ${currentBatch || '-'} de ${totalBatches || '-'} processado.` });
    } catch (error) {
      console.error('Erro ao processar chunk de estimativa no PostgreSQL:', error);
      return res.status(500).json({ success: false, message: 'Erro interno ao importar chunk de estimativa.', error: error.message });
    }
  }
};
