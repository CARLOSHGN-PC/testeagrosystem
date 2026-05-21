import { postgresReadService } from '../../services/postgresReadService';
import { apiRequest } from '../../services/apiClient';
import { fetchPremissasColheitaSafra } from '../../services/dadosDashboardService';

function legacyRow(row = {}) {
  const faz = row.COD_FAZ ?? row.fazenda ?? row.farmCode ?? row.COD ?? '';
  const tal = row.TALHAO ?? row.quadra ?? row.fieldCode ?? row.talhao ?? '';
  const prodPrev = row['PROD. PREV.'] ?? row['Prod. Prev.'] ?? row.prodPrev ?? row.prevTon ?? '';
  const prodReal = row['PROD. REAL'] ?? row['Prod. Real'] ?? row.prodReal ?? row.realTon ?? '';
  const areaLib = row['AREA LIBERADA'] ?? row.liberada ?? row.releasedArea ?? '';
  const areaCor = row['AREA CORTADA'] ?? row['Cortada'] ?? row.cortada ?? row.cutArea ?? '';
  const tchPrev = row.tHaPrev ?? row.prevTch ?? row['T/HA PREV.'] ?? '';
  const tchReal = row.tHaReal ?? row.realTch ?? row['T/HA REAL.'] ?? '';
  return {
    ...row,
    COD_FAZ: faz,
    TALHAO: tal,
    PARTE: row.PARTE ?? row.parte ?? row.part ?? '',
    ESTAGIO: row.ESTAGIO ?? row.estagio ?? row.stage ?? '',
    VARIEDADE: row.VARIEDADE ?? row.variedade ?? row.varietyName ?? 'Outras',
    'Nº ORDEM': row['Nº ORDEM'] ?? row.numeroOrdem ?? row.orderNumber ?? row.oc ?? '',
    PLANTIO: row.PLANTIO ?? row.plantio ?? row.plantingDate ?? '',
    ABERTURA: row.ABERTURA ?? row.abertura ?? row.openingDate ?? '',
    ENCERRAMENTO: row.ENCERRAMENTO ?? row.encerramento ?? row.closingDate ?? '',
    IDADE: row.IDADE ?? row.idade ?? row.age ?? '',
    TEMPO: row.TEMPO ?? row.tempo ?? row.timeDays ?? '',
    CORTES: row.CORTES ?? row.cortes ?? row.cuts ?? '',
    'AREA LIBERADA': areaLib,
    'AREA CORTADA': areaCor,
    'T/HA PREV.': tchPrev,
    'T/HA REAL.': tchReal,
    'PROD. PREV.': prodPrev,
    'PROD. REAL': prodReal,
    'VAR. %': row['VAR. %'] ?? row.varPercent ?? row.variationPercent ?? '',
    ATR: row.ATR ?? row.Atr ?? row.atr ?? '',
    atrPrevNumerator: row.atrPrevNumerator ?? row.ATR_PREV_NUMERATOR ?? '',
    atrPrevWeight: row.atrPrevWeight ?? row.ATR_PREV_WEIGHT ?? '',
    atrRealNumerator: row.atrRealNumerator ?? row.ATR_REAL_NUMERATOR ?? '',
    atrRealWeight: row.atrRealWeight ?? row.ATR_REAL_WEIGHT ?? '',
    'ATR/HA REAL.': row['ATR/HA REAL.'] ?? row.atrHaReal ?? '',
    'ATR PREV.': row['ATR PREV.'] ?? row.atrPrev ?? '',
    DM: row.DM ?? row.dm ?? '',
    'ESPAC.': row['ESPAC.'] ?? row.espac ?? row.spacing ?? '',
  };
}

export async function fetchOrdemCorteRecords(companyId) {
  if (!companyId) return [];
  const result = await postgresReadService.listAllClosureDashboardRecords({ companyId, limit: 1000 });
  return (result.data || []).map(legacyRow);
}

export async function fetchFazendaNomes(companyId) {
  if (!companyId) return {};
  try {
    const result = await apiRequest(`/api/postgres/agro/farms?companyId=${encodeURIComponent(companyId)}&limit=1000`);
    const map = {};
    (result.data || []).forEach((farm) => {
      const code = String(farm.code || farm.COD_FAZ || farm.codigo || '').trim();
      const name = String(farm.name || farm.nome || farm.fazenda || code).trim();
      if (code) map[code] = name;
    });
    return map;
  } catch {
    return {};
  }
}

export async function fetchHistoricoProducao() {
  return [];
}

export async function fetchCadastroRecords() {
  return [];
}

export async function fetchParametrosSafra(companyId) {
  if (!companyId) return [];
  try {
    const p = await fetchPremissasColheitaSafra(companyId);
    const data = p?.data || p || {};
    return [{ data }];
  } catch {
    return [];
  }
}

export async function fetchNote(companyId, section) {
  if (!companyId || !section) return '';
  try {
    const qs = new URLSearchParams({ companyId, section });
    const result = await apiRequest(`/api/dados-dashboard/dashboard/fechamento-oc/observacoes?${qs.toString()}`);
    return result?.data?.content || '';
  } catch {
    return '';
  }
}

export async function saveNote(companyId, section, content) {
  if (!companyId || !section) return;
  await apiRequest('/api/dados-dashboard/dashboard/fechamento-oc/observacoes', {
    method: 'POST',
    body: JSON.stringify({ companyId, section, content: content || '' }),
  });
}
