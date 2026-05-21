/**
 * Utilitários de chave agrícola para religar dados antigos ao SHP novo.
 * Regra: NUNCA depender de ID interno do SHP. O vínculo visual deve ser por
 * fundo agrícola / fazenda / talhão, com normalização forte.
 */
export function normalizeAgrKeyPart(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\.0+$/g, '')
    .replace(/^0+(?=\d)/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

export function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

export function splitFazendaLabel(value) {
  const text = String(value || '').trim();
  if (!text) return { fundo: '', fazenda: '' };
  const match = text.match(/^\s*([0-9A-Za-z.\-]+)\s*[-–]\s*(.+)$/);
  if (match) return { fundo: match[1], fazenda: match[2] };
  return { fundo: '', fazenda: text };
}

export function extractLegacyAgrParts(value) {
  const text = String(value || '').trim();
  if (!text) return null;

  const noSeq = text.replace(/_SEQ\d+$/i, '');
  const parts = noSeq.split('_').filter(Boolean);
  if (parts.length < 2) return null;

  // Formato legado mais comum: FUNDO_FAZENDA_COM_UNDERSCORE_TALHAO_SEQn.
  // O fundo é a primeira parte e o talhão é a última; a fazenda pode ter vários pedaços.
  const fundo = parts[0];
  const talhao = parts[parts.length - 1];
  const fazenda = parts.length > 2 ? parts.slice(1, -1).join(' ') : '';
  return { fundo, fazenda, talhao };
}

export function getAgrParts(source = {}) {
  const raw = source.rawData || source.raw || {};
  const relFarm = source.farm || raw.farm || {};
  const relField = source.field || raw.field || {};

  const fazendaLabel = pickFirst(
    source.fazendaNome, source.nome_fazenda, source.farmName, source.DES_FAZENDA,
    raw.fazendaNome, raw.nome_fazenda, raw.farmName, raw.DES_FAZENDA,
    relFarm.name
  );
  const parsedLabel = splitFazendaLabel(fazendaLabel);

  const fundo = pickFirst(
    source.FUNDO_AGR, source.fundoAgricola, source.fundo_agricola, source.COD_FAZ, source.CD_FAZ, source.codFaz, source.farmCode,
    raw.FUNDO_AGR, raw.fundoAgricola, raw.fundo_agricola, raw.COD_FAZ, raw.CD_FAZ, raw.codFaz, raw.farmCode,
    relFarm.code,
    parsedLabel.fundo
  );

  const fazenda = pickFirst(
    source.FAZENDA, source.fazenda, source.farmName, source.DES_FAZENDA, source.fazendaNome, source.nome_fazenda,
    raw.FAZENDA, raw.fazenda, raw.farmName, raw.DES_FAZENDA, raw.fazendaNome, raw.nome_fazenda,
    relFarm.name,
    parsedLabel.fazenda
  );

  const talhao = pickFirst(
    source.TALHAO, source.talhao, source.CD_TALHAO, source.COD_TALHAO, source.NR_TALHAO, source.NUM_TALHAO,
    source.talhaoNome, source.nomeTalhao, source.fieldCode, source.fieldName, source.code,
    raw.TALHAO, raw.talhao, raw.CD_TALHAO, raw.COD_TALHAO, raw.NR_TALHAO, raw.NUM_TALHAO,
    raw.talhaoNome, raw.nomeTalhao, raw.fieldCode, raw.fieldName,
    relField.code, relField.name
  );

  return { fundo, fazenda, talhao };
}

export function buildAgrAliases(source = {}) {
  const set = new Set();
  const add = (value) => {
    const normalized = normalizeAgrKeyPart(value);
    if (normalized) set.add(normalized);
  };
  const addCombo = ({ fundo, fazenda, talhao } = {}) => {
    const f = normalizeAgrKeyPart(fundo);
    const faz = normalizeAgrKeyPart(fazenda);
    const t = normalizeAgrKeyPart(talhao);
    if (!t) return;
    if (f) {
      set.add(`${f}_${t}`);
      set.add(`${f}|${t}`);
    }
    if (faz) {
      set.add(`${faz}_${t}`);
      set.add(`${faz}|${t}`);
    }
    if (f && faz) {
      set.add(`${f}_${faz}_${t}`);
      set.add(`${f}|${faz}|${t}`);
    }
  };

  const parts = getAgrParts(source);
  addCombo(parts);
  add(parts.talhao);

  const raw = source.rawData || source.raw || {};
  [source.talhaoId, source.fieldId, source.id, raw.talhaoId, raw.fieldId, raw.id].forEach((value) => {
    const parsed = extractLegacyAgrParts(value);
    if (parsed) addCombo(parsed);
  });

  return Array.from(set).filter(Boolean);
}

export function buildAgriculturalKey(source = {}) {
  const { fundo, fazenda, talhao } = getAgrParts(source);
  const f = normalizeAgrKeyPart(fundo) || 'NA';
  const faz = normalizeAgrKeyPart(fazenda) || 'NA';
  const t = normalizeAgrKeyPart(talhao) || 'NA';
  return `${f}_${faz}_${t}`;
}
