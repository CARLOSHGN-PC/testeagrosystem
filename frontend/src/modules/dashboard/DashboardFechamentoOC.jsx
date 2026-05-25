/**
 * DashboardFechamentoOC.jsx
 *
 * Dashboard de Talhões Fechados (Fechamento de Ordens de Corte).
 * Convertido de TypeScript (.tsx) para JSX puro.
 *
 * Dependências extras necessárias (instalar via npm):
 *   npm install html2canvas jspdf
 *
 * Uso:
 *   import DashboardFechamentoOC from './modules/dashboardFechamentoOC/DashboardFechamentoOC';
 *
 *   // Com ref (para expor gerarPdf):
 *   const dashRef = useRef(null);
 *   <DashboardFechamentoOC ref={dashRef} companyId={currentCompanyId} />
 *   // dashRef.current?.gerarPdf()
 */

import { forwardRef, memo, startTransition, useCallback, useDeferredValue, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckSquare2, Sprout, TrendingUp, Factory, Beaker, Clock, BarChart3, Timer,
  Activity, Leaf, Grid3x3, Target, Wrench, TrendingDown, CheckCircle2,
  AlertTriangle, Trophy, ListChecks, FileText, Calendar, CalendarRange,
  StickyNote, Save, ArrowDownUp, Pencil, X as XIcon, Check as CheckIcon,
  Building2, Layers, PieChart as PieIcon, ScatterChart as ScatterIcon,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, Line, PieChart, Pie, Cell,
  ScatterChart, Scatter, ZAxis, ReferenceLine, Area, LabelList,
} from "recharts";
import {
  fetchNote,
  saveNote,
} from "./dashboardFechamentoService";
import { apiRequest } from "../../services/apiClient";
import { DEFAULT_FECHAMENTO_OC_ATR_TCH_CONFIG } from "../../services/colheitaPremissasService";
import "./fechamento-oc-polish.css";

// ─────────────────────────────────────────────
// Utilitários
// ─────────────────────────────────────────────

