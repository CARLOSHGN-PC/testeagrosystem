/**
 * profissionalSelectors.js
 *
 * O que este bloco faz:
 * Útil para listar opções de funções, equipes e unidades disponíveis,
 * ou mapear status para etiquetas amigáveis.
 *
 * Por que ele existe:
 * Concentrar "listas de domínio" em um só lugar. Se um dia a equipe mudar,
 * não precisamos caçar pelo sistema inteiro.
 */

export const FUNCOES_MOCK = [
  "Operador de Máquina",
  "Motorista",
  "Líder de Frente",
  "Apontador",
  "Borracheiro",
  "Mecânico",
  "Outros"
];

export const EQUIPES_MOCK = [
  "Frente 1",
  "Frente 2",
  "Frente 3",
  "Oficina Mobile"
];

export const UNIDADES_MOCK = [
  "Usina Matriz",
  "Usina Filial Norte",
  "Posto Avançado"
];

/**
 * Traduz o status do profissional em classe CSS de cores.
 *
 * @param {string} status - O status, e.g. "ativo" ou "inativo".
 * @returns {string} Uma string Tailwind CSS para pintar os badges.
 */
export function getStatusColor(status) {
  switch (status) {
    case "ativo":
      return "bg-green-500/10 text-green-400 border border-green-500/20";
    case "inativo":
      return "bg-red-500/10 text-red-400 border border-red-500/20";
    default:
      return "bg-gray-500/10 text-gray-400 border border-gray-500/20";
  }
}
