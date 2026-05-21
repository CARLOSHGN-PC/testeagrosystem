import { apiRequest } from './apiClient';

const enabledRaw = String(import.meta.env.VITE_USE_POSTGRES_READS ?? 'true').toLowerCase();
export const usePostgresReads = !['false', '0', 'off', 'no'].includes(enabledRaw);

function normalizeAtivoStatus(status, fallback = 'active') {
  const value = String(status || fallback).toLowerCase();
  if (value === 'ativo') return 'active';
  if (value === 'inativo') return 'inactive';
  return value;
}

function normalizeUserStatus(status, fallback = 'ativo') {
  const value = String(status || fallback).toLowerCase();
  if (value === 'active') return 'ativo';
  if (value === 'inactive') return 'inativo';
  if (value === 'ativo' || value === 'inativo') return value;
  return fallback;
}

function normalizeRole(role) {
  const value = String(role || '').toUpperCase();
  if (value === 'ADMIN') return 'admin_empresa';
  if (value === 'MANAGER') return 'gestor';
  if (value === 'USER') return 'operador';
  return String(role || 'operador').toLowerCase();
}

export function normalizePostgresCompany(company) {
  const companyId = company.code || company.companyId || company.id;
  return {
    ...company,
    id: company.id,
    companyId,
    code: company.code || companyId,
    name: company.name || company.nome || companyId,
    status: normalizeAtivoStatus(company.status),
    plan: company.plan || 'postgres',
    maxUsers: company.maxUsers || null,
    logoColor: company.logoColor || '#55AB52',
    enabledModules: company.enabledModules || {},
    source: 'postgres',
  };
}

export function normalizePostgresUser(user) {
  const company = user.company ? normalizePostgresCompany(user.company) : null;
  return {
    ...user,
    uid: user.uid || user.id,
    id: user.id,
    nome: user.nome || user.name || user.email,
    name: user.name || user.nome || user.email,
    email: user.email,
    role: normalizeRole(user.roleReal || user.role),
    readOnly: user.readOnly === true || normalizeRole(user.roleReal || user.role) === 'visualizador',
    status: normalizeUserStatus(user.status),
    companyId: company?.companyId || user.companyCode || user.companyId,
    company,
    permissions: user.permissions || {},
    source: 'postgres',
  };
}

function decimalToLegacyString(value) {
  if (value === undefined || value === null || value === '') return '';
  return String(value);
}

export function normalizePostgresEstimate(estimate) {
  const raw = estimate.rawData || {};
  const farm = estimate.farm || null;
  const field = estimate.field || null;
  const variety = estimate.variety || null;

  return {
    ...raw,
    id: estimate.id,
    companyId: raw.companyId || estimate.companyCode || estimate.companyId,
    safra: raw.safra || estimate.harvestYear || '',
    rodada: raw.rodada || estimate.round || 'Estimativa',
    talhaoId: raw.talhaoId || field?.code || estimate.fieldCode || estimate.fieldId || '',
    fundo_agricola: raw.fundo_agricola ?? farm?.code ?? null,
    fazenda: raw.fazenda || farm?.name || farm?.code || '',
    variedade: raw.variedade || variety?.name || '',
    tch: raw.tch ?? decimalToLegacyString(estimate.estimatedTch),
    toneladas: raw.toneladas ?? decimalToLegacyString(estimate.estimatedTon),
    area: raw.area ?? decimalToLegacyString(estimate.area),
    version: raw.version || 1,
    syncStatus: 'synced',
    source: 'postgres',
    updatedAt: estimate.updatedAt || raw.updatedAt || new Date().toISOString(),
    farm,
    field,
    variety,
  };
}


