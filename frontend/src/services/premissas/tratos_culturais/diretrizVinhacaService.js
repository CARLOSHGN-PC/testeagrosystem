import db from '../../localDb.js';
import { getPremissasCompanyId } from '../../colheitaPremissasService.js';
import { apiRequest } from '../../apiClient.js';

const STORAGE_PREFIX = '@AgroSystem:premissas:tratos_culturais:diretriz_vinhaca:';
const COLLECTION_NAME = 'premissas_tratos_vinhaca';

export const DEFAULT_DIRETRIZ_VINHACA = {
  fatorN: 0.8,
  fatorK2O: 1.5,
  mapHa: 50,
  cortes: [
    { corte: 1, tchObjetivo: 130 },
    { corte: 2, tchObjetivo: 120 },
    { corte: 3, tchObjetivo: 110 },
    { corte: 4, tchObjetivo: 100 },
    { corte: 5, tchObjetivo: 95 },
    { corte: 6, tchObjetivo: 90 },
    { corte: 7, tchObjetivo: 85 },
    { corte: 8, tchObjetivo: 80 },
    { corte: 9, tchObjetivo: 75 },
    { corte: 10, tchObjetivo: 70 },
    { corte: 11, tchObjetivo: 65 }
  ]
};

const buildDocId = (companyId) => `${COLLECTION_NAME}_${companyId}`;

const parseNumber = (value, fallback = 0) => {
  const normalized = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(normalized) ? normalized : fallback;
};

const sanitizeCortes = (cortes = DEFAULT_DIRETRIZ_VINHACA.cortes) => {
  const safeArray = Array.isArray(cortes) && cortes.length > 0 ? cortes : DEFAULT_DIRETRIZ_VINHACA.cortes;

  return safeArray.map((item, index) => ({
    corte: index + 1,
    tchObjetivo: parseNumber(item?.tchObjetivo, DEFAULT_DIRETRIZ_VINHACA.cortes[index]?.tchObjetivo ?? 0)
  }));
};

export const sanitizeDiretrizVinhaca = (data = {}) => ({
  fatorN: parseNumber(data?.fatorN, DEFAULT_DIRETRIZ_VINHACA.fatorN),
  fatorK2O: parseNumber(data?.fatorK2O, DEFAULT_DIRETRIZ_VINHACA.fatorK2O),
  mapHa: parseNumber(data?.mapHa, DEFAULT_DIRETRIZ_VINHACA.mapHa),
  cortes: sanitizeCortes(data?.cortes)
});

export const buildDiretrizRows = (data = {}) => {
  const sanitized = sanitizeDiretrizVinhaca(data);
  return sanitized.cortes.map((item) => ({
    ...item,
    n: sanitized.fatorN * item.tchObjetivo,
    k2o: sanitized.fatorK2O * item.tchObjetivo,
    mapHa: sanitized.mapHa
  }));
};

async function getRemoteDiretrizViaApi(companyId) {
  const safeCompanyId = String(companyId || '').trim();
  if (!safeCompanyId) return null;
  const response = await apiRequest(`/api/premissas-tratos-vinhaca?companyId=${encodeURIComponent(safeCompanyId)}`);
  return response?.data || null;
}

async function saveRemoteDiretrizViaApi(companyId, sanitized) {
  const safeCompanyId = String(companyId || '').trim();
  if (!safeCompanyId) throw new Error('companyId não encontrado para salvar diretriz de vinhaça.');
  const response = await apiRequest('/api/premissas-tratos-vinhaca', {
    method: 'POST',
    body: JSON.stringify({ companyId: safeCompanyId, ...sanitized })
  });
  return response?.data || null;
}

