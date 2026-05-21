import { prisma } from '../../../lib/prisma.js';
import { gerarPdfOrdemCorte } from '../services/pdf/gerarPdfOrdemCorte.js';

const firstFilled = (...values) => {
  for (const value of values) if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  return '';
};

const parseNumber = (...values) => {
  for (const value of values) {
    const n = Number(String(value ?? '').replace(',', '.'));
    if (Number.isFinite(n) && n !== 0) return n;
  }
  return 0;
};

const buildTalhaoDisplay = (vinculo = {}, estimativa = {}) => firstFilled(
  vinculo.talhaoNome, vinculo.nomeTalhao, vinculo.talhao, vinculo.TALHAO, vinculo.talhaoNumero,
  estimativa.talhao, estimativa.talhaoNome, estimativa.nomeTalhao, estimativa.TALHAO, estimativa.talhaoNumero, '-'
);

const buildFazendaDisplay = (ordem = {}, vinculo = {}, estimativa = {}) => firstFilled(
  ordem.nome_fazenda, ordem.fazendaNome, ordem.fazendaDescricao, ordem.farm?.name,
  vinculo.nome_fazenda, vinculo.fazendaNome, vinculo.fazendaDescricao,
  estimativa.nome_fazenda, estimativa.fazendaNome, estimativa.fazendaDescricao, estimativa.fazenda, 'Não informada'
);

async function resolveCompanyId(companyId) {
  const raw = String(companyId || '').trim();
  const company = await prisma.company.findFirst({ where: { OR: [{ id: raw }, { code: raw }, { name: { equals: raw, mode: 'insensitive' } }] }, select: { id: true } });
  return company?.id || raw;
}

async function buscarEstimativaTalhao({ companyId, safra, vinculo }) {
  const companyDbId = await resolveCompanyId(companyId);
  const talhaoId = firstFilled(vinculo.talhaoId, vinculo.idTalhao, vinculo.field?.code, vinculo.fieldId);
  const row = await prisma.estimate.findFirst({
    where: { companyId: companyDbId, ...(safra ? { harvestYear: String(safra) } : {}), OR: [{ fieldId: String(vinculo.fieldId || '') }, { field: { code: String(talhaoId || '') } }] },
    include: { farm: true, field: true, variety: true },
    orderBy: [{ updatedAt: 'desc' }],
  }).catch(() => null);
  if (!row) return {};
  return { ...(row.rawData || {}), id: row.id, talhaoId: row.field?.code || row.fieldId, talhao: row.field?.name || row.field?.code, fazenda: row.farm?.name || row.farm?.code, area: row.rawData?.area ?? row.area, tch: row.rawData?.tch ?? row.estimatedTch, toneladas: row.rawData?.toneladas ?? row.estimatedTon };
}

class OrdemCorteRelatorioController {
  static async gerarPdfOperacional(req, res) {
    try {
      const { companyId } = req.params;
      const { ordemId } = req.query;
      if (!companyId || !ordemId) return res.status(400).json({ success: false, message: 'companyId e ordemId são obrigatórios.' });

      const companyDbId = await resolveCompanyId(companyId);
      const ordem = await prisma.cutOrder.findFirst({ where: { id: String(ordemId), companyId: companyDbId }, include: { farm: true, fields: { include: { field: { include: { farm: true } } } } } });
      if (!ordem) return res.status(404).json({ success: false, message: 'Ordem de corte não encontrada.' });

      const ordemDados = { ...(ordem.rawData || {}), id: ordem.id, status: ordem.status, numeroEmpresa: ordem.number, openedAt: ordem.openingDate, closedAt: ordem.closingDate, farm: ordem.farm };
      const talhoesVinculados = ordem.fields.map((v) => ({ ...(v.rawData || {}), id: v.id, fieldId: v.fieldId, talhaoId: v.field?.code, talhaoNome: v.field?.name || v.field?.code, fazendaNome: v.field?.farm?.name || ordem.farm?.name, area: v.area, tonEstimado: v.estimatedTon }));

      let totalArea = 0, totalTon = 0;
      let fazendaPrincipal = firstFilled(ordemDados.nome_fazenda, ordemDados.fazendaNome, ordemDados.fazendaDescricao, ordem.farm?.name, 'Não informada');
      const talhoesResolvidos = await Promise.all(talhoesVinculados.map(async (vinculo) => {
        const estData = await buscarEstimativaTalhao({ companyId, safra: vinculo.safra || ordemDados.safra, vinculo });
        const talhaoNome = buildTalhaoDisplay(vinculo, estData);
        const area = parseNumber(vinculo.area, vinculo.areaEstimada, estData.area, estData.areaEstimada, estData.areaTotal);
        const tchEstimado = parseNumber(vinculo.tchEstimado, vinculo.tch, estData.tch_estimativa, estData.tchEstimativa, estData.tchEstimado, estData.tch, estData.tchPrevisto);
        const tonEstimado = parseNumber(vinculo.tonEstimado, vinculo.tonEstimada, vinculo.toneladas, estData.toneladas_estimativa, estData.toneladasEstimativa, estData.toneladas, area * tchEstimado);
        const fazendaLinha = buildFazendaDisplay(ordemDados, vinculo, estData);
        if ((!fazendaPrincipal || fazendaPrincipal === 'Não informada') && fazendaLinha) fazendaPrincipal = fazendaLinha;
        totalArea += area; totalTon += tonEstimado;
        return { talhaoId: vinculo.talhaoId, talhaoNome, area, tchEstimado, tonEstimado, queimaCorte: firstFilled(ordemDados.tipoCana, ordemDados.tipoColheita, vinculo.queimaCorte, 'CRUA') };
      }));

      const openedAt = ordemDados.openedAt ? new Date(ordemDados.openedAt) : null;
      const reportData = {
        idSistema: ordemDados.id,
        numeroEmpresa: ordemDados.numeroEmpresa || '',
        status: ordemDados.status || 'AGUARDANDO',
        fazenda: fazendaPrincipal,
        frente: firstFilled(ordemDados.frenteServico, ordemDados.frente, ordemDados.nomeFrente),
        data: openedAt && !Number.isNaN(openedAt.getTime()) ? openedAt.toLocaleDateString('pt-BR') : '',
        hora: openedAt && !Number.isNaN(openedAt.getTime()) ? openedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
        responsavel: firstFilled(ordemDados.nomeColaborador, ordemDados.responsavel),
        tipoCana: firstFilled(ordemDados.tipoCana, ordemDados.tipoColheita),
        observacao: ordemDados.observacao || '',
        talhoes: talhoesResolvidos,
        totalArea,
        totalTon,
      };

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
      res.setHeader('Content-Disposition', `attachment; filename=OrdemCorte_${ordemDados.numeroEmpresa || ordemDados.codigo || ordemDados.sequencial || ordemDados.id}.pdf`);
      gerarPdfOrdemCorte(reportData, res);
    } catch (error) {
      console.error('Erro ao gerar relatório PDF da Ordem de Corte:', error);
      if (!res.headersSent) res.status(500).json({ success: false, message: 'Erro ao gerar relatório', error: error.message });
    }
  }
}

export default OrdemCorteRelatorioController;
