import { randomUUID } from 'crypto';
import { prisma } from '../../../lib/prisma.js';

const COLLECTION = 'planejamento_safra';

const PLANEJAMENTO_PALETTE = [
  '#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7',
  '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#06b6d4',
  '#84cc16', '#f43f5e', '#0ea5e9', '#10b981', '#f59e0b',
  '#6366f1', '#d946ef', '#14b8a6', '#fb7185', '#38bdf8'
];

const getPlanejamentoFillColor = (frente) => {
  const digits = String(frente ?? '').replace(/\D+/g, '');
  if (!digits) return '#808080';
  const index = Math.max(parseInt(digits, 10) - 1, 0) % PLANEJAMENTO_PALETTE.length;
  return PLANEJAMENTO_PALETTE[index];
};


const normalizeFrente = (value) => {
  const digits = String(value ?? '').replace(/\D+/g, '');
  return digits ? `F - ${parseInt(digits, 10)}` : '';
};

const sanitizeIdPart = (value) => {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\/]+/g, '-')
    .trim();
};

const buildPlanejamentoId = (companyId, safra, talhaoId) => {
  return [companyId, safra, talhaoId].map(sanitizeIdPart).join('_');
};

const toNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;

  // Aceita números em formato JS e pt-BR:
  // 2961.73, "2961.73", "2.961,73", "7.998,10 t".
  const raw = String(value).trim();
  if (!raw) return fallback;

  const cleaned = raw.replace(/[^0-9,.-]/g, '');
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  let normalized = cleaned;
  if (hasComma && hasDot) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    normalized = cleaned.replace(',', '.');
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
};

const roundTon = (value) => {
  const n = toNumber(value, 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
};

const toIsoDate = (value) => {
  if (!value) return '';
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [dd, mm, yyyy] = str.split('/');
    return `${yyyy}-${mm}-${dd}`;
  }
  const dt = new Date(str);
  if (!Number.isFinite(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
};

const toIsoDateTime = (value) => {
  if (!value) return '';
  const dt = new Date(value);
  if (!Number.isFinite(dt.getTime())) return '';
  return dt.toISOString();
};

const formatPreviewDate = (value) => {
  if (!value) return '';
  const dt = new Date(value);
  if (!Number.isFinite(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
};

const addHours = (dateValue, hours) => {
  const dt = new Date(dateValue);
  if (!Number.isFinite(dt.getTime())) return null;
  dt.setTime(dt.getTime() + (hours * 60 * 60 * 1000));
  return dt;
};

const addDays = (dateValue, days) => addHours(dateValue, days * 24);

const getEntryBase = (group) => {
  return (
    group.dataEntradaPlanejada ||
    group.dataColheita ||
    group.dataBase ||
    ''
  );
};

const buildLegacyGroupId = (doc) => {
  if (doc?.sequenciaGrupoId) return String(doc.sequenciaGrupoId);

  const parts = [
    doc?.companyId || '',
    doc?.safra || '',
    normalizeFrente(doc?.frenteColheita),
    String(doc?.blocoColheita || doc?.bloco || '').trim(),
    toIsoDate(doc?.dataColheita || doc?.dataEntradaPlanejada || doc?.dataBase),
    String(Math.max(1, parseInt(doc?.sequencia, 10) || 1))
  ].map(sanitizeIdPart);

  return parts.join('__');
};


const omitUndefined = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => omitUndefined(item))
      .filter((item) => item !== undefined);
  }

  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, omitUndefined(item)])
        .filter(([, item]) => item !== undefined)
    );
  }

  return value === undefined ? undefined : value;
};

const pickGroupCommonFields = (source = {}) => ({
  safra: source.safra,
  frenteColheita: normalizeFrente(source.frenteColheita),
  blocoColheita: source.blocoColheita || source.bloco || '',
  dataColheita: toIsoDate(source.dataColheita || source.dataBase),
  dataBase: toIsoDate(source.dataBase || source.dataColheita),
  observacao: source.observacao ?? '',
  statusPlanejamento: source.statusPlanejamento,
  tchEst: source.tchEst,
  horasProdutivas: source.horasProdutivas,
  tiroMedio: source.tiroMedio,
  numeroLinhas: source.numeroLinhas,
  capacidadeTransbordo: source.capacidadeTransbordo,
  manobra: source.manobra,
  aguardando: source.aguardando,
  velocidadeIda: source.velocidadeIda,
  velocidadeVolta: source.velocidadeVolta,
  densidade: source.densidade,
  numeroColhedoras: source.numeroColhedoras,
  numeroTratores: source.numeroTratores,
  velocidadeColheita: source.velocidadeColheita,
  horasManobra: source.horasManobra,
  horasCorte: source.horasCorte,
  raioMedio: source.raioMedio,
  pmc: source.pmc,
  cota: source.cota,
  idadeAtual: source.idadeAtual,
  idadeCorte: source.idadeCorte,
  areaEscopo: source.areaEscopo,
  toneladasEstimadas: source.toneladasEstimadas,
  maturacao: source.maturacao,
  escopoAtual: source.escopoAtual
});

