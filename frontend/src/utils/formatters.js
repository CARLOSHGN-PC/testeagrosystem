/**
 * formatters.js
 *
 * O que este bloco faz:
 * Fornece funções utilitárias puras para formatar e parsear dados exibidos na UI,
 * especialmente valores numéricos e strings.
 *
 * Por que ele existe:
 * A aplicação precisa lidar com formatação brasileira (vírgulas para decimais,
 * pontos para milhares) de forma consistente em todos os painéis e modais,
 * sem duplicar a lógica de conversão.
 */

/**
 * Converte strings ou números de qualquer formato (BR ou US) para um Float válido no JS.
 *
 * Por que ele existe:
 * Entradas de formulário e dados do GeoJSON frequentemente misturam formatos, como "1.500,45" ou "1500.45".
 *
 * @param {string|number} val - O valor a ser parseado (ex: "1.500,45" ou 1500.45).
 * @returns {number} O valor numérico em Float (ex: 1500.45), ou 0 se for inválido.
 */
export const parseBrazilianFloat = (val) => {
  if (val === undefined || val === null || val === "") return 0;
  if (typeof val === 'number') return val;

  let str = String(val).trim();
  // Se contém ponto e vírgula (ex: 1.500,45), remove o ponto e troca vírgula por ponto.
  if (str.includes('.') && str.includes(',')) {
    str = str.replace(/\./g, '').replace(',', '.');
  }
  // Se contém apenas vírgula (ex: 1500,45)
  else if (str.includes(',')) {
    str = str.replace(',', '.');
  }
  // Se contém apenas ponto, já é um formato Float válido.
  return parseFloat(str) || 0;
};

/**
 * Formata um número Float do JS para o padrão monetário/decimal brasileiro.
 *
 * @param {number} val - O número a ser formatado (ex: 1500.45).
 * @param {number} minDecimals - O número mínimo de casas decimais (padrão: 2).
 * @param {number} maxDecimals - O número máximo de casas decimais (padrão: 2).
 * @returns {string} A string formatada (ex: "1.500,45").
 */
export const formatBrazilianNumber = (val, minDecimals = 2, maxDecimals = 2) => {
  if (isNaN(val) || val === null || val === undefined) return "0,00";
  return Number(val).toLocaleString('pt-BR', {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals
  });
};

/**
 * Normaliza o nome do estágio de corte para um padrão consistente de exibição e filtragem.
 *
 * Por que ele existe:
 * Os shapefiles podem vir com strings diferentes para o mesmo conceito (ex: "1 Corte", "1º Corte", "1CORTE").
 *
 * @param {string} val - O valor original do corte no GeoJSON.
 * @returns {string} O valor normalizado (ex: "1º corte") ou "Sem estágio".
 */
export const normalizeCorte = (val) => {
  if (!val) return "Sem estágio";
  const str = String(val).toLowerCase().trim();
  const match = str.match(/(\d+)/); // Encontra o primeiro número na string
  if (match) {
    return `${match[1]}º corte`;
  }
  return "Sem estágio";
};

/**
 * Função utilitária para ordenação alfanumérica natural de strings.
 *
 * Por que ele existe:
 * Para garantir que "Talhão 2" venha antes de "Talhão 10" nos dropdowns de filtros.
 */
export const naturalSort = (a, b) => {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
};
