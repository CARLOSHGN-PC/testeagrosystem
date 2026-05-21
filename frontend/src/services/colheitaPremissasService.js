import db from './localDb';
import { apiRequest } from './apiClient';

const STORAGE_PREFIX = '@AgroSystem:premissas:colheita:';
const COLLECTION_NAME = 'premissas_colheita';
const MONTH_KEYS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const buildDefaultMetasMensais = () => MONTH_KEYS.reduce((acc, key) => {
  acc[key] = { metaMes: 0, atr: 0, broca: 0 };
  return acc;
}, {});

export const DEFAULT_FECHAMENTO_OC_ATR_TCH_CONFIG = {
  tchDivisao: 75,
  atrDivisao: 127,
  quadrantes: {
    baixoAtrBaixoTch: { label: 'Baixo ATR / Baixo TCH', color: '#cd3c37', tchMin: 0, tchMax: 75, atrMin: 0, atrMax: 127 },
    altoAtrBaixoTch: { label: 'Alto ATR / Baixo TCH', color: '#555fd7', tchMin: 0, tchMax: 75, atrMin: 127, atrMax: 999 },
    baixoAtrAltoTch: { label: 'Baixo ATR / Alto TCH', color: '#e1a823', tchMin: 75, tchMax: 999, atrMin: 0, atrMax: 127 },
    altoAtrAltoTch: { label: 'Alto ATR / Alto TCH', color: '#22aa58', tchMin: 75, tchMax: 999, atrMin: 127, atrMax: 999 }
  }
};

export const DEFAULT_COLHEITA_PREMISSAS = {
  anoSafra: String(new Date().getFullYear()),
  dataInicioSafra: '',
  dataFimSafra: '',
  horasProdutivas: 14,
  tiroMedio: 600,
  numeroLinhas: 1,
  capacidadeTransbordo: 16.5,
  manobra: '01:00',
  aguardando: '00:30',
  velocidadeIda: 28,
  velocidadeVolta: 26,
  densidadeCarga: 75,
  numeroColhedoras: 4,
  numeroTratores: 7,
  raioMedio: 14,
  metaHora: 0,
  metaDia: 0,
  metaSemana: 0,
  metaMes: 0,
  moagemPrevista: 0,
  metaReprojetada: 0,
  atr: 0,
  tch: 0,
  tah: 0,
  impurezaMineral: 0,
  impurezaVegetal: 0,
  metaDensidade: 0,
  rotacaoMoenda: 0,
  estoque: 0,
  metasMensais: buildDefaultMetasMensais(),
  fechamentoOcAtrTchConfig: DEFAULT_FECHAMENTO_OC_ATR_TCH_CONFIG,
  idadeIdealMeses: 12
};

export function getPremissasCompanyId() {
  try {
    const sessionCompanyId = JSON.parse(localStorage.getItem('@AgroSystem:session') || 'null')?.user?.companyId;
    if (sessionCompanyId) return sessionCompanyId;
  } catch {}

  try {
    const authCompanyId = JSON.parse(localStorage.getItem('@AgroSystem:auth') || 'null')?.companyId;
    if (authCompanyId) return authCompanyId;
  } catch {}

  return '';
}

const buildDocId = (companyId) => `${COLLECTION_NAME}_${companyId}`;
const buildRemoteDocId = (companyId) => String(companyId || '').trim();

const parseNumericValue = (value, fallback = 0) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const cleaned = String(value).trim();
  if (!cleaned) return fallback;
  const commaIndex = cleaned.lastIndexOf(',');
  const dotIndex = cleaned.lastIndexOf('.');
  let normalizedStr = cleaned;

  if (commaIndex > -1 && dotIndex > -1) {
    normalizedStr = commaIndex > dotIndex
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '');
  } else if (commaIndex > -1) {
    normalizedStr = cleaned.replace(',', '.');
  }

  const normalized = Number(normalizedStr);
  return Number.isFinite(normalized) ? normalized : fallback;
};

const sanitizeAtrTchConfig = (value = {}) => {
  const source = value || {};
  const base = DEFAULT_FECHAMENTO_OC_ATR_TCH_CONFIG;
  const quadrantes = {};
  Object.entries(base.quadrantes).forEach(([key, defaults]) => {
    const item = source?.quadrantes?.[key] || {};
    quadrantes[key] = {
      label: String(item.label ?? defaults.label),
      color: String(item.color ?? defaults.color),
      tchMin: parseNumericValue(item.tchMin, defaults.tchMin),
      tchMax: parseNumericValue(item.tchMax, defaults.tchMax),
      atrMin: parseNumericValue(item.atrMin, defaults.atrMin),
      atrMax: parseNumericValue(item.atrMax, defaults.atrMax)
    };
  });
  return {
    tchDivisao: parseNumericValue(source.tchDivisao, base.tchDivisao),
    atrDivisao: parseNumericValue(source.atrDivisao, base.atrDivisao),
    quadrantes
  };
};

