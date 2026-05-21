import React from "react";
import { motion } from "framer-motion";
import { palette } from "../../constants/theme";
import { useCompanyConfig } from "../../contexts/ConfigContext";

/**
 * GlowOrb.jsx
 *
 * O que este bloco faz:
 * Um orbe difuso em background, animado via Framer Motion.
 * Usa a cor configurada da empresa se for passado colorType="theme".
 *
 * Por que ele existe:
 * Para dar a estética "premium/futurista" à tela inicial de login e ao mapa.
 *
 * O que entra e o que sai:
 * @param {string} className - Classes Tailwind extras (ex: cores, posições).
 * @param {number} size - O tamanho base do orbe.
 * @param {number} delay - O delay inicial da animação contínua (Framed Motion).
 * @param {string} colorType - 'theme' para forçar cor dinamica
 * @returns {JSX.Element} Uma `div` animada posicionada no DOM absoluto.
 */

export default function GlowOrb({ className = "", size = 280, delay = 0, colorType = "" }) {
  const { logoColor } = useCompanyConfig();

  // Convert hex color to rgba helper
  const hexToRgb = (hex) => {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)}` : '212,175,55';
  };

  const themeColor = logoColor || palette.gold;
  const rgbThemeColor = hexToRgb(themeColor);

  const customStyle = colorType === "theme" ? { background: `rgba(${rgbThemeColor}, 0.4)` } : {};

  return (
    <motion.div
      className={`absolute rounded-full blur-3xl opacity-30 ${className}`}
      style={{ width: size, height: size, ...customStyle }}
      animate={{ x: [0, 24, -16, 0], y: [0, -20, 14, 0], scale: [1, 1.08, 0.96, 1] }}
      transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay }}
    />
  );
}
