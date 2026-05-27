import { prisma } from '../../../lib/prisma.js';
import { gerarPdfOrdemServicoComparativo } from '../services/pdf/gerarPdfOrdemServicoComparativo.js';

function clean(value) {
  if (value == null) return '-';
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text || '-';
}
function getDose(item) {
  if (!item) return '-';
  const dose = item.dosagem ?? item.dose ?? item.quantidade ?? item.qtde;
  const unidade = item.unidade || item.unidadeMedida || item.unidadeAplicacao || item.und || 'L/ha';
  if (dose == null || dose === '') return '-';
  return `${String(dose).replace('.', ',')} ${unidade}`.trim();
}
function getItemKey(item) { return item?.id || item?.insumoId || item?.produtoId || `${item?.descricao || ''}-${item?.dosagem || ''}`; }
function getProdutoNome(item, insumosMap) {
  const insumoId = item?.insumoId || item?.produtoId;
  const insumo = insumosMap.get(insumoId);
  if (insumo) return clean(`${insumo.codInsumo ? `${insumo.codInsumo} - ` : ''}${insumo.descInsumo || insumo.nome || insumo.descricao || ''}`);
  return clean(item?.nome || item?.descricao || item?.descInsumo || item?.produtoNome || item?.label);
}
function montarProdutosComparativos(originais, editados, insumosMap) {
  const originalMap = new Map(); const editedMap = new Map();
  (originais || []).forEach((item) => originalMap.set(getItemKey(item), item));
  (editados || []).forEach((item) => editedMap.set(getItemKey(item), item));
  const allKeys = Array.from(new Set([...originalMap.keys(), ...editedMap.keys()]));
  return allKeys.map((key) => {
    const original = originalMap.get(key); const solicitado = editedMap.get(key);
    const nome = getProdutoNome(original || solicitado, insumosMap);
    const originalDose = getDose(original); const solicitadoDose = getDose(solicitado);
    let divergencia = 'Não'; let observacao = 'Sem alteração';
    if (original && !solicitado) { divergencia = 'Sim'; observacao = 'Produto removido'; }
    else if (!original && solicitado) { divergencia = 'Sim'; observacao = 'Produto incluído'; }
    else if (clean(originalDose) !== clean(solicitadoDose)) { divergencia = 'Sim'; observacao = 'Dose alterada'; }
    return { nome, originalDose, solicitadoDose, divergencia, observacao };
  });
}
async function resolveCompany(companyId) {
  const raw = String(companyId || '').trim();
  return prisma.company.findFirst({ where: { OR: [{ id: raw }, { code: raw }, { name: { equals: raw, mode: 'insensitive' } }] } });
}
async function buscarOrdemPostgres(companyId, ordemId, ordemPayload) {
  const company = await resolveCompany(companyId);
  if (!company) return { company: null, ordem: null };
  let ordem = null;
  if (ordemId) ordem = await prisma.serviceOrder.findFirst({ where: { id: String(ordemId), companyId: company.id }, include: { fields: { include: { field: { include: { farm: true } } } } } });
  if (!ordem && ordemPayload?.sequencial != null) ordem = await prisma.serviceOrder.findFirst({ where: { companyId: company.id, rawData: { path: ['sequencial'], equals: ordemPayload.sequencial } }, include: { fields: { include: { field: { include: { farm: true } } } } } }).catch(() => null);
  if (!ordem && ordemPayload?.numeroEmpresa) ordem = await prisma.serviceOrder.findFirst({ where: { companyId: company.id, number: String(ordemPayload.numeroEmpresa) }, include: { fields: { include: { field: { include: { farm: true } } } } } });
  return { company, ordem };
}
class OrdemServicoRelatorioController {
  static async gerarPdfComparativo(req, res) {
    try {
      const { companyId } = req.params;
      const { ordemId } = req.query;
      const ordemPayload = req.body?.ordem && typeof req.body.ordem === 'object' ? req.body.ordem : null;
      if (!companyId || (!ordemId && !ordemPayload)) return res.status(400).json({ success: false, message: 'companyId e ordemId ou ordem são obrigatórios.' });

      const { company, ordem: ordemDb } = await buscarOrdemPostgres(companyId, ordemId, ordemPayload);
      const ordem = { ...(ordemDb?.rawData || {}), ...(ordemPayload || {}), id: ordemPayload?.id || ordemDb?.id || ordemId, companyId, numeroEmpresa: ordemPayload?.numeroEmpresa || ordemDb?.number, status: ordemPayload?.status || ordemDb?.status, operacao: ordemPayload?.operacao || ordemDb?.operation };
      if (!ordem?.id && !ordem?.sequencial) return res.status(404).json({ success: false, message: 'Ordem de serviço não encontrada.' });

      const talhoes = [];
      if (Array.isArray(ordemPayload?.talhoes) && ordemPayload.talhoes.length) ordemPayload.talhoes.forEach((t) => talhoes.push(t));
      else if (Array.isArray(ordem?.talhoes) && ordem.talhoes.length) ordem.talhoes.forEach((t) => talhoes.push(t));
      else if (ordemDb?.fields?.length) ordemDb.fields.forEach((v) => talhoes.push({ ...(v.rawData || {}), id: v.id, talhaoId: v.field?.code, talhaoNome: v.field?.name || v.field?.code, fazendaNome: v.field?.farm?.name, area: v.area }));

      const protocoloOriginais = Array.isArray(ordem.protocoloOriginalItens) ? ordem.protocoloOriginalItens : [];
      const protocoloEditado = Array.isArray(ordem.protocoloEditado) ? ordem.protocoloEditado : [];
      const ids = Array.from(new Set([...protocoloOriginais, ...protocoloEditado].map((item) => item?.insumoId || item?.produtoId).filter(Boolean)));
      const insumosRows = ids.length ? await prisma.input.findMany({ where: { id: { in: ids } } }).catch(() => []) : [];
      const insumosMap = new Map(insumosRows.map((item) => [item.id, { ...(item.rawData || {}), id: item.id, nome: item.name, codInsumo: item.code }]));

      const produtosComparativos = Array.isArray(req.body?.produtosComparativos) && req.body.produtosComparativos.length
        ? req.body.produtosComparativos
        : montarProdutosComparativos(protocoloOriginais, protocoloEditado, insumosMap);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=Comparativo_OS_${ordem.numeroEmpresa || ordem.sequencial || ordem.id}.pdf`);
      gerarPdfOrdemServicoComparativo({ companyName: company?.name || 'AgroSystem', companyCode: company?.code || '', companyId, ordem, talhoes, produtosComparativos }, res);
    } catch (error) {
      console.error('Erro ao gerar relatório PDF da Ordem de Serviço:', error);
      if (!res.headersSent) res.status(500).json({ success: false, message: 'Erro ao gerar relatório', error: error.message });
    }
  }
}
export default OrdemServicoRelatorioController;