/** Normaliza qualquer valor para número (suporta formato brasileiro). */
const num = (v) => {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;

  let s = String(v).trim();
  if (!s) return 0;
  s = s.replace(/\s/g, "").replace(/[^\d,.-]/g, "");

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // Usa o último separador como decimal: 1.234,56 ou 1,234.56.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    s = s.replace(",", ".");
  } else if (hasDot) {
    const parts = s.split(".");
    if (parts.length > 2) {
      const dec = parts.pop();
      s = `${parts.join("")}.${dec}`;
    } else {
      const [intPart, decPart] = parts;
      // Ex.: 27.918 vindo como milhar deve virar 27918; 19.23 continua decimal.
      if (decPart?.length === 3 && intPart.length <= 3) s = `${intPart}${decPart}`;
    }
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

/** Formata número com casas decimais em pt-BR. */
const fmt = (n, decimals = 2) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** Formata inteiro em pt-BR. */
const fmtInt = (n) => Math.round(n).toLocaleString("pt-BR");

/** Formata percentual com sinal. */
const fmtPct = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(2).replace(".", ",")}%`;


/** Rótulo em formato de badge para destacar os pontos da linha no gráfico. */
const LinhaBadgeLabel = ({ x, y, value }) => {
  const v = Number(value);
  if (!Number.isFinite(v)) return null;

  const label = fmt(v, 1);
  const width = Math.max(34, label.length * 7 + 14);
  const height = 18;
  const posX = Number(x) - width / 2;
  const posY = Number(y) - height - 7;

  return (
    <g pointerEvents="none">
      <rect
        x={posX}
        y={posY}
        width={width}
        height={height}
        rx={5}
        ry={5}
        fill="#0b1f36"
        stroke="rgba(96,165,250,0.45)"
        strokeWidth={1}
      />
      <text
        x={Number(x)}
        y={posY + 12.5}
        textAnchor="middle"
        fill="#ffffff"
        fontSize={9}
        fontWeight={900}
      >
        {label}
      </text>
    </g>
  );
};

/** Junta classes condicionalmente (substitui o shadcn/cn). */
const cn = (...args) =>
  args
    .flatMap((a) => {
      if (!a) return [];
      if (typeof a === "string") return [a];
      if (typeof a === "object") return Object.entries(a).filter(([, v]) => v).map(([k]) => k);
      return [];
    })
    .join(" ");

/** Normaliza tipo de propriedade. */
const normalizeTipoPropriedade = (v) => {
  if (!v) return "";
  const s = String(v).trim().toUpperCase();
  if (s.includes("ARRENDAMENTO")) return "ARRENDAMENTO";
  if (s.includes("PARCERIA")) return "PARCERIA";
  if (s.includes("FORNECEDOR")) return "FORNECEDOR";
  return s;
};

/** Normaliza código/nome para cruzamento com o Cadastro Geral. */
const normalizeCadastroKey = (v) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

const firstNonEmpty = (...values) => {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
};

const nestedCadastroValue = (row = {}, keys = []) => {
  const containers = [row, row.rawData, row.raw, row.original, row.farm, row.field].filter(Boolean);
  for (const container of containers) {
    for (const key of keys) {
      const value = container?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") return value;
    }
  }
  return "";
};

const cadastroKeyVariants = (value) => {
  const base = normalizeCadastroKey(value);
  if (!base) return [];
  const variants = new Set([base]);
  const digits = base.replace(/[^0-9]/g, "");
  if (digits) {
    variants.add(digits);
    variants.add(String(Number(digits)));
  }
  return Array.from(variants).filter(Boolean);
};

const getTipoPropriedadeCadastro = (row = {}) => normalizeTipoPropriedade(nestedCadastroValue(row, [
  "TIPO_PROPRIEDADE",
  "tipoPropriedade",
  "tipo_propriedade",
  "TIPO_PROP",
  "tipoProp",
  "MOD_ADM",
  "modAdm"
]));

const getCodigoFazendaCadastro = (row = {}) => String(nestedCadastroValue(row, [
  "COD_FAZ",
  "codFaz",
  "codigo",
  "code",
  "farmCode",
  "fazendaCodigo",
  "fazendaId",
  "farmId"
])).trim();

const getNomeFazendaCadastro = (row = {}) => String(nestedCadastroValue(row, [
  "DES_FAZENDA",
  "desFazenda",
  "nome",
  "name",
  "fazenda",
  "farmName",
  "nome_fazenda"
])).trim();

const getTalhaoCadastro = (row = {}) => String(nestedCadastroValue(row, [
  "TALHAO",
  "talhao",
  "talhaoNome",
  "fieldCode",
  "fieldName"
])).trim();

/** Parse de data serial Excel ou string ISO/BR → Date | null. */
const parseDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;

  if (typeof v === "number" && Number.isFinite(v)) {
    // Serial do Excel, inclusive com decimal de horário.
    if (v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  const s = String(v).trim();
  if (!s) return null;

  if (/^\d+(?:[.,]\d+)?$/.test(s)) {
    const serial = parseFloat(s.replace(",", "."));
    if (serial > 20000 && serial < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
  }

  // Padrão do cadastro: 18/05/2025. Extrai igual =ANO() do Excel.
  const mBr = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (mBr) {
    const dd = parseInt(mBr[1], 10);
    const mm = parseInt(mBr[2], 10) - 1;
    let yy = parseInt(mBr[3], 10);
    if (yy < 100) yy += yy < 50 ? 2000 : 1900;
    const d = new Date(Date.UTC(yy, mm, dd));
    return isNaN(d.getTime()) ? null : d;
  }

  const mIso = s.match(/(19|20)\d{2}/);
  if (mIso) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
    return new Date(Date.UTC(parseInt(mIso[0], 10), 0, 1));
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

const parseTempo = (v) => {
  if (!v) return 0;
  const s = String(v).replace(",", ".").match(/[\d.]+/);
  return s ? parseFloat(s[0]) : 0;
};

// Regras oficiais do Talhões Fechados vindas do backend/relatório importado.
// A base de área para TCH previsto e real é sempre AREA CORTADA.
const getTchPrevRelatorio = (r) => {
  const prodPrev = num(r["PROD. PREV."]);
  const areaCortada = num(r["AREA CORTADA"]);
  return prodPrev > 0 && areaCortada > 0 ? prodPrev / areaCortada : 0;
};

const getTchRealRelatorio = (r) => {
  const prodReal = num(r["PROD. REAL"]);
  const areaCortada = num(r["AREA CORTADA"]);
  return prodReal > 0 && areaCortada > 0 ? prodReal / areaCortada : 0;
};

const calcGapPct = (realizado, previsto) => {
  const prev = num(previsto);
  const real = num(realizado);
  return prev > 0 ? ((real / prev) * 100) - 100 : 0;
};

// Cálculos vindos do backend. Mantive fallback idempotente para não quebrar
// caso algum registro antigo ainda não traga os campos calculados pela API.
const getAtrPrevNumeratorBackend = (r) => {
  const backendValue = num(r.atrPrevNumerator);
  if (backendValue > 0) return backendValue;
  const prodPrev = num(r["PROD. PREV."] ?? r.tonPrev ?? r.prodPrev);
  const atr = num(r.ATR ?? r.atr ?? r.atrReal);
  return prodPrev > 0 && atr > 0 ? prodPrev * atr : 0;
};
const getAtrPrevWeightBackend = (r) => {
  const backendValue = num(r.atrPrevWeight);
  return backendValue > 0 ? backendValue : num(r["PROD. PREV."] ?? r.tonPrev ?? r.prodPrev);
};
const getAtrRealNumeratorBackend = (r) => {
  const backendValue = num(r.atrRealNumerator);
  if (backendValue > 0) return backendValue;
  const prodReal = num(r["PROD. REAL"] ?? r.tonReal ?? r.ton ?? r.prodReal);
  const atr = num(r.ATR ?? r.atr ?? r.atrReal);
  return prodReal > 0 && atr > 0 ? prodReal * atr : 0;
};
const getAtrRealWeightBackend = (r) => {
  const backendValue = num(r.atrRealWeight);
  return backendValue > 0 ? backendValue : num(r["PROD. REAL"] ?? r.tonReal ?? r.ton ?? r.prodReal);
};

// ─────────────────────────────────────────────
// Constantes de cores / paleta
// ─────────────────────────────────────────────

const STATUS_COLORS = {
  Excelente: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  Bom:       "bg-green-500/20 text-green-300 border-green-500/30",
  Neutro:    "bg-amber-500/20 text-amber-300 border-amber-500/30",
  Atenção:   "bg-orange-500/20 text-orange-300 border-orange-500/30",
  Crítico:   "bg-red-500/20 text-red-300 border-red-500/30",
};

const VAR_COLORS = ["#a78bfa", "#22c55e", "#60a5fa", "#fbbf24", "#f87171", "#22d3ee", "#f97316"];

const TF_ACCENTS = {
  amber:   { bar: "from-amber-400 to-amber-600",     iconBg: "from-amber-500/25 to-amber-500/5 border-amber-500/30",     iconText: "text-amber-400",   glow: "from-amber-500/10" },
  emerald: { bar: "from-emerald-400 to-emerald-600", iconBg: "from-emerald-500/25 to-emerald-500/5 border-emerald-500/30", iconText: "text-emerald-400", glow: "from-emerald-500/10" },
  red:     { bar: "from-red-400 to-red-600",         iconBg: "from-red-500/25 to-red-500/5 border-red-500/30",           iconText: "text-red-400",     glow: "from-red-500/10" },
  blue:    { bar: "from-blue-400 to-blue-600",       iconBg: "from-blue-500/25 to-blue-500/5 border-blue-500/30",         iconText: "text-blue-400",    glow: "from-blue-500/10" },
  violet:  { bar: "from-violet-400 to-violet-600",   iconBg: "from-violet-500/25 to-violet-500/5 border-violet-500/30",   iconText: "text-violet-400",  glow: "from-violet-500/10" },
  cyan:    { bar: "from-cyan-400 to-cyan-600",       iconBg: "from-cyan-500/25 to-cyan-500/5 border-cyan-500/30",         iconText: "text-cyan-400",    glow: "from-cyan-500/10" },
};

// ─────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────

/** Card KPI simples (1 valor central). */
const KpiCard = memo(({ title, icon: Icon, iconBg, iconColor, accent, children, index }) => (
  <div
    className="kpi-card-enter group relative overflow-hidden rounded-xl border border-amber-500/[0.08] bg-card/80 backdrop-blur-sm p-4 hover:border-amber-500/20 transition-all"
    style={{ animationDelay: `${index * 40}ms` }}
  >
    <div className={cn("absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl bg-gradient-to-b", accent)} />
    <div className="absolute -top-6 -right-6 h-24 w-24 rounded-full bg-gradient-to-br from-white/[0.03] to-transparent" />
    <div className="relative flex items-start justify-between gap-2 mb-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className={cn("p-2 rounded-lg", iconBg)}>
        <Icon className={cn("h-4 w-4", iconColor)} />
      </div>
    </div>
    <div className="relative">{children}</div>
  </div>
));

/** Card wrapper para gráficos.
 * Otimização: gráficos pesados só são montados quando entram perto da tela.
 * Isso evita que o Talhões Fechados trave renderizando todos os Recharts de uma vez.
 */
const ChartCard = memo(({ title, subtitle, icon: Icon, color, children, className, headerActions, eager = false, index = 0 }) => {
  const ref = useRef(null);
  const [visible, setVisible] = useState(eager);

  useEffect(() => {
    if (visible) return undefined;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      const id = setTimeout(() => setVisible(true), 250);
      return () => clearTimeout(id);
    }
    let timeoutId = null;
    const obs = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        const delay = Math.min(index * 80, 400);
        timeoutId = setTimeout(() => {
          setVisible(true);
          obs.disconnect();
        }, delay);
      }
    }, { rootMargin: "120px 0px" });
    obs.observe(el);
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      obs.disconnect();
    };
  }, [visible, index]);

  return (
    <div ref={ref} className={cn("relative rounded-2xl border border-amber-500/[0.08] bg-card/60 backdrop-blur-sm p-4 flex flex-col", className)}>
      <div className="flex items-center gap-3 mb-4">
        <div className={cn("p-2.5 rounded-xl border", color)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-foreground tracking-tight">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        {headerActions && (
          <div className="ml-auto flex items-center gap-1.5 flex-wrap justify-end">{headerActions}</div>
        )}
      </div>
      <div className="flex-1 min-h-0">
        {visible ? children : <div className="flex h-64 items-center justify-center rounded-xl border border-white/5 bg-white/[0.02] text-xs text-muted-foreground">Preparando gráfico...</div>}
      </div>
    </div>
  );
});

/** Gantt-style progress row (Real vs Planejado em ha). */
const GanttRow = memo(({ label, sublabel, areaReal, areaPlan, realPct, fillPct, done, labelWidthClass = "w-28" }) => {
  const fillColor = done ? "bg-gradient-to-r from-emerald-500 to-emerald-400" : "bg-gradient-to-r from-green-600 to-green-400";
  const pillReal = done ? "bg-emerald-500 text-black border-emerald-300" : "bg-amber-500 text-black border-amber-300";
  const showInnerPill = fillPct >= 12;
  return (
    <div className="flex items-center gap-3 text-[11px]">
      <div className={cn("shrink-0", labelWidthClass)}>
        <div className="font-semibold text-foreground truncate" title={label}>{label}</div>
        {sublabel && <div className="text-[10px] text-muted-foreground mt-0.5">{sublabel}</div>}
      </div>
      <div className="flex-1 relative h-6">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-4 rounded-md bg-muted/30 border border-amber-500/[0.08] overflow-hidden">
          <div className={cn("absolute inset-y-0 left-0 transition-all rounded-md", fillColor)} style={{ width: `${fillPct}%` }} />
        </div>
        {showInnerPill && (
          <div className="absolute -top-1 -translate-x-1/2 z-10" style={{ left: `${fillPct}%` }}>
            <span className={cn("inline-block px-1.5 py-[1px] rounded font-mono font-bold text-[9px] border border-amber-500/[0.08] shadow-sm whitespace-nowrap", pillReal)}>
              {fmt(areaReal)} ha
            </span>
          </div>
        )}
        <div className="absolute -top-1 right-0 z-10">
          <span className="inline-block px-1.5 py-[1px] rounded font-mono font-bold text-[9px] bg-muted text-muted-foreground border border-amber-500/[0.08] shadow-sm whitespace-nowrap">
            {fmt(areaPlan)} ha
          </span>
        </div>
      </div>
      <div className={cn("w-14 text-right font-bold tabular-nums", done ? "text-emerald-400" : "text-amber-400")}>
        {fmt(realPct)}%
      </div>
    </div>
  );
});

/** KPI Card executivo: Previsto / Real + Gap. */
const ExecKpiCard = memo(({ title, icon: Icon, index, previsto, real, gapLabel, gapValue, gapPct, accent = "emerald" }) => {
  const positive = gapPct >= 0;
  const a = TF_ACCENTS[accent] || TF_ACCENTS.emerald;
  return (
    <div
      className="kpi-card-enter group relative overflow-hidden rounded-xl border border-amber-500/[0.08] bg-card/80 backdrop-blur-sm p-2.5 min-h-[96px] flex flex-col hover:border-amber-400/30 hover:shadow-lg hover:shadow-amber-500/5 transition-all"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className={cn("absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b", a.bar)} />
      <div className={cn("absolute -top-10 -right-10 h-28 w-28 rounded-full bg-gradient-to-br to-transparent blur-2xl pointer-events-none", a.glow)} />
      <div className="relative flex items-start justify-between gap-2 mb-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
        <div className={cn("p-2 rounded-lg bg-gradient-to-br border shrink-0", a.iconBg)}>
          <Icon className={cn("h-4 w-4", a.iconText)} />
        </div>
      </div>
      <div className="relative grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-0.5">Previsto</p>
          <p className="text-xl font-bold text-foreground leading-none">{previsto}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-0.5">Real</p>
          <p className={cn("text-xl font-bold leading-none", a.iconText)}>{real}</p>
        </div>
      </div>
      <div className="relative mt-auto pt-1.5 border-t border-amber-500/[0.06]">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">{gapLabel}</p>
        <div className="flex items-baseline gap-2">
          <span className={cn("text-base font-bold leading-none", positive ? "text-emerald-400" : "text-red-400")}>{gapValue}</span>
          <span className={cn("text-[11px] font-bold px-1.5 py-0.5 rounded border", positive ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : "bg-red-500/15 text-red-300 border-red-500/30")}>
            ({positive ? "+" : ""}{fmt(gapPct)}%)
          </span>
        </div>
      </div>
    </div>
  );
});

/** KPI Card para Idade de Corte. */
const IdadeKpiCard = memo(({ index, idadeMeses, idadeCorte }) => {
  const fora = Math.abs(idadeMeses - 12) > 1.5;
  const accent = fora ? "red" : "cyan";
  const a = TF_ACCENTS[accent];
  return (
    <div
      className="kpi-card-enter group relative overflow-hidden rounded-xl border border-amber-500/[0.08] bg-card/80 backdrop-blur-sm p-2.5 min-h-[96px] flex flex-col hover:border-amber-400/30 hover:shadow-lg hover:shadow-amber-500/5 transition-all"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className={cn("absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b", a.bar)} />
      <div className={cn("absolute -top-10 -right-10 h-28 w-28 rounded-full bg-gradient-to-br to-transparent blur-2xl pointer-events-none", a.glow)} />
      <div className="relative flex items-start justify-between gap-2 mb-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">IDADE DE CORTE</p>
        <div className={cn("p-2 rounded-lg bg-gradient-to-br border shrink-0", a.iconBg)}>
          <Timer className={cn("h-4 w-4", a.iconText)} />
        </div>
      </div>
      <div className="relative grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-0.5">Meses</p>
          <p className={cn("text-xl font-bold leading-none", a.iconText)}>{idadeMeses > 0 ? fmt(idadeMeses, 1) : "—"}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-0.5">Nº Corte</p>
          <p className={cn("text-xl font-bold leading-none", a.iconText)}>{idadeCorte > 0 ? fmt(idadeCorte, 1) : "—"}</p>
        </div>
      </div>
      <div className="relative mt-auto pt-1.5 border-t border-amber-500/[0.06] text-[10px] text-muted-foreground">
        <span>Idade ideal: <span className="text-foreground font-semibold">~12 meses</span></span>
      </div>
    </div>
  );
});

/** Modal genérico (substitui shadcn Dialog). */
const Modal = memo(({ open, onClose, title, children }) => {
  if (!open) return null;
  const content = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col rounded-2xl border border-amber-500/25 bg-slate-950/95 text-slate-100 shadow-2xl shadow-black/60"
        style={{
          willChange: 'transform',
          '--foreground': '210 40% 98%',
          '--muted-foreground': '215 20% 70%',
          '--card': '222 47% 6%',
        }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-amber-500/20 bg-slate-950/90 shrink-0">
          <h3 className="text-base font-bold text-amber-300">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition">
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5 text-slate-100 [&_td]:text-slate-100 [&_th]:text-slate-200 [&_.text-foreground]:!text-slate-100 [&_.text-muted-foreground]:!text-slate-400">{children}</div>
      </div>
    </div>
  );
  return createPortal(content, document.body);
});


/** Tick customizado do eixo X: mostra código da fazenda em cima e nome embaixo. */
const FazendaXAxisTick = memo(({ x, y, payload }) => {
  const raw = String(payload?.value || "");
  const [cod, nome] = raw.split("||");
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={12} textAnchor="middle" fill="rgba(255,255,255,0.72)" fontSize={9} fontWeight={700}>
        {cod || "—"}
      </text>
      <text x={0} y={0} dy={25} textAnchor="middle" fill="rgba(255,255,255,0.50)" fontSize={8}>
        {nome && nome !== cod ? nome.slice(0, 18) : ""}
      </text>
    </g>
  );
});

/** Rótulo em formato de pill para o GAP, sempre acima da bolinha da linha. */
const GapPillLabel = memo(({ x, y, value }) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  const positive = Number(value) >= 0;
  const text = `${positive ? "+" : ""}${fmt(Number(value), 2)}%`;
  const width = Math.max(48, text.length * 7.2);
  const xx = Number(x || 0);
  const yy = Number(y || 0);
  return (
    <g transform={`translate(${xx - width / 2},${yy - 30})`} pointerEvents="none">
      <rect width={width} height={20} rx={6} fill={positive ? "#16a34a" : "#dc2626"} stroke="rgba(255,255,255,.16)" strokeWidth="0.8" opacity={0.98} />
      <text x={width / 2} y={13.5} textAnchor="middle" fill="#ffffff" fontSize={10} fontWeight={900}>
        {text}
      </text>
    </g>
  );
});

/** Rótulo do valor realizado: fica dentro/centro da barra para não brigar com a linha. */
const BarCenterValueLabel = memo(({ x, y, width, height, value }) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const text = Math.abs(n) >= 1000 ? fmtInt(n) : fmt(n, 1);
  const xx = Number(x || 0) + Number(width || 0) / 2;
  const h = Math.max(Number(height || 0), 1);
  const yy = Number(y || 0) + Math.max(14, Math.min(h / 2 + 4, h - 6));
  return (
    <text x={xx} y={yy} textAnchor="middle" fill="#ffffff" fontSize={10} fontWeight={900} style={{ paintOrder: "stroke", stroke: "rgba(3,7,18,.82)", strokeWidth: 3 }} pointerEvents="none">
      {text}
    </text>
  );
});

/** Rótulo da linha prevista: pill pequeno acima da bolinha. */
const LineDotValueLabel = memo(({ x, y, value }) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const text = Math.abs(n) >= 1000 ? fmtInt(n) : fmt(n, 1);
  const xx = Number(x || 0);
  const yy = Number(y || 0);
  const width = Math.max(36, text.length * 6.7);
  return (
    <g transform={`translate(${xx - width / 2},${yy - 26})`} pointerEvents="none">
      <rect width={width} height={17} rx={6} fill="rgba(15,23,42,.88)" stroke="rgba(56,189,248,.65)" strokeWidth="0.8" />
      <text x={width / 2} y={11.5} textAnchor="middle" fill="#dff7ff" fontSize={9} fontWeight={900}>
        {text}
      </text>
    </g>
  );
});

const MonthBarValueLabel = BarCenterValueLabel;
const MonthLineValueLabel = LineDotValueLabel;



const corteKey = (value) => {
  const s = String(value ?? "").trim();
  if (!s) return "";
  const n = s.match(/\d+/)?.[0];
  return n || s;
};

const getAnoHistoricoAnterior = () => new Date().getFullYear() - 1;

const fetchHistoricoProducaoAnoAnteriorBackend = async (companyId, anoRef = getAnoHistoricoAnterior(), filters = {}) => {
  if (!companyId) {
    return {
      anoRef,
      tchPorCorte: {},
      areaPorCorte: {},
      atrPorCorte: {},
      totalRegistrosAno: 0,
    };
  }

  const qs = new URLSearchParams({ companyId, anoRef: String(anoRef), ...filters });
  const payload = await apiRequest(`/api/dados-dashboard/colheita/fechamento-oc/historico-producao-ano-anterior?${qs.toString()}`);
  const data = payload?.data || {};
  return {
    anoRef: data.anoRef ?? anoRef,
    tchPorCorte: data.tchPorCorte || {},
    areaPorCorte: data.areaPorCorte || {},
    atrPorCorte: data.atrPorCorte || {},
    totalRegistrosAno: data.totalRegistrosAno || 0,
  };
};

const fetchFechamentoOcDashboardPronto = async (companyId, filters = {}) => {
  if (!companyId) return {};
  const params = new URLSearchParams();
  Object.entries(filters || {}).forEach(([key, value]) => {
    const text = String(value ?? "").trim();
    if (text && text !== "undefined" && text !== "null") params.set(key, text);
  });
  params.set("companyId", companyId);
  const result = await apiRequest(`/api/dados-dashboard/dashboard/fechamento-oc?${params.toString()}`);
  return result.data || {};
};


const PeriodDateInput = ({ label, value, onChange }) => (
  <label className="flex min-w-[150px] items-center gap-2 rounded-xl border border-cyan-500/15 bg-[#07101d]/90 px-3 py-2">
    <Calendar className="h-3.5 w-3.5 text-cyan-400" />
    <div className="flex flex-col gap-0.5">
      <span className="text-[8px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <input
        type="date"
        value={value || ""}
        onChange={(e) => onChange?.(e.target.value)}
        className="h-5 bg-transparent text-xs font-bold text-foreground outline-none [color-scheme:dark]"
      />
    </div>
  </label>
);

// ─────────────────────────────────────────────
// Componente Principal
// ─────────────────────────────────────────────

const DashboardFechamentoOC = forwardRef(({ companyId: companyIdProp, safra, setSafra, fazenda, setFazenda, dataInicio, setDataInicio, dataFim, setDataFim, options = {} }, ref) => {
  const companyId = companyIdProp || options?.companyId || options?.empresaId || options?.currentCompanyId || options?.company?.id;
  // ── Estado ──────────────────────────────────
  const [allRecords, setAllRecords] = useState([]);
  const [dashboardPronto, setDashboardPronto] = useState(null);
  const [tipoPropMap, setTipoPropMap] = useState({});
  const [tipoPropFilter, setTipoPropFilter] = useState([]);
  const [filterSnap, setFilterSnap] = useState({ safra, fazenda, dataInicio, dataFim });
  useEffect(() => {
    const id = setTimeout(() => {
      startTransition(() => setFilterSnap({ safra, fazenda, dataInicio, dataFim }));
    }, 180);
    return () => clearTimeout(id);
  }, [safra, fazenda, dataInicio, dataFim]);
  const [loading, setLoading] = useState(true);
  const [fazendaNomes, setFazendaNomes] = useState({});
  const [historicoTchPorCorte, setHistoricoTchPorCorte] = useState({});
  const [historicoAreaPorCorte, setHistoricoAreaPorCorte] = useState({});
  const [historicoAtrPorCorte, setHistoricoAtrPorCorte] = useState({});
  const [historicoAnoRef, setHistoricoAnoRef] = useState(null);
  const [historicoTotalRegistrosAno, setHistoricoTotalRegistrosAno] = useState(0);
  const [areaPlanCorte, setAreaPlanCorte] = useState({});
  const [areaPlanVariedade, setAreaPlanVariedade] = useState({});
  const [variedadeEstagioFilter, setVariedadeEstagioFilter] = useState("all");
  const [drilldown, setDrilldown] = useState(null);
  const [estagioPage, setEstagioPage] = useState(0);
  const [variedadePage, setVariedadePage] = useState(0);
  const [finalAbaixoPage, setFinalAbaixoPage] = useState(0);
  const ESTAGIO_PAGE_SIZE = 12;
  const VARIEDADE_PAGE_SIZE = 20;
  const FINAL_ABAIXO_PAGE_SIZE = 12;
  const pdfRef = useRef(null);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [moagemPrevista, setMoagemPrevista] = useState(0);
  const [atrPlanejadoMes, setAtrPlanejadoMes] = useState({});
  const [moagemMensal, setMoagemMensal] = useState({});
  const [observacoes, setObservacoes] = useState("");
  const [observacoesSalvas, setObservacoesSalvas] = useState("");
  const [savingObs, setSavingObs] = useState(false);
  const [observacoesEditing, setObservacoesEditing] = useState(false);
  const NOTE_SECTION = "talhoes_fechados_observacoes";
  const ROW_NOTE_PREFIX = "talhoes_fechados_row:";
  const [rowObs, setRowObs] = useState({});
  const [rowObsSaved, setRowObsSaved] = useState({});
  const [rowObsEditing, setRowObsEditing] = useState({});
  const [pdfOnlyEmptyObs, setPdfOnlyEmptyObs] = useState(false);
  const [colheitaPremissas, setColheitaPremissas] = useState(null);

  const rowKey = (faz, tal) => `${ROW_NOTE_PREFIX}${faz}|${tal}`;
  const finalObsKey = useCallback((r) => rowKey(
    r?.faz ?? "—",
    `${r?.variedade ?? "—"}|${r?.estagio ?? "—"}|${r?.mesPlantio ?? "—"}|${r?.talhoesTxt ?? "—"}`
  ), []);

  const defaultObsFinal = useCallback((r) => {
    if (!r) return "";
    return r.gap <= -15
      ? "Desvio crítico: revisar operação, variedade e condições do talhão."
      : "Acompanhar desempenho e possíveis ajustes de operação.";
  }, []);

  // ── Carregamento de dados ────────────────────
  useEffect(() => {
    if (!companyId) return;
    let active = true;

    const load = async () => {
      setLoading(true);
      try {
        // Carrega primeiro o dashboard principal. O histórico da Produção Agrícola é pesado
        // e não pode travar a tela em “Carregando...” caso a rota demore ou falhe.
        const dashboard = await fetchFechamentoOcDashboardPronto(companyId, { safra, fazenda, dataInicio, dataFim });
        const records = dashboard.serverAggregated ? [] : (dashboard.legacyRows || []);
        const hist = dashboard.historico || {};
        if (active) {
          setDashboardPronto(dashboard || null);
          setAllRecords(records);
          setFazendaNomes(dashboard?.fazendaNomes || dashboard?.cadastros?.fazendaNomes || {});
          setAreaPlanCorte(dashboard?.planejamento?.areaPorCorte || {});
          setAreaPlanVariedade(dashboard?.planejamento?.areaPorVariedade || {});
          setMoagemPrevista(num(dashboard.cards?.moagemPrevistaEntrada ?? dashboard.cards?.moagemPrevista ?? dashboard.cards?.prodPrev));
          setAtrPlanejadoMes({});
          setMoagemMensal({});
          setHistoricoTchPorCorte(hist.tchPorCorte || {});
          setHistoricoAreaPorCorte(hist.areaPorCorte || {});
          setHistoricoAtrPorCorte(hist.atrPorCorte || {});
          setHistoricoTotalRegistrosAno(hist.totalRegistrosAno || 0);
          setHistoricoAnoRef(hist.anoRef ?? getAnoHistoricoAnterior());
          setColheitaPremissas(dashboard?.premissas || null);
          setObservacoes(dashboard?.observacoes || "");
          setObservacoesSalvas(dashboard?.observacoes || "");
          setLoading(false);
        }
      } catch (e) {
        console.error("[DashboardFechamentoOC] Erro ao carregar Talhões Fechados", e);
        if (active) {
          setDashboardPronto(null);
          setAllRecords([]);
          setLoading(false);
        }
      }
    };

    load();

    return () => { active = false; };
  }, [companyId, safra, fazenda, dataInicio, dataFim]);

  // Premissas oficiais já vêm junto da API própria do Talhões Fechados.

  // Tipo de propriedade já vem agregado no backend; não busca Cadastro Geral no frontend.

  const salvarObservacoes = useCallback(async () => {
    if (!companyId) return;
    setSavingObs(true);
    try {
      await saveNote(companyId, NOTE_SECTION, observacoes);
      setObservacoesSalvas(observacoes);
    } catch (e) {
      console.error("Erro ao salvar observações:", e);
    } finally {
      setSavingObs(false);
    }
  }, [companyId, observacoes]);

  // Salvar nota por talhão
  const salvarRowObs = useCallback(async (faz, tal) => {
    if (!companyId) return false;
    const key = rowKey(faz, tal);
    const value = rowObs[key] ?? "";
    if ((rowObsSaved[key] ?? "") === value) return true;
    try {
      await saveNote(companyId, key, value);
      setRowObsSaved((prev) => ({ ...prev, [key]: value }));
      return true;
    } catch {
      return false;
    }
  }, [companyId, rowObs, rowObsSaved]);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ── PDF ──────────────────────────────────────
  // PDF desativado nesta integração para não quebrar o Vite quando html2canvas/jspdf
  // não estiverem instalados no node_modules local. O dashboard carrega normalmente.
  const handleGerarPdf = async () => {
    alert("Dashboard integrado. Para ativar PDF, rode no frontend: npm install html2canvas jspdf");
  };

  useImperativeHandle(ref, () => ({ gerarPdf: handleGerarPdf, isGerando: gerandoPdf }));

  // ── Filtro por TIPO_PROPRIEDADE ──────────────
  const tipoOf = useCallback((r) => {
    const cod = String(firstNonEmpty(
      r.COD_FAZ, r.codFaz, r.FAZENDA, r.fazenda, r.faz, r.farmCode, r.cod, r.key,
      r.rawData?.COD_FAZ, r.rawData?.codFaz, r.rawData?.FAZENDA, r.rawData?.fazenda
    )).trim();
    const tal = String(firstNonEmpty(r.TALHAO, r.talhao, r.fieldCode, r.rawData?.TALHAO, r.rawData?.talhao)).trim();
    const nomeFaz = String(firstNonEmpty(
      r.DES_FAZENDA, r.nomeFazenda, r.farmName, r.nome, r.fazendaNome, r.fazendaNomeCompleto,
      r.rawData?.DES_FAZENDA, r.rawData?.desFazenda, r.rawData?.FAZENDA, r.rawData?.fazenda
    )).trim();

    const fazKeys = [...cadastroKeyVariants(cod), ...cadastroKeyVariants(nomeFaz)];
    const talKeys = cadastroKeyVariants(tal);

    const directTipo = getTipoPropriedadeCadastro(r);
    if (directTipo && directTipo !== "SEM CADASTRO") return directTipo;

    for (const fazKey of fazKeys) {
      for (const talKey of talKeys) {
        const found = tipoPropMap[`${fazKey}|${talKey}`];
        if (found) return found;
      }
    }

    for (const fazKey of fazKeys) {
      const found = tipoPropMap[fazKey];
      if (found) return found;
    }

    return directTipo || "";
  }, [tipoPropMap]);

  const recordsRaw = useMemo(() => {
    if (dashboardPronto?.serverAggregated) return [];
    const tipoSet = new Set(tipoPropFilter);
    const fazendaFiltro = String(filterSnap.fazenda || "").trim();
    const safraFiltro = String(filterSnap.safra || "").trim();
    const dataIni = filterSnap.dataInicio ? new Date(`${filterSnap.dataInicio}T00:00:00`) : null;
    const dataFimDate = filterSnap.dataFim ? new Date(`${filterSnap.dataFim}T23:59:59`) : null;

    return allRecords.filter((r) => {
      if (tipoSet.size && !tipoSet.has(tipoOf(r) || "SEM CADASTRO")) return false;
      if (fazendaFiltro && fazendaFiltro !== "todas" && String(r.COD_FAZ ?? "").trim() !== fazendaFiltro) return false;
      if (safraFiltro && safraFiltro !== "todas") {
        const rowSafra = String(r.safra || r.SAFRA || "").trim();
        if (rowSafra && rowSafra !== safraFiltro) return false;
      }
      const d = parseDate(r.ENCERRAMENTO || r.ABERTURA);
      if (dataIni && d && d < dataIni) return false;
      if (dataFimDate && d && d > dataFimDate) return false;
      return true;
    });
  }, [dashboardPronto, allRecords, tipoOf, tipoPropFilter, filterSnap]);
  const records = useDeferredValue(recordsRaw);
  const recordsDeferred2 = records;

  // Linhas detalhadas do backend agregado. Quando serverAggregated=true, records fica vazio
  // para performance, então filtros/drilldowns da tabela de variedade precisam usar este detalhe.
  const detalheOcRows = useMemo(() => {
    const rows = dashboardPronto?.tabelas?.detalhe || dashboardPronto?.analiseDesvio?.detalhe || dashboardPronto?.detalhe || [];
    return Array.isArray(rows) ? rows : [];
  }, [dashboardPronto]);

  const normalizeTextKey = useCallback((v) =>
    String(v ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase(),
  []);

  const normalizeEstagioKey = useCallback((v) => {
    const raw = normalizeTextKey(v);
    if (!raw || raw === "ALL") return raw;
    const n = raw.match(/\d+/)?.[0];
    return n ? n : raw.replace(/[^A-Z0-9]/g, "");
  }, [normalizeTextKey]);

  const getAnyCampo = useCallback((r, keys, fallback = "") => {
    for (const key of keys) {
      const value = r?.[key];
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return fallback;
  }, []);

  const getRowEstagio = useCallback((r) => getAnyCampo(r, ["ESTAGIO", "estagio", "corte", "estagioCorte"], ""), [getAnyCampo]);
  const getRowVariedade = useCallback((r) => getAnyCampo(r, ["VARIEDADE", "variedade", "variety", "nomeVariedade"], "—"), [getAnyCampo]);

  const filterRowsByVariedadeEstagio = useCallback((rows) => {
    if (variedadeEstagioFilter === "all") return rows;
    const filtroNorm = normalizeEstagioKey(variedadeEstagioFilter);
    return rows.filter((r) => normalizeEstagioKey(getRowEstagio(r)) === filtroNorm);
  }, [variedadeEstagioFilter, normalizeEstagioKey, getRowEstagio]);

  // ── ATR Previsto da Safra ────────────────────
  const atrPrevSafra = useMemo(() => {
    const ORDER = ["ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ","JAN","FEV","MAR"];
    const m = new Date().getMonth();
    const pos = m >= 3 ? m - 3 : 9 + m;
    const meses = ORDER.slice(0, pos + 1);
    let sumW = 0, sumP = 0;
    meses.forEach((mes) => {
      const atr = atrPlanejadoMes[mes] || 0;
      const peso = moagemMensal[mes] || 0;
      if (atr > 0 && peso > 0) { sumW += atr * peso; sumP += peso; }
    });
    return sumP > 0 ? sumW / sumP : 0;
  }, [atrPlanejadoMes, moagemMensal]);

  // ── Resumo por TIPO_PROPRIEDADE ──────────────
  const resumoTipoProp = useMemo(() => {
    const parseDecLocal = (v) => {
      if (v === null || v === undefined || v === "") return 0;
      const n = parseFloat(String(v).trim().replace(",", "."));
      return isNaN(n) ? 0 : n;
    };

    const rowsFonte = dashboardPronto?.serverAggregated ? detalheOcRows : allRecords;
    const agg = new Map();

    (rowsFonte || []).forEach((r) => {
      const tipo = tipoOf(r) || "SEM CADASTRO";
      const cur = agg.get(tipo) || {
        tipo, talhoes: 0, areaCortada: 0, areaLiberada: 0,
        prodPrev: 0, prodReal: 0, atrSum: 0, atrPeso: 0,
        atrPrevSum: 0, atrPrevPeso: 0,
        idadeSum: 0, idadePeso: 0, corteSum: 0, cortePeso: 0,
      };

      cur.talhoes += 1;
      const areaCort = num(getAnyCampo(r, ["AREA CORTADA", "Area Cortada", "Área Cortada", "areaCortada", "areaColhida", "areaReal", "area", "cortada", "Cortada", "cutArea"]));
      const areaLib = num(getAnyCampo(r, ["AREA LIBERADA", "Area Liberada", "Área Liberada", "areaLiberada", "liberada", "releasedArea"]));
      const prodPrev = num(getAnyCampo(r, ["PROD. PREV.", "PROD. PREV", "prodPrev", "tonPrev", "prevTon"]));
      const prodReal = num(getAnyCampo(r, ["PROD. REAL", "prodReal", "tonReal", "ton", "realTon"]));

      cur.areaCortada += areaCort;
      cur.areaLiberada += areaLib;
      cur.prodPrev += prodPrev;
      cur.prodReal += prodReal;

      const atrRealNum = getAtrRealNumeratorBackend(r);
      const atrRealPeso = getAtrRealWeightBackend(r);
      const atrPrevNum = getAtrPrevNumeratorBackend(r);
      const atrPrevPeso = getAtrPrevWeightBackend(r);
      const atrRealDireto = num(getAnyCampo(r, ["ATR", "atr", "atrReal", "ATR REAL"]));
      const atrPrevDireto = num(getAnyCampo(r, ["ATR PREV.", "ATR PREV", "atrPrev", "atrPrevisto"]));

      if (atrRealNum > 0 && atrRealPeso > 0) { cur.atrSum += atrRealNum; cur.atrPeso += atrRealPeso; }
      else if (atrRealDireto > 0 && prodReal > 0) { cur.atrSum += atrRealDireto * prodReal; cur.atrPeso += prodReal; }

      if (atrPrevNum > 0 && atrPrevPeso > 0) { cur.atrPrevSum += atrPrevNum; cur.atrPrevPeso += atrPrevPeso; }
      else if (atrPrevDireto > 0 && prodPrev > 0) { cur.atrPrevSum += atrPrevDireto * prodPrev; cur.atrPrevPeso += prodPrev; }

      const idade = parseDecLocal(getAnyCampo(r, ["IDADE", "idade", "idadeMeses"]));
      const corte = parseDecLocal(getAnyCampo(r, ["ESTAGIO", "estagio", "corte", "estagioCorte"]));
      if (idade > 0 && areaCort > 0) { cur.idadeSum += idade * areaCort; cur.idadePeso += areaCort; }
      if (corte > 0 && areaCort > 0) { cur.corteSum += corte * areaCort; cur.cortePeso += areaCort; }

      agg.set(tipo, cur);
    });

    // Fallback: se a rota não devolver detalhe, mantém o resumo do backend.
    if (agg.size === 0 && dashboardPronto?.serverAggregated) {
      return dashboardPronto?.agrupamentos?.tipos || [];
    }

    const ORDER = ["PROPRIA", "PRÓPRIA", "ARRENDAMENTO", "ARRENDATARIO", "ARRENDATÁRIO", "PARCERIA", "FORNECEDOR", "SEM CADASTRO"];
    return Array.from(agg.values())
      .map((x) => {
        const tchPrev = x.areaCortada > 0 ? x.prodPrev / x.areaCortada : 0;
        const tchReal = x.areaCortada > 0 ? x.prodReal / x.areaCortada : 0;
        const atrMedio = x.atrPeso > 0 ? x.atrSum / x.atrPeso : 0;
        const atrPrev = x.atrPrevPeso > 0 ? x.atrPrevSum / x.atrPrevPeso : 0;
        return {
          ...x, tchPrev, tchReal, atrMedio, atrPrev,
          gapPct: x.prodPrev > 0 ? ((x.prodReal - x.prodPrev) / x.prodPrev) * 100 : 0,
          gapTchPct: tchPrev > 0 ? calcGapPct(tchReal, tchPrev) : 0,
          gapAtrPct: atrPrev > 0 ? calcGapPct(atrMedio, atrPrev) : 0,
          idadeMeses: x.idadePeso > 0 ? x.idadeSum / x.idadePeso : 0,
          idadeCorte: x.cortePeso > 0 ? x.corteSum / x.cortePeso : 0,
        };
      })
      .sort((a, b) => {
        const ai = ORDER.indexOf(normalizeCadastroKey(a.tipo));
        const bi = ORDER.indexOf(normalizeCadastroKey(b.tipo));
        if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
        return String(a.tipo).localeCompare(String(b.tipo), "pt-BR");
      });
  }, [dashboardPronto, detalheOcRows, allRecords, tipoOf, getAnyCampo]);

  // ── KPIs principais ──────────────────────────
  const kpis = useMemo(() => {
    if (dashboardPronto?.serverAggregated) {
      const c = dashboardPronto.cards || {};
      return {
        total: dashboardPronto.totalRegistros || 0,
        ordens: c.ocsFechadas || dashboardPronto.totalRegistros || 0,
        areaLiberada: c.areaLiberada || 0,
        areaCortada: c.areaColhida || 0,
        aderencia: c.aderencia || 0,
        prodPrev: c.prodPrev || c.producaoPrevista || 0,
        prodReal: c.prodReal || c.producaoReal || 0,
        desvio: (c.prodReal || c.producaoReal || 0) - (c.prodPrev || c.producaoPrevista || 0),
        desvioPct: c.variacaoPct || 0,
        tchPrevMed: c.tchPrev || c.tchPrevistoMedio || 0,
        tchRealMed: c.tchReal || c.tchRealMedio || 0,
        gapTch: c.gapTch || 0,
        gapTchPct: c.gapTchPct || 0,
        atrMedio: c.atrMedio || c.atrReal || 0,
        atrPrev: c.atrPrev || c.atrPrevisto || 0,
        atrGap: c.atrGap || 0,
        atrGapPct: c.atrGapPct || 0,
        idadeMediaMeses: c.idadeMediaMeses || dashboardPronto.resumo?.idadeMeses || 0,
        idadeMediaCorte: c.idadeMediaCorte || dashboardPronto.resumo?.idadeCorte || 0,
      };
    }
    const total = records.length;
    const ordens = new Set(records.map((r) => r["Nº ORDEM"])).size || total;
    const areaLiberada = records.reduce((s, r) => s + num(r["AREA LIBERADA"]), 0);
    const areaCortada = records.reduce((s, r) => s + num(r["AREA CORTADA"]), 0);
    const aderencia = areaLiberada > 0 ? (areaCortada / areaLiberada) * 100 : 0;
    const prodPrev = records.reduce((s, r) => s + num(r["PROD. PREV."]), 0);
    const prodReal = records.reduce((s, r) => s + num(r["PROD. REAL"]), 0);
    const desvio = prodReal - prodPrev;
    const desvioPct = prodPrev > 0 ? calcGapPct(prodReal, prodPrev) : 0;
    const tchPrevMed = areaCortada > 0 ? prodPrev / areaCortada : 0;
    const tchRealMed = areaCortada > 0 ? prodReal / areaCortada : 0;
    const gapTch = tchRealMed - tchPrevMed;
    const gapTchPct = tchPrevMed > 0 ? calcGapPct(tchRealMed, tchPrevMed) : 0;
    let atrSum = 0, atrPeso = 0, atrPrevSum = 0, atrPrevPeso = 0;
    records.forEach((r) => {
      const a = num(r.ATR);
      const pReal = num(r["PROD. REAL"]);
      const pPrev = num(r["PROD. PREV."]);
      const atrRealNum = getAtrRealNumeratorBackend(r);
      const atrRealPeso = getAtrRealWeightBackend(r);
      const atrPrevNum = getAtrPrevNumeratorBackend(r);
      const atrPrevPesoLinha = getAtrPrevWeightBackend(r);
      if (atrRealNum > 0 && atrRealPeso > 0) { atrSum += atrRealNum; atrPeso += atrRealPeso; }
      if (atrPrevNum > 0 && atrPrevPesoLinha > 0) { atrPrevSum += atrPrevNum; atrPrevPeso += atrPrevPesoLinha; }
    });
    const atrMedio = atrPeso > 0 ? atrSum / atrPeso : 0;
    const atrPrevMedio = atrPrevPeso > 0 ? atrPrevSum / atrPrevPeso : 0;
    const atrGap = atrMedio - atrPrevMedio;
    const atrGapPct = atrPrevMedio > 0 ? calcGapPct(atrMedio, atrPrevMedio) : 0;
    let idadeNumPeso = 0, idadeDenPeso = 0, corteNumPeso = 0, corteDenPeso = 0;
    records.forEach((r) => {
      const parseDecL = (v) => {
        if (v === null || v === undefined || v === "") return 0;
        const n = parseFloat(String(v).trim().replace(",", "."));
        return isNaN(n) ? 0 : n;
      };
      const area = num(r["AREA CORTADA"] ?? r.areaReal ?? r.area ?? r.areaCortada);
      const idade = parseDecL(r.IDADE);
      const corte = parseDecL(r.ESTAGIO);
      if (area > 0 && idade > 0) { idadeNumPeso += idade * area; idadeDenPeso += area; }
      if (area > 0 && corte > 0) { corteNumPeso += corte * area; corteDenPeso += area; }
    });
    return {
      total, ordens, areaLiberada, areaCortada, aderencia,
      prodPrev, prodReal, desvio, desvioPct, tchPrevMed, tchRealMed,
      gapTch, gapTchPct, atrMedio, atrPrev: atrPrevMedio, atrGap, atrGapPct,
      idadeMediaMeses: idadeDenPeso > 0 ? idadeNumPeso / idadeDenPeso : 0,
      idadeMediaCorte: corteDenPeso > 0 ? corteNumPeso / corteDenPeso : 0,
    };
  }, [dashboardPronto, records]);

  // ── Datas header ─────────────────────────────
  const headerInfo = useMemo(() => {
    const formatInputD = (v) => {
      if (!v) return "";
      const d = new Date(`${v}T12:00:00`);
      return Number.isNaN(d.getTime()) ? "" : `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
    };
    const selectedPeriodo = dataInicio || dataFim
      ? `${formatInputD(dataInicio) || "início"} – ${formatInputD(dataFim) || "hoje"}`
      : "";
    if (dashboardPronto?.serverAggregated && dashboardPronto.headerInfo) {
      return { ...dashboardPronto.headerInfo, periodo: selectedPeriodo || dashboardPronto.headerInfo.periodo || "—" };
    }
    let safra = "";
    let minDate = null, maxDate = null;
    records.forEach((r) => {
      if (r.PLANTIO) {
        const s = String(r.PLANTIO).slice(0, 4);
        if (/^\d{4}$/.test(s)) {
          const y = parseInt(s, 10);
          const s2 = `${y}/${y + 1}`;
          if (!safra || s2 > safra) safra = s2;
        }
      }
      const d = parseDate(r.ENCERRAMENTO);
      if (d) {
        if (!minDate || d < minDate) minDate = d;
        if (!maxDate || d > maxDate) maxDate = d;
      }
    });
    const formatD = (d) => d ? `${String(d.getUTCDate()).padStart(2,"0")}/${String(d.getUTCMonth()+1).padStart(2,"0")}/${d.getUTCFullYear()}` : "—";
    const periodo = selectedPeriodo || (minDate && maxDate ? `${formatD(minDate)} – ${formatD(maxDate)}` : "—");
    const now = new Date();
    const atualizadoEm = `${String(now.getDate()).padStart(2,"0")}/${String(now.getMonth()+1).padStart(2,"0")}/${now.getFullYear()}`;
    return { safra: safra || "—", periodo, atualizadoEm };
  }, [dashboardPronto, records, dataInicio, dataFim]);

  // ── TCH Histórico ATR por corte vem consolidado do backend ──────────────

  // ── TCH por Estágio ──────────────────────────
  const tchPorEstagio = useMemo(() => {
    if (dashboardPronto?.serverAggregated) {
      return (dashboardPronto?.agrupamentos?.estagios || []).map((x) => {
        const estagio = x.estagio ?? x.key ?? x.label;
        const estStr = String(estagio ?? '').trim();
        const estInt = estStr.match(/\d+/)?.[0] || '';
        const tchReal = x.tchReal || x.real || 0;
        const tchPrev = x.tchPrev || x.prev || 0;
        const atr = x.atrReal || x.atr || 0;
        const atrPrev = x.atrPrev || 0;
        const tchAnoAnt = historicoTchPorCorte[estStr] ?? historicoTchPorCorte[estInt] ?? 0;
        const areaAnoAnt = historicoAreaPorCorte[estStr] ?? historicoAreaPorCorte[estInt] ?? 0;
        const atrAnoAnt = historicoAtrPorCorte[estStr] ?? historicoAtrPorCorte[estInt] ?? 0;
        const areaReal = x.areaReal || x.area || 0;
        const areaPlan = x.areaPlanejada ?? x.areaPlan ?? x.areaPlanejadaCorte ?? 0;
        const realPct = areaPlan > 0 ? (areaReal / areaPlan) * 100 : 0;
        return {
          ...x, estagio, tchPrev, tchReal, atr, atrPrev,
          n: x.n || x.count || 0, areaReal, tonReal: x.tonReal || x.prodReal || 0, tonPrev: x.tonPrev || x.prodPrev || 0,
          areaPlan, areaPlanejada: areaPlan, realPct, percentualRealizado: realPct, evolucaoPct: Math.max(0, Math.min(100, realPct)),
          gapPct: tchPrev > 0 ? calcGapPct(tchReal, tchPrev) : 0,
          tchAnoAnt, areaAnoAnt, gapAnoAntPct: tchAnoAnt > 0 ? calcGapPct(tchReal, tchAnoAnt) : 0,
          atrAnoAnt, gapAtrPct: atrPrev > 0 ? calcGapPct(atr, atrPrev) : 0, gapAtrAnoAntPct: atrAnoAnt > 0 ? calcGapPct(atr, atrAnoAnt) : 0,
        };
      });
    }
    const map = new Map();
    recordsDeferred2.forEach((r) => {
      const e = (r.ESTAGIO || "—").toString().trim() || "—";
      const cur = map.get(e) || { prodPrev: 0, prodReal: 0, areaPrev: 0, areaReal: 0, n: 0, atrSum: 0, atrPeso: 0, atrPrevSum: 0, atrPrevPeso: 0 };
      cur.prodPrev += num(r["PROD. PREV."]);
      cur.prodReal += num(r["PROD. REAL"]);
      cur.areaPrev += num(r["AREA LIBERADA"]);
      cur.areaReal += num(r["AREA CORTADA"]);
      cur.n += 1;
      const atrV = num(r.ATR);
      const pesoV = num(r["PROD. REAL"] ?? r.tonReal ?? r.ton ?? r.prodReal);
      const atrRealNum = getAtrRealNumeratorBackend(r);
      const atrRealPeso = getAtrRealWeightBackend(r);
      const atrPrevNum = getAtrPrevNumeratorBackend(r);
      const atrPrevPesoLinha = getAtrPrevWeightBackend(r);
      if (atrRealNum > 0 && atrRealPeso > 0) { cur.atrSum += atrRealNum; cur.atrPeso += atrRealPeso; }
      if (atrPrevNum > 0 && atrPrevPesoLinha > 0) { cur.atrPrevSum += atrPrevNum; cur.atrPrevPeso += atrPrevPesoLinha; }
      map.set(e, cur);
    });
    return Array.from(map.entries())
      .map(([estagio, v]) => {
        const tchPrev = v.areaReal > 0 ? v.prodPrev / v.areaReal : 0;
        const tchReal = v.areaReal > 0 ? v.prodReal / v.areaReal : 0;
        const gapPct = tchPrev > 0 ? calcGapPct(tchReal, tchPrev) : 0;
        const estStr = String(estagio).trim();
        const estInt = estStr.match(/\d+/)?.[0] || "";
        const tchAnoAnt = historicoTchPorCorte[estStr] ?? historicoTchPorCorte[estInt] ?? 0;
        const areaAnoAnt = historicoAreaPorCorte[estStr] ?? historicoAreaPorCorte[estInt] ?? 0;
        const gapAnoAntPct = tchAnoAnt > 0 ? calcGapPct(tchReal, tchAnoAnt) : 0;
        const atrMed = v.atrPeso > 0 ? v.atrSum / v.atrPeso : 0;
        const atrPrevMed = v.atrPrevPeso > 0 ? v.atrPrevSum / v.atrPrevPeso : 0;
        const gapAtrPct = atrPrevMed > 0 ? calcGapPct(atrMed, atrPrevMed) : 0;
        const atrAnoAnt = historicoAtrPorCorte[estStr] ?? historicoAtrPorCorte[estInt] ?? 0;
        const gapAtrAnoAntPct = atrAnoAnt > 0 ? calcGapPct(atrMed, atrAnoAnt) : 0;
        return {
          estagio, tchPrev, tchReal, gapPct, n: v.n, areaReal: v.areaReal, tonReal: v.prodReal,
          tonPrev: v.prodPrev, tchAnoAnt, areaAnoAnt, gapAnoAntPct, atr: atrMed,
          atrPrev: atrPrevMed, gapAtrPct, atrAnoAnt, gapAtrAnoAntPct,
          atrSum: v.atrSum, atrPeso: v.atrPeso, atrPrevSum: v.atrPrevSum, atrPrevPeso: v.atrPrevPeso,
        };
      })
      .filter((x) => x.tchPrev > 0 || x.tchReal > 0)
      .sort((a, b) => {
        const na = parseFloat(String(a.estagio).replace(/\D/g, "")) || 999;
        const nb = parseFloat(String(b.estagio).replace(/\D/g, "")) || 999;
        return na - nb;
      });
  }, [dashboardPronto, recordsDeferred2, historicoTchPorCorte, historicoAreaPorCorte, historicoAtrPorCorte]);

  // ── TCH/ATR Mensal ───────────────────────────
  const tchAtrMensal = useMemo(() => {
    if (dashboardPronto?.serverAggregated) return dashboardPronto?.graficos?.tchAtrMensal || [];
    const ORDER = ["ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];
    const monthKeyFromDate = (d) => (d.getUTCMonth() >= 3 && d.getUTCMonth() <= 11 ? ORDER[d.getUTCMonth() - 3] : null);
    // Mostrar todos os meses da safra no eixo (ABR..MAR), igual ao relatório do chefe.
    // Mesmo que não exista movimento no mês, o ponto aparece zerado e a meta permanece visível.
    const mesesComDados = new Set(ORDER);

    const acc = {};
    ORDER.forEach((m) => {
      acc[m] = { ton: 0, area: 0, atrSum: 0, atrPeso: 0, atrPrevSum: 0, atrPrevPeso: 0, tonPrev: 0, areaPrev: 0, tchPrevSum: 0, tchPrevPeso: 0 };
    });

    recordsDeferred2.forEach((r) => {
      const d = parseDate(r.ENCERRAMENTO);
      if (!d) return;
      const mKey = monthKeyFromDate(d);
      if (!mKey || !acc[mKey]) return;
      const ton = num(r["PROD. REAL"] ?? r.tonReal ?? r.ton ?? r.prodReal);
      const area = num(r["AREA CORTADA"]);
      const atr = num(r.ATR);
      const tonP = num(r["PROD. PREV."]);
      const areaP = num(r["AREA LIBERADA"]);
      const tchPrevRel = getTchPrevRelatorio(r);
      if (ton > 0) acc[mKey].ton += ton;
      if (area > 0) acc[mKey].area += area;
      if (tonP > 0) acc[mKey].tonPrev += tonP;
      if (areaP > 0) acc[mKey].areaPrev += areaP;
      if (tchPrevRel > 0 && area > 0) { acc[mKey].tchPrevSum += tchPrevRel * area; acc[mKey].tchPrevPeso += area; }
      const atrRealNum = getAtrRealNumeratorBackend(r);
      const atrRealPeso = getAtrRealWeightBackend(r);
      const atrPrevNum = getAtrPrevNumeratorBackend(r);
      const atrPrevPeso = getAtrPrevWeightBackend(r);
      if (atrRealNum > 0 && atrRealPeso > 0) { acc[mKey].atrSum += atrRealNum; acc[mKey].atrPeso += atrRealPeso; }
      if (atrPrevNum > 0 && atrPrevPeso > 0) { acc[mKey].atrPrevSum += atrPrevNum; acc[mKey].atrPrevPeso += atrPrevPeso; }
    });

    const rows = ORDER.filter((m) => mesesComDados.has(m)).map((mes) => {
      const a = acc[mes];
      const atrPrevRelatorio = a.atrPrevPeso > 0 ? a.atrPrevSum / a.atrPrevPeso : 0;
      return {
        mes,
        tch: a.area > 0 ? a.ton / a.area : 0,
        tchPrev: a.area > 0 ? a.tonPrev / a.area : 0,
        atr: a.atrPeso > 0 ? a.atrSum / a.atrPeso : 0,
        metaAtr: atrPrevRelatorio,
        ton: a.ton, area: a.area, atrSum: a.atrSum, atrPeso: a.atrPeso, atrPrevSum: a.atrPrevSum, atrPrevPeso: a.atrPrevPeso,
        tonPrev: a.tonPrev, areaPrev: a.areaPrev,
      };
    });

    if (!rows.length) return [];

    const totalTon = rows.reduce((s, x) => s + x.ton, 0);
    const totalArea = rows.reduce((s, x) => s + x.area, 0);
    const totalAtrSum = rows.reduce((s, x) => s + x.atrSum, 0);
    const totalAtrPeso = rows.reduce((s, x) => s + x.atrPeso, 0);
    const totalTonPrev = rows.reduce((s, x) => s + x.tonPrev, 0);
    const totalAreaPrev = rows.reduce((s, x) => s + x.areaPrev, 0);
    const totalTchPrevSum = rows.reduce((s, x) => s + ((x.tchPrev || 0) * (x.area || 0)), 0);
    const totalTchPrevPeso = rows.reduce((s, x) => s + (x.area || 0), 0);
    const totalAtrPrevSum = rows.reduce((s, x) => s + (x.atrPrevSum || 0), 0);
    const totalAtrPrevPeso = rows.reduce((s, x) => s + (x.atrPrevPeso || 0), 0);
    rows.push({
      mes: "ACUM",
      tch: totalArea > 0 ? totalTon / totalArea : 0,
      tchPrev: totalArea > 0 ? totalTonPrev / totalArea : 0,
      atr: totalAtrPeso > 0 ? totalAtrSum / totalAtrPeso : 0,
      metaAtr: totalAtrPrevPeso > 0 ? totalAtrPrevSum / totalAtrPrevPeso : 0,
      ton: totalTon, area: totalArea, atrSum: totalAtrSum, atrPeso: totalAtrPeso, atrPrevSum: totalAtrPrevSum, atrPrevPeso: totalAtrPrevPeso,
      tonPrev: totalTonPrev, areaPrev: totalAreaPrev,
    });
    return rows;
  }, [dashboardPronto, recordsDeferred2, moagemMensal, atrPlanejadoMes]);

  // ── TCH/ATR por Variedade ────────────────────
  const prodVariedadeComp = useMemo(() => {
    if (dashboardPronto?.serverAggregated && variedadeEstagioFilter === "all") return dashboardPronto?.agrupamentos?.variedades || [];
    const baseRows = dashboardPronto?.serverAggregated ? detalheOcRows : recordsDeferred2;
    const filteredRows = filterRowsByVariedadeEstagio(baseRows);
    const recs = filteredRows.length || variedadeEstagioFilter === "all" ? filteredRows : baseRows;
    const map = new Map();
    recs.forEach((r) => {
      const v = String(getRowVariedade(r) || "—").trim() || "—";
      const cur = map.get(v) || { prev: 0, real: 0, areaPrev: 0, areaReal: 0, n: 0, atrSum: 0, atrPeso: 0, atrPrevSum: 0, atrPrevPeso: 0 };
      cur.prev += num(r["PROD. PREV."] ?? r.tonPrev ?? r.prodPrev);
      cur.real += num(r["PROD. REAL"] ?? r.tonReal ?? r.ton ?? r.prodReal);
      cur.areaPrev += num(r["AREA LIBERADA"] ?? r.areaLib ?? r.areaLiberada ?? r.areaPrev);
      cur.areaReal += num(r["AREA CORTADA"] ?? r.areaReal ?? r.area ?? r.areaCortada);
      cur.n += 1;
      const atrV = num(r.ATR);
      const pesoV = num(r["PROD. REAL"]);
      const atrRealNum = getAtrRealNumeratorBackend(r);
      const atrRealPeso = getAtrRealWeightBackend(r);
      const atrPrevNum = getAtrPrevNumeratorBackend(r);
      const atrPrevPesoLinha = getAtrPrevWeightBackend(r);
      if (atrRealNum > 0 && atrRealPeso > 0) { cur.atrSum += atrRealNum; cur.atrPeso += atrRealPeso; }
      if (atrPrevNum > 0 && atrPrevPesoLinha > 0) { cur.atrPrevSum += atrPrevNum; cur.atrPrevPeso += atrPrevPesoLinha; }
      map.set(v, cur);
    });
    return Array.from(map.entries())
      .map(([variedade, v]) => {
        const tchPrev = v.areaReal > 0 ? v.prev / v.areaReal : 0;
        const tchReal = v.areaReal > 0 ? v.real / v.areaReal : 0;
        const atrMed = v.atrPeso > 0 ? v.atrSum / v.atrPeso : 0;
        const atrPrevMed = v.atrPrevPeso > 0 ? v.atrPrevSum / v.atrPrevPeso : 0;
        return {
          variedade, prev: tchPrev, real: tchReal,
          gapPct: tchPrev > 0 ? calcGapPct(tchReal, tchPrev) : 0,
          areaReal: v.areaReal, tonReal: v.real, tonPrev: v.prev, n: v.n,
          atr: atrMed, atrPrev: atrPrevMed,
          gapAtrPct: atrPrevMed > 0 ? calcGapPct(atrMed, atrPrevMed) : 0,
          atrSum: v.atrSum, atrPeso: v.atrPeso, atrPrevSum: v.atrPrevSum, atrPrevPeso: v.atrPrevPeso,
        };
      })
      .filter((x) => x.prev > 0 || x.real > 0)
      .sort((a, b) => b.real - a.real)
      .slice(0, 15);
  }, [dashboardPronto, recordsDeferred2, detalheOcRows, variedadeEstagioFilter, filterRowsByVariedadeEstagio, getRowVariedade]);

  // Helper usado pelas tabelas/memos precisa ficar antes de qualquer useMemo que chame ele
  const parseDecLocalMemo = useCallback((v) => {
    if (v === null || v === undefined || v === "") return 0;
    const n = parseFloat(String(v).trim().replace(",", "."));
    return isNaN(n) ? 0 : n;
  }, []);

  // ── Tabela TCH/ATR por Variedade ─────────────
  const tchPorVariedadeTabela = useMemo(() => {
    if (dashboardPronto?.serverAggregated && variedadeEstagioFilter === "all") {
      return (dashboardPronto?.agrupamentos?.variedades || []).map((x) => {
        const variedade = String(x.variedade ?? x.key ?? x.label ?? "—").trim() || "—";
        const areaReal = Number(x.areaReal ?? x.area ?? x.areaCortada ?? 0);
        const tonReal = Number(x.tonReal ?? x.prodReal ?? x.realTon ?? 0);
        const tonPrev = Number(x.tonPrev ?? x.prodPrev ?? x.prevTon ?? 0);
        const tchPrev = Number(x.tchPrev ?? x.prev ?? (areaReal > 0 ? tonPrev / areaReal : 0));
        const tchReal = Number(x.tchReal ?? x.real ?? (areaReal > 0 ? tonReal / areaReal : 0));
        const atr = Number(x.atrReal ?? x.atr ?? 0);
        const atrPrev = Number(x.atrPrev ?? x.metaAtr ?? 0);
        const areaPlan = Number(x.areaPlanejada ?? x.areaPlan ?? areaPlanVariedade[variedade] ?? 0);
        const realPct = areaPlan > 0 ? (areaReal / areaPlan) * 100 : 0;
        return {
          ...x,
          variedade,
          areaReal,
          tonReal,
          tonPrev,
          idadeMedia: Number(x.idadeMedia ?? x.idadeMediaMeses ?? x.idadeMeses ?? x.idade ?? 0),
          tchPrev,
          tchReal,
          gapPct: tchPrev > 0 ? calcGapPct(tchReal, tchPrev) : 0,
          atrPrev,
          atr,
          gapAtrPct: atrPrev > 0 ? calcGapPct(atr, atrPrev) : 0,
          areaPlan,
          areaPlanejada: areaPlan,
          realPct,
          evolucaoPct: Math.max(0, Math.min(100, realPct)),
        };
      }).filter((x) => x.areaReal > 0 || x.tonReal > 0 || x.areaPlan > 0).sort((a, b) => b.tonReal - a.tonReal);
    }

    const baseRows = dashboardPronto?.serverAggregated ? detalheOcRows : recordsDeferred2;
    const filteredRows = filterRowsByVariedadeEstagio(baseRows);
    const recs = filteredRows.length || variedadeEstagioFilter === "all" ? filteredRows : baseRows;
    const map = new Map();
    recs.forEach((r) => {
      const variedade = String(getRowVariedade(r) ?? "—").trim() || "—";
      const cur = map.get(variedade) || {
        areaReal: 0, areaPrev: 0, tonReal: 0, tonPrev: 0, n: 0,
        atrSum: 0, atrPeso: 0, atrPrevSum: 0, atrPrevPeso: 0,
        idadeNum: 0, idadeDen: 0,
      };
      const area = num(r["AREA CORTADA"] ?? r.areaReal ?? r.area ?? r.areaCortada);
      const areaPrev = num(r["AREA LIBERADA"] ?? r.areaLib ?? r.areaLiberada ?? r.areaPrev);
      const ton = num(r["PROD. REAL"] ?? r.tonReal ?? r.ton ?? r.prodReal);
      const tonPrev = num(r["PROD. PREV."] ?? r.tonPrev ?? r.prodPrev);
      const idade = parseDecLocalMemo(r.IDADE ?? r.idade ?? r.idadeMedia ?? r.idadeMeses);
      const atrRealNum = getAtrRealNumeratorBackend(r);
      const atrRealPeso = getAtrRealWeightBackend(r);
      const atrPrevNum = getAtrPrevNumeratorBackend(r);
      const atrPrevPesoLinha = getAtrPrevWeightBackend(r);
      cur.areaReal += area;
      cur.areaPrev += areaPrev;
      cur.tonReal += ton;
      cur.tonPrev += tonPrev;
      cur.n += 1;
      if (area > 0 && idade > 0) { cur.idadeNum += idade * area; cur.idadeDen += area; }
      if (atrRealNum > 0 && atrRealPeso > 0) { cur.atrSum += atrRealNum; cur.atrPeso += atrRealPeso; }
      if (atrPrevNum > 0 && atrPrevPesoLinha > 0) { cur.atrPrevSum += atrPrevNum; cur.atrPrevPeso += atrPrevPesoLinha; }
      map.set(variedade, cur);
    });

    return Array.from(map.entries()).map(([variedade, v]) => {
      const tchPrev = v.areaReal > 0 ? v.tonPrev / v.areaReal : 0;
      const tchReal = v.areaReal > 0 ? v.tonReal / v.areaReal : 0;
      const atr = v.atrPeso > 0 ? v.atrSum / v.atrPeso : 0;
      const atrPrev = v.atrPrevPeso > 0 ? v.atrPrevSum / v.atrPrevPeso : 0;
      const areaPlan = Number(areaPlanVariedade[variedade] ?? 0);
      const realPct = areaPlan > 0 ? (v.areaReal / areaPlan) * 100 : 0;
      return {
        variedade,
        areaReal: v.areaReal,
        areaPrev: v.areaPrev,
        tonReal: v.tonReal,
        tonPrev: v.tonPrev,
        n: v.n,
        idadeMedia: v.idadeDen > 0 ? v.idadeNum / v.idadeDen : 0,
        tchPrev,
        tchReal,
        gapPct: tchPrev > 0 ? calcGapPct(tchReal, tchPrev) : 0,
        atrPrev,
        atr,
        gapAtrPct: atrPrev > 0 ? calcGapPct(atr, atrPrev) : 0,
        areaPlan,
        areaPlanejada: areaPlan,
        realPct,
        evolucaoPct: Math.max(0, Math.min(100, realPct)),
      };
    }).filter((x) => x.tchPrev > 0 || x.tchReal > 0 || x.tonReal > 0 || x.areaPlan > 0).sort((a, b) => b.tonReal - a.tonReal);
  }, [dashboardPronto, recordsDeferred2, detalheOcRows, variedadeEstagioFilter, areaPlanVariedade, parseDecLocalMemo, filterRowsByVariedadeEstagio, getRowVariedade]);

  // ── TCH por Fazenda (Gantt) ──────────────────
  const tchPorFazenda = useMemo(() => {
    if (dashboardPronto?.serverAggregated) {
      return (dashboardPronto?.agrupamentos?.fazendas || []).map((x) => ({
        ...x,
        cod: x.cod || x.fazenda || x.key,
        nome: x.nome || dashboardPronto?.fazendaNomes?.[String(x.cod || x.fazenda || x.key).trim()] || x.fazenda || x.key,
        label: x.label || `${x.fazenda || x.key}||${x.nome || dashboardPronto?.fazendaNomes?.[String(x.cod || x.fazenda || x.key).trim()] || x.fazenda || x.key}`,
        tchPrev: x.tchPrev || x.prev || 0,
        tchReal: x.tchReal || x.real || 0,
        n: x.n || x.count || 0,
        areaReal: x.areaReal || x.area || 0,
        areaPrev: x.areaPrev || 0,
        tonReal: x.tonReal || x.prodReal || 0,
        tonPrev: x.tonPrev || x.prodPrev || 0,
      })).sort((a, b) => (b.gapPct || 0) - (a.gapPct || 0)).slice(0, 30);
    }
    const map = new Map();
    recordsDeferred2.forEach((r) => {
      const faz = String(r.COD_FAZ ?? "—").trim() || "—";
      const cur = map.get(faz) || { prodPrev: 0, prodReal: 0, areaPrev: 0, areaReal: 0, n: 0 };
      cur.prodPrev += num(r["PROD. PREV."]);
      cur.prodReal += num(r["PROD. REAL"]);
      cur.areaPrev += num(r["AREA LIBERADA"]);
      cur.areaReal += num(r["AREA CORTADA"]);
      cur.n += 1;
      map.set(faz, cur);
    });
    return Array.from(map.entries())
      .map(([cod, v]) => {
        const tchPrev = v.areaReal > 0 ? v.prodPrev / v.areaReal : 0;
        const tchReal = v.areaReal > 0 ? v.prodReal / v.areaReal : 0;
        return {
          cod,
          nome: fazendaNomes[cod] || cod,
          label: `${cod}||${fazendaNomes[cod] || cod}`,
          tchPrev,
          tchReal,
          gapPct: tchPrev > 0 ? calcGapPct(tchReal, tchPrev) : 0,
          n: v.n, areaReal: v.areaReal, areaPrev: v.areaPrev,
          tonReal: v.prodReal, tonPrev: v.prodPrev,
        };
      })
      .filter((x) => x.tchPrev > 0 || x.tchReal > 0)
      .sort((a, b) => b.gapPct - a.gapPct)
      .slice(0, 30);
  }, [dashboardPronto, recordsDeferred2, fazendaNomes]);

  // ── Análise de Desvio (memos menores + lazy) ────────────────────────

  const faixaGap = useMemo(() => {
    if (dashboardPronto?.serverAggregated && dashboardPronto.analiseDesvio?.faixaGap) return dashboardPronto.analiseDesvio.faixaGap;
    const faixas = [
      { label: "< -15%", min: -Infinity, max: -15, color: "#ef4444" },
      { label: "-15% a -10%", min: -15, max: -10, color: "#f97316" },
      { label: "-10% a -5%", min: -10, max: -5, color: "#eab308" },
      { label: "-5% a 0%", min: -5, max: 0, color: "#84cc16" },
      { label: "0% a +5%", min: 0, max: 5, color: "#22c55e" },
      { label: "+5% a +10%", min: 5, max: 10, color: "#10b981" },
      { label: "> +10%", min: 10, max: Infinity, color: "#06b6d4" },
    ];
    return faixas.map((f) => {
      let count = 0, area = 0;
      recordsDeferred2.forEach((r) => {
        const prev = getTchPrevRelatorio(r);
        if (prev <= 0) return;
        const gp = calcGapPct(getTchRealRelatorio(r), prev);
        if (gp > f.min && gp <= f.max) { count += 1; area += num(r["AREA CORTADA"]); }
      });
      return { ...f, count, area };
    }).filter((x) => x.count > 0);
  }, [dashboardPronto, recordsDeferred2]);

  const piorTalhoes = useMemo(() => {
    if (dashboardPronto?.serverAggregated && dashboardPronto.analiseDesvio?.piorTalhoes) return dashboardPronto.analiseDesvio.piorTalhoes.slice(0, 50);
    return recordsDeferred2.map((r) => {
      const tch = getTchRealRelatorio(r);
      const prev = getTchPrevRelatorio(r);
      const gapPct = prev > 0 ? calcGapPct(tch, prev) : 0;
      return {
        faz: String(r.COD_FAZ ?? "").trim(), tal: String(r.TALHAO ?? "").trim(), parte: String(r.PARTE ?? "").trim(),
        estagio: String(r.ESTAGIO ?? "").trim(), variedade: String(r.VARIEDADE ?? "").trim(), areaReal: num(r["AREA CORTADA"]),
        tchPrev: prev, tchReal: tch, gapPct, tonReal: num(r["PROD. REAL"]), tonPrev: num(r["PROD. PREV."]),
        atr: num(r.ATR), dm: num(r.DM), tempo: parseTempo(r.TEMPO), abertura: r.ABERTURA, encerramento: r.ENCERRAMENTO,
      };
    }).filter((x) => x.areaReal > 0).sort((a, b) => a.gapPct - b.gapPct).slice(0, 50);
  }, [dashboardPronto, recordsDeferred2]);

  const atrData = useMemo(() => {
    if (dashboardPronto?.serverAggregated && dashboardPronto.analiseDesvio?.atrData) {
      const data = dashboardPronto.analiseDesvio.atrData || [];
      return data.length > 300 ? data.filter((_, i) => i % Math.ceil(data.length / 300) === 0).slice(0, 300) : data;
    }
    const allAtrPoints = recordsDeferred2
      .filter((r) => getTchRealRelatorio(r) > 0 && num(r.ATR) > 0)
      .map((r) => ({
        x: getTchRealRelatorio(r),
        y: num(r.ATR),
        z: num(r["AREA CORTADA"]),
        faz: String(r.COD_FAZ ?? "").trim(),
        tal: String(r.TALHAO ?? "").trim(),
        estagio: String(r.ESTAGIO ?? "").trim(),
        variedade: String(r.VARIEDADE ?? "").trim(),
        idade: num(r.IDADE ?? r["IDADE MESES"] ?? r.idade),
        ton: num(r["PROD. REAL"] ?? r.tonReal ?? r.ton),
      }));
    return allAtrPoints.length > 300 ? allAtrPoints.filter((_, i) => i % Math.ceil(allAtrPoints.length / 300) === 0).slice(0, 300) : allAtrPoints;
  }, [dashboardPronto, recordsDeferred2]);

  const premissasColheitaAtivas = useMemo(() => {
    const fromDashboard = dashboardPronto?.premissas || {};
    return { ...(fromDashboard || {}), ...(colheitaPremissas || {}) };
  }, [dashboardPronto, colheitaPremissas]);

  const fechamentoOcAtrTchConfig = useMemo(() => {
    const source = premissasColheitaAtivas?.fechamentoOcAtrTchConfig || DEFAULT_FECHAMENTO_OC_ATR_TCH_CONFIG;
    const defaults = DEFAULT_FECHAMENTO_OC_ATR_TCH_CONFIG;
    const quadrantes = {};
    Object.entries(defaults.quadrantes).forEach(([key, def]) => {
      const item = source?.quadrantes?.[key] || {};
      quadrantes[key] = {
        ...def,
        ...item,
        tchMin: num(item.tchMin ?? def.tchMin),
        tchMax: num(item.tchMax ?? def.tchMax),
        atrMin: num(item.atrMin ?? def.atrMin),
        atrMax: num(item.atrMax ?? def.atrMax),
        color: item.color || def.color,
        label: item.label || def.label,
      };
    });
    const tchDivisaoCalculada = firstNonEmpty(
      source?.tchDivisao,
      source?.tchMeta,
      source?.metaTch,
      premissasColheitaAtivas?.tch,
      premissasColheitaAtivas?.tchMeta,
      premissasColheitaAtivas?.metaTch,
      quadrantes.altoAtrAltoTch?.tchMin,
      quadrantes.baixoAtrAltoTch?.tchMin,
      quadrantes.altoAtrBaixoTch?.tchMax,
      quadrantes.baixoAtrBaixoTch?.tchMax,
      defaults.tchDivisao
    );
    const atrDivisaoCalculada = firstNonEmpty(
      source?.atrDivisao,
      source?.atrMeta,
      source?.metaAtr,
      premissasColheitaAtivas?.atr,
      premissasColheitaAtivas?.atrMeta,
      premissasColheitaAtivas?.metaAtr,
      quadrantes.altoAtrAltoTch?.atrMin,
      quadrantes.altoAtrBaixoTch?.atrMin,
      quadrantes.baixoAtrAltoTch?.atrMax,
      quadrantes.baixoAtrBaixoTch?.atrMax,
      defaults.atrDivisao
    );
    return {
      tchDivisao: num(tchDivisaoCalculada),
      atrDivisao: num(atrDivisaoCalculada),
      quadrantes,
    };
  }, [premissasColheitaAtivas]);

  const idadeIdealMeses = useMemo(() => {
    const value = firstNonEmpty(
      premissasColheitaAtivas?.idadeIdealMeses,
      premissasColheitaAtivas?.idadeIdealMediaMeses,
      premissasColheitaAtivas?.idadeIdeal,
      premissasColheitaAtivas?.idadeIdealCorte,
      premissasColheitaAtivas?.fechamentoOcIdadeIdeal,
      premissasColheitaAtivas?.fechamentoOc?.idadeIdealMeses,
      12
    );
    const parsed = num(value);
    return parsed > 0 ? parsed : 12;
  }, [premissasColheitaAtivas]);

  const getAtrTchQuadrante = useCallback((x, y) => {
    const quadrantes = fechamentoOcAtrTchConfig.quadrantes || {};

    // Regra única do gráfico:
    // as linhas de divisão cadastradas em Premissas > Colheita definem
    // visualmente e matematicamente em qual quadrante cada bolinha/talhão entra.
    // Assim a cor da bolinha, o percentual do quadro e o modal de detalhamento
    // sempre batem com as linhas tracejadas do gráfico.
    const highTch = num(x) >= num(fechamentoOcAtrTchConfig.tchDivisao);
    const highAtr = num(y) >= num(fechamentoOcAtrTchConfig.atrDivisao);

    const key = highAtr && highTch
      ? "altoAtrAltoTch"
      : highAtr
        ? "altoAtrBaixoTch"
        : highTch
          ? "baixoAtrAltoTch"
          : "baixoAtrBaixoTch";

    return { key, ...(quadrantes[key] || {}) };
  }, [fechamentoOcAtrTchConfig]);

  const atrTchQuadranteResumo = useMemo(() => {
    const base = Object.entries(fechamentoOcAtrTchConfig.quadrantes || {}).reduce((acc, [key, item]) => {
      acc[key] = { key, label: item.label, color: item.color, count: 0, pct: 0 };
      return acc;
    }, {});
    atrData.forEach((p) => {
      const q = getAtrTchQuadrante(p.x, p.y);
      if (!base[q.key]) base[q.key] = { key: q.key, label: q.label || q.key, color: q.color || "#94a3b8", count: 0, pct: 0 };
      base[q.key].count += 1;
    });
    const total = atrData.length || 1;
    Object.values(base).forEach((item) => { item.pct = (item.count / total) * 100; });
    return base;
  }, [atrData, fechamentoOcAtrTchConfig, getAtrTchQuadrante]);

  const atrXTch = useMemo(() => ({
    avgX: fechamentoOcAtrTchConfig.tchDivisao,
    avgY: fechamentoOcAtrTchConfig.atrDivisao,
  }), [fechamentoOcAtrTchConfig]);

  const status = useMemo(() => {
    if (dashboardPronto?.serverAggregated && dashboardPronto.analiseDesvio?.status) return dashboardPronto.analiseDesvio.status;
    const areaCort = recordsDeferred2.reduce((sum, r) => sum + num(r["AREA CORTADA"]), 0);
    const prodReal = recordsDeferred2.reduce((sum, r) => sum + num(r["PROD. REAL"]), 0);
    const tchMed = areaCort > 0 ? prodReal / areaCort : 0;
    const BAND = 0.05;
    let acima = 0, dentro = 0, abaixo = 0, areaAcima = 0, areaDentro = 0, areaAbaixo = 0;
    recordsDeferred2.forEach((r) => {
      const area = num(r["AREA CORTADA"]);
      const tch = area > 0 ? num(r["PROD. REAL"]) / area : 0;
      if (tch <= 0 || area <= 0) return;
      const ratio = tchMed > 0 ? tch / tchMed : 1;
      if (ratio > 1 + BAND) { acima++; areaAcima += area; }
      else if (ratio < 1 - BAND) { abaixo++; areaAbaixo += area; }
      else { dentro++; areaDentro += area; }
    });
    return { acima, dentro, abaixo, areaAcima, areaDentro, areaAbaixo };
  }, [dashboardPronto, recordsDeferred2]);

  const pctAcima = useMemo(() => recordsDeferred2.length > 0 ? (status.acima / recordsDeferred2.length) * 100 : 0, [recordsDeferred2.length, status.acima]);

  const statusAtr = useMemo(() => {
    if (dashboardPronto?.serverAggregated && dashboardPronto.analiseDesvio?.statusAtr) return dashboardPronto.analiseDesvio.statusAtr;
    let atrSum = 0, atrPeso = 0;
    recordsDeferred2.forEach((r) => {
      const atrRealNum = getAtrRealNumeratorBackend(r);
      const atrRealPeso = getAtrRealWeightBackend(r);
      if (atrRealNum > 0 && atrRealPeso > 0) { atrSum += atrRealNum; atrPeso += atrRealPeso; }
    });
    const atrMedG = atrPeso > 0 ? atrSum / atrPeso : 0;
    const BAND = 0.05;
    let acima = 0, dentro = 0, abaixo = 0, areaAcima = 0, areaDentro = 0, areaAbaixo = 0, tonAcima = 0, tonDentro = 0, tonAbaixo = 0;
    recordsDeferred2.forEach((r) => {
      const atr = num(r.ATR), area = num(r["AREA CORTADA"]), ton = num(r["PROD. REAL"]);
      if (atr <= 0 || area <= 0) return;
      const ratio = atrMedG > 0 ? atr / atrMedG : 1;
      if (ratio > 1 + BAND) { acima++; areaAcima += area; tonAcima += ton; }
      else if (ratio < 1 - BAND) { abaixo++; areaAbaixo += area; tonAbaixo += ton; }
      else { dentro++; areaDentro += area; tonDentro += ton; }
    });
    return { acima, dentro, abaixo, areaAcima, areaDentro, areaAbaixo, tonAcima, tonDentro, tonAbaixo };
  }, [dashboardPronto, recordsDeferred2]);

  const detalhe = useMemo(() => {
    if (dashboardPronto?.serverAggregated && dashboardPronto.analiseDesvio?.detalhe) return dashboardPronto.analiseDesvio.detalhe;
    return recordsDeferred2.map((r) => {
      const area = num(r["AREA CORTADA"]);
      const tch = area > 0 ? num(r["PROD. REAL"]) / area : 0;
      const prev = getTchPrevRelatorio(r);
      const cortes = String(r.CORTES ?? "").trim();
      return { faz: String(r.COD_FAZ ?? "").trim(), tal: String(r.TALHAO ?? "").trim(), estagio: String(r.ESTAGIO ?? "").trim(), variedade: String(r.VARIEDADE ?? "").trim(), tch, prev, gapPct: prev > 0 ? calcGapPct(tch, prev) : 0, area, atr: num(r.ATR), dm: num(r.DM), espac: num(r["ESPAC."]), cortes: cortes ? parseInt(cortes, 10) : 0, ton: num(r["PROD. REAL"]) };
    }).filter((x) => x.area > 0).slice(0, 1000);
  }, [dashboardPronto, recordsDeferred2]);

  const temposPorFazenda = useMemo(() => {
    if (dashboardPronto?.serverAggregated && dashboardPronto.analiseDesvio?.temposPorFazenda) return dashboardPronto.analiseDesvio.temposPorFazenda;
    const temposFaz = new Map();
    recordsDeferred2.forEach((r) => {
      const faz = String(r.COD_FAZ ?? "—").trim() || "—";
      const t = parseTempo(r.TEMPO);
      if (t <= 0) return;
      const cur = temposFaz.get(faz) || { sum: 0, cnt: 0 };
      cur.sum += t; cur.cnt += 1;
      temposFaz.set(faz, cur);
    });
    return Array.from(temposFaz.entries()).map(([cod, v]) => ({ cod, nome: fazendaNomes[cod] || cod, tempoMedio: v.cnt > 0 ? v.sum / v.cnt : 0 })).sort((a, b) => b.tempoMedio - a.tempoMedio).slice(0, 15);
  }, [dashboardPronto, recordsDeferred2, fazendaNomes]);

  const idadePorMes = useMemo(() => {
    if (dashboardPronto?.serverAggregated && dashboardPronto.analiseDesvio?.idadePorMes) return dashboardPronto.analiseDesvio.idadePorMes;
    const mesesLabels = ["ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];
    const mesesIdx = [3, 4, 5, 6, 7, 8, 9, 10, 11];
    const accM = mesesIdx.map(() => ({ idadeNum: 0, idadeDen: 0, corteNum: 0, corteDen: 0 }));
    let totIdNum = 0, totIdDen = 0, totCtNum = 0, totCtDen = 0;
    recordsDeferred2.forEach((r) => {
      const d = parseDate(r.ENCERRAMENTO);
      const area = num(r["AREA CORTADA"]);
      const idade = parseDecLocalMemo(r.IDADE);
      const corte = parseDecLocalMemo(r.ESTAGIO);
      if (area <= 0) return;
      const i = d ? mesesIdx.indexOf(d.getMonth()) : -1;
      if (idade > 0) { if (i >= 0) { accM[i].idadeNum += idade * area; accM[i].idadeDen += area; } totIdNum += idade * area; totIdDen += area; }
      if (corte > 0) { if (i >= 0) { accM[i].corteNum += corte * area; accM[i].corteDen += area; } totCtNum += corte * area; totCtDen += area; }
    });
    const rows = mesesLabels.map((mes, i) => ({ mes, idadeMeses: accM[i].idadeDen > 0 ? accM[i].idadeNum / accM[i].idadeDen : 0, idadeCorte: accM[i].corteDen > 0 ? accM[i].corteNum / accM[i].corteDen : 0 }));
    rows.push({ mes: "Acum", idadeMeses: totIdDen > 0 ? totIdNum / totIdDen : 0, idadeCorte: totCtDen > 0 ? totCtNum / totCtDen : 0 });
    return rows;
  }, [dashboardPronto, recordsDeferred2, parseDecLocalMemo]);


  const idadeXTchData = useMemo(() => {
    const fonte = dashboardPronto?.serverAggregated ? detalheOcRows : recordsDeferred2;
    const pontos = (fonte || [])
      .map((r) => {
        const area = num(getAnyCampo(r, ["AREA CORTADA", "Area Cortada", "areaCortada", "areaReal", "area", "areaColhida"]));
        const ton = num(getAnyCampo(r, ["PROD. REAL", "prodReal", "tonReal", "ton", "realTon"]));
        const tch = area > 0 && ton > 0 ? ton / area : num(getAnyCampo(r, ["TCH REAL", "tchReal", "real"]));
        const idade = parseDecLocalMemo(getAnyCampo(r, ["IDADE", "idade", "idadeMeses", "idadeMedia"]));
        const z = ton > 0 ? ton : area;
        return {
          x: idade,
          y: tch,
          z,
          area,
          ton,
          atr: num(getAnyCampo(r, ["ATR", "atr", "atrReal"])),
          tchPrev: area > 0 && num(getAnyCampo(r, ["PROD. PREV.", "PROD. PREV", "prodPrev", "tonPrev", "prevTon"])) > 0
            ? num(getAnyCampo(r, ["PROD. PREV.", "PROD. PREV", "prodPrev", "tonPrev", "prevTon"])) / area
            : num(getAnyCampo(r, ["TCH PREV.", "TCH PREV", "tchPrev", "prev"])),
          faz: String(getAnyCampo(r, ["COD_FAZ", "FAZENDA", "fazenda", "codFaz"], "")).trim(),
          tal: String(getAnyCampo(r, ["TALHAO", "talhao", "talhão"], "")).trim(),
          estagio: String(getAnyCampo(r, ["ESTAGIO", "estagio", "corte"], "")).trim(),
          variedade: String(getAnyCampo(r, ["VARIEDADE", "variedade"], "")).trim(),
        };
      })
      .filter((p) => p.x > 0 && p.y > 0);

    return pontos.length > 300
      ? pontos.filter((_, i) => i % Math.ceil(pontos.length / 300) === 0).slice(0, 300)
      : pontos;
  }, [dashboardPronto, detalheOcRows, recordsDeferred2, getAnyCampo, parseDecLocalMemo]);

  const idadeFaixaResumo = useMemo(() => {
    const base = {
      abaixo: { key: "abaixo", label: "ABAIXO DO IDEAL", color: "#f59e0b", count: 0, pct: 0 },
      acima: { key: "acima", label: "ACIMA DO IDEAL", color: "#34d399", count: 0, pct: 0 },
    };
    idadeXTchData.forEach((p) => {
      const bucket = num(p.x) < num(idadeIdealMeses) ? base.abaixo : base.acima;
      bucket.count += 1;
    });
    const total = idadeXTchData.length || 1;
    Object.values(base).forEach((item) => { item.pct = (item.count / total) * 100; });
    return base;
  }, [idadeXTchData, idadeIdealMeses]);

  const statusTalhoesFechados = useMemo(() => {
    const fonte = dashboardPronto?.serverAggregated ? detalheOcRows : recordsDeferred2;
    const acc = {
      acima: { key: "acima", name: "Acima do TCH Prev.", value: 0, count: 0, color: "#10b981" },
      dentro: { key: "dentro", name: "Dentro da Meta (±5%)", value: 0, count: 0, color: "#f59e0b" },
      abaixo: { key: "abaixo", name: "Abaixo do TCH Prev.", value: 0, count: 0, color: "#ef4444" },
    };

    (fonte || []).forEach((r) => {
      const area = num(getAnyCampo(r, ["AREA CORTADA", "Area Cortada", "areaCortada", "areaReal", "area", "areaColhida"]));
      const tonReal = num(getAnyCampo(r, ["PROD. REAL", "prodReal", "tonReal", "ton", "realTon"]));
      const tonPrev = num(getAnyCampo(r, ["PROD. PREV.", "PROD. PREV", "prodPrev", "tonPrev", "prevTon"]));
      const tchReal = area > 0 && tonReal > 0 ? tonReal / area : num(getAnyCampo(r, ["TCH REAL", "tchReal", "real"]));
      const tchPrev = area > 0 && tonPrev > 0 ? tonPrev / area : num(getAnyCampo(r, ["TCH PREV.", "TCH PREV", "tchPrev", "prev"]));
      if (area <= 0 || tchReal <= 0 || tchPrev <= 0) return;
      const gap = calcGapPct(tchReal, tchPrev);
      const bucket = gap > 5 ? acc.acima : gap < -5 ? acc.abaixo : acc.dentro;
      bucket.value += area;
      bucket.count += 1;
    });

    return [acc.acima, acc.dentro, acc.abaixo].filter((x) => x.value > 0);
  }, [dashboardPronto, detalheOcRows, recordsDeferred2, getAnyCampo]);

  const statusTalhoesTotalArea = useMemo(
    () => statusTalhoesFechados.reduce((sum, item) => sum + item.value, 0),
    [statusTalhoesFechados]
  );

  // Estados únicos de estágio para filtro de variedade
  const estagiosUnicos = useMemo(() => {
    const rows = dashboardPronto?.serverAggregated
      ? ((dashboardPronto?.agrupamentos?.estagios || []).length
          ? (dashboardPronto?.agrupamentos?.estagios || []).map((r) => r.estagio ?? r.key ?? r.label)
          : detalheOcRows.map((r) => getRowEstagio(r)))
      : records.map((r) => getRowEstagio(r));
    return [...new Set(rows.map((v) => String(v ?? "").trim()).filter(Boolean))]
      .sort((a, b) => {
        const na = parseFloat(String(a).replace(/\D/g, "")) || 999;
        const nb = parseFloat(String(b).replace(/\D/g, "")) || 999;
        return na - nb;
      });
  }, [dashboardPronto, records, detalheOcRows, getRowEstagio]);

  useEffect(() => {
    setEstagioPage(0);
  }, [tchPorEstagio.length]);

  useEffect(() => {
    setVariedadePage(0);
  }, [tchPorVariedadeTabela.length, variedadeEstagioFilter]);



  const compactarTalhoes = useCallback((values) => {
    const nums = [];
    const outros = [];
    (values || []).forEach((v) => {
      const raw = String(v ?? "").trim();
      if (!raw) return;
      const n = Number(raw.replace(",", "."));
      if (Number.isInteger(n) && String(n) === raw) nums.push(n);
      else outros.push(raw);
    });
    nums.sort((a, b) => a - b);
    outros.sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
    const parts = [];
    for (let i = 0; i < nums.length;) {
      const start = nums[i];
      let end = start;
      while (i + 1 < nums.length && nums[i + 1] === end + 1) { i += 1; end = nums[i]; }
      parts.push(end > start ? `${start} ao ${end}` : String(start));
      i += 1;
    }
    return [...parts, ...outros].join(", ");
  }, []);

  const detalheFonteFinal = useMemo(() => {
    const rows = dashboardPronto?.serverAggregated
      ? (dashboardPronto?.tabelas?.detalhe || dashboardPronto?.analiseDesvio?.detalhe || [])
      : recordsDeferred2;
    return Array.isArray(rows) ? rows : [];
  }, [dashboardPronto, recordsDeferred2]);

  const finalAbaixoPrevistoRows = useMemo(() => {
    const by = new Map();
    detalheFonteFinal.forEach((r) => {
      const area = num(getAnyCampo(r, ["AREA CORTADA", "areaReal", "area", "areaCortada", "areaColhida"]));
      const tonReal = num(getAnyCampo(r, ["PROD. REAL", "prodReal", "tonReal", "ton", "realTon"]));
      const tonPrev = num(getAnyCampo(r, ["PROD. PREV.", "PROD. PREV", "prodPrev", "tonPrev", "prevTon"]));
      const tchReal = area > 0 && tonReal > 0 ? tonReal / area : num(getAnyCampo(r, ["TCH REAL", "tchReal", "real"]));
      const tchPrev = area > 0 && tonPrev > 0 ? tonPrev / area : num(getAnyCampo(r, ["TCH PREV.", "TCH PREV", "tchPrev", "prev"]));
      if (!(area > 0 && tchReal > 0 && tchPrev > 0)) return;
      const gap = calcGapPct(tchReal, tchPrev);
      // Mantém a tabela final alinhada ao donut "Abaixo do TCH Prev.", que considera abaixo somente fora da tolerância de -5%.
      if (!(gap < -5)) return;
      const faz = String(getAnyCampo(r, ["COD_FAZ", "faz", "codFaz", "fazenda", "cod"], "—")).trim() || "—";
      const nome = fazendaNomes[faz] || String(getAnyCampo(r, ["FAZENDA", "DES_FAZENDA", "nomeFazenda", "fazendaNome", "farmName"], "—"));
      const variedade = String(getAnyCampo(r, ["VARIEDADE", "variedade", "variety", "nomeVariedade"], "—")).trim() || "—";
      const estagio = String(getAnyCampo(r, ["ESTAGIO", "estagio", "corte", "estagioCorte"], "—")).trim() || "—";
      const mesPlantio = String(getAnyCampo(r, ["MES PLANTIO", "MÊS PLANTIO", "mesPlantio", "plantioMes"], "—")).trim() || "—";
      const key = `${faz}|${variedade}|${estagio}|${mesPlantio}`;
      const cur = by.get(key) || { faz, nome, variedade, estagio, mesPlantio, talhoes: new Set(), area: 0, tonReal: 0, tonPrev: 0, atrSum: 0, atrPeso: 0, idadeSum: 0, idadePeso: 0 };
      const tal = String(getAnyCampo(r, ["TALHAO", "tal", "talhao", "quadra", "fieldCode"], "")).trim();
      if (tal) cur.talhoes.add(tal);
      const atr = num(getAnyCampo(r, ["ATR", "atr", "atrReal"]));
      const idade = num(getAnyCampo(r, ["IDADE", "IDADE MESES", "idade", "idadeMeses"]));
      cur.area += area;
      cur.tonReal += tonReal;
      cur.tonPrev += tonPrev;
      if (atr > 0 && tonReal > 0) { cur.atrSum += atr * tonReal; cur.atrPeso += tonReal; }
      if (idade > 0 && area > 0) { cur.idadeSum += idade * area; cur.idadePeso += area; }
      by.set(key, cur);
    });
    return Array.from(by.values()).map((x) => {
      const tchReal = x.area > 0 ? x.tonReal / x.area : 0;
      const tchPrev = x.area > 0 ? x.tonPrev / x.area : 0;
      const gap = tchPrev > 0 ? calcGapPct(tchReal, tchPrev) : 0;
      return { ...x, talhoesTxt: compactarTalhoes(Array.from(x.talhoes)), qtdTalhoes: x.talhoes.size, tchReal, tchPrev, gap, atr: x.atrPeso > 0 ? x.atrSum / x.atrPeso : 0, idade: x.idadePeso > 0 ? x.idadeSum / x.idadePeso : 0 };
    }).sort((a, b) => a.gap - b.gap);
  }, [detalheFonteFinal, getAnyCampo, fazendaNomes, compactarTalhoes]);

  useEffect(() => {
    setFinalAbaixoPage(0);
  }, [finalAbaixoPrevistoRows.length]);

  const finalAbaixoRowsPage = useMemo(() => (
    finalAbaixoPrevistoRows.slice(
      finalAbaixoPage * FINAL_ABAIXO_PAGE_SIZE,
      (finalAbaixoPage + 1) * FINAL_ABAIXO_PAGE_SIZE
    )
  ), [finalAbaixoPrevistoRows, finalAbaixoPage]);

  const rowObsSavedRef = useRef(rowObsSaved);
  useEffect(() => { rowObsSavedRef.current = rowObsSaved; }, [rowObsSaved]);

  useEffect(() => {
    if (!companyId || finalAbaixoPrevistoRows.length === 0) return;
    let active = true;
    const rowsToLoad = finalAbaixoPrevistoRows
      .map((r) => ({ r, key: finalObsKey(r) }))
      .filter(({ key }) => rowObsSavedRef.current[key] === undefined)
      .slice(0, 20);

    if (rowsToLoad.length === 0) return;

    Promise.all(rowsToLoad.map(({ key }) => fetchNote(companyId, key).then((value) => ({ key, value: value || "" })).catch(() => ({ key, value: "" }))))
      .then((items) => {
        if (!active) return;
        setRowObsSaved((prev) => {
          const next = { ...prev };
          items.forEach(({ key, value }) => { next[key] = value; });
          return next;
        });
        setRowObs((prev) => {
          const next = { ...prev };
          items.forEach(({ key, value }) => {
            if (next[key] === undefined) next[key] = value;
          });
          return next;
        });
      });

    return () => { active = false; };
  }, [companyId, finalAbaixoPrevistoRows, finalObsKey]);

  const finalAbaixoResumo = useMemo(() => {
    const area = finalAbaixoPrevistoRows.reduce((s, x) => s + num(x.area), 0);
    const tonReal = finalAbaixoPrevistoRows.reduce((s, x) => s + num(x.tonReal), 0);
    const tonPrev = finalAbaixoPrevistoRows.reduce((s, x) => s + num(x.tonPrev), 0);
    const atrPeso = finalAbaixoPrevistoRows.reduce((s, x) => s + num(x.atrPeso), 0);
    const atrSum = finalAbaixoPrevistoRows.reduce((s, x) => s + num(x.atrSum), 0);
    const idadePeso = finalAbaixoPrevistoRows.reduce((s, x) => s + num(x.idadePeso), 0);
    const idadeSum = finalAbaixoPrevistoRows.reduce((s, x) => s + num(x.idadeSum), 0);
    const talhoes = finalAbaixoPrevistoRows.reduce((s, x) => s + num(x.qtdTalhoes), 0);
    const fazendas = new Set(finalAbaixoPrevistoRows.map((x) => x.faz)).size;
    const tchReal = area > 0 ? tonReal / area : 0;
    const tchPrev = area > 0 ? tonPrev / area : 0;
    const gap = tchPrev > 0 ? calcGapPct(tchReal, tchPrev) : 0;
    const atr = atrPeso > 0 ? atrSum / atrPeso : 0;
    const idade = idadePeso > 0 ? idadeSum / idadePeso : 0;
    const pior = finalAbaixoPrevistoRows[0] || null;
    return { area, tonReal, tonPrev, tchReal, tchPrev, gap, atr, idade, talhoes, fazendas, pior };
  }, [finalAbaixoPrevistoRows]);

  const finalInsights = useMemo(() => {
    const acima = statusTalhoesFechados.find((x) => x.key === "acima")?.value || 0;
    const total = statusTalhoesTotalArea || 0;
    const pctAcima = total > 0 ? (acima / total) * 100 : 0;
    const pior = finalAbaixoResumo.pior;
    const melhorQuadrante = atrTchQuadranteResumo?.altoAtrAltoTch?.pct || 0;
    return {
      recomendacoes: [
        pior ? `Revisar operação na Fazenda ${pior.faz}: gap de ${fmt(pior.gap, 2)}% no TCH.` : "Sem talhões abaixo do previsto no TCH.",
        melhorQuadrante >= 50 ? `Manter padrão dos talhões em Alto ATR / Alto TCH (${fmt(melhorQuadrante, 1)}%).` : "Priorizar talhões fora do quadrante Alto ATR / Alto TCH.",
        finalAbaixoResumo.talhoes > 0 ? `Acompanhar ${finalAbaixoResumo.talhoes} talhão(ões) abaixo do previsto.` : "Safra sem talhões abaixo do previsto.",
      ],
      diagnosticos: [
        `${fmt(pctAcima, 2)}% da área fechada está acima do TCH previsto.`,
        pior ? `Fazenda ${pior.faz} apresenta o maior desvio negativo (${fmt(pior.gap, 2)}%).` : "Nenhum desvio negativo relevante encontrado.",
        kpis?.atrMedio > 0 ? `ATR médio consolidado em ${fmt(kpis.atrMedio, 2)} kg ATR/t.` : "ATR médio ainda sem base suficiente.",
      ],
    };
  }, [statusTalhoesFechados, statusTalhoesTotalArea, finalAbaixoResumo, atrTchQuadranteResumo, kpis]);

  const drilldownContent = useMemo(() => {
    if (!drilldown) return null;

          const ORDER_MES = ["ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ","JAN","FEV","MAR"];
          const parseIdadeLocal = (v) => {
            if (v === null || v === undefined || v === "") return 0;
            const n = parseFloat(String(v).trim().replace(",", "."));
            return isNaN(n) ? 0 : n;
          };
          // Quando o backend retorna dados agregados, `records` fica vazio por performance.
          // O drilldown precisa usar o detalhe já calculado pelo backend; senão o modal abre sem registros.
          const detalheBackend = dashboardPronto?.tabelas?.detalhe || dashboardPronto?.analiseDesvio?.detalhe || [];
          const drillRows = dashboardPronto?.serverAggregated ? detalheBackend : records;

          const getCampo = (r, legacyKey, backendKey, fallback = "") => r?.[legacyKey] ?? r?.[backendKey] ?? fallback;
          const getFaz = (r) => String(getCampo(r, "COD_FAZ", "faz", getCampo(r, "fazenda", "cod", "—"))).trim() || "—";
          const getTal = (r) => String(getCampo(r, "TALHAO", "tal", getCampo(r, "quadra", "fieldCode", ""))).trim();
          const getEstagio = (r) => String(getCampo(r, "ESTAGIO", "estagio", getCampo(r, "corte", "estagioCorte", ""))).trim();
          const getVariedade = (r) => String(getCampo(r, "VARIEDADE", "variedade", getCampo(r, "variety", "nomeVariedade", ""))).trim();
          const getEncerramento = (r) => getCampo(r, "ENCERRAMENTO", "encerramento", "");
          const getAreaReal = (r) => num(r?.["AREA CORTADA"] ?? r?.areaReal ?? r?.area ?? r?.areaCortada);
          const getAreaLib = (r) => num(r?.["AREA LIBERADA"] ?? r?.areaLib ?? r?.areaLiberada);
          const getTonReal = (r) => num(r?.["PROD. REAL"] ?? r?.tonReal ?? r?.ton ?? r?.prodReal);
          const getTonPrev = (r) => num(r?.["PROD. PREV."] ?? r?.tonPrev ?? r?.prodPrev);
          const getAtrReal = (r) => num(r?.ATR ?? r?.atr ?? r?.atrReal);
          const getIdadeDrill = (r) => num(r?.IDADE ?? r?.["IDADE MESES"] ?? r?.idade ?? r?.idadeMeses);
          const getTchRealDrill = (r) => {
            const direto = num(r?.tchReal ?? r?.tch);
            if (direto > 0) return direto;
            const ton = getTonReal(r);
            const area = getAreaReal(r);
            return ton > 0 && area > 0 ? ton / area : 0;
          };

          const filtered = drillRows.filter((r) => {
            if (drilldown.type === "estagio") {
              if (drilldown.value === "ALL") return true;
              return normalizeEstagioKey(getEstagio(r)) === normalizeEstagioKey(drilldown.value);
            }
            if (drilldown.type === "variedade") return normalizeTextKey(getVariedade(r)) === normalizeTextKey(drilldown.value);
            if (drilldown.type === "tipoprop") return (tipoOf(r) || "SEM CADASTRO") === drilldown.value;
            if (drilldown.type === "mes") {
              if (drilldown.value === "ACUM") return true;
              const d = parseDate(getEncerramento(r));
              if (!d) return false;
              const mIdx = d.getUTCMonth();
              const mKey = ORDER_MES[mIdx >= 3 ? mIdx - 3 : mIdx + 9];
              return mKey === drilldown.value;
            }
            if (drilldown.type === "quadrante-atr") {
              const x = getTchRealDrill(r);
              const y = getAtrReal(r);
              if (!(x > 0 && y > 0)) return false;
              const q = getAtrTchQuadrante(x, y);
              return q.key === drilldown.value;
            }
            if (drilldown.type === "ponto-atr") {
              const alvo = drilldown.value || {};
              return String(getFaz(r)) === String(alvo.faz || "—") && String(getTal(r)) === String(alvo.tal || "");
            }
            if (drilldown.type === "ponto-idade") {
              const alvo = drilldown.value || {};
              return String(getFaz(r)) === String(alvo.faz || "—") && String(getTal(r)) === String(alvo.tal || "");
            }
            if (drilldown.type === "idade-faixa") {
              const idade = getIdadeDrill(r);
              if (!(idade > 0)) return false;
              return drilldown.value === "abaixo" ? idade < idadeIdealMeses : idade >= idadeIdealMeses;
            }
            if (drilldown.type === "status-tch") {
              const area = getAreaReal(r);
              const tchReal = getTchRealDrill(r);
              const tonPrev = getTonPrev(r);
              const tchPrev = area > 0 && tonPrev > 0 ? tonPrev / area : num(r?.tchPrev ?? r?.prev ?? r?.["TCH PREV."] ?? r?.["TCH PREV"]);
              if (!(area > 0 && tchReal > 0 && tchPrev > 0)) return false;
              const gap = calcGapPct(tchReal, tchPrev);
              const bucket = gap > 5 ? "acima" : gap < -5 ? "abaixo" : "dentro";
              return bucket === drilldown.value;
            }
            return false;
          });

          const isTalhaoDetalhamento = ["quadrante-atr", "ponto-atr", "ponto-idade", "idade-faixa", "status-tch", "mes"].includes(drilldown.type);
          if (isTalhaoDetalhamento) {
            const sortTalhoesLocal = (set) => Array.from(set).sort((a, b) => {
              const na = Number(String(a).replace(",", "."));
              const nb = Number(String(b).replace(",", "."));
              if (Number.isInteger(na) && Number.isInteger(nb)) return na - nb;
              return String(a).localeCompare(String(b), "pt-BR", { numeric: true });
            });
            const formatTalhoesLocal = (list) => {
              const parts = [];
              let i = 0;
              while (i < list.length) {
                const raw = String(list[i]).trim();
                const startN = Number(raw);
                if (Number.isInteger(startN) && String(startN) === raw) {
                  let j = i;
                  while (j + 1 < list.length) {
                    const curr = Number(String(list[j]).trim());
                    const nextRaw = String(list[j + 1]).trim();
                    const next = Number(nextRaw);
                    if (!Number.isInteger(next) || String(next) !== nextRaw || next !== curr + 1) break;
                    j += 1;
                  }
                  parts.push(j > i ? `${list[i]} ao ${list[j]}` : String(list[i]));
                  i = j + 1;
                } else {
                  parts.push(raw);
                  i += 1;
                }
              }
              return parts.join(", ");
            };

            const byFazDrill = new Map();
            filtered.forEach((r) => {
              const faz = getFaz(r);
              const tal = getTal(r);
              const area = getAreaReal(r);
              const ton = getTonReal(r);
              const atr = getAtrReal(r);
              const idade = getIdadeDrill(r);
              const cur = byFazDrill.get(faz) || {
                cod: faz,
                nome: fazendaNomes[faz] || getCampo(r, "FAZENDA", "fazenda", "—"),
                talhoes: new Set(),
                area: 0,
                ton: 0,
                atrSum: 0,
                atrPeso: 0,
                idadeSum: 0,
                idadePeso: 0,
              };
              if (tal) cur.talhoes.add(tal);
              cur.area += area;
              cur.ton += ton;
              if (atr > 0 && ton > 0) { cur.atrSum += atr * ton; cur.atrPeso += ton; }
              if (idade > 0 && area > 0) { cur.idadeSum += idade * area; cur.idadePeso += area; }
              byFazDrill.set(faz, cur);
            });

            const rowsFazDrill = Array.from(byFazDrill.values()).map((x) => {
              const talhoes = sortTalhoesLocal(x.talhoes);
              return {
                ...x,
                talhoesTxt: formatTalhoesLocal(talhoes),
                qtdTalhoes: talhoes.length,
                tch: x.area > 0 ? x.ton / x.area : 0,
                atr: x.atrPeso > 0 ? x.atrSum / x.atrPeso : 0,
                idade: x.idadePeso > 0 ? x.idadeSum / x.idadePeso : 0,
              };
            }).sort((a, b) => b.area - a.area);

            const rowsLimitedFazDrill = rowsFazDrill.slice(0, 200);
            const totalAreaFazDrill = rowsFazDrill.reduce((s, x) => s + x.area, 0);
            const totalTonFazDrill = rowsFazDrill.reduce((s, x) => s + x.ton, 0);
            const totalTalhoesFazDrill = rowsFazDrill.reduce((s, x) => s + x.qtdTalhoes, 0);
            const atrPesoFazDrill = rowsFazDrill.reduce((s, x) => s + (x.atr > 0 && x.ton > 0 ? x.ton : 0), 0);
            const atrSumFazDrill = rowsFazDrill.reduce((s, x) => s + (x.atr > 0 && x.ton > 0 ? x.atr * x.ton : 0), 0);
            const idadePesoFazDrill = rowsFazDrill.reduce((s, x) => s + (x.idade > 0 && x.area > 0 ? x.area : 0), 0);
            const idadeSumFazDrill = rowsFazDrill.reduce((s, x) => s + (x.idade > 0 && x.area > 0 ? x.idade * x.area : 0), 0);

            return (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b border-amber-500/30">
                    <th className="text-left py-2 px-2 text-[11px] font-bold uppercase tracking-wider bg-amber-500/[0.08] text-amber-200/90">Cód. Faz</th>
                    <th className="text-left py-2 px-2 text-[11px] font-bold uppercase tracking-wider bg-amber-500/[0.08] text-amber-200/90">Fazenda</th>
                    <th className="text-left py-2 px-2 text-[11px] font-bold uppercase tracking-wider bg-amber-500/[0.08] text-amber-200/90 min-w-[220px]">Talhões</th>
                    <th className="text-center py-2 px-2 text-[11px] font-bold uppercase tracking-wider bg-amber-500/[0.08] text-amber-200/90">Área (ha)</th>
                    <th className="text-center py-2 px-2 text-[11px] font-bold uppercase tracking-wider bg-emerald-500/[0.08] text-emerald-200/90">Ton Fechada</th>
                    <th className="text-center py-2 px-2 text-[11px] font-bold uppercase tracking-wider bg-emerald-500/[0.08] text-emerald-200/90">TCH Real</th>
                    <th className="text-center py-2 px-2 text-[11px] font-bold uppercase tracking-wider bg-violet-500/[0.08] text-violet-200/90">ATR</th>
                    <th className="text-center py-2 px-2 text-[11px] font-bold uppercase tracking-wider bg-cyan-500/[0.08] text-cyan-200/90">Idade</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsFazDrill.length > 200 && (
                    <tr><td colSpan={8} className="py-2 px-2 text-center text-xs text-amber-300 bg-amber-500/[0.08]">Mostrando 200 de {rowsFazDrill.length} fazendas neste detalhamento.</td></tr>
                  )}
                  {rowsLimitedFazDrill.map((r) => (
                    <tr key={r.cod} className="border-b border-amber-500/[0.08] hover:bg-amber-500/[0.04]">
                      <td className="py-1.5 px-2 font-mono text-foreground whitespace-nowrap">{r.cod}</td>
                      <td className="py-1.5 px-2 text-foreground/90">{r.nome}</td>
                      <td className="py-1.5 px-2 text-foreground/80 text-xs">{r.talhoesTxt || "—"} <span className="text-muted-foreground">({r.qtdTalhoes})</span></td>
                      <td className="py-1.5 px-2 text-center font-mono text-sky-200">{fmt(r.area)}</td>
                      <td className="py-1.5 px-2 text-center font-mono text-emerald-400 font-semibold">{fmt(r.ton)}</td>
                      <td className="py-1.5 px-2 text-center font-mono text-emerald-300 font-semibold">{fmt(r.tch)}</td>
                      <td className="py-1.5 px-2 text-center font-mono text-violet-300">{r.atr > 0 ? fmt(r.atr) : "—"}</td>
                      <td className="py-1.5 px-2 text-center font-mono text-cyan-300">{r.idade > 0 ? fmt(r.idade, 1) : "—"}</td>
                    </tr>
                  ))}
                  {rowsFazDrill.length > 0 && (
                    <tr className="bg-gradient-to-r from-amber-500/15 to-transparent font-bold border-t border-amber-500/30">
                      <td className="py-2 px-2 text-amber-300" colSpan={2}>TOTAL ({rowsFazDrill.length} fazenda{rowsFazDrill.length > 1 ? "s" : ""})</td>
                      <td className="py-2 px-2 text-amber-200">{totalTalhoesFazDrill} talhão(ões)</td>
                      <td className="py-2 px-2 text-center font-mono text-amber-200">{fmt(totalAreaFazDrill)}</td>
                      <td className="py-2 px-2 text-center font-mono text-amber-200">{fmt(totalTonFazDrill)}</td>
                      <td className="py-2 px-2 text-center font-mono text-amber-200">{fmt(totalAreaFazDrill > 0 ? totalTonFazDrill / totalAreaFazDrill : 0)}</td>
                      <td className="py-2 px-2 text-center font-mono text-amber-200">{atrPesoFazDrill > 0 ? fmt(atrSumFazDrill / atrPesoFazDrill) : "—"}</td>
                      <td className="py-2 px-2 text-center font-mono text-amber-200">{idadePesoFazDrill > 0 ? fmt(idadeSumFazDrill / idadePesoFazDrill, 1) : "—"}</td>
                    </tr>
                  )}
                  {rowsFazDrill.length === 0 && (
                    <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">Sem registros para este filtro.</td></tr>
                  )}
                </tbody>
              </table>
            );
          }

          const byFaz = new Map();
          filtered.forEach((r) => {
            const cod = getFaz(r);
            const tal = getTal(r);
            const areaR = getAreaReal(r);
            const areaL = getAreaLib(r);
            const ton = getTonReal(r);
            const tonPrev = getTonPrev(r);
            const atr = getAtrReal(r);
            const atrRealNum = num(r?.atrRealNumerator) || (ton > 0 && atr > 0 ? ton * atr : 0);
            const atrRealPeso = num(r?.atrRealWeight) || ton;
            const cur = byFaz.get(cod) || { cod, talhoes: new Set(), areaReal: 0, areaLib: 0, tonReal: 0, prodPrev: 0, atrSum: 0, atrPeso: 0 };
            if (tal) cur.talhoes.add(tal);
            cur.areaReal += areaR;
            cur.areaLib += areaL;
            cur.tonReal += ton;
            cur.prodPrev += tonPrev;
            if (atrRealNum > 0 && atrRealPeso > 0) { cur.atrSum += atrRealNum; cur.atrPeso += atrRealPeso; }
            byFaz.set(cod, cur);
          });
          const rows = Array.from(byFaz.values()).sort((a, b) => b.tonReal - a.tonReal);
          const rowsLimited = rows.slice(0, 100);
          const totArea = rows.reduce((s, x) => s + x.areaReal, 0);
          const totTon = rows.reduce((s, x) => s + x.tonReal, 0);
          const totAtrSum = rows.reduce((s, x) => s + x.atrSum, 0);
          const totAtrPeso = rows.reduce((s, x) => s + x.atrPeso, 0);

          const sortTalhoes = (set) =>
            Array.from(set).sort((a, b) => {
              const na = parseFloat(a.replace(",", ".")); const nb = parseFloat(b.replace(",", "."));
              if (!isNaN(na) && !isNaN(nb)) return na - nb;
              return a.localeCompare(b);
            });

          const formatTalhoes = (list) => {
            if (!list.length) return "";
            const parts = [];
            let i = 0;
            while (i < list.length) {
              const startStr = list[i];
              const startN = Number(startStr);
              if (Number.isInteger(startN) && String(startN) === startStr.trim()) {
                let j = i;
                while (j + 1 < list.length && Number.isInteger(Number(list[j + 1])) && String(Number(list[j + 1])) === list[j + 1].trim() && Number(list[j + 1]) === Number(list[j]) + 1) { j++; }
                parts.push(j > i ? `${list[i]} ao ${list[j]}` : list[i]);
                i = j + 1;
              } else { parts.push(startStr); i++; }
            }
            return parts.join(", ");
          };

          return (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-amber-500/30">
                  <th className="text-left py-2 px-2 text-[11px] font-bold uppercase tracking-wider bg-amber-500/[0.08] text-amber-200/90">Cód. Faz</th>
                  <th className="text-left py-2 px-2 text-[11px] font-bold uppercase tracking-wider bg-amber-500/[0.08] text-amber-200/90">Fazenda</th>
                  <th className="text-left py-2 px-2 text-[11px] font-bold uppercase tracking-wider bg-amber-500/[0.08] text-amber-200/90 min-w-[180px]">Talhões</th>
                  <th className="text-center py-2 px-2 text-[11px] font-bold uppercase tracking-wider bg-amber-500/[0.08] text-amber-200/90">Área (ha)</th>
                  <th className="text-center py-2 px-2 text-[11px] font-bold uppercase tracking-wider bg-emerald-500/[0.08] text-emerald-200/90">Ton Fechada</th>
                  <th className="text-center py-2 px-2 text-[11px] font-bold uppercase tracking-wider bg-emerald-500/[0.08] text-emerald-200/90">TCH Real</th>
                  <th className="text-center py-2 px-2 text-[11px] font-bold uppercase tracking-wider bg-violet-500/[0.08] text-violet-200/90">ATR Médio</th>
                </tr>
              </thead>
              <tbody>
                {rows.length > 100 && (
                  <tr>
                    <td colSpan={7} className="py-2 px-2 text-center text-xs text-amber-300 bg-amber-500/[0.08]">
                      Mostrando 100 de {rows.length} fazendas neste detalhamento.
                    </td>
                  </tr>
                )}
                {rowsLimited.map((r) => {
                  const nome = fazendaNomes[r.cod] || "—";
                  const tch = r.areaReal > 0 ? r.tonReal / r.areaReal : 0;
                  const atr = r.atrPeso > 0 ? r.atrSum / r.atrPeso : 0;
                  const talhoes = sortTalhoes(r.talhoes);
                  return (
                    <tr key={r.cod} className="border-b border-amber-500/[0.08] hover:bg-amber-500/[0.04]">
                      <td className="py-1.5 px-2 font-mono text-foreground whitespace-nowrap">{r.cod}</td>
                      <td className="py-1.5 px-2 text-foreground/90">{nome}</td>
                      <td className="py-1.5 px-2 text-foreground/80 text-xs">{formatTalhoes(talhoes) || "—"} <span className="text-muted-foreground">({talhoes.length})</span></td>
                      <td className="py-1.5 px-2 text-center font-mono text-foreground/80">{fmt(r.areaReal)}</td>
                      <td className="py-1.5 px-2 text-center font-mono text-emerald-400 font-semibold">{fmt(r.tonReal)}</td>
                      <td className="py-1.5 px-2 text-center font-mono text-emerald-300 font-semibold">{fmt(tch)}</td>
                      <td className="py-1.5 px-2 text-center font-mono text-violet-300">{atr > 0 ? fmt(atr) : "—"}</td>
                    </tr>
                  );
                })}
                {rows.length > 0 && (
                  <tr className="bg-gradient-to-r from-amber-500/15 to-transparent font-bold border-t border-amber-500/30">
                    <td className="py-2 px-2 text-amber-300" colSpan={3}>TOTAL ({rows.length} fazenda{rows.length > 1 ? "s" : ""})</td>
                    <td className="py-2 px-2 text-center font-mono text-amber-200">{fmt(totArea)}</td>
                    <td className="py-2 px-2 text-center font-mono text-amber-200">{fmt(totTon)}</td>
                    <td className="py-2 px-2 text-center font-mono text-amber-200">{fmt(totArea > 0 ? totTon / totArea : 0)}</td>
                    <td className="py-2 px-2 text-center font-mono text-amber-200">{totAtrPeso > 0 ? fmt(totAtrSum / totAtrPeso) : "—"}</td>
                  </tr>
                )}
                {rows.length === 0 && (
                  <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">Sem registros para este filtro.</td></tr>
                )}
              </tbody>
            </table>
          );

  }, [drilldown, dashboardPronto, records, recordsDeferred2, tipoOf, fazendaNomes, idadeIdealMeses]);

  // ── Loading / Empty states ───────────────────
  // Não bloquear a aba inteira durante a troca Entrada de Cana → Talhões Fechados.
  // A tela deve montar imediatamente; enquanto a API responde, KPIs/tabelas/gráficos
  // usam valores vazios/zerados e depois atualizam quando `dashboardPronto` chegar.
  const totalRegistrosDashboard = dashboardPronto?.serverAggregated ? (dashboardPronto.totalRegistros || 0) : records.length;
  if (!loading && !totalRegistrosDashboard) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Nenhuma Ordem de Corte cadastrada. Importe via Integrações de Dados → Ordem de Corte.
      </div>
    );
  }

  // ── Helper inline para gap color ─────────────
  const gapCls = (v) => v >= 0 ? "text-emerald-400" : "text-red-400";

  // ══════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════
  return (
    <div className="flex flex-col gap-4">
      <div ref={pdfRef} className="fechamento-oc-polish flex flex-col gap-4" style={{ contain: 'layout style paint' }}>

        {/* ── Header: Safra / Datas / KPIs Moagem ── */}
        <div data-pdf-skip="true" className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3">
          {/* Info header */}
          <div className="relative rounded-2xl border border-amber-500/[0.08] bg-card/60 backdrop-blur-sm px-4 py-3 flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-amber-500/15 border border-amber-500/20">
                <CalendarRange className="h-3.5 w-3.5 text-amber-400" />
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-[0.18em] font-bold text-muted-foreground">Safra</p>
                <p className="text-sm font-bold text-foreground">{headerInfo.safra}</p>
              </div>
            </div>
            <div className="h-8 w-px bg-amber-500/[0.08]" />
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-cyan-500/15 border border-cyan-500/20">
                <Calendar className="h-3.5 w-3.5 text-cyan-400" />
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-[0.18em] font-bold text-muted-foreground">Atualizado em</p>
                <p className="text-sm font-bold text-foreground">{headerInfo.atualizadoEm}</p>
              </div>
            </div>
            <div className="h-8 w-px bg-amber-500/[0.08]" />
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-violet-500/15 border border-violet-500/20">
                <Clock className="h-3.5 w-3.5 text-violet-400" />
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-[0.18em] font-bold text-muted-foreground">Período</p>
                <p className="text-sm font-bold text-foreground">{headerInfo.periodo}</p>
              </div>
            </div>
            <div className="h-8 w-px bg-amber-500/[0.08]" />
            <div className="flex flex-wrap items-center gap-2">
              <PeriodDateInput label="Data inicial" value={dataInicio} onChange={setDataInicio} />
              <PeriodDateInput label="Data final" value={dataFim} onChange={setDataFim} />
              {(dataInicio || dataFim) && (
                <button
                  type="button"
                  onClick={() => { setDataInicio?.(""); setDataFim?.(""); }}
                  className="h-9 rounded-xl border border-border/60 px-3 text-[10px] font-bold uppercase tracking-wide text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>

          {/* Mini KPIs de moagem */}
          {(() => {
            const cardsEntrada = dashboardPronto?.cards || {};
            const moagemReal = num(cardsEntrada.moagemRealizadaEntrada ?? cardsEntrada.moagemRealizada ?? kpis.prodReal);
            const saldoMoagem = Number.isFinite(num(cardsEntrada.saldoMoagemEntrada ?? cardsEntrada.saldoMoagem, NaN))
              ? num(cardsEntrada.saldoMoagemEntrada ?? cardsEntrada.saldoMoagem)
              : moagemPrevista - moagemReal;
            const saldoPositivo = saldoMoagem >= 0;
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="group relative rounded-2xl border border-amber-500/[0.15] bg-gradient-to-br from-amber-500/[0.08] to-amber-500/[0.02] backdrop-blur-sm px-4 py-3 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/20">
                    <Factory className="h-5 w-5 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.18em] font-bold text-amber-300/80">Moagem Prevista</p>
                    <p className="text-xl font-bold text-amber-300">{fmtInt(moagemPrevista)} <span className="text-xs font-semibold text-amber-400/70">t</span></p>
                  </div>
                </div>
                <div className="group relative rounded-2xl border border-cyan-500/[0.15] bg-gradient-to-br from-cyan-500/[0.08] to-cyan-500/[0.02] backdrop-blur-sm px-4 py-3 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-cyan-500/15 border border-cyan-500/20">
                    <Factory className="h-5 w-5 text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.18em] font-bold text-cyan-300/80">Moagem Realizada</p>
                    <p className="text-xl font-bold text-cyan-300">{fmtInt(moagemReal)} <span className="text-xs font-semibold text-cyan-400/70">t</span></p>
                  </div>
                </div>
                <div className={cn("group relative rounded-2xl border backdrop-blur-sm px-4 py-3 flex items-center gap-3", saldoPositivo ? "border-violet-500/[0.15] bg-gradient-to-br from-violet-500/[0.08] to-violet-500/[0.02]" : "border-red-500/[0.15] bg-gradient-to-br from-red-500/[0.08] to-red-500/[0.02]")}>
                  <div className={cn("p-2 rounded-lg border", saldoPositivo ? "bg-violet-500/15 border-violet-500/20" : "bg-red-500/15 border-red-500/20")}>
                    <ArrowDownUp className={cn("h-5 w-5", saldoPositivo ? "text-violet-400" : "text-red-400")} />
                  </div>
                  <div>
                    <p className={cn("text-[9px] uppercase tracking-[0.18em] font-bold", saldoPositivo ? "text-violet-300/80" : "text-red-300/80")}>Saldo Moagem</p>
                    <p className={cn("text-xl font-bold", saldoPositivo ? "text-violet-300" : "text-red-300")}>{fmtInt(saldoMoagem)} <span className={cn("text-xs font-semibold", saldoPositivo ? "text-violet-400/70" : "text-red-400/70")}>t</span></p>
                  </div>
                </div>
                <div className="group relative rounded-2xl border border-emerald-500/[0.15] bg-gradient-to-br from-emerald-500/[0.08] to-emerald-500/[0.02] backdrop-blur-sm px-4 py-3 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/15 border border-emerald-500/20">
                    <Leaf className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.18em] font-bold text-emerald-300/80">Área Colhida</p>
                    <p className="text-xl font-bold text-emerald-300">{fmt(kpis.areaCortada)} <span className="text-xs font-semibold text-emerald-400/70">ha</span></p>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* ── Resumo por Tipo de Propriedade ── */}
        <div>
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-amber-500/15 border border-amber-500/20">
                <Building2 className="h-3.5 w-3.5 text-amber-400" />
              </div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-400/90">Resumo por Tipo de Propriedade</p>
              <span className="text-[10px] text-muted-foreground">· selecione um ou mais tipos para filtrar o dashboard</span>
            </div>
            <div data-pdf-skip="true" className="flex items-center gap-1 bg-background/50 border border-amber-500/[0.08] rounded-lg p-0.5">
              <button onClick={() => startTransition(() => setTipoPropFilter([]))} className={cn("h-7 px-2.5 text-[10px] font-semibold rounded-md transition-colors flex items-center gap-1.5", tipoPropFilter.length === 0 ? "bg-amber-500 text-black" : "text-muted-foreground hover:text-foreground")}>
                <Layers className="h-3 w-3" /> Todos
              </button>
              {resumoTipoProp.map((t) => {
                const active = tipoPropFilter.includes(t.tipo);
                return (
                  <button key={`btn-${t.tipo}`}
                    onClick={() => startTransition(() => setTipoPropFilter((prev) => prev.includes(t.tipo) ? prev.filter((x) => x !== t.tipo) : [...prev, t.tipo]))}
                    className={cn("h-7 px-2.5 text-[10px] font-semibold rounded-md transition-colors", active ? "bg-amber-500 text-black" : "text-muted-foreground hover:text-foreground")}
                  >{t.tipo}</button>
                );
              })}
            </div>
          </div>
          {resumoTipoProp.length === 0 ? (
            <div className="rounded-xl border border-amber-500/[0.08] bg-card/60 backdrop-blur-sm p-4 text-xs text-muted-foreground">Nenhum talhão fechado encontrado.</div>
          ) : (
            <div className="rounded-xl border border-amber-500/[0.08] bg-card/80 backdrop-blur-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-muted/30 border-b border-amber-500/[0.08]">
                    <tr className="text-[10px] uppercase tracking-wider">
                      <th className="align-middle px-3 py-2 text-left text-muted-foreground">Tipo Propriedade</th>
                      <th className="align-middle px-2 py-2 text-center border-l border-amber-500/[0.08] text-sky-400">Área Fechada (ha)</th>
                      <th className="align-middle px-2 py-2 text-center border-l border-amber-500/[0.08] text-amber-400">Ton Prev</th>
                      <th className="align-middle px-2 py-2 text-center text-amber-400">Ton Fechada</th>
                      <th className="align-middle px-2 py-2 text-center text-amber-400">Gap</th>
                      <th className="align-middle px-2 py-2 text-center border-l border-amber-500/[0.08] text-emerald-400">TCH Prev.</th>
                      <th className="align-middle px-2 py-2 text-center text-emerald-400">TCH Real</th>
                      <th className="align-middle px-2 py-2 text-center text-emerald-400">Gap</th>
                      <th className="align-middle px-2 py-2 text-center border-l border-amber-500/[0.08] text-violet-400">ATR Prev</th>
                      <th className="align-middle px-2 py-2 text-center text-violet-400">ATR Real</th>
                      <th className="align-middle px-2 py-2 text-center text-violet-400">Gap</th>
                      <th className="align-middle px-2 py-2 text-center border-l border-amber-500/[0.08] text-cyan-400">Idade (meses)</th>
                      <th className="align-middle px-2 py-2 text-center text-rose-400">Idade (corte)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumoTipoProp.map((t) => {
                      const isActive = tipoPropFilter.includes(t.tipo);
                      const tipoColor = t.tipo === "ARRENDAMENTO" ? "text-blue-300" : t.tipo === "FORNECEDOR" ? "text-violet-300" : t.tipo === "PARCERIA" ? "text-cyan-300" : "text-amber-300";
                      const dotColor = t.tipo === "ARRENDAMENTO" ? "bg-blue-400" : t.tipo === "FORNECEDOR" ? "bg-violet-400" : t.tipo === "PARCERIA" ? "bg-cyan-400" : "bg-amber-400";
                      const gapTon = t.prodReal - t.prodPrev;
                      const gapTch = t.tchReal - t.tchPrev;
                      const gapAtr = t.atrMedio - t.atrPrev;
                      return (
                        <tr key={t.tipo} className={cn("border-b border-amber-500/[0.05] transition-colors cursor-pointer hover:bg-amber-500/[0.06]", isActive && "bg-amber-500/[0.08]")}
                          onClick={() => setDrilldown({ type: "tipoprop", value: t.tipo, label: t.tipo })}>
                          <td className="align-middle px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className={cn("h-2 w-2 rounded-full", dotColor)} />
                              <span className={cn("font-bold", tipoColor)}>{t.tipo}</span>
                              <span className="text-[9px] text-muted-foreground">({fmtInt(t.talhoes)})</span>
                            </div>
                          </td>
                          <td className="align-middle px-2 py-2.5 text-center tabular-nums border-l border-amber-500/[0.08] text-sky-500 font-semibold">{fmt(t.areaCortada, 2)}</td>
                          <td className="align-middle px-2 py-2.5 text-center tabular-nums border-l border-amber-500/[0.08] text-amber-500 font-semibold">{fmtInt(t.prodPrev)}</td>
                          <td className="align-middle px-2 py-2.5 text-center tabular-nums text-amber-500 font-semibold">{fmtInt(t.prodReal)}</td>
                          <td className={cn("px-2 py-2.5 text-center tabular-nums font-bold", gapCls(gapTon))}>{gapTon >= 0 ? "+" : ""}{fmt(t.gapPct)}%</td>
                          <td className="align-middle px-2 py-2.5 text-center tabular-nums border-l border-amber-500/[0.08] text-emerald-500 font-semibold">{fmt(t.tchPrev)}</td>
                          <td className="align-middle px-2 py-2.5 text-center tabular-nums text-emerald-500 font-semibold">{fmt(t.tchReal)}</td>
                          <td className={cn("px-2 py-2.5 text-center tabular-nums font-bold", gapCls(gapTch))}>{t.tchPrev > 0 ? `${gapTch >= 0 ? "+" : ""}${fmt(t.gapTchPct)}%` : "—"}</td>
                          <td className="align-middle px-2 py-2.5 text-center tabular-nums border-l border-amber-500/[0.08] text-violet-500 font-semibold">{t.atrPrev > 0 ? fmt(t.atrPrev) : "—"}</td>
                          <td className="align-middle px-2 py-2.5 text-center tabular-nums text-violet-500 font-semibold">{t.atrMedio > 0 ? fmt(t.atrMedio) : "—"}</td>
                          <td className={cn("px-2 py-2.5 text-center tabular-nums font-bold", gapCls(gapAtr))}>{t.atrPrev > 0 && t.atrMedio > 0 ? `${gapAtr >= 0 ? "+" : ""}${fmt(t.gapAtrPct)}%` : "—"}</td>
                          <td className="align-middle px-2 py-2.5 text-center tabular-nums border-l border-amber-500/[0.08] text-cyan-500 font-semibold">{t.idadeMeses > 0 ? fmt(t.idadeMeses, 1) : "—"}</td>
                          <td className="align-middle px-2 py-2.5 text-center tabular-nums text-rose-500 font-semibold">{t.idadeCorte > 0 ? fmt(t.idadeCorte, 1) : "—"}</td>
                        </tr>
                      );
                    })}
                    {/* Total row */}
                    {(() => {
                      const tot = resumoTipoProp.reduce((a, t) => ({
                        talhoes: a.talhoes + t.talhoes,
                        prodPrev: a.prodPrev + t.prodPrev, prodReal: a.prodReal + t.prodReal,
                        areaLib: a.areaLib + t.areaLiberada, areaCort: a.areaCort + t.areaCortada,
                        atrSum: a.atrSum + t.atrSum, atrPeso: a.atrPeso + t.atrPeso,
                        atrPrevSum: a.atrPrevSum + t.atrPrevSum, atrPrevPeso: a.atrPrevPeso + t.atrPrevPeso,
                        idadeSum: a.idadeSum + t.idadeSum, idadePeso: a.idadePeso + t.idadePeso,
                        corteSum: a.corteSum + t.corteSum, cortePeso: a.cortePeso + t.cortePeso,
                      }), { talhoes:0, prodPrev:0, prodReal:0, areaLib:0, areaCort:0, atrSum:0, atrPeso:0, atrPrevSum:0, atrPrevPeso:0, idadeSum:0, idadePeso:0, corteSum:0, cortePeso:0 });
                      const tchPrev = tot.areaCort > 0 ? tot.prodPrev / tot.areaCort : 0;
                      const tchReal = tot.areaCort > 0 ? tot.prodReal / tot.areaCort : 0;
                      const atrPrev = tot.atrPrevPeso > 0 ? tot.atrPrevSum / tot.atrPrevPeso : 0;
                      const atrMed = tot.atrPeso > 0 ? tot.atrSum / tot.atrPeso : 0;
                      const gapTon = tot.prodReal - tot.prodPrev;
                      const gapTonPct = tot.prodPrev > 0 ? (gapTon / tot.prodPrev) * 100 : 0;
                      const gapTch = tchReal - tchPrev;
                      const gapTchPct = tchPrev > 0 ? (gapTch / tchPrev) * 100 : 0;
                      const gapAtr = atrMed - atrPrev;
                      const gapAtrPct = atrPrev > 0 ? calcGapPct(atrMed, atrPrev) : 0;
                      const idadeM = tot.idadePeso > 0 ? tot.idadeSum / tot.idadePeso : 0;
                      const idadeC = tot.cortePeso > 0 ? tot.corteSum / tot.cortePeso : 0;
                      return (
                        <tr className="bg-amber-500/[0.06] font-bold">
                          <td className="align-middle px-3 py-2.5 text-amber-500">TOTAL <span className="text-[9px] text-muted-foreground font-normal">({fmtInt(tot.talhoes)})</span></td>
                          <td className="align-middle px-2 py-2.5 text-center tabular-nums border-l border-amber-500/[0.08] text-sky-600">{fmt(tot.areaCort, 2)}</td>
                          <td className="align-middle px-2 py-2.5 text-center tabular-nums border-l border-amber-500/[0.08] text-amber-600">{fmtInt(tot.prodPrev)}</td>
                          <td className="align-middle px-2 py-2.5 text-center tabular-nums text-amber-600">{fmtInt(tot.prodReal)}</td>
                          <td className={cn("px-2 py-2.5 text-center tabular-nums", gapCls(gapTon))}>{gapTon >= 0 ? "+" : ""}{fmt(gapTonPct)}%</td>
                          <td className="align-middle px-2 py-2.5 text-center tabular-nums border-l border-amber-500/[0.08] text-emerald-600">{fmt(tchPrev)}</td>
                          <td className="align-middle px-2 py-2.5 text-center tabular-nums text-emerald-600">{fmt(tchReal)}</td>
                          <td className={cn("px-2 py-2.5 text-center tabular-nums", gapCls(gapTch))}>{tchPrev > 0 ? `${gapTch >= 0 ? "+" : ""}${fmt(gapTchPct)}%` : "—"}</td>
                          <td className="align-middle px-2 py-2.5 text-center tabular-nums border-l border-amber-500/[0.08] text-violet-600">{atrPrev > 0 ? fmt(atrPrev) : "—"}</td>
                          <td className="align-middle px-2 py-2.5 text-center tabular-nums text-violet-600">{atrMed > 0 ? fmt(atrMed) : "—"}</td>
                          <td className={cn("px-2 py-2.5 text-center tabular-nums", gapCls(gapAtr))}>{atrPrev > 0 && atrMed > 0 ? `${gapAtr >= 0 ? "+" : ""}${fmt(gapAtrPct)}%` : "—"}</td>
                          <td className="align-middle px-2 py-2.5 text-center tabular-nums border-l border-amber-500/[0.08] text-cyan-600">{idadeM > 0 ? fmt(idadeM, 1) : "—"}</td>
                          <td className="align-middle px-2 py-2.5 text-center tabular-nums text-rose-600">{idadeC > 0 ? fmt(idadeC, 1) : "—"}</td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ── KPIs Principais ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-400/90">Indicadores Principais</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            <ExecKpiCard title="TCH MÉDIO (T/Ha)" icon={TrendingUp} index={0} accent="emerald"
              previsto={fmt(kpis.tchPrevMed)} real={fmt(kpis.tchRealMed)}
              gapLabel="Gap" gapValue={`${kpis.gapTch >= 0 ? "+" : ""}${fmt(kpis.gapTch)}`} gapPct={kpis.gapTchPct} />
            <ExecKpiCard title="PRODUÇÃO (TON)" icon={Factory} index={1} accent="amber"
              previsto={fmtInt(kpis.prodPrev)} real={fmtInt(kpis.prodReal)}
              gapLabel="Desvio" gapValue={`${kpis.desvio >= 0 ? "+" : ""}${fmtInt(kpis.desvio)}`} gapPct={kpis.desvioPct} />
            <ExecKpiCard title="ATR MÉDIO (KG ATR/T)" icon={Beaker} index={2} accent="red"
              previsto={fmt(kpis.atrPrev)} real={fmt(kpis.atrMedio)}
              gapLabel="Gap" gapValue={`${kpis.atrGap >= 0 ? "+" : ""}${fmt(kpis.atrGap)}`} gapPct={kpis.atrGapPct} />
            {(() => {
              const tahPrev = (kpis.atrPrev * kpis.tchPrevMed) / 1000;
              const tahReal = (kpis.atrMedio * kpis.tchRealMed) / 1000;
              const tahGap = tahReal - tahPrev;
              const tahGapPct = tahPrev > 0 ? calcGapPct(tahReal, tahPrev) : 0;
              return (
                <ExecKpiCard title="TAH (T/Ha)" icon={Leaf} index={3} accent="violet"
                  previsto={fmt(tahPrev)} real={fmt(tahReal)}
                  gapLabel="Gap" gapValue={`${tahGap >= 0 ? "+" : ""}${fmt(tahGap)}`} gapPct={tahGapPct} />
              );
            })()}
            <IdadeKpiCard index={4} idadeMeses={kpis.idadeMediaMeses} idadeCorte={kpis.idadeMediaCorte} />
          </div>
        </div>

        {/* ── Gráfico: TCH Previsto x Real por Fazenda ── */}
        <div>
          <ChartCard index={0} title="TCH Previsto x Real por Fazenda" subtitle="Comparativo do TCH médio (T/Ha)"
            icon={BarChart3} color="bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
            className="min-h-[520px]"
            headerActions={
              <button onClick={() => setDrilldown({ type: "estagio", value: "ALL", label: "Todas" })}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-amber-500/[0.08] hover:border-amber-500/20">
                Ver detalhes
              </button>
            }
          >
            {tchPorFazenda.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-xs text-muted-foreground">Sem dados suficientes.</div>
            ) : (
              <ResponsiveContainer width="100%" height={490}>
                <ComposedChart data={tchPorFazenda} margin={{ top: 72, right: 54, bottom: 78, left: 16 }} barGap={10} barCategoryGap="18%">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(245,158,11,0.06)" />
                  <XAxis dataKey="label" tick={<FazendaXAxisTick />} interval={0} height={72} />
                  <YAxis yAxisId="left" domain={[0, "dataMax + 15"]} hide />
                  <YAxis yAxisId="right" orientation="right" domain={["dataMin - 12", "dataMax + 12"]} hide />
                  <Tooltip
                    contentStyle={{ background: "#1a1a1a", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 8, fontSize: 11 }}
                    labelFormatter={(label) => { const [cod, nome] = String(label).split("||"); return `${cod} - ${nome || ""}`; }}
                    formatter={(v, n) => {
                      if (n === "gapPct") return [`${Number(v) >= 0 ? "+" : ""}${fmt(Number(v), 2)}%`, "Gap %"];
                      return [fmt(Number(v), 2), n];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10, paddingTop: 10 }} />
                  <Bar yAxisId="left" dataKey="tchPrev" name="TCH Previsto (T/Ha)" fill="#3b82f6" radius={[4,4,0,0]} isAnimationActive animationDuration={650} animationEasing="ease-out">
                    <LabelList dataKey="tchPrev" content={<BarCenterValueLabel />} />
                  </Bar>
                  <Bar yAxisId="left" dataKey="tchReal" name="TCH Real (T/Ha)" fill="#10b981" radius={[4,4,0,0]} isAnimationActive animationDuration={650} animationEasing="ease-out">
                    <LabelList dataKey="tchReal" content={<BarCenterValueLabel />} />
                  </Bar>
                  <Line yAxisId="right" type="monotone" dataKey="gapPct" name="Gap %" stroke="#fbbf24" strokeWidth={3} dot={{ r: 5, fill: "#fbbf24", stroke: "#0f172a", strokeWidth: 2.2 }} activeDot={{ r: 7 }} isAnimationActive animationDuration={800} animationEasing="ease-out">
                    <LabelList dataKey="gapPct" content={<GapPillLabel />} />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* ── Tabela: TCH/ATR por Estágio ── */}
        <div data-pdf-page-break="before">
          <ChartCard index={1} title="TCH Médio por Estágio de Corte" subtitle={`Previsto x Real x Ano Anterior (${historicoAnoRef ?? "—"}) + Gaps (%) — clique para detalhar por fazenda`}
            icon={Grid3x3} color="bg-amber-500/10 border-amber-500/20 text-amber-400">
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b border-amber-500/[0.08] text-[9px] uppercase tracking-wider text-muted-foreground">
                    <th colSpan={3} className="text-left py-1 px-2 bg-amber-500/[0.06]">Identificação</th>
                    <th colSpan={3} className="text-center py-1 px-2 bg-emerald-500/[0.06]">TCH (Safra Atual)</th>
                    <th colSpan={3} className="text-center py-1 px-2 bg-cyan-500/[0.06]">{`TCH Histórico ${historicoAnoRef ?? "Ano Ant."}`}</th>
                    <th colSpan={3} className="text-center py-1 px-2 bg-violet-500/[0.06]">ATR (Safra Atual)</th>
                    <th colSpan={2} className="text-center py-1 px-2 bg-cyan-500/[0.06]">{`ATR Histórico ${historicoAnoRef ?? "Ano Ant."}`}</th>
                    <th colSpan={3} className="text-left py-1 px-2 bg-purple-500/[0.06]">Planejamento / Evolução</th>
                  </tr>
                  <tr className="border-b border-amber-500/[0.15]">
                    <th className="align-middle text-left py-1.5 px-2 whitespace-nowrap text-[11px] font-bold uppercase tracking-wider bg-amber-500/[0.08] text-amber-200/90">Estágio</th>
                    <th className="align-middle text-center py-1.5 px-2 whitespace-nowrap text-[11px] font-bold uppercase tracking-wider bg-amber-500/[0.08] text-amber-200/90">Área (ha)</th>
                    <th className="align-middle text-center py-1.5 px-2 whitespace-nowrap text-[11px] font-bold uppercase tracking-wider bg-amber-500/[0.08] text-amber-200/90">Ton Fechada</th>
                    <th className="align-middle text-center py-1.5 px-2 whitespace-nowrap text-[11px] font-bold uppercase tracking-wider bg-emerald-500/[0.08] text-emerald-200/90">TCH Prev.</th>
                    <th className="align-middle text-center py-1.5 px-2 whitespace-nowrap text-[11px] font-bold uppercase tracking-wider bg-emerald-500/[0.08] text-emerald-200/90">TCH Real</th>
                    <th className="align-middle text-center py-1.5 px-2 whitespace-nowrap text-[11px] font-bold uppercase tracking-wider bg-emerald-500/[0.08] text-emerald-200/90">Gap (%)</th>
                    <th className="align-middle text-center py-1.5 px-2 whitespace-nowrap text-[11px] font-bold uppercase tracking-wider bg-cyan-500/[0.08] text-cyan-200/90">{`Área ${historicoAnoRef ?? "Ant."}`}</th>
                    <th className="align-middle text-center py-1.5 px-2 whitespace-nowrap text-[11px] font-bold uppercase tracking-wider bg-cyan-500/[0.08] text-cyan-200/90">{`TCH ${historicoAnoRef ?? "Ant."}`}</th>
                    <th className="align-middle text-center py-1.5 px-2 whitespace-nowrap text-[11px] font-bold uppercase tracking-wider bg-cyan-500/[0.08] text-cyan-200/90">Gap (%)</th>
                    <th className="align-middle text-center py-1.5 px-2 whitespace-nowrap text-[11px] font-bold uppercase tracking-wider bg-violet-500/[0.08] text-violet-200/90">ATR Prev.</th>
                    <th className="align-middle text-center py-1.5 px-2 whitespace-nowrap text-[11px] font-bold uppercase tracking-wider bg-violet-500/[0.08] text-violet-200/90">ATR Real</th>
                    <th className="align-middle text-center py-1.5 px-2 whitespace-nowrap text-[11px] font-bold uppercase tracking-wider bg-violet-500/[0.08] text-violet-200/90">Gap (%)</th>
                    <th className="align-middle text-center py-1.5 px-2 whitespace-nowrap text-[11px] font-bold uppercase tracking-wider bg-cyan-500/[0.08] text-cyan-200/90">{`ATR ${historicoAnoRef ?? "Ant."}`}</th>
                    <th className="align-middle text-center py-1.5 px-2 whitespace-nowrap text-[11px] font-bold uppercase tracking-wider bg-cyan-500/[0.08] text-cyan-200/90">Gap (%)</th>
                    <th className="align-middle text-left py-1.5 px-2 whitespace-nowrap text-[11px] font-bold uppercase tracking-wider bg-purple-500/[0.08] text-purple-200/90 w-full min-w-[220px]">Evolução</th>
                    <th className="align-middle text-center py-1.5 px-2 whitespace-nowrap text-[11px] font-bold uppercase tracking-wider bg-purple-500/[0.08] text-purple-200/90">Área Plan.</th>
                    <th className="align-middle text-center py-1.5 px-2 whitespace-nowrap text-[11px] font-bold uppercase tracking-wider bg-purple-500/[0.08] text-purple-200/90">% Real.</th>
                  </tr>
                </thead>
                <tbody>
                  {tchPorEstagio.slice(estagioPage * ESTAGIO_PAGE_SIZE, (estagioPage + 1) * ESTAGIO_PAGE_SIZE).map((e) => {
                    const positive = e.gapPct >= 0;
                    const positiveAno = e.gapAnoAntPct >= 0;
                    const positiveAtr = e.gapAtrPct >= 0;
                    const positiveAtrAno = e.gapAtrAnoAntPct >= 0;
                    const estagioLabel = /^\d+$/.test(String(e.estagio).trim()) ? `${e.estagio}º Corte` : String(e.estagio);
                    const estStr = String(e.estagio).trim();
                    const estInt = estStr.match(/\d+/)?.[0] || "";
                    const areaPlan = e.areaPlan ?? e.areaPlanejada ?? areaPlanCorte[estStr] ?? areaPlanCorte[estInt] ?? 0;
                    const realPct = areaPlan > 0 ? (e.areaReal / areaPlan) * 100 : 0;
                    const fillPct = Math.max(0, Math.min(100, realPct));
                    const done = realPct >= 100;
                    return (
                      <tr key={String(e.estagio)} className="border-b border-amber-500/[0.06] hover:bg-amber-500/[0.08] transition-colors cursor-pointer"
                        onClick={() => setDrilldown({ type: "estagio", value: estStr, label: estagioLabel })}>
                        <td className="align-middle py-1.5 px-2 whitespace-nowrap text-foreground font-medium">{estagioLabel}</td>
                        <td className="align-middle py-1.5 px-2 whitespace-nowrap text-center text-foreground/80 font-mono">{fmt(e.areaReal)}</td>
                        <td className="align-middle py-1.5 px-2 whitespace-nowrap text-center text-emerald-400 font-mono font-semibold">{fmt(e.tonReal)}</td>
                        <td className="align-middle py-1.5 px-2 whitespace-nowrap text-center text-foreground font-mono">{fmt(e.tchPrev)}</td>
                        <td className="align-middle py-1.5 px-2 whitespace-nowrap text-center text-emerald-400 font-mono font-semibold">{fmt(e.tchReal)}</td>
                        <td className={cn("py-1.5 px-2 whitespace-nowrap text-center font-mono font-bold", positive ? "text-emerald-400" : "text-red-400")}>{positive ? "+" : ""}{fmt(e.gapPct)}%</td>
                        <td className="align-middle py-1.5 px-2 whitespace-nowrap text-center text-foreground/80 font-mono">{e.areaAnoAnt > 0 ? fmt(e.areaAnoAnt) : "—"}</td>
                        <td className="align-middle py-1.5 px-2 whitespace-nowrap text-center text-foreground/80 font-mono">{e.tchAnoAnt > 0 ? fmt(e.tchAnoAnt) : "—"}</td>
                        <td className={cn("py-1.5 px-2 whitespace-nowrap text-center font-mono font-bold", e.tchAnoAnt > 0 ? (positiveAno ? "text-emerald-400" : "text-red-400") : "text-muted-foreground")}>{e.tchAnoAnt > 0 ? `${positiveAno ? "+" : ""}${fmt(e.gapAnoAntPct)}%` : "—"}</td>
                        <td className="align-middle py-1.5 px-2 whitespace-nowrap text-center text-foreground font-mono">{e.atrPrev > 0 ? fmt(e.atrPrev) : "—"}</td>
                        <td className="align-middle py-1.5 px-2 whitespace-nowrap text-center text-violet-300 font-mono font-semibold">{e.atr > 0 ? fmt(e.atr) : "—"}</td>
                        <td className={cn("py-1.5 px-2 whitespace-nowrap text-center font-mono font-bold", e.atrPrev > 0 ? (positiveAtr ? "text-emerald-400" : "text-red-400") : "text-muted-foreground")}>{e.atrPrev > 0 ? `${positiveAtr ? "+" : ""}${fmt(e.gapAtrPct)}%` : "—"}</td>
                        <td className="align-middle py-1.5 px-2 whitespace-nowrap text-center text-foreground/80 font-mono">{e.atrAnoAnt > 0 ? fmt(e.atrAnoAnt) : "—"}</td>
                        <td className={cn("py-1.5 px-2 whitespace-nowrap text-center font-mono font-bold", e.atrAnoAnt > 0 ? (positiveAtrAno ? "text-emerald-400" : "text-red-400") : "text-muted-foreground")}>{e.atrAnoAnt > 0 ? `${positiveAtrAno ? "+" : ""}${fmt(e.gapAtrAnoAntPct)}%` : "—"}</td>
                        <td className="align-middle py-1.5 px-2 whitespace-nowrap w-full min-w-[220px]">
                          <div className="relative h-3 rounded-full bg-white/[0.045] overflow-hidden shadow-inner">
                            <div className={cn("absolute inset-y-0 left-0 rounded-full transition-all", done ? "bg-gradient-to-r from-emerald-500 to-emerald-400" : "bg-gradient-to-r from-green-600 to-green-400")} style={{ width: `${fillPct}%` }} />
                          </div>
                        </td>
                        <td className="align-middle py-1.5 px-2 whitespace-nowrap text-center text-foreground/80 font-mono">{areaPlan > 0 ? fmt(areaPlan) : "—"}</td>
                        <td className={cn("py-1.5 px-2 whitespace-nowrap text-center font-mono font-bold", done ? "text-emerald-400" : "text-amber-400")}>{areaPlan > 0 ? `${fmt(realPct)}%` : "—"}</td>
                      </tr>
                    );
                  })}
                  {(() => {
                    const total = tchPorEstagio.reduce((acc, e) => {
                      const areaReal = Number(e.areaReal || 0);
                      const tonReal = Number(e.tonReal || 0);
                      const tonPrev = Number(e.tonPrev || 0);
                      const areaAnt = Number(e.areaAnoAnt || 0);
                      const tchAnt = Number(e.tchAnoAnt || 0);
                      const atrAnt = Number(e.atrAnoAnt || 0);
                      const atr = Number(e.atr || 0);
                      const atrPrev = Number(e.atrPrev || 0);
                      const estStr = String(e.estagio ?? "").trim();
                      const estInt = estStr.match(/\d+/)?.[0] || "";
                      const plan = Number(e.areaPlan ?? e.areaPlanejada ?? areaPlanCorte[estStr] ?? areaPlanCorte[estInt] ?? 0);
                      acc.areaReal += areaReal;
                      acc.tonReal += tonReal;
                      acc.tonPrev += tonPrev;
                      acc.areaAnoAnt += areaAnt;
                      if (areaAnt > 0 && tchAnt > 0) { acc.tchAntPeso += tchAnt * areaAnt; acc.tchAntArea += areaAnt; }
                      if (areaAnt > 0 && atrAnt > 0) { acc.atrAntPeso += atrAnt * areaAnt; acc.atrAntArea += areaAnt; }
                      if (tonReal > 0 && atr > 0) { acc.atrRealPeso += atr * tonReal; acc.atrRealTon += tonReal; }
                      if (tonPrev > 0 && atrPrev > 0) { acc.atrPrevPeso += atrPrev * tonPrev; acc.atrPrevTon += tonPrev; }
                      acc.areaPlan += plan;
                      return acc;
                    }, { areaReal: 0, tonReal: 0, tonPrev: 0, areaAnoAnt: 0, tchAntPeso: 0, tchAntArea: 0, atrAntPeso: 0, atrAntArea: 0, atrRealPeso: 0, atrRealTon: 0, atrPrevPeso: 0, atrPrevTon: 0, areaPlan: 0 });
                    const tchPrev = total.areaReal > 0 ? total.tonPrev / total.areaReal : 0;
                    const tchReal = total.areaReal > 0 ? total.tonReal / total.areaReal : 0;
                    const gapPct = tchPrev > 0 ? calcGapPct(tchReal, tchPrev) : 0;
                    const tchAnt = total.tchAntArea > 0 ? total.tchAntPeso / total.tchAntArea : 0;
                    const gapAnt = tchAnt > 0 ? calcGapPct(tchReal, tchAnt) : 0;
                    const atrPrev = total.atrPrevTon > 0 ? total.atrPrevPeso / total.atrPrevTon : 0;
                    const atrReal = total.atrRealTon > 0 ? total.atrRealPeso / total.atrRealTon : 0;
                    const gapAtr = atrPrev > 0 ? calcGapPct(atrReal, atrPrev) : 0;
                    const atrAnt = total.atrAntArea > 0 ? total.atrAntPeso / total.atrAntArea : 0;
                    const gapAtrAnt = atrAnt > 0 ? calcGapPct(atrReal, atrAnt) : 0;
                    const realPct = total.areaPlan > 0 ? (total.areaReal / total.areaPlan) * 100 : 0;
                    const fillPct = Math.max(0, Math.min(100, realPct));
                    const done = realPct >= 100;
                    return (
                      <tr className="bg-amber-500/[0.075] border-t border-amber-500/[0.18] font-bold">
                        <td className="align-middle py-2 px-2 whitespace-nowrap text-amber-300">TOTAL</td>
                        <td className="align-middle py-2 px-2 whitespace-nowrap text-center text-amber-200 font-mono">{fmt(total.areaReal)}</td>
                        <td className="align-middle py-2 px-2 whitespace-nowrap text-center text-emerald-300 font-mono">{fmt(total.tonReal)}</td>
                        <td className="align-middle py-2 px-2 whitespace-nowrap text-center text-foreground font-mono">{fmt(tchPrev)}</td>
                        <td className="align-middle py-2 px-2 whitespace-nowrap text-center text-emerald-300 font-mono">{fmt(tchReal)}</td>
                        <td className={cn("py-2 px-2 whitespace-nowrap text-center font-mono", gapPct >= 0 ? "text-emerald-400" : "text-red-400")}>{tchPrev > 0 ? `${gapPct >= 0 ? "+" : ""}${fmt(gapPct)}%` : "—"}</td>
                        <td className="align-middle py-2 px-2 whitespace-nowrap text-center text-foreground/80 font-mono">{total.areaAnoAnt > 0 ? fmt(total.areaAnoAnt) : "—"}</td>
                        <td className="align-middle py-2 px-2 whitespace-nowrap text-center text-foreground/80 font-mono">{tchAnt > 0 ? fmt(tchAnt) : "—"}</td>
                        <td className={cn("py-2 px-2 whitespace-nowrap text-center font-mono", tchAnt > 0 ? (gapAnt >= 0 ? "text-emerald-400" : "text-red-400") : "text-muted-foreground")}>{tchAnt > 0 ? `${gapAnt >= 0 ? "+" : ""}${fmt(gapAnt)}%` : "—"}</td>
                        <td className="align-middle py-2 px-2 whitespace-nowrap text-center text-foreground font-mono">{atrPrev > 0 ? fmt(atrPrev) : "—"}</td>
                        <td className="align-middle py-2 px-2 whitespace-nowrap text-center text-violet-300 font-mono">{atrReal > 0 ? fmt(atrReal) : "—"}</td>
                        <td className={cn("py-2 px-2 whitespace-nowrap text-center font-mono", atrPrev > 0 ? (gapAtr >= 0 ? "text-emerald-400" : "text-red-400") : "text-muted-foreground")}>{atrPrev > 0 ? `${gapAtr >= 0 ? "+" : ""}${fmt(gapAtr)}%` : "—"}</td>
                        <td className="align-middle py-2 px-2 whitespace-nowrap text-center text-foreground/80 font-mono">{atrAnt > 0 ? fmt(atrAnt) : "—"}</td>
                        <td className={cn("py-2 px-2 whitespace-nowrap text-center font-mono", atrAnt > 0 ? (gapAtrAnt >= 0 ? "text-emerald-400" : "text-red-400") : "text-muted-foreground")}>{atrAnt > 0 ? `${gapAtrAnt >= 0 ? "+" : ""}${fmt(gapAtrAnt)}%` : "—"}</td>
                        <td className="align-middle py-2 px-2 whitespace-nowrap w-full min-w-[220px]">
                          <div className="relative h-3 rounded-full bg-white/[0.045] overflow-hidden shadow-inner">
                            <div className={cn("absolute inset-y-0 left-0 rounded-full transition-all", done ? "bg-gradient-to-r from-emerald-500 to-emerald-400" : "bg-gradient-to-r from-green-600 to-green-400")} style={{ width: `${fillPct}%` }} />
                          </div>
                        </td>
                        <td className="align-middle py-2 px-2 whitespace-nowrap text-center text-foreground/80 font-mono">{total.areaPlan > 0 ? fmt(total.areaPlan) : "—"}</td>
                        <td className={cn("py-2 px-2 whitespace-nowrap text-center font-mono", done ? "text-emerald-400" : "text-amber-400")}>{total.areaPlan > 0 ? `${fmt(realPct)}%` : "—"}</td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
            {tchPorEstagio.length > ESTAGIO_PAGE_SIZE && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>Mostrando {Math.min(tchPorEstagio.length, estagioPage * ESTAGIO_PAGE_SIZE + 1)}-{Math.min(tchPorEstagio.length, (estagioPage + 1) * ESTAGIO_PAGE_SIZE)} de {tchPorEstagio.length} estágios</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEstagioPage((p) => Math.max(0, p - 1))}
                    disabled={estagioPage === 0}
                    className="rounded-lg border border-amber-500/[0.15] px-3 py-1 text-xs font-semibold text-foreground disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <span className="font-mono text-amber-200">{estagioPage + 1}/{Math.ceil(tchPorEstagio.length / ESTAGIO_PAGE_SIZE)}</span>
                  <button
                    type="button"
                    onClick={() => setEstagioPage((p) => Math.min(Math.ceil(tchPorEstagio.length / ESTAGIO_PAGE_SIZE) - 1, p + 1))}
                    disabled={estagioPage >= Math.ceil(tchPorEstagio.length / ESTAGIO_PAGE_SIZE) - 1}
                    className="rounded-lg border border-amber-500/[0.15] px-3 py-1 text-xs font-semibold text-foreground disabled:opacity-40"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </ChartCard>
        </div>

        {/* ── Gráficos: TCH/ATR/TON Mensal ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <ChartCard index={2} title="TCH Fechado Mês a Mês" subtitle="Ton/Área dos talhões encerrados por mês da safra (ABR..DEZ + ACUM)"
            icon={Activity} color="bg-emerald-500/10 border-emerald-500/20 text-emerald-400" className="min-h-[390px] fechamento-month-card">
            {tchAtrMensal.length <= 1 ? (
              <div className="flex items-center justify-center h-40 text-xs text-muted-foreground">Sem dados mensais. Verifique as datas de encerramento das OCs.</div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={tchAtrMensal} margin={{ top: 24, right: 18, bottom: 18, left: 8 }}
                  onClick={(d) => { if (d?.activePayload?.[0]) setDrilldown({ type: "mes", value: d.activePayload[0].payload.mes, label: d.activePayload[0].payload.mes }); }}>
                  <defs>
                    <linearGradient id="barGreenTchOC" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" />
                      <stop offset="100%" stopColor="#16a34a" />
                    </linearGradient>
                    <linearGradient id="barYellowAcumOC" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f6b700" />
                      <stop offset="100%" stopColor="#f6b700" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(245,158,11,0.07)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.62)" }} />
                  <YAxis tick={{ fontSize: 9, fill: "rgba(255,255,255,0.62)" }} />
                  <Tooltip contentStyle={{ background: "#0b1117", border: "1px solid rgba(245,158,11,0.22)", borderRadius: 10, fontSize: 11 }}
                    formatter={(v, n) => [fmt(v), n === "tch" ? "TCH Real" : "TCH Prev.."]} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar isAnimationActive animationDuration={650} animationEasing="ease-out" dataKey="tch" name="TCH Real" radius={[5,5,0,0]}>
                    {tchAtrMensal.map((entry, i) => <Cell key={i} fill={entry.mes === "ACUM" ? "url(#barYellowAcumOC)" : "url(#barGreenTchOC)"} />)}
                    <LabelList dataKey="tch" content={<MonthBarValueLabel />} />
                  </Bar>
                  <Line isAnimationActive animationDuration={800} animationEasing="ease-out" type="monotone" dataKey="tchPrev" name="TCH Prev.." stroke="#2db7f5" strokeWidth={2.2} dot={{ r: 3 }} activeDot={{ r: 5 }}>
                    <LabelList dataKey="tchPrev" content={<MonthLineValueLabel />} />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard index={3} title="ATR Fechado Mês a Mês" subtitle="ATR ponderado pela tonelagem dos talhões encerrados por mês (ABR..DEZ + ACUM)"
            icon={Beaker} color="bg-violet-500/10 border-violet-500/20 text-violet-400" className="min-h-[390px] fechamento-month-card">
            {tchAtrMensal.length <= 1 ? (
              <div className="flex items-center justify-center h-40 text-xs text-muted-foreground">Sem dados mensais. Verifique as datas de encerramento das OCs.</div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={tchAtrMensal} margin={{ top: 24, right: 18, bottom: 18, left: 8 }}
                  onClick={(d) => { if (d?.activePayload?.[0]) setDrilldown({ type: "mes", value: d.activePayload[0].payload.mes, label: d.activePayload[0].payload.mes }); }}>
                  <defs>
                    <linearGradient id="barPurpleAtrOC" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7c3aed" />
                      <stop offset="100%" stopColor="#6d28d9" />
                    </linearGradient>
                    <linearGradient id="barYellowAtrAcumOC" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f6b700" />
                      <stop offset="100%" stopColor="#f6b700" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(245,158,11,0.07)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.62)" }} />
                  <YAxis tick={{ fontSize: 9, fill: "rgba(255,255,255,0.62)" }} />
                  <Tooltip contentStyle={{ background: "#0b1117", border: "1px solid rgba(245,158,11,0.22)", borderRadius: 10, fontSize: 11 }}
                    formatter={(v, n) => [fmt(v), n === "atr" ? "ATR Real" : "ATR Previsto"]} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar isAnimationActive animationDuration={650} animationEasing="ease-out" dataKey="atr" name="ATR Real" radius={[5,5,0,0]}>
                    {tchAtrMensal.map((entry, i) => <Cell key={i} fill={entry.mes === "ACUM" ? "url(#barYellowAtrAcumOC)" : "url(#barPurpleAtrOC)"} />)}
                    <LabelList dataKey="atr" content={<MonthBarValueLabel />} />
                  </Bar>
                  <Line isAnimationActive animationDuration={800} animationEasing="ease-out" type="monotone" dataKey="metaAtr" name="ATR Previsto" stroke="#f6b700" strokeWidth={2.2} dot={{ r: 3 }} activeDot={{ r: 5 }}>
                    <LabelList dataKey="metaAtr" content={<MonthLineValueLabel />} />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard index={4} title="TON Fechada Mês a Mês" subtitle="Toneladas reais dos talhões encerrados por mês (ABR..DEZ + ACUM)"
            icon={Factory} color="bg-orange-500/10 border-orange-500/20 text-orange-400" className="min-h-[390px] fechamento-month-card">
            {tchAtrMensal.length <= 1 ? (
              <div className="flex items-center justify-center h-40 text-xs text-muted-foreground">Sem dados mensais. Verifique as datas de encerramento das OCs.</div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={tchAtrMensal} margin={{ top: 24, right: 18, bottom: 18, left: 8 }}
                  onClick={(d) => { if (d?.activePayload?.[0]) setDrilldown({ type: "mes", value: d.activePayload[0].payload.mes, label: d.activePayload[0].payload.mes }); }}>
                  <defs>
                    <linearGradient id="barOrangeTonOC" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f97316" />
                      <stop offset="100%" stopColor="#f97316" />
                    </linearGradient>
                    <linearGradient id="barYellowTonAcumOC" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f6b700" />
                      <stop offset="100%" stopColor="#f6b700" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(245,158,11,0.07)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.62)" }} />
                  <YAxis tick={{ fontSize: 9, fill: "rgba(255,255,255,0.62)" }} tickFormatter={(v) => fmtInt(v)} />
                  <Tooltip contentStyle={{ background: "#0b1117", border: "1px solid rgba(245,158,11,0.22)", borderRadius: 10, fontSize: 11 }}
                    formatter={(v, n) => [fmtInt(v), n === "ton" ? "TON Real" : "TON Prev."]} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar isAnimationActive animationDuration={650} animationEasing="ease-out" dataKey="ton" name="TON Real" radius={[5,5,0,0]}>
                    {tchAtrMensal.map((entry, i) => <Cell key={i} fill={entry.mes === "ACUM" ? "url(#barYellowTonAcumOC)" : "url(#barOrangeTonOC)"} />)}
                    <LabelList dataKey="ton" content={<MonthBarValueLabel />} />
                  </Bar>
                  <Line isAnimationActive animationDuration={800} animationEasing="ease-out" type="monotone" dataKey="tonPrev" name="TON Prev." stroke="#2db7f5" strokeWidth={2.2} dot={{ r: 3 }} activeDot={{ r: 5 }}>
                    <LabelList dataKey="tonPrev" content={<MonthLineValueLabel />} />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>



        {/* ── Tabela: TCH/ATR por Variedade ── */}
        <div className="grid grid-cols-1 gap-4">
          <ChartCard index={5} title="TCH Previsto x Real por Variedade" subtitle="Produtividade, gaps e evolução por variedade"
            icon={Leaf} color="bg-emerald-500/10 border-emerald-500/20 text-emerald-400" className="fechamento-table-card">
            <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setVariedadeEstagioFilter("all")}
                className={cn("rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wide transition", variedadeEstagioFilter === "all" ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-border/60 text-muted-foreground hover:text-foreground")}
              >
                Todos
              </button>
              {estagiosUnicos.map((est) => (
                <button
                  key={est}
                  type="button"
                  onClick={() => setVariedadeEstagioFilter(est)}
                  className={cn("rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wide transition", variedadeEstagioFilter === est ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-border/60 text-muted-foreground hover:text-foreground")}
                >
                  {est}º C
                </button>
              ))}
            </div>

            <div className="overflow-x-auto rounded-xl border border-amber-500/[0.10]">
              <table className="w-full min-w-[1180px] text-[11px]">
                <thead className="bg-amber-500/[0.06] text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th colSpan={4} className="px-2 py-2 text-left border-r border-amber-500/[0.08]">Identificação</th>
                    <th colSpan={3} className="px-2 py-2 text-left border-r border-emerald-500/[0.10]">TCH (Safra Atual)</th>
                    <th colSpan={3} className="px-2 py-2 text-left border-r border-violet-500/[0.10]">ATR (Safra Atual)</th>
                    <th colSpan={3} className="px-2 py-2 text-left">Planejamento / Evolução</th>
                  </tr>
                  <tr>
                    <th className="px-2 py-2 text-left">Variedade</th>
                    <th className="px-2 py-2 text-center">Área (ha)</th>
                    <th className="px-2 py-2 text-center">Ton Fechada</th>
                    <th className="px-2 py-2 text-center border-r border-amber-500/[0.08]">Idade meses</th>
                    <th className="px-2 py-2 text-center">TCH Prev.</th>
                    <th className="px-2 py-2 text-center">TCH Real</th>
                    <th className="px-2 py-2 text-center border-r border-emerald-500/[0.10]">Gap (%)</th>
                    <th className="px-2 py-2 text-center">ATR Prev.</th>
                    <th className="px-2 py-2 text-center">ATR Real</th>
                    <th className="px-2 py-2 text-center border-r border-violet-500/[0.10]">Gap (%)</th>
                    <th className="px-2 py-2 text-left">Evolução</th>
                    <th className="px-2 py-2 text-center">Área Plan.</th>
                    <th className="px-2 py-2 text-center">% Real.</th>
                  </tr>
                </thead>
                <tbody className="[&>tr+tr]:border-t [&>tr+tr]:border-amber-500/[0.055]">
                  {tchPorVariedadeTabela.slice(variedadePage * VARIEDADE_PAGE_SIZE, (variedadePage + 1) * VARIEDADE_PAGE_SIZE).map((v) => {
                    const areaPlan = Number(v.areaPlan ?? v.areaPlanejada ?? areaPlanVariedade[v.variedade] ?? 0);
                    const realPct = areaPlan > 0 ? (Number(v.areaReal || 0) / areaPlan) * 100 : Number(v.realPct || 0);
                    const fillPct = Math.max(0, Math.min(100, realPct));
                    const done = realPct >= 100;
                    return (
                      <tr key={v.variedade} className="hover:bg-amber-500/[0.035] cursor-pointer transition-colors" onClick={() => setDrilldown({ type: "variedade", value: v.variedade, label: v.variedade })}>
                        <td className="py-1.5 px-2 whitespace-nowrap font-bold text-foreground">{v.variedade}</td>
                        <td className="py-1.5 px-2 whitespace-nowrap text-center text-foreground/80 font-mono">{fmt(Number(v.areaReal || 0))}</td>
                        <td className="py-1.5 px-2 whitespace-nowrap text-center text-emerald-300 font-mono font-bold">{fmt(Number(v.tonReal || 0))}</td>
                        <td className="py-1.5 px-2 whitespace-nowrap text-center text-cyan-300 font-mono font-bold">{Number(v.idadeMedia || 0) > 0 ? fmt(Number(v.idadeMedia || 0), 1) : "—"}</td>
                        <td className="py-1.5 px-2 whitespace-nowrap text-center text-foreground font-mono">{fmt(Number(v.tchPrev || 0))}</td>
                        <td className="py-1.5 px-2 whitespace-nowrap text-center text-emerald-300 font-mono font-bold">{fmt(Number(v.tchReal || 0))}</td>
                        <td className={cn("py-1.5 px-2 whitespace-nowrap text-center font-mono font-bold", Number(v.gapPct || 0) >= 0 ? "text-emerald-400" : "text-red-400")}>{Number(v.tchPrev || 0) > 0 ? `${Number(v.gapPct || 0) >= 0 ? "+" : ""}${fmt(Number(v.gapPct || 0))}%` : "—"}</td>
                        <td className="py-1.5 px-2 whitespace-nowrap text-center text-foreground font-mono">{Number(v.atrPrev || 0) > 0 ? fmt(Number(v.atrPrev || 0)) : "—"}</td>
                        <td className="py-1.5 px-2 whitespace-nowrap text-center text-violet-300 font-mono font-bold">{Number(v.atr || 0) > 0 ? fmt(Number(v.atr || 0)) : "—"}</td>
                        <td className={cn("py-1.5 px-2 whitespace-nowrap text-center font-mono font-bold", Number(v.gapAtrPct || 0) >= 0 ? "text-emerald-400" : "text-red-400")}>{Number(v.atrPrev || 0) > 0 ? `${Number(v.gapAtrPct || 0) >= 0 ? "+" : ""}${fmt(Number(v.gapAtrPct || 0))}%` : "—"}</td>
                        <td className="py-1.5 px-2 whitespace-nowrap w-full min-w-[260px]">
                          <div className="relative h-3 rounded-full bg-white/[0.045] overflow-hidden shadow-inner">
                            <div className={cn("absolute inset-y-0 left-0 rounded-full transition-all", done ? "bg-gradient-to-r from-emerald-500 to-emerald-400" : "bg-gradient-to-r from-green-600 to-green-400")} style={{ width: `${fillPct}%` }} />
                          </div>
                        </td>
                        <td className="py-1.5 px-2 whitespace-nowrap text-center text-foreground/80 font-mono">{areaPlan > 0 ? fmt(areaPlan) : "—"}</td>
                        <td className={cn("py-1.5 px-2 whitespace-nowrap text-center font-mono font-bold", done ? "text-emerald-400" : "text-amber-400")}>{areaPlan > 0 ? `${fmt(realPct)}%` : "—"}</td>
                      </tr>
                    );
                  })}
                  {(() => {
                    const total = tchPorVariedadeTabela.reduce((acc, v) => {
                      const areaReal = Number(v.areaReal || 0);
                      const tonReal = Number(v.tonReal || 0);
                      const tonPrev = Number(v.tonPrev || 0);
                      const atr = Number(v.atr || 0);
                      const atrPrev = Number(v.atrPrev || 0);
                      const idade = Number(v.idadeMedia || 0);
                      const areaPlan = Number(v.areaPlan ?? v.areaPlanejada ?? areaPlanVariedade[v.variedade] ?? 0);
                      acc.areaReal += areaReal;
                      acc.tonReal += tonReal;
                      acc.tonPrev += tonPrev;
                      acc.areaPlan += areaPlan;
                      if (areaReal > 0 && idade > 0) { acc.idadePeso += idade * areaReal; acc.idadeArea += areaReal; }
                      if (tonReal > 0 && atr > 0) { acc.atrPeso += atr * tonReal; acc.atrTon += tonReal; }
                      if (tonPrev > 0 && atrPrev > 0) { acc.atrPrevPeso += atrPrev * tonPrev; acc.atrPrevTon += tonPrev; }
                      return acc;
                    }, { areaReal: 0, tonReal: 0, tonPrev: 0, areaPlan: 0, idadePeso: 0, idadeArea: 0, atrPeso: 0, atrTon: 0, atrPrevPeso: 0, atrPrevTon: 0 });
                    const tchPrev = total.areaReal > 0 ? total.tonPrev / total.areaReal : 0;
                    const tchReal = total.areaReal > 0 ? total.tonReal / total.areaReal : 0;
                    const gapPct = tchPrev > 0 ? calcGapPct(tchReal, tchPrev) : 0;
                    const atrPrev = total.atrPrevTon > 0 ? total.atrPrevPeso / total.atrPrevTon : 0;
                    const atrReal = total.atrTon > 0 ? total.atrPeso / total.atrTon : 0;
                    const gapAtr = atrPrev > 0 ? calcGapPct(atrReal, atrPrev) : 0;
                    const idadeMedia = total.idadeArea > 0 ? total.idadePeso / total.idadeArea : 0;
                    const realPct = total.areaPlan > 0 ? (total.areaReal / total.areaPlan) * 100 : 0;
                    const fillPct = Math.max(0, Math.min(100, realPct));
                    const done = realPct >= 100;
                    return (
                      <tr className="bg-amber-500/[0.075] border-t border-amber-500/[0.18] font-bold">
                        <td className="py-2 px-2 whitespace-nowrap text-amber-300">TOTAL</td>
                        <td className="py-2 px-2 whitespace-nowrap text-center text-amber-200 font-mono">{fmt(total.areaReal)}</td>
                        <td className="py-2 px-2 whitespace-nowrap text-center text-emerald-300 font-mono">{fmt(total.tonReal)}</td>
                        <td className="py-2 px-2 whitespace-nowrap text-center text-cyan-300 font-mono">{idadeMedia > 0 ? fmt(idadeMedia, 1) : "—"}</td>
                        <td className="py-2 px-2 whitespace-nowrap text-center text-foreground font-mono">{fmt(tchPrev)}</td>
                        <td className="py-2 px-2 whitespace-nowrap text-center text-emerald-300 font-mono">{fmt(tchReal)}</td>
                        <td className={cn("py-2 px-2 whitespace-nowrap text-center font-mono", gapPct >= 0 ? "text-emerald-400" : "text-red-400")}>{tchPrev > 0 ? `${gapPct >= 0 ? "+" : ""}${fmt(gapPct)}%` : "—"}</td>
                        <td className="py-2 px-2 whitespace-nowrap text-center text-foreground font-mono">{atrPrev > 0 ? fmt(atrPrev) : "—"}</td>
                        <td className="py-2 px-2 whitespace-nowrap text-center text-violet-300 font-mono">{atrReal > 0 ? fmt(atrReal) : "—"}</td>
                        <td className={cn("py-2 px-2 whitespace-nowrap text-center font-mono", gapAtr >= 0 ? "text-emerald-400" : "text-red-400")}>{atrPrev > 0 ? `${gapAtr >= 0 ? "+" : ""}${fmt(gapAtr)}%` : "—"}</td>
                        <td className="py-2 px-2 whitespace-nowrap w-full min-w-[260px]"><div className="relative h-3 rounded-full bg-white/[0.045] overflow-hidden shadow-inner"><div className={cn("absolute inset-y-0 left-0 rounded-full transition-all", done ? "bg-gradient-to-r from-emerald-500 to-emerald-400" : "bg-gradient-to-r from-green-600 to-green-400")} style={{ width: `${fillPct}%` }} /></div></td>
                        <td className="py-2 px-2 whitespace-nowrap text-center text-foreground/80 font-mono">{total.areaPlan > 0 ? fmt(total.areaPlan) : "—"}</td>
                        <td className={cn("py-2 px-2 whitespace-nowrap text-center font-mono", done ? "text-emerald-400" : "text-amber-400")}>{total.areaPlan > 0 ? `${fmt(realPct)}%` : "—"}</td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
            {tchPorVariedadeTabela.length > VARIEDADE_PAGE_SIZE && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>Mostrando {Math.min(tchPorVariedadeTabela.length, variedadePage * VARIEDADE_PAGE_SIZE + 1)}-{Math.min(tchPorVariedadeTabela.length, (variedadePage + 1) * VARIEDADE_PAGE_SIZE)} de {tchPorVariedadeTabela.length} variedades</span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setVariedadePage((p) => Math.max(0, p - 1))} disabled={variedadePage === 0} className="rounded-lg border border-amber-500/[0.15] px-3 py-1 text-xs font-semibold text-foreground disabled:opacity-40">Anterior</button>
                  <span className="font-mono text-amber-200">{variedadePage + 1}/{Math.ceil(tchPorVariedadeTabela.length / VARIEDADE_PAGE_SIZE)}</span>
                  <button type="button" onClick={() => setVariedadePage((p) => Math.min(Math.ceil(tchPorVariedadeTabela.length / VARIEDADE_PAGE_SIZE) - 1, p + 1))} disabled={variedadePage >= Math.ceil(tchPorVariedadeTabela.length / VARIEDADE_PAGE_SIZE) - 1} className="rounded-lg border border-amber-500/[0.15] px-3 py-1 text-xs font-semibold text-foreground disabled:opacity-40">Próxima</button>
                </div>
              </div>
            )}
          </ChartCard>
        </div>

        {/* ── Gráficos finais no padrão executivo ── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ChartCard index={6} title="ATR × TCH — Quadrante de Qualidade" subtitle="Clique num quadrante para detalhar"
            icon={ScatterIcon} color="bg-sky-500/10 border-sky-500/20 text-sky-400" className="min-h-[380px]">
            {atrData.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-xs text-muted-foreground">Sem dados de ATR.</div>
            ) : (
              <div className="relative h-[300px]">
                {[
                  ["altoAtrBaixoTch", "left-12 top-2"],
                  ["altoAtrAltoTch", "right-10 top-2"],
                  ["baixoAtrBaixoTch", "left-12 bottom-8"],
                  ["baixoAtrAltoTch", "right-10 bottom-8"],
                ].map(([key, pos]) => {
                  const q = atrTchQuadranteResumo[key];
                  if (!q) return null;
                  return (
                    <div key={key} onClick={() => setDrilldown({ type: "quadrante-atr", value: key, label: q.label || key })} title="Clique para detalhar as fazendas desse quadrante" className={cn("pointer-events-auto absolute z-10 cursor-pointer rounded-xl border bg-slate-950/80 px-3 py-2 text-[10px] font-black uppercase leading-tight shadow-lg backdrop-blur transition hover:scale-[1.03] hover:bg-slate-900", pos)} style={{ borderColor: q.color, color: q.color }}>
                      <div>{q.label}</div>
                      <div className="mt-0.5 text-[12px]">{fmt(q.pct, 1)}%</div>
                    </div>
                  );
                })}
                <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 22, right: 28, bottom: 22, left: 8 }}
                  onClick={(d) => {
                    if (!d?.activePayload) return;
                    const p = d.activePayload[0]?.payload;
                    if (!p) return;
                    const q = getAtrTchQuadrante(p.x, p.y);
                    setDrilldown({ type: "ponto-atr", value: { faz: p.faz, tal: p.tal, quadrante: q.key }, label: `${p.faz || "—"} / Talhão ${p.tal || "—"}` });
                  }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" />
                  <XAxis dataKey="x" name="TCH Real" type="number" domain={[0, "dataMax + 12"]} tick={{ fontSize: 9, fill: "rgba(255,255,255,0.5)" }} label={{ value: "TCH", position: "insideBottom", offset: -2, fontSize: 9, fill: "rgba(255,255,255,0.45)" }} />
                  <YAxis dataKey="y" name="ATR" type="number" domain={[0, "dataMax + 12"]} tick={{ fontSize: 9, fill: "rgba(255,255,255,0.5)" }} label={{ value: "ATR", angle: -90, position: "insideLeft", fontSize: 9, fill: "rgba(255,255,255,0.45)" }} />
                  <ZAxis dataKey="z" range={[24, 190]} />
                  <Tooltip contentStyle={{ background: "#f8fafc", border: "1px solid rgba(56,189,248,0.35)", borderRadius: 10, fontSize: 11, color: "#0f172a" }}
                    itemStyle={{ color: "#0f172a" }} labelStyle={{ color: "#0f172a", fontWeight: 800 }}
                    formatter={(v, n) => [fmt(v), n === "x" ? "TCH" : n === "y" ? "ATR" : "Produção"]} />
                  {atrXTch.avgX > 0 && <ReferenceLine x={atrXTch.avgX} stroke="#f59e0b" strokeWidth={1.6} strokeOpacity={0.95} strokeDasharray="5 4" ifOverflow="extendDomain" />}
                  {atrXTch.avgY > 0 && <ReferenceLine y={atrXTch.avgY} stroke="#f59e0b" strokeWidth={1.6} strokeOpacity={0.95} strokeDasharray="5 4" ifOverflow="extendDomain" />}
                  <Scatter data={atrData} opacity={0.85}>
                    {atrData.map((entry, i) => {
                      const q = getAtrTchQuadrante(entry.x, entry.y);
                      return <Cell key={i} fill={q.color || "#94a3b8"} />;
                    })}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
              </div>
            )}
          </ChartCard>

          <ChartCard index={7} title="IDADE (MESES) × TCH" subtitle="Bolhas = produção real"
            icon={Leaf} color="bg-emerald-500/10 border-emerald-500/20 text-emerald-400" className="min-h-[380px]">
            {idadeXTchData.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-xs text-muted-foreground">Sem dados de idade x TCH.</div>
            ) : (
              <div className="relative h-[300px]">
                <button
                  type="button"
                  onClick={() => setDrilldown({ type: "idade-faixa", value: "abaixo", label: "Abaixo do ideal" })}
                  className="absolute left-10 top-1 z-10 rounded-xl border border-amber-400/55 bg-slate-950/80 px-3 py-2 text-left text-[10px] font-black uppercase leading-tight text-amber-300 shadow-lg backdrop-blur transition hover:scale-[1.03] hover:bg-slate-900"
                  title="Clique para detalhar talhões abaixo da idade ideal"
                >
                  <div>ABAIXO DO IDEAL</div>
                  <div className="text-xs">{fmt(idadeFaixaResumo.abaixo.pct, 1)}%</div>
                </button>
                <button
                  type="button"
                  onClick={() => setDrilldown({ type: "idade-faixa", value: "acima", label: "Acima do ideal" })}
                  className="absolute right-10 top-1 z-10 rounded-xl border border-emerald-400/55 bg-slate-950/80 px-3 py-2 text-left text-[10px] font-black uppercase leading-tight text-emerald-300 shadow-lg backdrop-blur transition hover:scale-[1.03] hover:bg-slate-900"
                  title="Clique para detalhar talhões acima da idade ideal"
                >
                  <div>ACIMA DO IDEAL</div>
                  <div className="text-xs">{fmt(idadeFaixaResumo.acima.pct, 1)}%</div>
                </button>
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 22, right: 28, bottom: 22, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" />
                    <XAxis dataKey="x" name="Idade" type="number" domain={[0, "dataMax + 1"]} tick={{ fontSize: 9, fill: "rgba(255,255,255,0.5)" }} label={{ value: "IDADE (MESES)", position: "insideBottom", offset: -2, fontSize: 9, fill: "rgba(255,255,255,0.45)" }} />
                    <YAxis dataKey="y" name="TCH" type="number" domain={[0, "dataMax + 12"]} tick={{ fontSize: 9, fill: "rgba(255,255,255,0.5)" }} label={{ value: "TCH", angle: -90, position: "insideLeft", fontSize: 9, fill: "rgba(255,255,255,0.45)" }} />
                    <ZAxis dataKey="z" range={[28, 210]} />
                    <Tooltip
                      cursor={{ stroke: "rgba(52,211,153,0.45)", strokeDasharray: "4 3" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0]?.payload || {};
                        return (
                          <div className="rounded-xl border border-emerald-400/35 bg-slate-950/95 px-3 py-2 shadow-2xl backdrop-blur text-[11px] text-slate-100">
                            <div className="mb-1 font-black text-emerald-300">Detalhe do talhão</div>
                            <div><span className="text-slate-400">Fazenda:</span> <b className="text-white">{p.faz || "—"}</b></div>
                            <div><span className="text-slate-400">Talhão:</span> <b className="text-white">{p.tal || "—"}</b></div>
                            <div><span className="text-slate-400">Idade:</span> <b className="text-white">{fmt(p.x, 1)} meses</b></div>
                            <div><span className="text-slate-400">TCH:</span> <b className="text-white">{fmt(p.y, 2)}</b></div>
                            <div><span className="text-slate-400">Produção:</span> <b className="text-white">{fmt(p.z, 2)} t</b></div>
                          </div>
                        );
                      }}
                    />
                    <ReferenceLine x={idadeIdealMeses} stroke="rgba(16,185,129,0.75)" strokeDasharray="4 2" label={{ value: `IDADE IDEAL (<${fmt(idadeIdealMeses, 1)} MESES)`, fontSize: 9, fill: "rgba(52,211,153,0.9)", position: "top" }} />
                    <Scatter
                      data={idadeXTchData}
                      fill="#34d399"
                      opacity={0.78}
                      onClick={(evt) => {
                        const p = evt?.payload || evt;
                        if (!p) return;
                        setDrilldown({ type: "ponto-idade", value: { faz: p.faz, tal: p.tal }, label: `${p.faz || "—"} / Talhão ${p.tal || "—"}` });
                      }}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>

          <ChartCard index={8} title="Status dos Talhões Fechados" subtitle="Área (ha) por faixa de TCH Real vs Previsto"
            icon={PieIcon} color="bg-emerald-500/10 border-emerald-500/20 text-emerald-400" className="min-h-[380px]">
            {statusTalhoesFechados.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-xs text-muted-foreground">Sem dados de status.</div>
            ) : (
              <div className="grid h-[320px] grid-cols-1 lg:grid-cols-[1fr_240px] items-center gap-3">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusTalhoesFechados}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="52%"
                      outerRadius="88%"
                      paddingAngle={3}
                      stroke="rgba(2,6,23,0.95)"
                      strokeWidth={3}
                      onClick={(entry) => entry?.key && setDrilldown({ type: "status-tch", value: entry.key, label: entry.name })}
                    >
                      {statusTalhoesFechados.map((item, i) => <Cell key={i} fill={item.color} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "#020617", border: "1px solid rgba(16,185,129,0.38)", borderRadius: 12, fontSize: 11, color: "#f8fafc", boxShadow: "0 16px 40px rgba(0,0,0,0.45)" }}
                      itemStyle={{ color: "#f8fafc" }}
                      labelStyle={{ color: "#a7f3d0", fontWeight: 800 }}
                      formatter={(v) => [`${fmt(v, 2)} ha`, "Área"]}
                    />
                    <text x="50%" y="43%" textAnchor="middle" dominantBaseline="middle" fill="#f8fafc" fontSize="25" fontWeight="900">
                      {fmt(statusTalhoesTotalArea, 2)}
                    </text>
                    <text x="50%" y="53%" textAnchor="middle" dominantBaseline="middle" fill="#34d399" fontSize="12" fontWeight="900">
                      HA FECHADOS
                    </text>
                    <text x="50%" y="62%" textAnchor="middle" dominantBaseline="middle" fill="rgba(226,232,240,0.72)" fontSize="10" fontWeight="800">
                      ÁREA TOTAL
                    </text>
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-3 text-xs">
                  {statusTalhoesFechados.map((item) => {
                    const pct = statusTalhoesTotalArea > 0 ? (item.value / statusTalhoesTotalArea) * 100 : 0;
                    return (
                      <button key={item.name} type="button" onClick={() => setDrilldown({ type: "status-tch", value: item.key, label: item.name })} className="flex w-full items-start gap-2 rounded-lg p-1 text-left transition hover:bg-white/[0.04]">
                        <span className="mt-1.5 h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
                        <div>
                          <div className="font-bold text-foreground">{item.name}</div>
                          <div className="font-mono text-muted-foreground">{fmt(item.value, 2)} ha ({fmt(pct, 0)}%)</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </ChartCard>

          <ChartCard index={9} title="Idade Média por Mês" subtitle="Idade (meses) e Idade de Corte ponderadas pela área"
            icon={BarChart3} color="bg-violet-500/10 border-violet-500/20 text-violet-400" className="min-h-[380px]">
            {idadePorMes.filter((x) => x.idadeMeses > 0).length === 0 ? (
              <div className="flex items-center justify-center h-40 text-xs text-muted-foreground">Sem dados de idade.</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={idadePorMes} margin={{ top: 18, right: 28, bottom: 20, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.5)" }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.5)" }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.5)" }} />
                  <Tooltip contentStyle={{ background: "#101820", border: "1px solid rgba(139,92,246,0.22)", borderRadius: 10, fontSize: 11 }}
                    formatter={(v, n) => [fmt(v, 1), n === "idadeMeses" ? "Idade (meses)" : "Idade Corte"]} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <ReferenceLine yAxisId="left" y={idadeIdealMeses} stroke="rgba(245,158,11,0.5)" strokeDasharray="4 2" label={{ value: `${fmt(idadeIdealMeses, 1)}m`, fontSize: 8, fill: "rgba(245,158,11,0.7)" }} />
                  <Bar yAxisId="left" dataKey="idadeMeses" name="Idade (meses)" fill="#22d3ee" radius={[5,5,0,0]} opacity={0.82} onClick={(entry) => entry?.mes && setDrilldown({ type: "mes", value: entry.mes === "Acum" ? "ACUM" : entry.mes, label: entry.mes })}>
                    <LabelList dataKey="idadeMeses" position="top" style={{ fontSize: 9, fill: "rgba(255,255,255,0.78)", fontWeight: 700 }} formatter={(v) => fmt(v, 1)} />
                  </Bar>
                  <Line yAxisId="right" type="monotone" dataKey="idadeCorte" name="Idade Corte" stroke="#f97316" strokeWidth={2} dot={{ r: 3, fill: "#f97316" }} activeDot={{ r: 5, onClick: (_, entry) => entry?.payload?.mes && setDrilldown({ type: "mes", value: entry.payload.mes === "Acum" ? "ACUM" : entry.payload.mes, label: entry.payload.mes }) }}>
                    <LabelList dataKey="idadeCorte" content={<LinhaBadgeLabel />} />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>


        {/* ── Fechamento executivo final ── */}
        <div className="grid grid-cols-1 gap-4">
          <ChartCard index={10} title="Fazenda e Talhões Abaixo do Previsto" subtitle="Todos os talhões com TCH Real abaixo do previsto (gap < -5%)" icon={TrendingDown} color="bg-red-500/10 border-red-500/20 text-red-400">
            <div className="overflow-x-auto rounded-xl border border-amber-500/[0.08]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-950/50 text-[10px] uppercase tracking-wider text-slate-400">
                    <th className="px-3 py-2 text-left">Fazenda</th>
                    <th className="px-3 py-2 text-left">Variedade</th>
                    <th className="px-3 py-2 text-left">Talhões</th>
                    <th className="px-3 py-2 text-right">Área (ha)</th>
                    <th className="px-3 py-2 text-center">Estágio</th>
                    <th className="px-3 py-2 text-center">Mês Plantio</th>
                    <th className="px-3 py-2 text-right">Idade (m)</th>
                    <th className="px-3 py-2 text-right">TCH Prev.</th>
                    <th className="px-3 py-2 text-right">TCH Real</th>
                    <th className="px-3 py-2 text-right">Gap (%)</th>
                    <th className="px-3 py-2 text-right">ATR</th>
                    <th className="px-3 py-2 text-left">Observações</th>
                  </tr>
                </thead>
                <tbody>
                  {finalAbaixoRowsPage.map((r) => (
                    <tr key={`${r.faz}-${r.variedade}-${r.estagio}-${r.mesPlantio}`} className="bg-amber-50/[0.025] transition-colors hover:bg-amber-500/[0.045]">
                      <td className="px-3 py-2 font-mono text-slate-100 whitespace-nowrap">{r.faz} - {r.nome}</td>
                      <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{r.variedade}</td>
                      <td className="px-3 py-2 font-mono text-slate-300 min-w-[150px]">{r.talhoesTxt || "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-200">{fmt(r.area)}</td>
                      <td className="px-3 py-2 text-center font-mono text-slate-300">{r.estagio}</td>
                      <td className="px-3 py-2 text-center font-mono text-slate-300">{r.mesPlantio}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-200">{r.idade > 0 ? fmt(r.idade, 2) : "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-200">{fmt(r.tchPrev)}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-200">{fmt(r.tchReal)}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-red-400">{fmt(r.gap, 2)}%</td>
                      <td className="px-3 py-2 text-right font-mono text-violet-300">{r.atr > 0 ? fmt(r.atr) : "—"}</td>
                      <td className="px-3 py-2 text-slate-300 min-w-[260px]">
                        {(() => {
                          const obsKey = finalObsKey(r);
                          const isEditing = !!rowObsEditing[obsKey];
                          const saved = rowObsSaved[obsKey] ?? "";
                          const value = rowObs[obsKey] ?? saved;
                          const display = saved || defaultObsFinal(r);

                          if (isEditing) {
                            return (
                              <div className="space-y-2">
                                <textarea
                                  value={value}
                                  onChange={(e) => setRowObs((prev) => ({ ...prev, [obsKey]: e.target.value }))}
                                  placeholder="Digite a observação deste grupo..."
                                  className="min-h-[56px] w-full resize-none rounded-md border border-amber-400/15 bg-slate-950/60 p-2 text-xs text-slate-100 outline-none transition focus:border-amber-300/35"
                                />
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    title="Cancelar"
                                    onClick={() => {
                                      setRowObs((prev) => ({ ...prev, [obsKey]: saved }));
                                      setRowObsEditing((prev) => ({ ...prev, [obsKey]: false }));
                                    }}
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-slate-300 hover:bg-white/[0.08]"
                                  >
                                    <XIcon className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    title="Salvar observação"
                                    onClick={async () => {
                                      if (!companyId) return;
                                      const nextValue = rowObs[obsKey] ?? "";
                                      try {
                                        await saveNote(companyId, obsKey, nextValue);
                                        setRowObsSaved((prev) => ({ ...prev, [obsKey]: nextValue }));
                                        setRowObsEditing((prev) => ({ ...prev, [obsKey]: false }));
                                      } catch (err) {
                                        console.error("Erro ao salvar observação da linha:", err);
                                      }
                                    }}
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-amber-400/25 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
                                  >
                                    <Save className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div className="flex items-start gap-2">
                              <span className="flex-1 leading-relaxed">{display}</span>
                              <button
                                type="button"
                                title="Editar observação"
                                onClick={() => {
                                  setRowObs((prev) => ({ ...prev, [obsKey]: saved || defaultObsFinal(r) }));
                                  setRowObsEditing((prev) => ({ ...prev, [obsKey]: true }));
                                }}
                                className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-amber-400/15 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                  {finalAbaixoPrevistoRows.length > 0 && (
                    <tr className="bg-amber-500/[0.10] font-bold text-amber-200">
                      <td className="px-3 py-2" colSpan={2}>TOTAL GERAL - {finalAbaixoResumo.fazendas} FAZENDA(S)</td>
                      <td className="px-3 py-2 font-mono">{finalAbaixoResumo.talhoes} talhão(ões)</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(finalAbaixoResumo.area)}</td>
                      <td className="px-3 py-2 text-center font-mono">—</td>
                      <td className="px-3 py-2 text-center font-mono">—</td>
                      <td className="px-3 py-2 text-right font-mono">{finalAbaixoResumo.idade > 0 ? fmt(finalAbaixoResumo.idade, 2) : "—"}</td>
                      <td className="px-3 py-2 text-right font-mono">{finalAbaixoResumo.tchPrev > 0 ? fmt(finalAbaixoResumo.tchPrev) : "—"}</td>
                      <td className="px-3 py-2 text-right font-mono">{finalAbaixoResumo.tchReal > 0 ? fmt(finalAbaixoResumo.tchReal) : "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-red-300">{finalAbaixoResumo.tchPrev > 0 ? `${fmt(finalAbaixoResumo.gap, 2)}%` : "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-violet-200">{finalAbaixoResumo.atr > 0 ? fmt(finalAbaixoResumo.atr) : "—"}</td>
                      <td className="px-3 py-2 text-slate-400">—</td>
                    </tr>
                  )}
                  {finalAbaixoPrevistoRows.length === 0 && (
                    <tr><td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">Sem talhões com TCH Real abaixo do previsto.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {finalAbaixoPrevistoRows.length > FINAL_ABAIXO_PAGE_SIZE && (
              <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>Mostrando {Math.min(finalAbaixoPrevistoRows.length, finalAbaixoPage * FINAL_ABAIXO_PAGE_SIZE + 1)}-{Math.min(finalAbaixoPrevistoRows.length, (finalAbaixoPage + 1) * FINAL_ABAIXO_PAGE_SIZE)} de {finalAbaixoPrevistoRows.length} grupos abaixo do previsto</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFinalAbaixoPage((p) => Math.max(0, p - 1))}
                    disabled={finalAbaixoPage === 0}
                    className="rounded-lg border border-amber-500/[0.15] px-3 py-1 text-xs font-semibold text-foreground disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <span className="font-mono text-amber-200">{finalAbaixoPage + 1}/{Math.ceil(finalAbaixoPrevistoRows.length / FINAL_ABAIXO_PAGE_SIZE)}</span>
                  <button
                    type="button"
                    onClick={() => setFinalAbaixoPage((p) => Math.min(Math.ceil(finalAbaixoPrevistoRows.length / FINAL_ABAIXO_PAGE_SIZE) - 1, p + 1))}
                    disabled={finalAbaixoPage >= Math.ceil(finalAbaixoPrevistoRows.length / FINAL_ABAIXO_PAGE_SIZE) - 1}
                    className="rounded-lg border border-amber-500/[0.15] px-3 py-1 text-xs font-semibold text-foreground disabled:opacity-40"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <ChartCard index={11} title="Recomendações Operacionais" subtitle="Ações prioritárias baseadas no desempenho" icon={ListChecks} color="bg-orange-500/10 border-orange-500/20 text-orange-400">
            <div className="space-y-3">
              {finalInsights.recomendacoes.map((txt, i) => (
                <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-sm text-slate-200">
                  <div className="font-bold">{txt}</div>
                </div>
              ))}
            </div>
          </ChartCard>

          <ChartCard index={12} title="Diagnóstico Operacional" subtitle="Insights automáticos da safra" icon={CheckSquare2} color="bg-amber-500/10 border-amber-500/20 text-amber-400">
            <div className="space-y-3">
              {finalInsights.diagnosticos.map((txt, i) => (
                <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-sm text-slate-200">{txt}</div>
              ))}
            </div>
          </ChartCard>

          <ChartCard index={13} title="Resumo Final" subtitle="Indicadores consolidados da safra" icon={CheckCircle2} color="bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between gap-3"><span className="text-slate-400">Área colhida total</span><b className="font-mono text-slate-100">{fmt(kpis.areaCortada)} ha</b></div>
              <div className="flex justify-between gap-3"><span className="text-slate-400">Produção real</span><b className="font-mono text-slate-100">{fmt(kpis.prodReal)} t</b></div>
              <div className="flex justify-between gap-3"><span className="text-slate-400">TCH médio real</span><b className="font-mono text-slate-100">{fmt(kpis.tchRealMed)} T/Ha</b></div>
              <div className="flex justify-between gap-3"><span className="text-slate-400">ATR médio</span><b className="font-mono text-slate-100">{fmt(kpis.atrMedio)} kg ATR/t</b></div>
              <div className="flex justify-between gap-3"><span className="text-slate-400">Talhões críticos</span><b className="font-mono text-slate-100">{finalAbaixoResumo.talhoes}</b></div>
            </div>
          </ChartCard>

          <ChartCard index={14} title="Observações Gerais" subtitle="Justifique os principais pontos críticos do relatório" icon={FileText} color="bg-amber-500/10 border-amber-500/20 text-amber-400">
            <div className="space-y-3">
              {!observacoesEditing ? (
                <div className="rounded-xl border border-white/[0.08] bg-slate-950/50 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-200">Obs:</span>
                    <button
                      type="button"
                      title="Editar observações gerais"
                      onClick={() => setObservacoesEditing(true)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-amber-400/20 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="min-h-[120px] whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                    {observacoesSalvas || "Clique no lápis para incluir as observações gerais do fechamento."}
                  </div>
                </div>
              ) : (
                <>
                  <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Digite aqui as observações do fechamento..." className="min-h-[150px] w-full resize-none rounded-xl border border-white/[0.08] bg-slate-950/60 p-3 text-sm text-slate-100 outline-none focus:border-amber-400/40" />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => { setObservacoes(observacoesSalvas); setObservacoesEditing(false); }} className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm font-bold text-slate-300 hover:bg-white/[0.08]">
                      Cancelar
                    </button>
                    <button type="button" onClick={async () => { await salvarObservacoes(); setObservacoesEditing(false); }} disabled={savingObs || observacoes === observacoesSalvas} className="rounded-xl border border-amber-400/25 bg-amber-500/15 px-4 py-2 text-sm font-bold text-amber-200 disabled:opacity-50">
                      {savingObs ? "Salvando..." : "Salvar"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </ChartCard>
        </div>

      </div>

      {/* ── Modal de Drilldown ── */}
      <Modal
        open={!!drilldown}
        onClose={() => setDrilldown(null)}
        title={
          <>
            {drilldown?.type === "estagio" ? "Detalhamento por Fazenda — Estágio "
              : drilldown?.type === "variedade" ? "Detalhamento por Fazenda — Variedade "
              : drilldown?.type === "tipoprop" ? "Detalhamento por Fazenda — Tipo de Propriedade "
              : drilldown?.type === "mes" ? "Detalhamento por Talhão — Mês "
              : drilldown?.type === "quadrante-atr" ? "Detalhamento por Talhão — Quadrante "
              : drilldown?.type === "ponto-atr" ? "Detalhamento do Talhão "
              : drilldown?.type === "ponto-idade" ? "Detalhamento do Talhão "
              : drilldown?.type === "status-tch" ? "Detalhamento por Talhão — Status "
              : drilldown?.type === "idade-faixa" ? "Detalhamento por Talhão — Faixa de Idade "
              : "Detalhamento — "}
            <span className="text-foreground">{drilldown?.label}</span>
          </>
        }
      >
        {drilldownContent}
      </Modal>
    </div>
  );
});

DashboardFechamentoOC.displayName = "DashboardFechamentoOC";
export default DashboardFechamentoOC;