export function normalizePostgresHarvestPlan(plan) {
  const raw = plan.rawData || {};
  const companyId = raw.companyId || plan.companyCode || plan.companyId || '';
  const safra = raw.safra || plan.harvestYear || '';
  const talhaoId = raw.talhaoId || plan.id;

  return {
    ...raw,
    id: plan.id,
    companyId,
    safra,
    talhaoId,
    frenteColheita: raw.frenteColheita || plan.front || '',
    sequencia: raw.sequencia ?? plan.sequence ?? null,
    dataEntradaPlanejada: raw.dataEntradaPlanejada || plan.entryDate || '',
    dataSaidaPlanejada: raw.dataSaidaPlanejada || plan.exitDate || '',
    toneladasEstimadas: raw.toneladasEstimadas ?? plan.estimatedTon ?? null,
    toneladasLiquidasPlanejadas: raw.toneladasLiquidasPlanejadas ?? plan.availableTotal ?? plan.estimatedTon ?? null,
    saldoHerdado: raw.saldoHerdado ?? plan.receivedBalance ?? 0,
    saldoUltimoDia: raw.saldoUltimoDia ?? plan.remainingBalance ?? 0,
    cota: raw.cota ?? plan.dailyQuota ?? null,
    diasCheios: raw.diasCheios ?? plan.integerDays ?? null,
    horasUltimoDia: raw.horasUltimoDia ?? plan.decimalDays ?? null,
    statusPlanejamento: raw.statusPlanejamento || 'Planejado',
    syncStatus: 'synced',
    source: 'postgres',
    updatedAt: plan.updatedAt || raw.updatedAt || new Date().toISOString(),
  };
}


export function normalizePostgresClosureDashboardRecord(record) {
  const raw = record.rawData || {};
  const calc = record.calculated || raw.calculated || {};

  return {
    ...raw,
    id: record.id,
    companyId: raw.companyId || record.companyCode || record.companyId || '',
    safra: raw.safra || record.harvestYear || '',
    fazenda: raw.fazenda || record.farmCode || '',
    quadra: raw.quadra || record.fieldCode || '',
    parte: raw.parte || record.part || '',
    variedade: raw.variedade || record.varietyName || 'Outras',
    estagio: raw.estagio || record.stage || '',
    abertura: raw.abertura || record.openingDate || '',
    encerramento: raw.encerramento || record.closingDate || '',
    plantio: raw.plantio || record.plantingDate || '',
    liberada: raw.liberada ?? record.releasedArea ?? null,
    cortada: calc.cutAreaCalc ?? raw.Cortada ?? raw.cortada ?? raw['AREA CORTADA'] ?? record.cutArea ?? null,
    prodPrev: calc.prevTonCalc ?? raw['Prod. Prev.'] ?? raw.prodPrev ?? raw['PROD. PREV.'] ?? record.prevTon ?? null,
    prodReal: calc.realTonCalc ?? raw['Prod. Real'] ?? raw.prodReal ?? raw['PROD. REAL'] ?? record.realTon ?? null,
    tHaPrev: calc.prevTchCalc ?? record.prevTch ?? raw.tHaPrev ?? null,
    tHaReal: calc.realTchCalc ?? record.realTch ?? raw.tHaReal ?? null,
    atr: calc.atrBaseCalc ?? raw.Atr ?? raw.atr ?? raw.ATR ?? record.atr ?? null,
    atrHaReal: raw.atrHaReal ?? record.atrHaReal ?? null,
    idade: raw.idade ?? record.age ?? null,
    cortes: raw.cortes ?? record.cuts ?? null,
    espac: raw.espac ?? record.spacing ?? null,
    dm: raw.dm ?? record.dm ?? null,
    tempo: raw.tempo ?? record.timeDays ?? null,
    varPercent: raw.varPercent ?? record.variationPercent ?? null,
    atrPrevNumerator: calc.atrPrevNumerator ?? raw.atrPrevNumerator ?? null,
    atrPrevWeight: calc.atrPrevWeight ?? raw.atrPrevWeight ?? null,
    atrRealNumerator: calc.atrRealNumerator ?? raw.atrRealNumerator ?? null,
    atrRealWeight: calc.atrRealWeight ?? raw.atrRealWeight ?? null,
    source: 'postgres',
    updatedAt: record.updatedAt || raw.updatedAt || new Date().toISOString(),
  };
}

