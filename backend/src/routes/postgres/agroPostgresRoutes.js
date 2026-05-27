import express from "express";
import { prisma } from "../../lib/prisma.js";

function firstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return null;
}

function parseDateSafe(value) {
  if (!value) return null;
  const text = String(value).trim();
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (br) {
    const [, dd, mm, yy] = br;
    const yyyy = yy.length === 2 ? `20${yy}` : yy;
    const date = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toNumberSafe(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const number = Number(String(value).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

async function resolveApontamentosCompany(req) {
  const requested = firstValue(req.query.companyId, req.body?.companyId, req.authUser?.companyDbId, req.authUser?.companyId);
  const company = await prisma.company.findFirst({
    where: { OR: [{ id: String(requested || '') }, { code: String(requested || '') }, { name: String(requested || '') }] },
  });
  if (!company) throw new Error(`Empresa não encontrada: ${requested || 'não informada'}`);
  return company;
}

async function ensureGerenciarApontamentosTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS lancamentos_broca (
      id TEXT PRIMARY KEY,
      uuid_local TEXT,
      company_id TEXT NOT NULL,
      data_inspecao TIMESTAMPTZ,
      fazenda_codigo TEXT,
      fazenda_nome TEXT,
      talhao TEXT,
      talhao_id TEXT,
      variedade TEXT,
      entrenos_contados NUMERIC(14,2),
      brocado_base NUMERIC(14,2),
      brocado_meio NUMERIC(14,2),
      brocado_topo NUMERIC(14,2),
      total_brocado NUMERIC(14,2),
      percentual_brocamento NUMERIC(10,4),
      cochonilha NUMERIC(14,2),
      total_cochonilha NUMERIC(14,2),
      percentual_cochonilha NUMERIC(10,4),
      sincronizado BOOLEAN DEFAULT TRUE,
      status_sincronizacao TEXT,
      erro_sincronizacao TEXT,
      status_registro TEXT DEFAULT 'ativo',
      motivo_cancelamento TEXT,
      cancelado_por TEXT,
      cancelado_em TIMESTAMPTZ,
      created_by TEXT,
      created_by_email TEXT,
      synced_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      raw_data JSONB
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS lancamentos_perda (
      id TEXT PRIMARY KEY,
      uuid_local TEXT,
      company_id TEXT NOT NULL,
      data TIMESTAMPTZ,
      fazenda_codigo TEXT,
      fazenda_nome TEXT,
      talhao TEXT,
      talhao_id TEXT,
      variedade TEXT,
      frente_servico TEXT,
      turno TEXT,
      frota_equipamento TEXT,
      matricula_operador TEXT,
      nome_operador TEXT,
      cana_inteira NUMERIC(14,2),
      tolete NUMERIC(14,2),
      toco NUMERIC(14,2),
      ponta NUMERIC(14,2),
      estilhaco NUMERIC(14,2),
      pedaco NUMERIC(14,2),
      pisoteio_metros NUMERIC(14,2),
      percentual_pisoteio NUMERIC(10,4),
      paralelismo_esquerdo NUMERIC(14,2),
      paralelismo_direito NUMERIC(14,2),
      percentual_paralelismo NUMERIC(10,4),
      total_perda NUMERIC(14,2),
      sincronizado BOOLEAN DEFAULT TRUE,
      status_sincronizacao TEXT,
      erro_sincronizacao TEXT,
      status_registro TEXT DEFAULT 'ativo',
      motivo_cancelamento TEXT,
      cancelado_por TEXT,
      cancelado_em TIMESTAMPTZ,
      created_by TEXT,
      created_by_email TEXT,
      synced_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      raw_data JSONB
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS lancamentos_complexo_murcha (
      id TEXT PRIMARY KEY,
      uuid_local TEXT,
      company_id TEXT NOT NULL,
      data_avaliacao TIMESTAMPTZ,
      fazenda_codigo TEXT,
      fazenda_nome TEXT,
      talhao TEXT,
      talhao_id TEXT,
      variedade TEXT,
      cigarrinha NUMERIC(14,2),
      colletotrichum NUMERIC(14,2),
      plectocyta NUMERIC(14,2),
      estria NUMERIC(14,2),
      numero_colmos_3m NUMERIC(14,2),
      total_complexo NUMERIC(14,2),
      percentual_murcha NUMERIC(10,4),
      sincronizado BOOLEAN DEFAULT TRUE,
      status_sincronizacao TEXT,
      erro_sincronizacao TEXT,
      status_registro TEXT DEFAULT 'ativo',
      motivo_cancelamento TEXT,
      cancelado_por TEXT,
      cancelado_em TIMESTAMPTZ,
      created_by TEXT,
      created_by_email TEXT,
      synced_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      raw_data JSONB
    )
  `);
  await prisma.$executeRawUnsafe("ALTER TABLE lancamentos_broca ADD COLUMN IF NOT EXISTS status_registro TEXT DEFAULT 'ativo'");
  await prisma.$executeRawUnsafe('ALTER TABLE lancamentos_broca ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT');
  await prisma.$executeRawUnsafe('ALTER TABLE lancamentos_broca ADD COLUMN IF NOT EXISTS cancelado_por TEXT');
  await prisma.$executeRawUnsafe('ALTER TABLE lancamentos_broca ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMPTZ');
  await prisma.$executeRawUnsafe("ALTER TABLE lancamentos_perda ADD COLUMN IF NOT EXISTS status_registro TEXT DEFAULT 'ativo'");
  await prisma.$executeRawUnsafe('ALTER TABLE lancamentos_perda ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT');
  await prisma.$executeRawUnsafe('ALTER TABLE lancamentos_complexo_murcha ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT');
  await prisma.$executeRawUnsafe('ALTER TABLE lancamentos_perda ADD COLUMN IF NOT EXISTS cancelado_por TEXT');
  await prisma.$executeRawUnsafe('ALTER TABLE lancamentos_complexo_murcha ADD COLUMN IF NOT EXISTS cancelado_por TEXT');
  await prisma.$executeRawUnsafe('ALTER TABLE lancamentos_perda ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMPTZ');
  await prisma.$executeRawUnsafe('ALTER TABLE lancamentos_complexo_murcha ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMPTZ');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_lancamentos_broca_company_status ON lancamentos_broca(company_id, status_registro)');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_lancamentos_perda_company_status ON lancamentos_perda(company_id, status_registro)');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_lancamentos_complexo_murcha_company_status ON lancamentos_complexo_murcha(company_id, status_registro)');
}

function mapGerenciarRow(row, tipo) {
  const raw = row.raw_data && typeof row.raw_data === 'object' ? row.raw_data : {};
  const base = {
    ...raw,
    id: row.id,
    uuidLocal: row.uuid_local,
    tipo,
    companyId: row.company_id,
    fazendaCodigo: row.fazenda_codigo || raw.fazendaCodigo,
    fazendaNome: row.fazenda_nome || raw.fazendaNome,
    talhao: row.talhao || raw.talhao,
    talhaoId: row.talhao_id || raw.talhaoId,
    variedade: row.variedade || raw.variedade,
    statusRegistro: row.status_registro || raw.statusRegistro || 'ativo',
    motivoCancelamento: row.motivo_cancelamento || raw.motivoCancelamento || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncStatus: 'synced',
    status: row.status_sincronizacao || 'sincronizado',
  };
  if (tipo === 'broca') return {
    ...base,
    dataInspecao: row.data_inspecao ? new Date(row.data_inspecao).toISOString().slice(0, 10) : raw.dataInspecao,
    entrenosContados: row.entrenos_contados ?? raw.entrenosContados,
    brocadoBase: row.brocado_base ?? raw.brocadoBase,
    brocadoMeio: row.brocado_meio ?? raw.brocadoMeio,
    brocadoTopo: row.brocado_topo ?? raw.brocadoTopo,
    totalBrocado: row.total_brocado ?? raw.totalBrocado,
    percentualBrocamento: row.percentual_brocamento ?? raw.percentualBrocamento,
    cochonilha: row.cochonilha ?? raw.cochonilha,
    percentualCochonilha: row.percentual_cochonilha ?? raw.percentualCochonilha,
  };
  if (tipo === 'murcha') return {
    ...base,
    dataAvaliacao: row.data_avaliacao ? new Date(row.data_avaliacao).toISOString().slice(0, 10) : raw.dataAvaliacao,
    cigarrinha: row.cigarrinha ?? raw.cigarrinha,
    colletotrichum: row.colletotrichum ?? raw.colletotrichum,
    plectocyta: row.plectocyta ?? raw.plectocyta,
    estria: row.estria ?? raw.estria,
    numeroColmos3m: row.numero_colmos_3m ?? raw.numeroColmos3m,
    totalComplexo: row.total_complexo ?? raw.totalComplexo,
    percentualMurcha: row.percentual_murcha ?? raw.percentualMurcha,
  };
  return {
    ...base,
    data: row.data ? new Date(row.data).toISOString().slice(0, 10) : raw.data,
    frenteServico: row.frente_servico || raw.frenteServico,
    turno: row.turno || raw.turno,
    frotaEquipamento: row.frota_equipamento || raw.frotaEquipamento,
    matriculaOperador: row.matricula_operador || raw.matriculaOperador,
    nomeOperador: row.nome_operador || raw.nomeOperador,
    canaInteira: row.cana_inteira ?? raw.canaInteira,
    tolete: row.tolete ?? raw.tolete,
    toco: row.toco ?? raw.toco,
    ponta: row.ponta ?? raw.ponta,
    estilhaco: row.estilhaco ?? raw.estilhaco,
    pedaco: row.pedaco ?? raw.pedaco,
    pisoteioMetros: row.pisoteio_metros ?? raw.pisoteioMetros,
    percentualPisoteio: row.percentual_pisoteio ?? raw.percentualPisoteio,
    paralelismoEsquerdo: row.paralelismo_esquerdo ?? raw.paralelismoEsquerdo,
    paralelismoDireito: row.paralelismo_direito ?? raw.paralelismoDireito,
    percentualParalelismo: row.percentual_paralelismo ?? raw.percentualParalelismo,
    totalPerda: row.total_perda ?? raw.totalPerda,
  };
}

import { authenticateRequest } from "../../middlewares/authMiddleware.js";
import { enforceCompanyScope, requireModuleAccess } from "../../middlewares/permissionMiddleware.js";
import {
  getFarms,
  getFields,
  getVarieties,
  getEstimates,
  getCutOrders,
  getServiceOrders,
  getClosureDashboardRecords,
  getHarvestPlans,
  getPlanningTreatments,
  createPlanningTreatment,
} from "../../controllers/postgres/agroPostgresController.js";

const router = express.Router();


const gerenciarApontamentosAuth = [authenticateRequest, enforceCompanyScope];

router.get("/apontamentos", ...gerenciarApontamentosAuth, async (req, res) => {
  try {
    const company = await resolveApontamentosCompany(req);
    await ensureGerenciarApontamentosTables();
    const tipo = String(req.query.tipo || 'todos').toLowerCase();
    const limit = Math.min(Math.max(Number(req.query.limit || 300), 1), 1000);
    const params = [company.id];
    const whereBroca = ['company_id = $1'];
    const wherePerda = ['company_id = $1'];
    const whereMurcha = ['company_id = $1'];
    if (req.query.dataInicial) {
      params.push(parseDateSafe(req.query.dataInicial));
      whereBroca.push(`data_inspecao >= $${params.length}`);
      wherePerda.push(`data >= $${params.length}`);
      whereMurcha.push(`data_avaliacao >= $${params.length}`);
    }
    if (req.query.dataFinal) {
      params.push(parseDateSafe(req.query.dataFinal));
      whereBroca.push(`data_inspecao < ($${params.length}::timestamptz + interval '1 day')`);
      wherePerda.push(`data < ($${params.length}::timestamptz + interval '1 day')`);
      whereMurcha.push(`data_avaliacao < ($${params.length}::timestamptz + interval '1 day')`);
    }
    if (req.query.fazenda) {
      params.push(String(req.query.fazenda));
      whereBroca.push(`fazenda_codigo = $${params.length}`);
      wherePerda.push(`fazenda_codigo = $${params.length}`);
      whereMurcha.push(`fazenda_codigo = $${params.length}`);
    }
    if (req.query.talhao) {
      params.push(String(req.query.talhao));
      whereBroca.push(`talhao = $${params.length}`);
      wherePerda.push(`talhao = $${params.length}`);
      whereMurcha.push(`talhao = $${params.length}`);
    }
    if (req.query.statusRegistro && req.query.statusRegistro !== 'todos') {
      params.push(String(req.query.statusRegistro));
      whereBroca.push(`COALESCE(status_registro,'ativo') = $${params.length}`);
      wherePerda.push(`COALESCE(status_registro,'ativo') = $${params.length}`);
      whereMurcha.push(`COALESCE(status_registro,'ativo') = $${params.length}`);
    }
    const rows = [];
    if (tipo === 'todos' || tipo === 'broca') {
      const broca = await prisma.$queryRawUnsafe(`SELECT * FROM lancamentos_broca WHERE ${whereBroca.join(' AND ')} ORDER BY data_inspecao DESC NULLS LAST, updated_at DESC LIMIT ${limit}`, ...params);
      rows.push(...broca.map((row) => mapGerenciarRow(row, 'broca')));
    }
    if (tipo === 'todos' || tipo === 'perda') {
      const perda = await prisma.$queryRawUnsafe(`SELECT * FROM lancamentos_perda WHERE ${wherePerda.join(' AND ')} ORDER BY data DESC NULLS LAST, updated_at DESC LIMIT ${limit}`, ...params);
      rows.push(...perda.map((row) => mapGerenciarRow(row, 'perda')));
    }
    if (tipo === 'todos' || tipo === 'murcha') {
      const murcha = await prisma.$queryRawUnsafe(`SELECT * FROM lancamentos_complexo_murcha WHERE ${whereMurcha.join(' AND ')} ORDER BY data_avaliacao DESC NULLS LAST, updated_at DESC LIMIT ${limit}`, ...params);
      rows.push(...murcha.map((row) => mapGerenciarRow(row, 'murcha')));
    }
    rows.sort((a, b) => String(b.dataInspecao || b.data || b.dataAvaliacao || b.updatedAt || '').localeCompare(String(a.dataInspecao || a.data || a.dataAvaliacao || a.updatedAt || '')));
    res.json({ success: true, data: rows.slice(0, limit) });
  } catch (error) {
    console.error('[Gerenciar Apontamentos] Erro ao listar:', error);
    res.status(500).json({ success: false, message: error.message || 'Erro ao listar apontamentos.' });
  }
});

router.put("/apontamentos/:tipo/:id", ...gerenciarApontamentosAuth, async (req, res) => {
  try {
    const company = await resolveApontamentosCompany(req);
    await ensureGerenciarApontamentosTables();
    const tipo = String(req.params.tipo || '').toLowerCase();
    const p = req.body || {};
    const id = String(req.params.id);
    if (tipo === 'broca') {
      const totalBrocado = toNumberSafe(firstValue(p.totalBrocado, (toNumberSafe(p.brocadoBase) || 0) + (toNumberSafe(p.brocadoMeio) || 0) + (toNumberSafe(p.brocadoTopo) || 0)));
      const entrenos = toNumberSafe(p.entrenosContados) || 0;
      const percentualBrocamento = toNumberSafe(firstValue(p.percentualBrocamento, entrenos ? (totalBrocado / entrenos) * 100 : 0));
      const cochonilha = toNumberSafe(p.cochonilha);
      const percentualCochonilha = toNumberSafe(firstValue(p.percentualCochonilha, entrenos ? ((cochonilha || 0) / entrenos) * 100 : 0));
      await prisma.$executeRawUnsafe(
        `UPDATE lancamentos_broca SET data_inspecao=$1, fazenda_codigo=$2, fazenda_nome=$3, talhao=$4, talhao_id=$5, variedade=$6,
          entrenos_contados=$7, brocado_base=$8, brocado_meio=$9, brocado_topo=$10, total_brocado=$11, percentual_brocamento=$12,
          cochonilha=$13, total_cochonilha=$13, percentual_cochonilha=$14, updated_at=NOW(), raw_data=COALESCE(raw_data,'{}'::jsonb) || $15::jsonb
         WHERE id=$16 AND company_id=$17`,
        parseDateSafe(p.dataInspecao), firstValue(p.fazendaCodigo, p.codFaz), firstValue(p.fazendaNome, p.desFazenda), firstValue(p.talhao), firstValue(p.talhaoId), firstValue(p.variedade),
        toNumberSafe(p.entrenosContados), toNumberSafe(p.brocadoBase), toNumberSafe(p.brocadoMeio), toNumberSafe(p.brocadoTopo), totalBrocado, percentualBrocamento,
        cochonilha, percentualCochonilha, JSON.stringify({ ...p, totalBrocado, percentualBrocamento, percentualCochonilha }), id, company.id,
      );
    } else if (tipo === 'perda') {
      const totalPerda = toNumberSafe(firstValue(p.totalPerda, ['canaInteira','tolete','toco','ponta','estilhaco','pedaco'].reduce((sum, key) => sum + (toNumberSafe(p[key]) || 0), 0)));
      const percentualPisoteio = toNumberSafe(firstValue(p.percentualPisoteio, ((toNumberSafe(p.pisoteioMetros) || 0) / 20) * 100));
      const percentualParalelismo = toNumberSafe(firstValue(p.percentualParalelismo, ((toNumberSafe(p.paralelismoEsquerdo) || 0) + (toNumberSafe(p.paralelismoDireito) || 0)) / 2));
      await prisma.$executeRawUnsafe(
        `UPDATE lancamentos_perda SET data=$1, fazenda_codigo=$2, fazenda_nome=$3, talhao=$4, talhao_id=$5, variedade=$6,
          frente_servico=$7, turno=$8, frota_equipamento=$9, matricula_operador=$10, nome_operador=$11,
          cana_inteira=$12, tolete=$13, toco=$14, ponta=$15, estilhaco=$16, pedaco=$17,
          pisoteio_metros=$18, percentual_pisoteio=$19, paralelismo_esquerdo=$20, paralelismo_direito=$21, percentual_paralelismo=$22,
          total_perda=$23, updated_at=NOW(), raw_data=COALESCE(raw_data,'{}'::jsonb) || $24::jsonb
         WHERE id=$25 AND company_id=$26`,
        parseDateSafe(p.data), firstValue(p.fazendaCodigo, p.codFaz), firstValue(p.fazendaNome, p.desFazenda), firstValue(p.talhao), firstValue(p.talhaoId), firstValue(p.variedade),
        firstValue(p.frenteServico), firstValue(p.turno), firstValue(p.frotaEquipamento), firstValue(p.matriculaOperador), firstValue(p.nomeOperador),
        toNumberSafe(p.canaInteira), toNumberSafe(p.tolete), toNumberSafe(p.toco), toNumberSafe(p.ponta), toNumberSafe(p.estilhaco), toNumberSafe(p.pedaco),
        toNumberSafe(p.pisoteioMetros), percentualPisoteio, toNumberSafe(p.paralelismoEsquerdo), toNumberSafe(p.paralelismoDireito), percentualParalelismo,
        totalPerda, JSON.stringify({ ...p, totalPerda, percentualPisoteio, percentualParalelismo }), id, company.id,
      );
    } else if (tipo === 'murcha') {
      const totalComplexo = toNumberSafe(firstValue(p.totalComplexo, ['cigarrinha','colletotrichum','plectocyta','estria'].reduce((sum, key) => sum + (toNumberSafe(p[key]) || 0), 0)));
      const percentualMurcha = toNumberSafe(firstValue(p.percentualMurcha, totalComplexo));
      await prisma.$executeRawUnsafe(
        `UPDATE lancamentos_complexo_murcha SET data_avaliacao=$1, fazenda_codigo=$2, fazenda_nome=$3, talhao=$4, talhao_id=$5, variedade=$6,
          cigarrinha=$7, colletotrichum=$8, plectocyta=$9, estria=$10, numero_colmos_3m=$11,
          total_complexo=$12, percentual_murcha=$13, updated_at=NOW(), raw_data=COALESCE(raw_data,'{}'::jsonb) || $14::jsonb
         WHERE id=$15 AND company_id=$16`,
        parseDateSafe(p.dataAvaliacao), firstValue(p.fazendaCodigo, p.codFaz), firstValue(p.fazendaNome, p.desFazenda), firstValue(p.talhao), firstValue(p.talhaoId), firstValue(p.variedade),
        toNumberSafe(p.cigarrinha), toNumberSafe(p.colletotrichum), toNumberSafe(p.plectocyta), toNumberSafe(p.estria), toNumberSafe(p.numeroColmos3m),
        totalComplexo, percentualMurcha, JSON.stringify({ ...p, totalComplexo, percentualMurcha }), id, company.id,
      );
    } else {
      return res.status(400).json({ success: false, message: 'Tipo de apontamento inválido.' });
    }
    res.json({ success: true, data: { id, tipo } });
  } catch (error) {
    console.error('[Gerenciar Apontamentos] Erro ao editar:', error);
    res.status(500).json({ success: false, message: error.message || 'Erro ao editar apontamento.' });
  }
});

router.patch("/apontamentos/:tipo/:id/cancelar", ...gerenciarApontamentosAuth, async (req, res) => {
  try {
    const company = await resolveApontamentosCompany(req);
    await ensureGerenciarApontamentosTables();
    const tipo = String(req.params.tipo || '').toLowerCase();
    const table = tipo === 'broca' ? 'lancamentos_broca' : tipo === 'perda' ? 'lancamentos_perda' : tipo === 'murcha' ? 'lancamentos_complexo_murcha' : null;
    if (!table) return res.status(400).json({ success: false, message: 'Tipo de apontamento inválido.' });
    const motivo = firstValue(req.body?.motivo, 'Cancelado pelo gerenciamento de apontamentos');
    await prisma.$executeRawUnsafe(
      `UPDATE ${table} SET status_registro='cancelado', motivo_cancelamento=$1, cancelado_por=$2, cancelado_em=NOW(), updated_at=NOW(), raw_data=COALESCE(raw_data,'{}'::jsonb) || $3::jsonb WHERE id=$4 AND company_id=$5`,
      motivo,
      firstValue(req.authUser?.email, req.authUser?.uid, req.authUser?.id),
      JSON.stringify({ statusRegistro: 'cancelado', motivoCancelamento: motivo }),
      req.params.id,
      company.id,
    );
    res.json({ success: true });
  } catch (error) {
    console.error('[Gerenciar Apontamentos] Erro ao cancelar:', error);
    res.status(500).json({ success: false, message: error.message || 'Erro ao cancelar apontamento.' });
  }
});

router.use(authenticateRequest, requireModuleAccess("mapas"), enforceCompanyScope);

router.get("/farms", getFarms);
router.get("/fields", getFields);
router.get("/varieties", getVarieties);
router.get("/estimates", getEstimates);
router.get("/cut-orders", getCutOrders);
router.get("/service-orders", getServiceOrders);
router.get("/closure-dashboard-records", getClosureDashboardRecords);
router.get("/harvest-plans", getHarvestPlans);
router.get("/planning-treatments", getPlanningTreatments);
router.post("/planning-treatments", createPlanningTreatment);

export default router;
