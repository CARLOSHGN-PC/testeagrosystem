import React from "react";
import { palette } from "../../constants/theme";
import { useCompanyConfig } from "../../contexts/ConfigContext";

/**
 * PremiumBadge.jsx
 *
 * O que este bloco faz:
 * Etiqueta estilizada em tom de "ouro translúcido" ou cor da empresa para destacar seções do layout.
 *
 * @param {Object} props.children - Texto ou elemento a exibir dentro da badge.
 * @returns {JSX.Element} Badge inline-flex.
 */
export default function PremiumBadge({ children }) {
  const { logoColor } = useCompanyConfig();
  const themeColor = logoColor || palette.gold;
  const themeColorLight = logoColor || palette.goldLight;

  // Convert hex color to rgba helper
  const hexToRgb = (hex) => {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)}` : '212,175,55';
  };

  const rgbThemeColor = hexToRgb(themeColor);

  return (
    <span
      className="inline-flex items-center rounded-full border px-3 py-1 text-xs tracking-[0.18em] uppercase"
      style={{
        borderColor: `${themeColor}55`,
        background: `rgba(${rgbThemeColor},0.08)`,
        color: themeColorLight,
      }}
    >
      {children}
    </span>
  );
}
