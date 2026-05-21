import React from "react";
import { motion } from "framer-motion";
import { palette } from "../../constants/theme";
import { useCompanyConfig } from "../../contexts/ConfigContext";

/**
 * AnimatedBackground.jsx
 *
 * O que este bloco faz:
 * Rende as linhas reluzentes estilo tech-grid e bolinhas brilhantes que
 * permeiam o fundo da tela.
 *
 * Por que ele existe:
 * A experiência de AgroVetor tem apelo estético marcante no fundo ("tech/moderno").
 * Isso polui o arquivo raiz. Separando-o em um componente puro, ele é renderizado
 * apenas uma vez sem causar re-renders indesejados nas telas de negócio.
 *
 * O que entra e o que sai:
 * Não recebe props de negócio. Apenas retorna a div com os efeitos css/framer.
 */
export default function AnimatedBackground() {
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

  const lines = [
    { top: "10%", left: "-4%", width: 320 },
    { top: "18%", right: "-3%", width: 280 },
    { top: "72%", left: "-2%", width: 360 },
    { top: "84%", right: "-2%", width: 320 },
    { top: "50%", left: "8%", width: 180 },
    { top: "38%", right: "12%", width: 220 },
  ];

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {lines.map((line, index) => (
        <motion.div
          key={index}
          className="absolute h-px"
          style={{
            ...line,
            background: `linear-gradient(90deg, transparent 0%, ${themeColor} 25%, ${themeColorLight} 50%, transparent 100%)`,
            boxShadow: `0 0 10px rgba(${rgbThemeColor},0.45)`,
          }}
          animate={{ opacity: [0.08, 0.38, 0.12], x: [0, index % 2 === 0 ? 18 : -18, 0] }}
          transition={{ duration: 6 + index, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}

      {[...Array(22)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: 2 + (i % 2),
            height: 2 + (i % 2),
            background: i % 5 === 0 ? "rgba(255,255,255,0.7)" : themeColorLight,
            top: `${8 + ((i * 9) % 84)}%`,
            left: `${4 + ((i * 13) % 92)}%`,
            boxShadow: `0 0 10px ${i % 5 === 0 ? "rgba(255,255,255,0.45)" : `rgba(${rgbThemeColor},0.55)`}`,
          }}
          animate={{ opacity: [0.06, 0.75, 0.12], scale: [0.9, 1.35, 1], y: [0, -6, 0] }}
          transition={{ duration: 4 + (i % 5), repeat: Infinity, ease: "easeInOut", delay: i * 0.14 }}
        />
      ))}

      <motion.div
        className="absolute inset-x-0 bottom-[10%] h-24"
        style={{
          background: `radial-gradient(ellipse at center, rgba(${rgbThemeColor},0.14), rgba(${rgbThemeColor},0.03) 36%, transparent 72%)`,
          filter: "blur(12px)",
        }}
        animate={{ opacity: [0.18, 0.36, 0.22], scaleX: [0.98, 1.02, 0.99] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
