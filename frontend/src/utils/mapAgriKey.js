/**
 * Chave agrícola do mapa.
 * O SHP é a ponte visual do sistema; por isso o cruzamento das camadas deve usar
 * os atributos reais do SHP: FUNDO_AGR + TALHAO. Nunca use ID novo/antigo do polígono
 * como chave principal, porque o upload de um SHP novo recria esses IDs.
 */
export function normalizeAgriPart(value) {
  if (value === undefined || value === null) return '';
  let text = String(value).trim();
  if (!text) return '';
  text = text.replace(/\.0+$/, '');
  text = text.replace(/^0+(?=\d)/, '');
  text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  text = text.replace(/[^a-zA-Z0-9]/g, '');
  return text.toUpperCase();
}

export function firstAgriValue(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

export function buildAgriKey(fundoAgricola, talhao) {
  const fundo = normalizeAgriPart(fundoAgricola);
  const field = normalizeAgriPart(talhao);
  return fundo && field ? `${fundo}__${field}` : '';
}

export function getFeatureAgriKey(featureOrProps) {
  const p = featureOrProps?.properties || featureOrProps || {};
  return buildAgriKey(
    firstAgriValue(p.FUNDO_AGR, p.fundoAgricola, p.fundo_agricola, p.fundoAgr, p.COD_FAZ, p.codFaz, p.farmCode),
    firstAgriValue(p.TALHAO, p.talhao, p.talhaoNome, p.fieldCode, p.quadra, p.QUADRA)
  );
}

export function getRecordAgriKey(record = {}) {
  const raw = record.rawData || record.raw || {};
  return buildAgriKey(
    firstAgriValue(
      record.FUNDO_AGR, record.fundoAgricola, record.fundo_agricola, record.fundoAgr,
      record.COD_FAZ, record.codFaz, record.farmCode, record.fazenda, record.fazendaId,
      raw.FUNDO_AGR, raw.fundoAgricola, raw.fundo_agricola, raw.fundoAgr,
      raw.COD_FAZ, raw.codFaz, raw.farmCode, raw.fazenda, raw.fazendaId
    ),
    firstAgriValue(
      record.TALHAO, record.talhao, record.talhaoNome, record.fieldCode, record.quadra, record.QUADRA,
      raw.TALHAO, raw.talhao, raw.talhaoNome, raw.fieldCode, raw.quadra, raw.QUADRA
    )
  );
}

export function addAgriKeyVariants(set, key) {
  if (!set || !key) return;
  const text = String(key).trim();
  if (!text) return;
  set.add(text);
  set.add(text.toUpperCase());
}

export function addLegacyIdVariants(set, value) {
  if (!set || value === undefined || value === null || value === '') return;
  const text = String(value).trim();
  if (!text) return;
  set.add(text);
  set.add(text.toUpperCase());
  const normalized = normalizeAgriPart(text);
  if (normalized) set.add(normalized);
  const numeric = Number(text);
  if (Number.isFinite(numeric)) set.add(numeric);
}

export function featureMatchesKeySet(feature, set) {
  if (!set || !feature) return false;
  const p = feature.properties || {};
  const agriKey = getFeatureAgriKey(feature);
  if (agriKey && (set.has(agriKey) || set.has(agriKey.toUpperCase()))) return true;

  // Compatibilidade apenas como fallback. A regra principal continua sendo FUNDO_AGR + TALHAO.
  const candidates = [feature.id, p.id, p.talhaoId, p.TALHAO_ID, p.CD_TALHAO, p.featureId];
  return candidates.some((value) => {
    if (value === undefined || value === null || value === '') return false;
    const text = String(value).trim();
    const normalized = normalizeAgriPart(text);
    const numeric = Number(text);
    return set.has(value) || set.has(text) || set.has(text.toUpperCase()) || (normalized && set.has(normalized)) || (Number.isFinite(numeric) && set.has(numeric));
  });
}
