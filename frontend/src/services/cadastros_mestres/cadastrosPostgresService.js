import { apiRequest } from '../apiClient.js';
import db from '../localDb.js';

const resourceToStore = {
  farms: 'fazendas',
  fields: 'talhoes',
  varieties: 'variedades',
  operations: 'operacoes',
  inputs: 'insumos',
  'input-applications': 'apontamentosInsumo',
  production: 'producaoAgricola',
  protocols: 'protocolos',
  professionals: 'profissionais',
};

function buildQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, value);
  });
  const str = query.toString();
  return str ? `?${str}` : '';
}

function firstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function normalizeFarm(item = {}, companyId) {
  const codFaz = String(firstValue(item.COD_FAZ, item.codFaz, item.codigo, item.code, item.id)).trim();
  const desFazenda = String(firstValue(item.DES_FAZENDA, item.desFazenda, item.nome, item.name, codFaz)).trim();
  return {
    ...item,
    id: codFaz || item.id,
    postgresId: item.postgresId || item.postgresId || item.id,
    companyId,
    COD_FAZ: codFaz,
    DES_FAZENDA: desFazenda,
    codFaz,
    codigo: codFaz,
    code: codFaz,
    desFazenda,
    nome: desFazenda,
    name: desFazenda,
    status: item.status || 'ATIVO',
    syncStatus: item.syncStatus || 'synced',
  };
}

function normalizeField(item = {}, companyId) {
  const talhao = String(firstValue(item.TALHAO, item.talhao, item.talhaoNome, item.name, item.code, item.id)).trim();
  const codFaz = String(firstValue(item.COD_FAZ, item.codFaz, item.farmCode, item.fazendaId, item.farmId)).trim();
  const desFazenda = String(firstValue(item.DES_FAZENDA, item.desFazenda, item.farmName, item.nome_fazenda)).trim();
  return {
    ...item,
    id: item.id,
    companyId,
    fazendaId: codFaz || item.fazendaId || item.farmId || '',
    farmId: codFaz || item.farmId || item.fazendaId || '',
    COD_FAZ: codFaz,
    DES_FAZENDA: desFazenda,
    codFaz,
    desFazenda,
    TALHAO: talhao,
    talhao,
    talhaoNome: talhao,
    AREA_TALHAO: firstValue(item.AREA_TALHAO, item.areaTalhao, item.area, item.areaHa),
    area: firstValue(item.area, item.AREA_TALHAO, item.areaTalhao, item.areaHa),
    areaHa: firstValue(item.areaHa, item.area, item.AREA_TALHAO, item.areaTalhao),
    ESTAGIO: firstValue(item.ESTAGIO, item.estagio, item.stage),
    VARIEDADE: firstValue(item.VARIEDADE, item.variedade, item.nomeVariedade),
    status: item.status || 'ATIVO',
    syncStatus: item.syncStatus || 'synced',
  };
}

function normalizeVariety(item = {}, companyId) {
  const codigo = String(firstValue(item.CODIGO, item.codigo, item.code)).trim();
  const variedade = String(firstValue(item.VARIEDADE, item.variedade, item.nome, item.name)).trim();
  return {
    ...item,
    id: item.id,
    companyId,
    CODIGO: codigo,
    codigo,
    code: codigo,
    VARIEDADE: variedade,
    variedade,
    nome: variedade,
    name: variedade,
    TIPO_MATURACAO: firstValue(item.TIPO_MATURACAO, item.tipoMaturacao),
    INICIO_JANELA: firstValue(item.INICIO_JANELA, item.inicioJanela),
    FIM_JANELA: firstValue(item.FIM_JANELA, item.fimJanela),
    tipoMaturacao: firstValue(item.TIPO_MATURACAO, item.tipoMaturacao),
    inicioJanela: firstValue(item.INICIO_JANELA, item.inicioJanela),
    fimJanela: firstValue(item.FIM_JANELA, item.fimJanela),
    status: item.status || 'ATIVO',
    syncStatus: item.syncStatus || 'synced',
  };
}

function normalizeRecord(resource, item, requestedCompanyId) {
  const companyId = requestedCompanyId || item.companyId;
  if (resource === 'farms') return normalizeFarm(item, companyId);
  if (resource === 'fields') return normalizeField(item, companyId);
  if (resource === 'varieties') return normalizeVariety(item, companyId);
  return { ...item, companyId, syncStatus: item.syncStatus || 'synced' };
}

