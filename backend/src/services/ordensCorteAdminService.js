import { prisma } from '../lib/prisma.js';
import { buildCompanyWhere } from '../controllers/postgres/postgresControllerUtils.js';

const STATUS = {
  AGUARDANDO: 'AGUARDANDO',
  ABERTA: 'ABERTA',
  FINALIZADA: 'FINALIZADA',
  CANCELADA: 'CANCELADA'
};

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeDateKey(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value?.toDate === 'function') return value.toDate().toISOString().slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function normalizeDateTimeSortValue(value) {
  if (!value) return 0;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function normalizeStatus(value) {
  const raw = normalizeText(value).toUpperCase();
  if (raw.includes('FINAL') || raw.includes('FECH') || raw.includes('ENCERR')) return STATUS.FINALIZADA;
  if (raw.includes('AGUARD') || raw.includes('PEND')) return STATUS.AGUARDANDO;
  if (raw.includes('CANCEL')) return STATUS.CANCELADA;
  return raw || STATUS.ABERTA;
}

function normalizeStatusFilter(status) {
  const raw = normalizeText(status);
  if (['aberto', 'aberta', 'abertas', 'open'].includes(raw)) return STATUS.ABERTA;
  if (['aguardando', 'pendente', 'pendentes', 'waiting'].includes(raw)) return STATUS.AGUARDANDO;
  if (['fechado', 'fechada', 'fechadas', 'finalizado', 'finalizada', 'finalizadas', 'closed'].includes(raw)) return STATUS.FINALIZADA;
  if (['cancelado', 'cancelada', 'canceladas'].includes(raw)) return STATUS.CANCELADA;
  return '';
}

function firstText(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

function matchesSearch(ordem, searchTerm) {
  const term = normalizeText(searchTerm);
  if (!term) return true;
  const haystack = [
    ordem.id,
    ordem.codigo,
    ordem.number,
    ordem.sequencial,
    ordem.numeroEmpresa,
    ordem.nome_fazenda,
    ordem.fazendaNome,
    ordem.fazendaDescricao,
    ordem.fundo_agricola,
    ordem.fundoAgricola,
    ordem.frenteServico,
    ordem.frente,
    ordem.nomeColaborador,
    ordem.createdBy,
    ordem.status,
  ].map(normalizeText).join(' ');
  return haystack.includes(term);
}

function serializeCutOrder(order) {
  const raw = order.rawData || {};
  const farm = order.farm || null;
  const status = normalizeStatus(raw.status || order.status);
  const codigo = firstText(raw.codigo, raw.ordemCodigo, raw.sequencial);
  const numeroEmpresa = firstText(raw.numeroEmpresa, raw.numero, raw.number);
  const sequencial = Number(raw.sequencial || raw.sequence || String(codigo).replace(/\D/g, '')) || null;
  const farmCode = firstText(raw.fundoAgricola, raw.fundo_agricola, raw.fazenda, farm?.code);
  const farmName = firstText(raw.fazendaNome, raw.nome_fazenda, raw.fazendaDescricao, farm?.name, farmCode);
  const farmId = firstText(raw.fazendaId, raw.id_fazenda, farm?.id, farmCode);

  return {
    ...raw,
    id: order.id,
    companyId: firstText(raw.companyId, order.company?.code, order.companyId),
    safra: firstText(raw.safra, raw.harvestYear),
    sequencial,
    codigo,
    numeroEmpresa,
    status,
    openedAt: raw.openedAt || raw.createdAt || order.openingDate || order.createdAt || null,
    createdAt: raw.createdAt || order.openingDate || order.createdAt || null,
    updatedAt: order.updatedAt || raw.updatedAt || null,
    closedAt: raw.closedAt || order.closingDate || null,
    fazendaId: farmId,
    id_fazenda: farmId,
    fazendaNome: farmName,
    nome_fazenda: farmName,
    fundoAgricola: farmCode,
    fundo_agricola: farmCode,
    fazendaDescricao: firstText(raw.fazendaDescricao, farm?.name, farmName),
    fields: order.fields || [],
    source: 'postgres',
    syncStatus: 'synced',
  };
}

function getCounts(rows) {
  return rows.reduce((acc, row) => {
    const status = normalizeStatus(row.status);
    if (status === STATUS.AGUARDANDO) acc.aguardando += 1;
    else if (status === STATUS.FINALIZADA) acc.fechado += 1;
    else if (status === STATUS.ABERTA) acc.aberto += 1;
    acc.todos += 1;
    return acc;
  }, { aberto: 0, aguardando: 0, fechado: 0, todos: 0 });
}


function mergeRawData(rawData, changes) {
  const raw = rawData && typeof rawData === 'object' && !Array.isArray(rawData) ? { ...rawData } : {};
  const cleaned = {};
  Object.entries(changes || {}).forEach(([key, value]) => {
    if (value !== undefined) cleaned[key] = value;
  });
  return { ...raw, ...cleaned };
}

export async function updateOrdemCortePostgres(ordemId, dados = {}, authUser = {}) {
  if (!ordemId) throw new Error('ID da ordem de corte é obrigatório.');

  const ordemAtual = await prisma.cutOrder.findUnique({
    where: { id: String(ordemId) },
    include: { fields: true },
  });

  if (!ordemAtual) throw new Error('Ordem de corte não encontrada.');

  const rawAtual = ordemAtual.rawData || {};
  const updatedAt = new Date().toISOString();
  const numeroEmpresaInformado = Object.prototype.hasOwnProperty.call(dados, 'numeroEmpresa')
    ? String(dados.numeroEmpresa || '').trim()
    : firstText(rawAtual.numeroEmpresa, rawAtual.numero, rawAtual.number);
  const statusInformado = Object.prototype.hasOwnProperty.call(dados, 'status')
    ? normalizeStatus(dados.status)
    : normalizeStatus(rawAtual.status || ordemAtual.status);

  const rawAtualizado = mergeRawData(rawAtual, {
    ...dados,
    numeroEmpresa: numeroEmpresaInformado,
    status: statusInformado,
    updatedAt,
  });

  const updateData = {
    number: numeroEmpresaInformado || null,
    status: statusInformado || null,
    rawData: rawAtualizado,
  };

  if (statusInformado === STATUS.ABERTA && !ordemAtual.openingDate) {
    updateData.openingDate = new Date();
  }

  const ordemAtualizada = await prisma.$transaction(async (tx) => {
    const updated = await tx.cutOrder.update({
      where: { id: String(ordemId) },
      data: updateData,
      include: {
        company: { select: { id: true, code: true, name: true } },
        farm: { select: { id: true, code: true, name: true } },
        fields: { include: { field: { select: { id: true, code: true, name: true } } } },
      },
    });

    await Promise.all((ordemAtual.fields || []).map((rel) => {
      const relRaw = rel.rawData && typeof rel.rawData === 'object' && !Array.isArray(rel.rawData) ? rel.rawData : {};
      return tx.cutOrderField.update({
        where: { id: rel.id },
        data: {
          rawData: mergeRawData(relRaw, {
            numeroEmpresa: numeroEmpresaInformado,
            status: statusInformado,
            updatedAt,
          }),
        },
      });
    }));

    return updated;
  });

  return serializeCutOrder(ordemAtualizada);
}


function isSameTalhao(rel, talhaoId) {
  const alvo = normalizeText(talhaoId);
  if (!alvo) return false;
  const raw = rel.rawData && typeof rel.rawData === 'object' && !Array.isArray(rel.rawData) ? rel.rawData : {};
  const field = rel.field || null;
  const candidates = [
    raw.talhaoId,
    raw.idTalhao,
    raw.fieldId,
    raw.talhao,
    raw.talhaoNome,
    raw.nomeTalhao,
    field?.id,
    field?.code,
    field?.name,
  ];
  return candidates.some((value) => normalizeText(value) === alvo);
}

function serializeCutOrderField(rel, order = null) {
  const raw = rel.rawData && typeof rel.rawData === 'object' && !Array.isArray(rel.rawData) ? rel.rawData : {};
  const field = rel.field || null;
  const orderRaw = order?.rawData && typeof order.rawData === 'object' && !Array.isArray(order.rawData) ? order.rawData : {};
  const status = normalizeStatus(raw.status || orderRaw.status || order?.status);
  return {
    ...raw,
    id: rel.id,
    cutOrderId: rel.cutOrderId,
    ordemCorteId: rel.cutOrderId,
    fieldId: rel.fieldId || field?.id || null,
    talhaoId: firstText(raw.talhaoId, raw.idTalhao, raw.fieldId, field?.code, field?.id),
    talhaoNome: firstText(raw.talhaoNome, raw.nomeTalhao, field?.name, field?.code),
    status,
    closedAt: raw.closedAt || null,
    closedBy: raw.closedBy || null,
    updatedAt: rel.updatedAt || raw.updatedAt || null,
    numeroEmpresa: firstText(raw.numeroEmpresa, orderRaw.numeroEmpresa, order?.number),
    area: raw.area ?? rel.area ?? null,
    estimatedTon: raw.estimatedTon ?? rel.estimatedTon ?? null,
    realTon: raw.realTon ?? rel.realTon ?? null,
    syncStatus: 'synced',
    source: 'postgres',
  };
}

export async function fecharTalhoesOrdemCortePostgres(ordemId, talhoesIds = [], authUser = {}) {
  if (!ordemId) throw new Error('ID da ordem de corte é obrigatório.');
  if (!Array.isArray(talhoesIds) || talhoesIds.length === 0) {
    throw new Error('Nenhum talhão informado para fechar.');
  }

  const ordemAtual = await prisma.cutOrder.findUnique({
    where: { id: String(ordemId) },
    include: {
      company: { select: { id: true, code: true, name: true } },
      farm: { select: { id: true, code: true, name: true } },
      fields: { include: { field: { select: { id: true, code: true, name: true } } } },
    },
  });

  if (!ordemAtual) throw new Error('Ordem de corte não encontrada.');

  const selectedIds = talhoesIds.map((id) => String(id ?? '').trim()).filter(Boolean);
  const selectedRelations = (ordemAtual.fields || []).filter((rel) => selectedIds.some((id) => isSameTalhao(rel, id)));

  if (selectedRelations.length === 0) {
    throw new Error('Nenhum vínculo dos talhões selecionados foi encontrado nessa ordem.');
  }

  const closedAt = new Date();
  const closedAtIso = closedAt.toISOString();
  const closedBy = firstText(authUser?.name, authUser?.email, authUser?.id, 'Sistema');

  const result = await prisma.$transaction(async (tx) => {
    for (const rel of selectedRelations) {
      const relRaw = rel.rawData && typeof rel.rawData === 'object' && !Array.isArray(rel.rawData) ? rel.rawData : {};
      await tx.cutOrderField.update({
        where: { id: rel.id },
        data: {
          rawData: mergeRawData(relRaw, {
            status: STATUS.FINALIZADA,
            closedAt: closedAtIso,
            closedBy,
            updatedAt: closedAtIso,
          }),
        },
      });
    }

    const ordemComVinculos = await tx.cutOrder.findUnique({
      where: { id: String(ordemId) },
      include: {
        company: { select: { id: true, code: true, name: true } },
        farm: { select: { id: true, code: true, name: true } },
        fields: { include: { field: { select: { id: true, code: true, name: true } } } },
      },
    });

    const abertosRestantes = (ordemComVinculos.fields || []).filter((rel) => {
      const raw = rel.rawData && typeof rel.rawData === 'object' && !Array.isArray(rel.rawData) ? rel.rawData : {};
      return normalizeStatus(raw.status || ordemComVinculos.status) === STATUS.ABERTA;
    });

    let ordemFinal = ordemComVinculos;
    let masterClosed = false;

    if (abertosRestantes.length === 0) {
      const rawAtual = ordemComVinculos.rawData && typeof ordemComVinculos.rawData === 'object' && !Array.isArray(ordemComVinculos.rawData) ? ordemComVinculos.rawData : {};
      ordemFinal = await tx.cutOrder.update({
        where: { id: String(ordemId) },
        data: {
          status: STATUS.FINALIZADA,
          closingDate: closedAt,
          rawData: mergeRawData(rawAtual, {
            status: STATUS.FINALIZADA,
            closedAt: closedAtIso,
            closedBy,
            updatedAt: closedAtIso,
          }),
        },
        include: {
          company: { select: { id: true, code: true, name: true } },
          farm: { select: { id: true, code: true, name: true } },
          fields: { include: { field: { select: { id: true, code: true, name: true } } } },
        },
      });
      masterClosed = true;
    }

    return { ordemFinal, masterClosed };
  }, { timeout: 20000 });

  return {
    ordem: serializeCutOrder(result.ordemFinal),
    vinculos: (result.ordemFinal.fields || []).map((rel) => serializeCutOrderField(rel, result.ordemFinal)),
    fechadosIds: selectedRelations.map((rel) => rel.id),
    masterClosed: result.masterClosed,
    closedAt: closedAtIso,
    closedBy,
  };
}

export async function listOrdensCortePaginadas(companyId, safra, options = {}) {
  if (!companyId) throw new Error('companyId é obrigatório.');

  const limit = Math.min(Math.max(Number(options.limit || 20), 1), 100);
  const page = Math.max(Number(options.page || 1), 1);
  const statusFilter = normalizeStatusFilter(options.status);
  const dateFilter = normalizeDateKey(options.date);
  const searchTerm = String(options.search || '').trim();

  const where = await buildCompanyWhere(companyId);

  const records = await prisma.cutOrder.findMany({
    where,
    include: {
      company: { select: { id: true, code: true, name: true } },
      farm: { select: { id: true, code: true, name: true } },
      fields: {
        include: {
          field: { select: { id: true, code: true, name: true } },
        },
      },
    },
    orderBy: [{ openingDate: 'desc' }, { createdAt: 'desc' }],
  });

  let rows = records.map(serializeCutOrder);

  if (safra && String(safra) !== 'todas') {
    rows = rows.filter((row) => String(row.safra || '') === String(safra));
  }

  const counts = getCounts(rows);

  rows = rows.filter((ordem) => {
    if (statusFilter && normalizeStatus(ordem.status) !== statusFilter) return false;
    if (dateFilter && normalizeDateKey(ordem.createdAt || ordem.openedAt) !== dateFilter) return false;
    if (!matchesSearch(ordem, searchTerm)) return false;
    return true;
  });

  rows.sort((a, b) => normalizeDateTimeSortValue(b.updatedAt || b.createdAt || b.openedAt) - normalizeDateTimeSortValue(a.updatedAt || a.createdAt || a.openedAt));

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * limit;

  return {
    data: rows.slice(start, start + limit),
    page: safePage,
    limit,
    total,
    totalPages,
    counts,
  };
}