export async function getDiretrizVinhaca(companyId = getPremissasCompanyId()) {
  const safeCompanyId = String(companyId || '').trim();
  const docId = buildDocId(safeCompanyId);

  try {
    const remote = await getRemoteDiretrizViaApi(safeCompanyId);
    if (remote) {
      const sanitized = sanitizeDiretrizVinhaca(remote);
      const payload = {
        id: docId,
        nome: COLLECTION_NAME,
        tipo: COLLECTION_NAME,
        companyId: safeCompanyId,
        status: 'ATIVO',
        ...sanitized,
        syncStatus: 'synced'
      };
      localStorage.setItem(`${STORAGE_PREFIX}${safeCompanyId}`, JSON.stringify(payload));
      await db.modulos.put(payload).catch(() => {});
      return sanitized;
    }
  } catch (error) {
    console.warn('[Diretriz Vinhaça] Falha ao ler PostgreSQL/API. Usando cache local.', error);
  }

  try {
    const local = await db.modulos.get(docId);
    if (local) return sanitizeDiretrizVinhaca(local);
  } catch {}

  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${safeCompanyId}`);
    const parsed = raw ? JSON.parse(raw) : {};
    return sanitizeDiretrizVinhaca(parsed);
  } catch {
    return { ...DEFAULT_DIRETRIZ_VINHACA };
  }
}

export async function saveDiretrizVinhaca(data, companyId = getPremissasCompanyId()) {
  const safeCompanyId = String(companyId || '').trim();
  const sanitized = sanitizeDiretrizVinhaca(data);
  const payload = {
    id: buildDocId(safeCompanyId),
    nome: COLLECTION_NAME,
    tipo: COLLECTION_NAME,
    companyId: safeCompanyId,
    status: 'ATIVO',
    ...sanitized,
    updatedAt: new Date().toISOString(),
    syncStatus: 'pending'
  };

  try {
    const remote = await saveRemoteDiretrizViaApi(safeCompanyId, sanitized);
    const syncedPayload = {
      ...payload,
      ...(remote ? sanitizeDiretrizVinhaca(remote) : sanitized),
      syncStatus: 'synced'
    };
    localStorage.setItem(`${STORAGE_PREFIX}${safeCompanyId}`, JSON.stringify(syncedPayload));
    await db.modulos.put(syncedPayload);
    return syncedPayload;
  } catch (error) {
    const errorPayload = { ...payload, syncStatus: 'error' };
    localStorage.setItem(`${STORAGE_PREFIX}${safeCompanyId}`, JSON.stringify(errorPayload));
    await db.modulos.put(errorPayload).catch(() => {});
    console.error('[Diretriz Vinhaça] Erro ao salvar no PostgreSQL/API', error);
    throw error;
  }
}


export const findDiretrizRowByCorte = (corte, data = {}) => {
  const rows = buildDiretrizRows(data);
  const corteNumber = Number(String(corte ?? '').replace(/\D+/g, ''));
  return rows.find((row) => Number(row.corte) == corteNumber) || null;
};

export const calculateVinhacaDose = (diretrizRow) => {
  if (!diretrizRow) {
    return {
      tchDiretriz: 0,
      n: 0,
      k2o: 0,
      mapHa: 0,
      doseMap: 0,
      doseUreia: 0,
      doseKcl: 0,
      totalMap: 0,
      totalUreia: 0,
      totalKcl: 0,
    };
  }

  const tchDiretriz = parseNumber(diretrizRow.tchObjetivo, 0);
  const n = parseNumber(diretrizRow.n, 0);
  const k2o = parseNumber(diretrizRow.k2o, 0);
  const mapHa = parseNumber(diretrizRow.mapHa, DEFAULT_DIRETRIZ_VINHACA.mapHa);

  const doseMap = (mapHa / 520) * 1000;
  const nDoMap = doseMap * 0.11;
  const doseUreia = Math.max(((n - nDoMap) / 460) * 1000, 0);
  const kVinhaca = 30 * 3.5;
  const doseKcl = Math.max(((k2o - kVinhaca) / 600) * 1000, 0);

  return {
    tchDiretriz,
    n,
    k2o,
    mapHa,
    doseMap,
    doseUreia,
    doseKcl,
    totalMap: 0,
    totalUreia: 0,
    totalKcl: 0,
  };
};

export const calculateVinhacaResumoTalhao = (talhao, data = {}) => {
  const diretrizRow = findDiretrizRowByCorte(talhao?.corte, data);
  const base = calculateVinhacaDose(diretrizRow);
  const area = parseNumber(talhao?.area, 0);

  return {
    talhaoId: talhao?.id || null,
    talhaoNome: talhao?.nome || talhao?.talhao || '-',
    fazenda: talhao?.fazenda || '',
    corte: talhao?.corte || '-',
    area,
    ...base,
    totalMap: base.doseMap * area,
    totalUreia: base.doseUreia * area,
    totalKcl: base.doseKcl * area,
  };
};
