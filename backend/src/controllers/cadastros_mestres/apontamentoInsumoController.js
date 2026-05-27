import { randomUUID } from 'crypto';
import { prisma } from '../../lib/prisma.js';

function toDecimal(value) {
  if (value === undefined || value === null || value === '') return null;
  let text = String(value).trim();
  if (!text) return null;
  if (text.includes(',') && text.includes('.')) text = text.replace(/\./g, '').replace(',', '.');
  else if (text.includes(',')) text = text.replace(',', '.');
  const n = Number(text.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}
function parseDateBr(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
    const [dd, mm, yyyy] = text.split('/');
    const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}
export const apontamentoInsumoController = {
  importChunk: async (req, res) => {
    try {
      const { companyId, userId, chunk, currentBatch, totalBatches } = req.body;
      if (!companyId || !Array.isArray(chunk)) return res.status(400).json({ success: false, message: 'companyId e chunk (array) são obrigatórios.' });
      if (chunk.length === 0) return res.status(200).json({ success: true, message: 'Chunk vazio recebido e ignorado.' });

      const data = chunk.map((row) => {
        const id = randomUUID();
        const payload = {
          id,
          companyId,
          cluster: String(row.CLUSTER || '').trim(),
          empresa: String(row.EMPRESA || '').trim(),
          modAdm: String(row.MOD_ADM || '').trim(),
          instancia: String(row.INSTANCIA || '').trim(),
          dtHistorico: String(row.DT_HISTORICO || '').trim(),
          dtHistoricoIso: String(row.DT_HISTORICO || '').includes('/') ? String(row.DT_HISTORICO || '').split('/').reverse().join('-') : '',
          cdCcusto: String(row.CD_CCUSTO || '').trim(),
          deCcusto: String(row.DE_CCUSTO || '').trim(),
          cdOp: String(row.CD_OP || '').trim(),
          deOperacao: String(row.DE_OPERACAO || '').trim(),
          undOper: String(row.UND_OPER || '').trim(),
          codFaz: String(row.COD_FAZ || '').trim(),
          desFazenda: String(row.DES_FAZENDA || '').trim(),
          bloco: String(row.BLOCO || '').trim(),
          desBloco: String(row.DES_BLOCO || '').trim(),
          talhao: String(row.TALHAO || '').trim(),
          etapa: String(row.ETAPA || '').trim(),
          codInsumo: String(row.COD_INSUMO || '').trim(),
          descInsumo: String(row.DESC_INSUMO || '').trim(),
          haAplic: String(row.HA_APLIC || '').trim(),
          qtdeAplic: String(row.QTDE_APLIC || '').trim(),
          doseAplic: String(row.DOSE_APLIC || '').trim(),
          doseRec: String(row.DOSE_REC || '').trim(),
          vlrUnit: String(row.VLR_UNIT || '').trim(),
          totalRs: String(row.TOTAL_RS || '').trim(),
          status: 'ATIVO',
          syncStatus: 'synced',
          createdAt: new Date().toISOString(),
          createdBy: userId || 'system',
          updatedAt: new Date().toISOString(),
          updatedBy: userId || 'system',
        };
        return {
          id,
          companyId,
          inputName: payload.descInsumo || payload.codInsumo || null,
          farmCode: payload.codFaz || null,
          fieldCode: payload.talhao || null,
          operation: payload.deOperacao || payload.cdOp || null,
          dose: toDecimal(payload.doseAplic),
          area: toDecimal(payload.haAplic),
          applicationDate: parseDateBr(payload.dtHistorico),
          rawData: payload,
        };
      });
      await prisma.inputApplication.createMany({ data, skipDuplicates: true });
      return res.status(200).json({ success: true, message: `Lote ${currentBatch} de ${totalBatches} processado.`, processed: data.length });
    } catch (error) {
      console.error('Erro ao processar lote de apontamentos no PostgreSQL:', error);
      return res.status(500).json({ success: false, message: 'Erro interno ao processar lote no servidor.', error: error.message });
    }
  },
  migrarDatasParaIso: async (req, res) => {
    return res.status(200).json({ success: true, message: 'Migração legada de datas não é necessária no PostgreSQL.' });
  }
};