function firstText(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

function normalizeCutOrderStatus(status) {
  const value = String(status || '').toUpperCase().trim();
  if (!value) return 'ABERTA';
  if (value.includes('FINAL') || value.includes('FECH') || value.includes('ENCERR')) return 'FINALIZADA';
  if (value.includes('AGUARD') || value.includes('PEND')) return 'AGUARDANDO';
  if (value.includes('CANCEL')) return 'CANCELADA';
  // O frontend antigo usa ABERTA, mas algumas OCs antigas vêm como ABERTO.
  if (value === 'ABERTO' || value === 'ABERTA' || value === 'OPEN') return 'ABERTA';
  return value;
}

function buildCutOrderLegacyPair(order) {
  const raw = order.rawData || {};
  const companyId = firstText(raw.companyId, order.company?.code, order.companyCode, order.companyId);
  const safra = firstText(raw.safra, raw.harvestYear, order.harvestYear);
  const status = normalizeCutOrderStatus(raw.status || order.status);
  const codigo = firstText(raw.codigo, raw.ordemCodigo, raw.sequencial);
  const numeroEmpresa = firstText(raw.numeroEmpresa, raw.numero, raw.number);
  const sequencial = Number(raw.sequencial || raw.sequence || String(codigo).replace(/\D/g, '')) || null;
  const farm = order.farm || null;
  const farmCode = firstText(raw.fundoAgricola, raw.fundo_agricola, raw.fazenda, farm?.code);
  const farmName = firstText(raw.fazendaNome, raw.nome_fazenda, raw.fazendaDescricao, farm?.name, farmCode);
  const farmId = firstText(raw.fazendaId, raw.id_fazenda, farm?.id, farmCode);

  const ordem = {
    ...raw,
    id: order.id,
    companyId,
    safra,
    sequencial,
    codigo,
    ordemCodigo: firstText(raw.ordemCodigo, codigo),
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
    source: 'postgres',
  };

  const sourceFields = Array.isArray(order.fields) && order.fields.length
    ? order.fields
    : (Array.isArray(raw.talhaoIds) ? raw.talhaoIds.map((talhaoId, index) => ({
        id: `${order.id}_${talhaoId}_${index}`,
        rawData: {
          talhaoId,
          talhaoNome: Array.isArray(raw.talhoesNomes) ? raw.talhoesNomes[index] : undefined,
        },
      })) : []);

  const seen = new Set();

  const vinculos = sourceFields.flatMap((relation, index) => {
    const relRaw = relation.rawData || {};
    const field = relation.field || null;
    const relationFarm = field?.farm || farm || null;
    const rawTalhaoId = Array.isArray(raw.talhaoIds) ? raw.talhaoIds[index] : undefined;
    const rawTalhaoNome = Array.isArray(raw.talhoesNomes) ? raw.talhoesNomes[index] : undefined;

    // Regra idêntica à produção: o mapa pinta pelo talhaoId do vínculo.
    // NÃO usamos talhaoNome/fieldId como alias visual, porque esses valores podem
    // se repetir entre fazendas e pintar polígonos errados.
    const talhaoId = firstText(relRaw.talhaoId, rawTalhaoId, field?.code, relation.fieldCode);
    if (!talhaoId) return [];

    const dedupeKey = `${order.id}::${String(talhaoId).trim()}::${normalizeCutOrderStatus(relRaw.status || raw.status || order.status)}`;
    if (seen.has(dedupeKey)) return [];
    seen.add(dedupeKey);

    const talhaoNome = firstText(relRaw.talhaoNome, rawTalhaoNome, field?.name, talhaoId);
    const vinculoFarmCode = firstText(relRaw.fundoAgricola, relRaw.fundo_agricola, relationFarm?.code, farmCode);
    const vinculoFarmName = firstText(relRaw.fazendaNome, relRaw.nome_fazenda, relRaw.fazendaDescricao, relationFarm?.name, farmName);
    const vinculoFarmId = firstText(relRaw.fazendaId, relRaw.id_fazenda, relationFarm?.id, farmId, vinculoFarmCode);

    return [{
      ...relRaw,
      id: firstText(relRaw.id, relation.id, `${order.id}_${talhaoId}`),
      companyId,
      safra,
      ordemCorteId: firstText(relRaw.ordemCorteId, order.id),
      talhaoId,
      talhaoNome,
      status: normalizeCutOrderStatus(relRaw.status || raw.status || order.status),
      sequencial,
      codigo,
      ordemCodigo: firstText(relRaw.ordemCodigo, raw.ordemCodigo, codigo),
      numeroEmpresa: firstText(relRaw.numeroEmpresa, raw.numeroEmpresa, numeroEmpresa),
      openedAt: relRaw.openedAt || ordem.openedAt,
      closedAt: relRaw.closedAt || ordem.closedAt || null,
      fazendaId: vinculoFarmId,
      id_fazenda: vinculoFarmId,
      fazendaNome: vinculoFarmName,
      nome_fazenda: vinculoFarmName,
      fundoAgricola: vinculoFarmCode,
      fundo_agricola: vinculoFarmCode,
      fazendaDescricao: firstText(relRaw.fazendaDescricao, relationFarm?.name, vinculoFarmName),
      area: relRaw.area ?? relation.area ?? field?.area ?? null,
      estimatedTon: relRaw.estimatedTon ?? relation.estimatedTon ?? null,
      realTon: relRaw.realTon ?? relation.realTon ?? null,
      syncStatus: 'synced',
      source: 'postgres',
      updatedAt: relation.updatedAt || relRaw.updatedAt || ordem.updatedAt,
    }];
  });

  return { ordem, vinculos };
}

export function normalizePostgresCutOrder(order) {
  return buildCutOrderLegacyPair(order).ordem;
}

export function normalizePostgresCutOrderWithLinks(order) {
  return buildCutOrderLegacyPair(order);
}


function normalizeServiceOrderStatus(status) {
  const value = String(status || '').toUpperCase().trim();
  if (!value) return 'ABERTA';
  if (value.includes('EXECUT') || value.includes('FINAL') || value.includes('FECH')) return 'EXECUTADA';
  if (value.includes('CANCEL')) return 'CANCELADA';
  if (value.includes('REPROV')) return 'REPROVADA';
  if (value.includes('PENDENTE') || value.includes('APROV')) {
    if (value.includes('APROVACAO') || value.includes('APROVAÇÃO')) return 'PENDENTE_APROVACAO';
    if (value === 'APROVADA') return 'APROVADA';
  }
  if (value === 'RASCUNHO') return 'RASCUNHO';
  if (value === 'ABERTO' || value === 'ABERTA' || value === 'OPEN') return 'ABERTA';
  return value;
}

function buildServiceOrderLegacyPair(order) {
  const raw = order.rawData || {};
  const companyId = firstText(raw.companyId, order.company?.code, order.companyCode, order.companyId);
  const safra = firstText(raw.safra, raw.harvestYear, order.harvestYear, '2026/2027');
  const status = normalizeServiceOrderStatus(raw.status || order.status);
  const numeroEmpresa = firstText(raw.numeroEmpresa, raw.numero, raw.number);
  const sequencial = Number(raw.sequencial || String(numeroEmpresa).replace(/\D/g, '')) || null;
  const operation = raw.operacao?.nome || raw.protocoloNome || raw.subProtocolo || order.operation || '';

  const ordem = {
    ...raw,
    id: order.id,
    companyId,
    safra,
    sequencial,
    numeroEmpresa,
    status,
    operacao: raw.operacao || (operation ? { nome: operation, id: raw.protocoloId || raw.protocoloOriginalId || '' } : null),
    openedAt: raw.openedAt || raw.createdAt || order.openingDate || order.createdAt || null,
    closedAt: raw.closedAt || order.closingDate || null,
    updatedAt: order.updatedAt || raw.updatedAt || new Date().toISOString(),
    syncStatus: 'synced',
    source: 'postgres',
  };

  const sourceFields = Array.isArray(order.fields) ? order.fields : [];
  const seen = new Set();

  const vinculos = sourceFields.flatMap((relation, index) => {
    const relRaw = relation.rawData || {};
    const field = relation.field || null;
    const relationFarm = field?.farm || null;

    // Igual produção: o mapa de tratos pinta pelo talhaoId gravado em ordens_servico_talhoes.
    // Não usar talhaoNome como fallback principal, porque talhão pequeno repete entre fazendas.
    const talhaoId = firstText(relRaw.talhaoId, field?.code, relation.fieldCode);
    if (!talhaoId) return [];

    const vinculoStatus = normalizeServiceOrderStatus(relRaw.status || raw.status || order.status);
    const dedupeKey = `${order.id}::${String(talhaoId).trim()}::${vinculoStatus}`;
    if (seen.has(dedupeKey)) return [];
    seen.add(dedupeKey);

    const talhaoNome = firstText(relRaw.talhaoNome, field?.name, talhaoId);
    const farmCode = firstText(relRaw.fundoAgricola, relRaw.fundo_agricola, relationFarm?.code, raw.fundoAgricola, raw.fundo_agricola);
    const farmName = firstText(relRaw.fazendaNome, relRaw.nome_fazenda, relRaw.fazendaDescricao, relationFarm?.name, raw.fazendaNome, raw.nome_fazenda);
    const farmId = firstText(relRaw.fazendaId, relRaw.id_fazenda, relationFarm?.id, raw.fazendaId, raw.id_fazenda, farmCode);

    return [{
      ...relRaw,
      id: firstText(relRaw.id, relation.id, `${order.id}_${talhaoId}_${index}`),
      companyId,
      safra,
      ordemServicoId: firstText(relRaw.ordemServicoId, order.id),
      talhaoId,
      talhaoNome,
      status: vinculoStatus,
      sequencial,
      numeroEmpresa: firstText(relRaw.numeroEmpresa, raw.numeroEmpresa, numeroEmpresa),
      openedAt: relRaw.openedAt || ordem.openedAt,
      closedAt: relRaw.closedAt || ordem.closedAt || null,
      fazendaId: farmId,
      id_fazenda: farmId,
      fazendaNome: farmName,
      nome_fazenda: farmName,
      fundoAgricola: farmCode,
      fundo_agricola: farmCode,
      fazendaDescricao: firstText(relRaw.fazendaDescricao, relationFarm?.name, farmName),
      syncStatus: 'synced',
      source: 'postgres',
      updatedAt: relation.updatedAt || relRaw.updatedAt || ordem.updatedAt,
    }];
  });

  return { ordem, vinculos };
}

export function normalizePostgresServiceOrder(order) {
  return buildServiceOrderLegacyPair(order).ordem;
}

export function normalizePostgresServiceOrderWithLinks(order) {
  return buildServiceOrderLegacyPair(order);
}


function normalizePlanningTreatmentStatus(status) {
  const value = String(status || '').toUpperCase().trim();
  if (!value) return 'ABERTA';
  if (value.includes('CANCEL')) return 'CANCELADO';
  if (value.includes('EXECUT') || value.includes('FINAL') || value.includes('FECH')) return 'EXECUTADA';
  if (value.includes('APROVACAO') || value.includes('APROVAÇÃO')) return 'PENDENTE_APROVACAO';
  if (value.includes('ANALISTA')) return 'AGUARDANDO_ANALISTA';
  if (value.includes('AGUARD')) return 'AGUARDANDO';
  if (value === 'ABERTO' || value === 'ABERTA' || value === 'OPEN') return 'ABERTA';
  return value;
}

function normalizePostgresPlanningTreatmentPair(item) {
  const raw = item.rawData || {};
  const companyId = firstText(raw.companyId, item.companyCode, item.companyId);
  const safra = firstText(raw.safra, item.harvestYear);
  const status = normalizePlanningTreatmentStatus(raw.status || item.status);
  const sequencial = Number(raw.sequencial || item.sequential) || null;

  const mestre = {
    ...raw,
    id: item.id,
    companyId,
    safra,
    sequencial,
    status,
    operacao: raw.operacao || item.operation || null,
    protocoloOriginalId: raw.protocoloOriginalId || item.protocolOriginalId || null,
    protocoloNome: raw.protocoloNome || item.protocolName || null,
    subProtocolo: raw.subProtocolo || item.subProtocol || 'Protocolo I',
    protocoloEditado: raw.protocoloEditado || item.editedProtocol || [],
    custoTotalOriginal: raw.custoTotalOriginal ?? item.originalCost ?? 0,
    custoTotalPlanejado: raw.custoTotalPlanejado ?? item.plannedCost ?? 0,
    justificativaApoio: raw.justificativaApoio || item.justification || null,
    totalTalhoes: raw.totalTalhoes ?? item.totalFields ?? 0,
    totalFazendas: raw.totalFazendas ?? item.totalFarms ?? 0,
    fazendas: raw.fazendas || item.farms || [],
    createdAt: raw.createdAt || item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || raw.updatedAt || new Date().toISOString(),
    syncStatus: 'synced',
    source: 'postgres',
  };

  const vinculos = (Array.isArray(item.fields) ? item.fields : []).map((field, index) => {
    const relRaw = field.rawData || {};
    const talhaoId = firstText(relRaw.talhaoId, field.fieldCode);
    const talhaoNome = firstText(relRaw.talhaoNome, field.fieldName, talhaoId);
    const farmName = firstText(relRaw.fazenda, relRaw.fazendaNome, relRaw.nome_fazenda, field.farmName);

    return {
      ...relRaw,
      id: firstText(relRaw.id, field.id, `${item.id}_${talhaoId || index}`),
      planejamentoId: firstText(relRaw.planejamentoId, item.id),
      companyId,
      safra,
      talhaoId,
      talhaoNome,
      fazenda: farmName,
      fazendaNome: firstText(relRaw.fazendaNome, farmName),
      nome_fazenda: firstText(relRaw.nome_fazenda, farmName),
      fundoAgricola: firstText(relRaw.fundoAgricola, relRaw.fundo_agricola, field.farmCode),
      fundo_agricola: firstText(relRaw.fundo_agricola, relRaw.fundoAgricola, field.farmCode),
      corte: firstText(relRaw.corte, field.cut),
      area: relRaw.area ?? field.area ?? 0,
      status: normalizePlanningTreatmentStatus(relRaw.status || field.status || status),
      createdAt: relRaw.createdAt || field.createdAt || mestre.createdAt,
      updatedAt: field.updatedAt || relRaw.updatedAt || mestre.updatedAt,
      syncStatus: 'synced',
      source: 'postgres',
    };
  });

  return { mestre, vinculos };
}

export const postgresReadService = {

  async listMapCutOrderState(params = {}) {
    const query = new URLSearchParams(params).toString();
    const result = await apiRequest(`/api/realtime/maps/ordem-corte-state${query ? `?${query}` : ''}`);
    const data = result.data || {};
    return {
      success: true,
      data: [{
        ordens: data.ordens || [],
        vinculos: data.vinculos || [],
        generatedAt: data.generatedAt || new Date().toISOString(),
      }],
    };
  },

  async listCompanies(params = {}) {
    const query = new URLSearchParams(params).toString();
    const result = await apiRequest(`/api/postgres/companies${query ? `?${query}` : ''}`);
    return {
      ...result,
      data: (result.data || []).map(normalizePostgresCompany),
    };
  },

  async listUsers(params = {}) {
    const query = new URLSearchParams(params).toString();
    const result = await apiRequest(`/api/postgres/users${query ? `?${query}` : ''}`);
    return {
      ...result,
      data: (result.data || []).map(normalizePostgresUser),
    };
  },

  async listEstimates(params = {}) {
    const query = new URLSearchParams(params).toString();
    const result = await apiRequest(`/api/postgres/agro/estimates${query ? `?${query}` : ''}`);
    return {
      ...result,
      data: (result.data || []).map(normalizePostgresEstimate),
    };
  },

  async listAllEstimates(params = {}) {
    const limit = Number(params.limit || 500);
    let page = 1;
    let total = null;
    const all = [];

    do {
      const result = await this.listEstimates({
        ...params,
        page,
        limit,
      });

      total = Number(result.total || 0);
      all.push(...(result.data || []));

      if (!result.data || result.data.length === 0) break;
      page += 1;
    } while (all.length < total);

    return {
      success: true,
      page: 1,
      limit,
      total: total ?? all.length,
      data: all,
    };
  },


  async listCutOrders(params = {}) {
    const query = new URLSearchParams(params).toString();
    const result = await apiRequest(`/api/postgres/agro/cut-orders${query ? `?${query}` : ''}`);
    return {
      ...result,
      data: (result.data || []).map(normalizePostgresCutOrder),
    };
  },

  async listCutOrdersWithLinks(params = {}) {
    const query = new URLSearchParams(params).toString();
    const result = await apiRequest(`/api/postgres/agro/cut-orders${query ? `?${query}` : ''}`);
    return {
      ...result,
      data: (result.data || []).map(normalizePostgresCutOrderWithLinks),
    };
  },

  async listAllCutOrdersWithLinks(params = {}) {
    const limit = Number(params.limit || 500);
    let page = 1;
    let total = null;
    const all = [];

    do {
      const result = await this.listCutOrdersWithLinks({
        ...params,
        page,
        limit,
      });

      total = Number(result.total || 0);
      all.push(...(result.data || []));

      if (!result.data || result.data.length === 0) break;
      page += 1;
    } while (all.length < total);

    return {
      success: true,
      page: 1,
      limit,
      total: total ?? all.length,
      data: all,
    };
  },

  async listServiceOrders(params = {}) {
    const query = new URLSearchParams(params).toString();
    const result = await apiRequest(`/api/postgres/agro/service-orders${query ? `?${query}` : ''}`);
    return {
      ...result,
      data: (result.data || []).map(normalizePostgresServiceOrder),
    };
  },

  async listServiceOrdersWithLinks(params = {}) {
    const query = new URLSearchParams(params).toString();
    const result = await apiRequest(`/api/postgres/agro/service-orders${query ? `?${query}` : ''}`);
    return {
      ...result,
      data: (result.data || []).map(normalizePostgresServiceOrderWithLinks),
    };
  },

  async listAllServiceOrdersWithLinks(params = {}) {
    const limit = Number(params.limit || 500);
    let page = 1;
    let total = null;
    const all = [];

    do {
      const result = await this.listServiceOrdersWithLinks({
        ...params,
        page,
        limit,
      });

      total = Number(result.total || 0);
      all.push(...(result.data || []));

      if (!result.data || result.data.length === 0) break;
      page += 1;
    } while (all.length < total);

    return {
      success: true,
      page: 1,
      limit,
      total: total ?? all.length,
      data: all,
    };
  },

  async listClosureDashboardRecords(params = {}) {
    const query = new URLSearchParams(params).toString();
    const result = await apiRequest(`/api/postgres/agro/closure-dashboard-records${query ? `?${query}` : ''}`);
    return {
      ...result,
      data: (result.data || []).map(normalizePostgresClosureDashboardRecord),
    };
  },

  async listAllClosureDashboardRecords(params = {}) {
    const limit = Number(params.limit || 500);
    let page = 1;
    let total = null;
    const all = [];

    do {
      const result = await this.listClosureDashboardRecords({
        ...params,
        page,
        limit,
      });

      total = Number(result.total || 0);
      all.push(...(result.data || []));

      if (!result.data || result.data.length === 0) break;
      page += 1;
    } while (all.length < total);

    return {
      success: true,
      page: 1,
      limit,
      total: total ?? all.length,
      data: all,
    };
  },

  async listHarvestPlans(params = {}) {
    const query = new URLSearchParams(params).toString();
    const result = await apiRequest(`/api/postgres/agro/harvest-plans${query ? `?${query}` : ''}`);
    return {
      ...result,
      data: (result.data || []).map(normalizePostgresHarvestPlan),
    };
  },

  async listAllHarvestPlans(params = {}) {
    const limit = Number(params.limit || 500);
    let page = 1;
    let total = null;
    const all = [];

    do {
      const result = await this.listHarvestPlans({
        ...params,
        page,
        limit,
      });

      total = Number(result.total || 0);
      all.push(...(result.data || []));

      if (!result.data || result.data.length === 0) break;
      page += 1;
    } while (all.length < total);

    return {
      success: true,
      page: 1,
      limit,
      total: total ?? all.length,
      data: all,
    };
  },


  async listPlanningTreatments(params = {}) {
    const query = new URLSearchParams(params).toString();
    const result = await apiRequest(`/api/postgres/agro/planning-treatments${query ? `?${query}` : ''}`);
    return {
      ...result,
      data: (result.data || []).map(normalizePostgresPlanningTreatmentPair),
    };
  },

  async listAllPlanningTreatments(params = {}) {
    const limit = Number(params.limit || 500);
    let page = 1;
    let total = null;
    const all = [];

    do {
      const result = await this.listPlanningTreatments({
        ...params,
        page,
        limit,
      });

      total = Number(result.total || 0);
      all.push(...(result.data || []));

      if (!result.data || result.data.length === 0) break;
      page += 1;
    } while (all.length < total);

    return {
      success: true,
      page: 1,
      limit,
      total: total ?? all.length,
      data: all,
    };
  },

  async createPlanningTreatment(payload = {}) {
    return apiRequest('/api/postgres/agro/planning-treatments', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

};