const buildRepresentativeFromDoc = (doc) => ({
  groupId: buildLegacyGroupId(doc),
  requestedSeq: Math.max(1, parseInt(doc.sequencia, 10) || 1),
  dataBase: doc.dataBase || doc.dataEntradaPlanejada || doc.dataColheita || '',
  dataColheita: doc.dataColheita || '',
  toneladasEstimadas: toNumber(doc.toneladasEstimadas || doc.toneladasLiquidasPlanejadas, 0),
  cota: toNumber(doc.cota || doc.cotaDiaSequencia, 0),
  // Mantém fallback dos saldos gravados para compatibilidade com programações antigas.
  storedCapacidadeRestanteUltimoDia: toNumber(doc.capacidadeRestanteUltimoDia || doc.saldoDisponivelProximaSequencia, 0),
  storedSaldoUltimoDia: toNumber(doc.saldoUltimoDia || doc.saldoDisponivelProximaSequencia || doc.capacidadeRestanteUltimoDia, 0),
  frenteColheita: normalizeFrente(doc.frenteColheita),
  companyId: doc.companyId,
  safra: doc.safra,
  commonFields: pickGroupCommonFields(doc)
});

const addUtcDays = (dateValue, days) => {
  const iso = toIsoDate(dateValue);
  if (!iso) return '';
  const dt = new Date(`${iso}T00:00:00.000Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
};

const computeDailySchedule = ({ dataEntrada, toneladas, cota, saldoRecebido = 0 }) => {
  const startDate = toIsoDate(dataEntrada);
  const cotaDia = roundTon(Math.max(toNumber(cota, 0), 0));
  const toneladasSequencia = roundTon(Math.max(toNumber(toneladas, 0), 0));
  const saldoEntrada = roundTon(Math.max(toNumber(saldoRecebido, 0), 0));

  const totalDisponivel = roundTon(toneladasSequencia + saldoEntrada);

  if (!startDate || cotaDia <= 0 || totalDisponivel <= 0) {
    return {
      cronogramaDiario: [],
      dataEntrada: startDate || '',
      dataSaida: startDate || '',
      proximaEntradaSequencia: startDate || '',
      saldoUltimoDia: 0,
      sobraSequencia: 0,
      capacidadeRestanteUltimoDia: 0,
      finalizouDiaCompleto: true,
      diasCheios: 0,
      diasDaFrente: 0,
      diasCalendario: 0,
      diasNecessariosDecimal: 0,
      totalBaseCronograma: totalDisponivel,
      toneladasSequencia,
      saldoRecebidoSequencia: saldoEntrada,
      cotaDiaSequencia: cotaDia
    };
  }

  const diasNecessariosDecimal = totalDisponivel / cotaDia;
  const diasInteiros = Math.floor(diasNecessariosDecimal + 1e-9);
  const consumidoDiasCheios = roundTon(diasInteiros * cotaDia);
  const sobra = roundTon(Math.max(totalDisponivel - consumidoDiasCheios, 0));
  const temSobra = sobra > 0.01;
  const cronogramaDiario = [];

  for (let i = 0; i < diasInteiros; i += 1) {
    const data = addUtcDays(startDate, i);
    cronogramaDiario.push({
      data,
      entradaCompleta: `${data}T00:00:00.000Z`,
      saidaCompleta: `${data}T23:59:59.000Z`,
      capacidadeDisponivelDia: cotaDia,
      capacidadeJaUsadaNoDia: 0,
      capacidadeParaSequencia: cotaDia,
      toneladasDia: cotaDia,
      saldoDia: cotaDia,
      capacidadeRestanteDia: 0,
      horasUsadas: 24,
      diaCompleto: true
    });
  }

  if (temSobra) {
    const data = addUtcDays(startDate, diasInteiros);
    cronogramaDiario.push({
      data,
      entradaCompleta: `${data}T00:00:00.000Z`,
      saidaCompleta: `${data}T23:59:59.000Z`,
      capacidadeDisponivelDia: cotaDia,
      capacidadeJaUsadaNoDia: 0,
      capacidadeParaSequencia: cotaDia,
      toneladasDia: sobra,
      saldoDia: sobra,
      capacidadeRestanteDia: sobra,
      horasUsadas: cotaDia > 0 ? (sobra / cotaDia) * 24 : 0,
      diaCompleto: false
    });
  }

  const dataSaida = addUtcDays(startDate, diasInteiros);
  const proximaEntradaSequencia = dataSaida;

  return {
    cronogramaDiario,
    dataEntrada: startDate,
    dataSaida,
    proximaEntradaSequencia,
    saldoUltimoDia: sobra,
    sobraSequencia: sobra,
    capacidadeRestanteUltimoDia: sobra,
    horasUltimoDia: temSobra && cotaDia > 0 ? (sobra / cotaDia) * 24 : 24,
    finalizouDiaCompleto: !temSobra,
    diasCheios: diasInteiros,
    diasDaFrente: diasInteiros,
    diasCalendario: cronogramaDiario.length,
    diasNecessariosDecimal,
    totalBaseCronograma: totalDisponivel,
    toneladasSequencia,
    saldoRecebidoSequencia: saldoEntrada,
    cotaDiaSequencia: cotaDia
  };
};

const computeChain = (groups) => {
  let previous = null;

  return groups.map((group, index) => {
    const cota = Math.max(toNumber(group.cota, 0), 0);
    const toneladasEstimadas = Math.max(toNumber(group.toneladasEstimadas, 0), 0);

    let dataEntrada = '';
    if (previous?.dataSaidaPlanejada) {
      dataEntrada = previous.dataSaidaPlanejada;
    } else {
      dataEntrada = toIsoDate(getEntryBase(group));
    }

    const saldoHerdado = previous ? Math.max(toNumber(previous.sobraSequencia, 0), 0) : 0;

    const schedule = computeDailySchedule({
      dataEntrada,
      toneladas: toneladasEstimadas,
      cota,
      saldoRecebido: saldoHerdado
    });

    const capacidadeRestanteCalculada = toNumber(schedule.capacidadeRestanteUltimoDia, 0);
    const capacidadeRestanteFinal = capacidadeRestanteCalculada;

    const result = {
      ...group,
      sequencia: index + 1,
      sequenciaAnterior: previous?.sequencia || null,
      saldoHerdado,
      capacidadeRestanteDiaEntrada: saldoHerdado,
      toneladasLiquidasPlanejadas: toneladasEstimadas,
      totalBaseCronograma: schedule.totalBaseCronograma,
      diasCheios: schedule.diasCheios,
      saldoUltimoDia: Math.max(toNumber(schedule.saldoUltimoDia, 0), 0),
      sobraSequencia: Math.max(toNumber(schedule.sobraSequencia, 0), 0),
      capacidadeRestanteUltimoDia: capacidadeRestanteFinal,
      finalizouDiaCompleto: schedule.finalizouDiaCompleto,
      horasUltimoDia: schedule.horasUltimoDia,
      cronogramaDiario: schedule.cronogramaDiario,
      dataEntradaPlanejada: schedule.dataEntrada || dataEntrada || '',
      dataSaidaPlanejada: schedule.dataSaida || dataEntrada || '',
      proximaEntradaSequencia: schedule.proximaEntradaSequencia || schedule.dataSaida || dataEntrada || ''
    };

    previous = result;
    return result;
  });
};

async function resolveCompanyId(companyId) {
  const raw = String(companyId || '').trim();
  const company = await prisma.company.findFirst({
    where: { OR: [{ id: raw }, { code: raw }, { name: { equals: raw, mode: 'insensitive' } }] },
    select: { id: true, code: true, name: true },
  });
  return company?.id || raw;
}

async function persistPlanejamentoDocs(docs = []) {
  for (const doc of docs) {
    const companyDbId = await resolveCompanyId(doc.companyId);
    await prisma.harvestPlan.upsert({
      where: { id: doc.id },
      update: {
        companyId: companyDbId,
        harvestYear: doc.safra || null,
        front: doc.frenteColheita || null,
        sequence: Number.isFinite(Number(doc.sequencia)) ? Number(doc.sequencia) : null,
        entryDate: doc.dataEntradaPlanejada ? new Date(`${doc.dataEntradaPlanejada}T00:00:00.000Z`) : null,
        exitDate: doc.dataSaidaPlanejada ? new Date(`${doc.dataSaidaPlanejada}T00:00:00.000Z`) : null,
        estimatedTon: toNumber(doc.toneladasEstimadas, 0),
        receivedBalance: toNumber(doc.saldoHerdado, 0),
        availableTotal: toNumber(doc.totalBaseCronograma || doc.toneladasLiquidasPlanejadas, 0),
        dailyQuota: toNumber(doc.cota || doc.cotaDiaSequencia, 0),
        remainingBalance: toNumber(doc.saldoUltimoDia, 0),
        decimalDays: toNumber(doc.horasUltimoDia, 0),
        integerDays: Number.isFinite(Number(doc.diasCheios)) ? Number(doc.diasCheios) : null,
        rawData: { ...doc, updatedAt: new Date().toISOString() },
      },
      create: {
        id: doc.id,
        companyId: companyDbId,
        harvestYear: doc.safra || null,
        front: doc.frenteColheita || null,
        sequence: Number.isFinite(Number(doc.sequencia)) ? Number(doc.sequencia) : null,
        entryDate: doc.dataEntradaPlanejada ? new Date(`${doc.dataEntradaPlanejada}T00:00:00.000Z`) : null,
        exitDate: doc.dataSaidaPlanejada ? new Date(`${doc.dataSaidaPlanejada}T00:00:00.000Z`) : null,
        estimatedTon: toNumber(doc.toneladasEstimadas, 0),
        receivedBalance: toNumber(doc.saldoHerdado, 0),
        availableTotal: toNumber(doc.totalBaseCronograma || doc.toneladasLiquidasPlanejadas, 0),
        dailyQuota: toNumber(doc.cota || doc.cotaDiaSequencia, 0),
        remainingBalance: toNumber(doc.saldoUltimoDia, 0),
        decimalDays: toNumber(doc.horasUltimoDia, 0),
        integerDays: Number.isFinite(Number(doc.diasCheios)) ? Number(doc.diasCheios) : null,
        rawData: { ...doc, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      },
    });
  }
}

async function fetchDocsByCompanySafra(companyId, safra) {
  const companyDbId = await resolveCompanyId(companyId);
  const rows = await prisma.harvestPlan.findMany({
    where: { companyId: companyDbId, harvestYear: safra },
    orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }],
  });
  return rows
    .map((row) => ({ ...(row.rawData || {}), id: row.id, companyId, safra: row.harvestYear || safra, frenteColheita: row.front, sequencia: row.sequence, dataEntradaPlanejada: row.entryDate ? row.entryDate.toISOString().slice(0, 10) : row.rawData?.dataEntradaPlanejada, dataSaidaPlanejada: row.exitDate ? row.exitDate.toISOString().slice(0, 10) : row.rawData?.dataSaidaPlanejada }))
    .filter((item) => item.statusPlanejamento !== 'inativo');
}

function groupDocsByFront(docs) {
  const map = new Map();
  docs.forEach((doc) => {
    const frente = normalizeFrente(doc.frenteColheita);
    if (!frente) return;
    const groupId = buildLegacyGroupId(doc);
    const key = `${doc.companyId}__${doc.safra}__${frente}`;
    if (!map.has(key)) map.set(key, new Map());
    const frontGroups = map.get(key);
    if (!frontGroups.has(groupId)) {
      frontGroups.set(groupId, {
        ...buildRepresentativeFromDoc(doc),
        docs: []
      });
    }
    frontGroups.get(groupId).docs.push(doc);
  });
  return map;
}

function normalizeRequestedSeq(value, fallback = 1) {
  return Math.max(1, parseInt(value, 10) || fallback || 1);
}

function sortExistingGroups(groups) {
  return [...groups].sort((a, b) => {
    const sa = normalizeRequestedSeq(a.requestedSeq);
    const sb = normalizeRequestedSeq(b.requestedSeq);
    if (sa !== sb) return sa - sb;

    const da = String(getEntryBase(a) || '9999-12-31T00:00:00.000Z');
    const db = String(getEntryBase(b) || '9999-12-31T00:00:00.000Z');
    if (da !== db) return da.localeCompare(db);

    return String(a.groupId).localeCompare(String(b.groupId));
  });
}

function reorderGroupsByRequestedPosition(groups, currentGroup) {
  const others = sortExistingGroups((groups || []).filter((group) => group.groupId !== currentGroup.groupId));
  const requestedSeq = normalizeRequestedSeq(currentGroup.requestedSeq);
  const insertIndex = Math.max(0, Math.min(requestedSeq - 1, others.length));

  others.splice(insertIndex, 0, {
    ...currentGroup,
    requestedSeq
  });

  return others.map((group, index) => ({
    ...group,
    requestedSeq: index + 1
  }));
}

export async function previewPlanejamento(payload) {
  const companyId = String(payload.companyId || '').trim();
  const safra = String(payload.safra || '').trim();
  const frenteColheita = normalizeFrente(payload.frenteColheita);
  const requestedSeq = Math.max(1, parseInt(payload.sequencia, 10) || 1);

  if (!companyId || !safra || !frenteColheita) {
    throw new Error('companyId, safra e frenteColheita são obrigatórios para prévia.');
  }

  const allDocs = await fetchDocsByCompanySafra(companyId, safra);
  const frontKey = `${companyId}__${safra}__${frenteColheita}`;
  const grouped = groupDocsByFront(allDocs);
  const frontGroups = Array.from((grouped.get(frontKey) || new Map()).values());

  const currentGroupId = String(payload.sequenciaGrupoId || '').trim() || `preview-${randomUUID()}`;
  const withoutCurrent = frontGroups.filter((group) => group.groupId !== currentGroupId);

  const ordered = reorderGroupsByRequestedPosition(withoutCurrent, {
    groupId: currentGroupId,
    requestedSeq,
    dataBase: toIsoDate(payload.dataColheita || payload.dataBase),
    dataColheita: toIsoDate(payload.dataColheita || payload.dataBase),
    toneladasEstimadas: Math.max(toNumber(payload.toneladasEstimadas, 0), 0),
    cota: Math.max(toNumber(payload.cota, 0), 0),
    frenteColheita,
    companyId,
    safra,
    commonFields: {
      frenteColheita,
      dataColheita: toIsoDate(payload.dataColheita || payload.dataBase)
    },
    docs: []
  });
  const computed = computeChain(ordered);
  const current = computed.find((item) => item.groupId === currentGroupId);
  const previous = current?.sequenciaAnterior
    ? computed.find((item) => item.sequencia === current.sequenciaAnterior)
    : null;

  const cronogramaAtual = current?.cronogramaDiario || [];
  const ultimoDiaAtual = cronogramaAtual[cronogramaAtual.length - 1] || null;
  const dataSaidaAtual = current?.dataSaidaPlanejada || '';
  const dataProximaEntrada = current?.proximaEntradaSequencia || dataSaidaAtual;
  const cotaAtual = Math.max(toNumber(current?.cota, 0), 0);
  const toneladasAtuais = Math.max(toNumber(current?.toneladasEstimadas || current?.toneladasLiquidasPlanejadas, 0), 0);
  const saldoHerdadoAtual = Math.max(toNumber(current?.saldoHerdado, 0), 0);
  const toneladasBaseCronograma = Math.max(toNumber(current?.totalBaseCronograma, toneladasAtuais + saldoHerdadoAtual), 0);
  const diasNecessariosDecimal = cotaAtual > 0 ? toneladasBaseCronograma / cotaAtual : 0;

  const toneladasUltimoDia = Math.max(toNumber(ultimoDiaAtual?.toneladasDia, 0), 0);
  const capacidadeLivreUltimoDia = Math.max(toNumber(current?.sobraSequencia ?? current?.saldoUltimoDia ?? current?.capacidadeRestanteUltimoDia, 0), 0);

  const resumoPlanejamento = {
    dataEntradaSequencia: formatPreviewDate(current?.dataEntradaPlanejada),
    dataSaidaSequencia: formatPreviewDate(dataSaidaAtual),
    proximaEntradaSequencia: formatPreviewDate(dataProximaEntrada),
    sequenciaAtual: current?.sequencia || requestedSeq,
    proximaSequencia: (current?.sequencia || requestedSeq) + 1,
    toneladasSequencia: toneladasAtuais,
    saldoRecebidoSequencia: saldoHerdadoAtual,
    toneladasBaseCronograma,
    cotaDiaSequencia: cotaAtual,
    diasNecessariosDecimal,
    diasCalendario: cronogramaAtual.length,
    diasCheios: current?.diasCheios || Math.floor(diasNecessariosDecimal || 0),
    toneladasUltimoDia,
    saldoDisponivelProximaSequencia: capacidadeLivreUltimoDia,
    capacidadeLivreUltimoDia,
    ultimoDiaParcial: Boolean(current && !current.finalizouDiaCompleto),
    statusUltimoDia: current ? (current.finalizouDiaCompleto ? 'Dia cheio' : 'Dia parcial') : '',
    dataEntradaVeioDaSequenciaAnterior: Boolean(previous),
    sequenciaAnterior: previous?.sequencia || null,
    saldoHerdadoDaSequenciaAnterior: current?.saldoHerdado || 0,
    dataSaidaSequenciaAnterior: formatPreviewDate(previous?.dataSaidaPlanejada)
  };

  return {
    sequenciaGrupoId: currentGroupId,
    existeSequenciaAnterior: Boolean(previous),
    sequenciaAnterior: previous
      ? {
          sequencia: previous.sequencia,
          dataSaidaPlanejada: previous.dataSaidaPlanejada,
          toneladasUltimoDia: previous.saldoUltimoDia,
          saldoDisponivelProximaSequencia: previous.saldoUltimoDia || 0,
          statusUltimoDia: previous.finalizouDiaCompleto ? 'Dia cheio' : 'Dia parcial'
        }
      : null,
    dataEntradaPlanejada: formatPreviewDate(current?.dataEntradaPlanejada),
    dataEntradaPlanejadaCompleta: current?.dataEntradaPlanejada || '',
    dataSaidaPlanejada: formatPreviewDate(current?.dataSaidaPlanejada),
    dataSaidaPlanejadaCompleta: current?.dataSaidaPlanejada || '',
    proximaEntradaSequencia: resumoPlanejamento.proximaEntradaSequencia,
    diasCheios: current?.diasCheios || 0,
    diasCalendario: cronogramaAtual.length,
    diasNecessariosDecimal,
    saldoUltimoDia: current?.saldoUltimoDia || 0,
    capacidadeRestanteUltimoDia: capacidadeLivreUltimoDia,
    saldoDisponivelProximaSequencia: capacidadeLivreUltimoDia,
    toneladasUltimoDia,
    saldoHerdado: current?.saldoHerdado || 0,
    capacidadeRestanteDiaEntrada: current?.capacidadeRestanteDiaEntrada || 0,
    cronogramaDiario: current?.cronogramaDiario || [],
    toneladasLiquidasPlanejadas: current?.toneladasLiquidasPlanejadas || 0,
    sequenciaCalculada: current?.sequencia || requestedSeq,
    resumoPlanejamento
  };
}

export async function savePlanejamento(payload) {
  const companyId = String(payload.companyId || '').trim();
  const safra = String(payload.safra || '').trim();
  const frenteColheita = normalizeFrente(payload.frenteColheita);
  const requestedSeq = Math.max(1, parseInt(payload.sequencia, 10) || 1);
  const talhoes = Array.isArray(payload.talhoes) ? payload.talhoes.filter((t) => t?.talhaoId) : [];

  if (!companyId || !safra || !frenteColheita) throw new Error('companyId, safra e frenteColheita são obrigatórios.');
  if (!talhoes.length) throw new Error('Nenhum talhão informado para salvar o planejamento.');

  const allDocs = await fetchDocsByCompanySafra(companyId, safra);
  const selectedTalhaoIds = new Set(talhoes.map((t) => String(t.talhaoId)));
  const existingSelectedDocs = allDocs.filter((doc) => selectedTalhaoIds.has(String(doc.talhaoId)));
  const currentGroupId = String(
    payload.sequenciaGrupoId ||
    existingSelectedDocs.find((doc) => doc.sequenciaGrupoId)?.sequenciaGrupoId ||
    (existingSelectedDocs[0] ? buildLegacyGroupId(existingSelectedDocs[0]) : '') ||
    randomUUID()
  );

  const oldFronts = new Set(existingSelectedDocs.map((doc) => normalizeFrente(doc.frenteColheita)).filter(Boolean));
  oldFronts.add(frenteColheita);

  const groupedByFront = groupDocsByFront(allDocs);
  const affectedFronts = new Set(oldFronts);
  const docsToPersist = [];

  for (const front of affectedFronts) {
    const frontKey = `${companyId}__${safra}__${front}`;
    const frontGroupMap = new Map(groupedByFront.get(frontKey) || []);

    frontGroupMap.delete(currentGroupId);
    for (const [groupId, group] of Array.from(frontGroupMap.entries())) {
      const remainingDocs = (group.docs || []).filter((doc) => !selectedTalhaoIds.has(String(doc.talhaoId)));
      if (remainingDocs.length === 0) {
        frontGroupMap.delete(groupId);
      } else if (remainingDocs.length !== group.docs.length) {
        const rep = remainingDocs[0];
        frontGroupMap.set(groupId, {
          ...buildRepresentativeFromDoc(rep),
          docs: remainingDocs
        });
      }
    }

    if (front === frenteColheita) {
      const now = new Date().toISOString();
      const groupDocs = talhoes.map((talhao) => {
        const matched = existingSelectedDocs.find((doc) => String(doc.talhaoId) === String(talhao.talhaoId));
        const docId = matched?.id || buildPlanejamentoId(companyId, safra, talhao.talhaoId);
        return {
          ...(matched || {}),
          ...payload.commonPayload,
          ...talhao,
          id: docId,
          companyId,
          safra,
          frenteColheita,
          talhaoId: talhao.talhaoId,
          sequenciaGrupoId: currentGroupId,
          updatedAt: now,
          createdAt: matched?.createdAt || now,
          statusPlanejamento: payload.commonPayload?.statusPlanejamento || matched?.statusPlanejamento || 'Planejado'
        };
      });

      frontGroupMap.set(currentGroupId, {
        groupId: currentGroupId,
        requestedSeq,
        dataBase: toIsoDate(payload.commonPayload?.dataColheita || payload.commonPayload?.dataBase),
        dataColheita: toIsoDate(payload.commonPayload?.dataColheita || payload.commonPayload?.dataBase),
        toneladasEstimadas: Math.max(toNumber(payload.commonPayload?.toneladasEstimadas, 0), 0),
        cota: Math.max(toNumber(payload.commonPayload?.cota, 0), 0),
        frenteColheita,
        companyId,
        safra,
        commonFields: {
          ...pickGroupCommonFields(payload.commonPayload || {}),
          safra,
          frenteColheita,
          dataColheita: toIsoDate(payload.commonPayload?.dataColheita || payload.commonPayload?.dataBase),
          dataBase: toIsoDate(payload.commonPayload?.dataBase || payload.commonPayload?.dataColheita)
        },
        docs: groupDocs
      });
    }

    const groupsForFront = Array.from(frontGroupMap.values());
    const currentGroup = groupsForFront.find((group) => group.groupId === currentGroupId);
    const ordered = currentGroup
      ? reorderGroupsByRequestedPosition(groupsForFront, currentGroup)
      : sortExistingGroups(groupsForFront).map((group, index) => ({ ...group, requestedSeq: index + 1 }));
    const computed = computeChain(ordered);

    computed.forEach((group) => {
      group.docs.forEach((doc) => {
        docsToPersist.push(omitUndefined({
          ...doc,
          ...group.commonFields,
          companyId,
          safra,
          frenteColheita: front,
          sequenciaGrupoId: group.groupId,
          sequencia: group.sequencia,
          dataEntradaPlanejada: group.dataEntradaPlanejada,
          dataSaidaPlanejada: group.dataSaidaPlanejada,
          proximaEntradaSequencia: group.proximaEntradaSequencia,
          saldoHerdado: group.saldoHerdado,
          saldoRecebidoSequencia: group.saldoHerdado,
          capacidadeRestanteDiaEntrada: group.capacidadeRestanteDiaEntrada,
          saldoUltimoDia: group.saldoUltimoDia,
          sobraSequencia: group.sobraSequencia,
          saldoDisponivelProximaSequencia: group.saldoUltimoDia,
          diasCheios: group.diasCheios,
          diasDaFrente: group.diasCheios,
          cotaDiaSequencia: group.cota,
          toneladasSequencia: group.toneladasEstimadas,
          diasCalendario: Array.isArray(group.cronogramaDiario) ? group.cronogramaDiario.length : 0,
          totalBaseCronograma: group.totalBaseCronograma,
          diasNecessariosDecimal: group.cota > 0 ? ((group.totalBaseCronograma || group.toneladasEstimadas || 0) / group.cota) : 0,
          horasUltimoDia: group.horasUltimoDia,
          capacidadeRestanteUltimoDia: group.capacidadeRestanteUltimoDia,
          finalizouDiaCompleto: group.finalizouDiaCompleto,
          statusUltimoDia: group.finalizouDiaCompleto ? 'Dia cheio' : 'Dia parcial',
          cronogramaDiario: group.cronogramaDiario,
          // Cor pronta para o mapa: o frontend só renderiza, sem recalcular regra pesada.
          fillColor: getPlanejamentoFillColor(front),
          toneladasLiquidasPlanejadas: group.toneladasLiquidasPlanejadas,
          syncStatus: 'synced'
        }));
      });
    });
  }

  await persistPlanejamentoDocs(docsToPersist.map((doc) => omitUndefined({ ...doc, updatedAt: new Date().toISOString() })));

  for (const front of affectedFronts) {
    await recalcularCronogramaFrente(companyId, safra, front);
  }

  const preview = await previewPlanejamento({
    companyId,
    safra,
    frenteColheita,
    sequencia: requestedSeq,
    sequenciaGrupoId: currentGroupId,
    dataColheita: payload.commonPayload?.dataColheita,
    toneladasEstimadas: payload.commonPayload?.toneladasEstimadas,
    cota: payload.commonPayload?.cota
  });

  return {
    savedItems: docsToPersist,
    preview,
    sequenciaGrupoId: currentGroupId
  };
}

export async function recalcularCronogramaFrente(companyId, safra, frenteColheita) {
  if (!companyId || !safra || !frenteColheita) return;

  const allDocs = await fetchDocsByCompanySafra(companyId, safra);
  const frontKey = `${companyId}__${safra}__${frenteColheita}`;
  const groupedByFront = groupDocsByFront(allDocs);
  const frontGroupMap = new Map(groupedByFront.get(frontKey) || []);

  if (frontGroupMap.size === 0) return;

  const groupsForFront = Array.from(frontGroupMap.values());
  const ordered = sortExistingGroups(groupsForFront).map((group, index) => ({ ...group, requestedSeq: index + 1 }));
  const computed = computeChain(ordered);

  const docsToPersist = [];
  computed.forEach((group) => {
    group.docs.forEach((doc) => {
      docsToPersist.push(omitUndefined({
        ...doc,
        ...group.commonFields,
        companyId,
        safra,
        frenteColheita,
        sequenciaGrupoId: group.groupId,
        sequencia: group.sequencia,
        dataEntradaPlanejada: group.dataEntradaPlanejada,
        dataSaidaPlanejada: group.dataSaidaPlanejada,
        proximaEntradaSequencia: group.proximaEntradaSequencia,
        saldoHerdado: group.saldoHerdado,
        saldoRecebidoSequencia: group.saldoHerdado,
        capacidadeRestanteDiaEntrada: group.capacidadeRestanteDiaEntrada,
        saldoUltimoDia: group.saldoUltimoDia,
        sobraSequencia: group.sobraSequencia,
        saldoDisponivelProximaSequencia: group.sobraSequencia,
        diasCheios: group.diasCheios,
        diasDaFrente: group.diasCheios,
        cotaDiaSequencia: group.cota,
        toneladasSequencia: group.toneladasEstimadas,
        diasCalendario: Array.isArray(group.cronogramaDiario) ? group.cronogramaDiario.length : 0,
        totalBaseCronograma: group.totalBaseCronograma,
        diasNecessariosDecimal: group.cota > 0 ? ((group.totalBaseCronograma || group.toneladasEstimadas || 0) / group.cota) : 0,
        horasUltimoDia: group.horasUltimoDia,
        capacidadeRestanteUltimoDia: group.capacidadeRestanteUltimoDia,
        finalizouDiaCompleto: group.finalizouDiaCompleto,
        statusUltimoDia: group.finalizouDiaCompleto ? 'Dia cheio' : 'Dia parcial',
        cronogramaDiario: group.cronogramaDiario,
        fillColor: getPlanejamentoFillColor(frenteColheita),
        toneladasLiquidasPlanejadas: group.toneladasLiquidasPlanejadas,
        syncStatus: 'synced'
      }));
    });
  });

  await persistPlanejamentoDocs(docsToPersist.map((doc) => omitUndefined({ ...doc, updatedAt: new Date().toISOString() })));
}
