/**
 * geoHelpers.js
 *
 * O que este bloco faz:
 * Reúne funções para lidar com propriedades de GeoJSONs e identificadores de talhões.
 *
 * Por que ele existe:
 * O mapeamento dos dados geométricos (shapefile/geojson) com os dados no PostgreSQL (estimativas)
 * exige chaves únicas e consistentes. O GeoJSON cru não tem um ID confiável
 * e imutável. Essa lógica centraliza a geração desses IDs baseando-se nos atributos do shapefile.
 */

/**
 * Retorna o nome formatado e normalizado da Fazenda concatenada ao Fundo Agrícola.
 *
 * @param {Object} properties - Os atributos de uma feature do GeoJSON (ex: feature.properties).
 * @returns {string} O nome formatado (ex: "AGRO 1 - FAZENDA SANTA RITA").
 */
export const getFazendaName = (properties) => {
  if (!properties) return "";

  const f_agr = properties.FUNDO_AGR ? String(properties.FUNDO_AGR).trim() : "";
  const faz = properties.FAZENDA ? String(properties.FAZENDA).trim() : "";

  if (f_agr && faz) return `${f_agr} - ${faz}`;
  if (faz) return faz;
  if (f_agr) return f_agr;
  return "";
};

/**
 * Helper para gerar um ID de talhão (feature) verdadeiramente único para o PostgreSQL.
 *
 * Por que ele existe:
 * Muitas vezes um shapefile contém geometrias divididas (multi-polígonos ou polígonos
 * vizinhos que pertencem ao mesmo talhão "lógico", mas têm a mesma string "FUNDO_AGR",
 * "FAZENDA", e "TALHAO"). Se não adicionarmos o `featureId` sequencial que é instanciado no
 * load, uma estimativa salvaria em cima da outra no banco de dados.
 *
 * @param {Object} feature - O objeto Feature do GeoJSON.
 * @returns {string} Um ID concatenado, sem barras ou espaços (ex: "AGRO_SANTA_RITA_101_SEQ2").
 */
export const getUniqueTalhaoId = (feature) => {
  if (!feature || !feature.properties) return `mock_invalid_id`;

  const p = feature.properties;
  const f_agr = p.FUNDO_AGR ? String(p.FUNDO_AGR).trim() : "N-A";
  const faz = p.FAZENDA ? String(p.FAZENDA).trim() : "N-A";
  const talhao = p.TALHAO ? String(p.TALHAO).trim() : `mock_${feature.id}`;

  // Usamos o featureId estático do primeiro load, ou fallback pro index .id se por algum motivo falhar.
  const uniqueIndex = p.featureId !== undefined ? p.featureId : feature.id;

  const rawId = `${f_agr}_${faz}_${talhao}_SEQ${uniqueIndex}`;

  // Limpamos strings problemáticas para caminhos de PostgreSQL.
  return rawId.replace(/\//g, '-').replace(/ /g, '_').toUpperCase();
};
