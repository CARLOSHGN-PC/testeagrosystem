import { prisma } from '../../../lib/prisma.js';

function firstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function normalizeCompany(value) {
  return String(value || '').trim();
}

class RelatorioEstimativaRepository {
  async resolveCompanyId(empresaId) {
    const raw = normalizeCompany(empresaId);
    if (!raw) return null;
    const company = await prisma.company.findFirst({
      where: { OR: [{ id: raw }, { code: raw }, { name: { equals: raw, mode: 'insensitive' } }] },
      select: { id: true },
    });
    return company?.id || raw;
  }

  async fetchEstimativas(filters = {}) {
    const companyId = await this.resolveCompanyId(filters.empresaId);
    const rows = await prisma.estimate.findMany({
      where: {
        ...(companyId ? { companyId } : {}),
        ...(filters.safra ? { harvestYear: String(filters.safra) } : {}),
      },
      include: { farm: true, field: true, variety: true },
      orderBy: [{ updatedAt: 'desc' }],
    });

    let results = rows.map((row) => ({
      ...(row.rawData || {}),
      id: row.id,
      companyId: filters.empresaId || row.companyId,
      safra: row.harvestYear || row.rawData?.safra || '',
      rodada: row.round || row.rawData?.rodada || 'Estimativa',
      talhaoId: firstValue(row.rawData?.talhaoId, row.field?.code, row.fieldId),
      talhao: firstValue(row.rawData?.talhao, row.field?.name, row.field?.code),
      fazenda: firstValue(row.rawData?.fazenda, row.farm?.name, row.farm?.code),
      fazendaId: firstValue(row.rawData?.fazendaId, row.farm?.id, row.farm?.code),
      fundo_agricola: firstValue(row.rawData?.fundo_agricola, row.farm?.code),
      variedade: firstValue(row.rawData?.variedade, row.variety?.name),
      area: row.rawData?.area ?? row.area,
      tch: row.rawData?.tch ?? row.estimatedTch,
      toneladas: row.rawData?.toneladas ?? row.estimatedTon,
      updatedAt: row.updatedAt,
    }));

    if (filters.unidadeId) {
      results = results.filter((item) => item.unidadeId == filters.unidadeId || item.fundo_agricola == filters.unidadeId);
    }
    if (filters.tipoPropriedade?.length && !filters.tipoPropriedade.includes('TODAS')) {
      results = results.filter((item) => filters.tipoPropriedade.includes(String(item.tipoPropriedade || 'PROPRIA').toUpperCase()));
    }
    if (filters.fazendaIds?.length) results = results.filter((item) => filters.fazendaIds.includes(item.fazenda) || filters.fazendaIds.includes(item.fazendaId));
    if (filters.talhaoIds?.length) results = results.filter((item) => filters.talhaoIds.includes(item.talhaoId));
    if (filters.cortes?.length) results = results.filter((item) => filters.cortes.includes(item.corte || item.ecorte));
    if (filters.situacao === 'SOMENTE_ESTIMATIVA') results = results.filter((item) => String(item.rodada || '').startsWith('Estimativa'));
    if (filters.situacao === 'SOMENTE_REESTIMATIVA') results = results.filter((item) => String(item.rodada || '').startsWith('Reestimativa'));
    return results;
  }
}

export default new RelatorioEstimativaRepository();