const sanitizePremissas = (data = {}) => {
  const raw = data?.rawData && typeof data.rawData === 'object' ? { ...data.rawData, ...data } : data || {};
  const anoSafraConfig = raw?.anoSafraConfig || {};
  const sanitized = { ...DEFAULT_COLHEITA_PREMISSAS, metasMensais: buildDefaultMetasMensais() };

  for (const [key, defaultValue] of Object.entries(DEFAULT_COLHEITA_PREMISSAS)) {
    if (key === 'fechamentoOcAtrTchConfig') {
      sanitized[key] = sanitizeAtrTchConfig(raw?.[key]);
      continue;
    }

    if (key === 'metasMensais') {
      const monthlySource = raw?.metasMensais || {};
      MONTH_KEYS.forEach((monthKey) => {
        const month = monthlySource?.[monthKey] || {};
        const fallbackMetaMes = parseNumericValue(raw?.metaMes, 0);
        const fallbackAtr = parseNumericValue(raw?.atr, 0);
        const fallbackBroca = parseNumericValue(raw?.broca, 0);
        sanitized.metasMensais[monthKey] = {
          metaMes: parseNumericValue(month.metaMes, fallbackMetaMes),
          atr: parseNumericValue(month.atr, fallbackAtr),
          broca: parseNumericValue(month.broca, fallbackBroca)
        };
      });
      continue;
    }

    const rawValue = key === 'anoSafra'
      ? (raw?.anoSafra ?? raw?.safra ?? anoSafraConfig?.anoSafra)
      : key === 'dataInicioSafra'
        ? (raw?.dataInicioSafra ?? anoSafraConfig?.dataInicioSafra)
        : key === 'dataFimSafra'
          ? (raw?.dataFimSafra ?? anoSafraConfig?.dataFimSafra)
          : raw?.[key];

    if (rawValue === undefined || rawValue === null || rawValue === '') {
      sanitized[key] = defaultValue;
      continue;
    }

    if (typeof defaultValue === 'string') {
      sanitized[key] = String(rawValue ?? '').trim();
      continue;
    }

    sanitized[key] = parseNumericValue(rawValue, defaultValue);
  }

  return sanitized;
};

async function getRemotePremissasViaApi(companyId) {
  const remoteDocId = buildRemoteDocId(companyId);
  if (!remoteDocId) return null;
  const response = await apiRequest(`/api/premissas-colheita?companyId=${encodeURIComponent(remoteDocId)}`);
  return response?.data || null;
}

async function saveRemotePremissasViaApi(companyId, sanitizedValues) {
  const remoteDocId = buildRemoteDocId(companyId);
  if (!remoteDocId) throw new Error('companyId não encontrado para salvar premissas de colheita.');
  const response = await apiRequest('/api/premissas-colheita', {
    method: 'POST',
    body: JSON.stringify({ companyId: remoteDocId, ...sanitizedValues })
  });
  return response?.data || null;
}

export async function getColheitaPremissas(companyId = getPremissasCompanyId()) {
  const safeCompanyId = buildRemoteDocId(companyId);
  if (!safeCompanyId) return { ...DEFAULT_COLHEITA_PREMISSAS };
  const docId = buildDocId(safeCompanyId);

  try {
    const remote = await getRemotePremissasViaApi(safeCompanyId);
    if (remote) {
      const merged = sanitizePremissas(remote);
      localStorage.setItem(STORAGE_PREFIX + safeCompanyId, JSON.stringify(merged));
      await db.modulos.put({
        id: docId,
        nome: 'premissas_colheita',
        tipo: 'premissas_colheita',
        companyId: safeCompanyId,
        status: 'ATIVO',
        ...merged,
        syncStatus: 'synced'
      }).catch(() => {});
      return merged;
    }
  } catch (error) {
    console.warn('[Premissas Colheita] Falha ao ler PostgreSQL/API. Usando cache local.', error);
  }

  try {
    const local = await db.modulos.get(docId);
    if (local) return sanitizePremissas(local);
  } catch {}

  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + safeCompanyId);
    const parsed = raw ? JSON.parse(raw) : {};
    return sanitizePremissas(parsed);
  } catch {
    return { ...DEFAULT_COLHEITA_PREMISSAS };
  }
}

export async function saveColheitaPremissas(data, companyId = getPremissasCompanyId()) {
  const safeCompanyId = buildRemoteDocId(companyId);
  if (!safeCompanyId) {
    throw new Error('Empresa não identificada para salvar premissas de colheita. Faça login novamente.');
  }

  const sanitizedValues = sanitizePremissas(data);
  const docId = buildDocId(safeCompanyId);
  const payload = {
    id: docId,
    nome: 'premissas_colheita',
    tipo: 'premissas_colheita',
    companyId: safeCompanyId,
    status: 'ATIVO',
    ...sanitizedValues,
    updatedAt: new Date().toISOString(),
    syncStatus: 'pending'
  };

  try {
    const remote = await saveRemotePremissasViaApi(safeCompanyId, sanitizedValues);
    const syncedPayload = {
      ...payload,
      ...(remote ? sanitizePremissas(remote) : sanitizedValues),
      syncStatus: 'synced'
    };
    localStorage.setItem(STORAGE_PREFIX + safeCompanyId, JSON.stringify(syncedPayload));
    await db.modulos.put(syncedPayload);
    return syncedPayload;
  } catch (error) {
    const errorPayload = { ...payload, syncStatus: 'error' };
    localStorage.setItem(STORAGE_PREFIX + safeCompanyId, JSON.stringify(errorPayload));
    await db.modulos.put(errorPayload).catch(() => {});
    console.error('[Premissas Colheita] Erro ao salvar no PostgreSQL/API', error);
    throw error;
  }
}