async function requestCadastro(resource, query, options = {}) {
  try {
    return await apiRequest(`/api/postgres/cadastros/${resource}${query}`, options);
  } catch (error) {
    if (error?.status === 404) {
      return await apiRequest(`/api/postgres/cadastro-geral/${resource}${query}`, options);
    }
    throw error;
  }
}

export async function listCadastro(resource, companyId, params = {}) {
  const query = buildQuery({ companyId, ...params });
  const payload = await requestCadastro(resource, query);
  const requestedCompanyId = companyId ? String(companyId) : null;
  const data = Array.isArray(payload.data)
    ? payload.data.map((item) => normalizeRecord(resource, item, requestedCompanyId))
    : [];

  const store = resourceToStore[resource];
  if (store && db[store]) {
    try {
      if (data.length) await db[store].bulkPut(data);
    } catch (error) {
      console.error(`[CadastroGeral] Falha ao gravar ${resource} no Dexie:`, error);
    }
  }

  return { ...payload, data };
}

export async function saveCadastro(resource, data) {
  const payload = await requestCadastro(resource, `${data?.id ? `/${encodeURIComponent(data.id)}` : ''}`, {
    method: data?.id ? 'PUT' : 'POST',
    body: JSON.stringify(data),
  });
  const saved = payload.data;
  const store = resourceToStore[resource];
  if (saved && store && db[store]) await db[store].put(normalizeRecord(resource, saved, data.companyId)).catch(() => {});
  return saved;
}

export async function bulkSaveCadastro(resource, rows, companyId, options = {}) {
  const payload = await requestCadastro(resource, '/bulk', {
    method: 'POST',
    body: JSON.stringify({
      companyId,
      mode: options.mode,
      rows: rows.map((r) => ({ ...r, companyId: r.companyId || companyId })),
    }),
  });

  const store = resourceToStore[resource];
  if ((resource === 'varieties' || options.mode === 'replace') && store && db[store]) {
    await db[store].where('companyId').equals(companyId).delete().catch(() => {});
  }
  if (resource === 'fields' && options.mode === 'replace') {
    await db.fazendas.where('companyId').equals(companyId).delete().catch(() => {});
    await listCadastro('farms', companyId, { limit: 1000 }).catch(() => {});
  }

  await listCadastro(resource, companyId, { limit: 1000 }).catch(() => {});
  return payload;
}

export async function inactivateCadastro(resource, id, companyId) {
  const payload = await requestCadastro(resource, `/${encodeURIComponent(id)}/inactivate`, {
    method: 'PATCH',
    body: JSON.stringify({ companyId }),
  });
  const saved = payload.data;
  const store = resourceToStore[resource];
  if (saved && store && db[store]) await db[store].put(normalizeRecord(resource, saved, companyId)).catch(() => {});
  return saved;
}

export async function loadAllPages(resource, companyId, params = {}) {
  const limit = params.limit || 1000;
  let page = 1;
  let total = Infinity;
  let all = [];
  while (all.length < total) {
    const payload = await listCadastro(resource, companyId, { ...params, page, limit });
    all = all.concat(payload.data || []);
    total = Number(payload.total || all.length);
    if (!payload.data?.length || payload.data.length < limit) break;
    page += 1;
  }
  return all;
}

const tabResources = {
  fazendas: ['farms', 'fields'],
  variedades: ['varieties'],
  operacoes: ['operations'],
  insumos: ['inputs'],
  producao: ['production'],
  apontamento_insumo: ['input-applications'],
};

export async function hydrateCadastroGeral(activeTab, companyId) {
  const resources = tabResources[activeTab] || [];
  const results = {};

  for (const resource of resources) {
    const limit = resource === 'input-applications' || resource === 'production' ? 100 : 1000;
    try {
      const payload = await listCadastro(resource, companyId, { limit, page: 1 });
      results[resource] = payload.data || [];
    } catch (error) {
      console.error(`[CadastroGeral] Erro ao carregar ${resource}:`, error);
      results[resource] = [];
    }
  }

  return results;
}
