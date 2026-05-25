/**
 * theme.js
 *
 * O que este bloco faz:
 * Centraliza a paleta de cores e os padrões visuais "premium/dark" da aplicação.
 *
 * Por que ele existe:
 * Para evitar valores hexadecimais espalhados por todo o código (magic strings),
 * garantindo consistência visual e facilitando futuras alterações de tema (ex: light mode).
 *
 * O que entra e o que sai:
 * Exporta um objeto constante `palette` com as cores principais do AgroSystem.
 */
export const palette = {
  bg: "#050505",
  bg2: "#0A0A0A",
  tech: "#0D1B2A",
  tech2: "#1B263B",
  gold: "#D4AF37",
  goldLight: "#E6C76B",
  white: "#FFFFFF",
  text2: "#B0BEC5",
};
