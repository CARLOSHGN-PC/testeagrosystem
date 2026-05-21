
const PALETTE = [
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#eab308",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#8b5cf6",
  "#06b6d4",
  "#84cc16",
  "#f43f5e",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#6366f1",
  "#d946ef",
  "#14b8a6",
  "#fb7185",
  "#38bdf8"
];

export function normalizeFrenteLabel(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim().replace(/\s+/g, " ").toUpperCase();
}

function extractFrenteNumber(value) {
  const normalized = normalizeFrenteLabel(value);
  const match = normalized.match(/(?:^F\s*|^FRENTE\s*)?(\d+)/);
  return match ? Number(match[1]) : null;
}

function hashString(value) {
  const normalized = normalizeFrenteLabel(value);
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getPlanejamentoSafraColor(frente) {
  const normalized = normalizeFrenteLabel(frente);
  if (!normalized) return "#808080";

  const numeric = extractFrenteNumber(normalized);
  if (numeric !== null && numeric > 0) {
    return PALETTE[(numeric - 1) % PALETTE.length];
  }

  return PALETTE[hashString(normalized) % PALETTE.length];
}

export function buildPlanejamentoLegendItems(features = []) {
  const byLabel = new Map();

  features.forEach((feature) => {
    const props = feature?.properties || {};
    const frenteRaw = props._frente_planejamento ?? props._planejamento?.frenteColheita ?? "";
    const frente = String(frenteRaw || "").trim();
    if (!frente) return;

    const normalized = normalizeFrenteLabel(frente);
    if (!byLabel.has(normalized)) {
      byLabel.set(normalized, [props._frente_color || getPlanejamentoSafraColor(frente), frente]);
    }
  });

  const items = Array.from(byLabel.values());
  return items.sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true, sensitivity: "base" }));
}
