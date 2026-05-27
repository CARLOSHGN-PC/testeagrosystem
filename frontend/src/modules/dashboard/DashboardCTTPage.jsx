import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Calendar,
  ChevronLeft,
  Filter,
  FileDown,
  Maximize,
  Minimize,
  Pause,
  Play,
  Target,
  TrendingUp,
  Truck,
  Wheat,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import DashboardFechamentoOC from "./DashboardFechamentoOC";
import { fetchColheitaDashboardSummary, fetchDadosDashboardFilterOptions, fetchDashboardColheitaOperacional, downloadColheitaDashboardRenderedPdf } from "../../services/dadosDashboardService";
import { getColheitaPremissas } from "../../services/colheitaPremissasService";
import { hasModuleAccess } from "../../utils/accessControl";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  LabelList,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  calculateReprojectedTarget,
  extractEffectiveWeekdays,
  formatBrazilianNumber,
  getCurrentMonthIndex,
  getCurrentWeekRange,
  getRemainingEffectiveDaysOfMonth,
  getRemainingEffectiveDaysOfWeek,
  getRemainingHoursUntilEndOfDay,
} from "./utils/dashboardCardMetrics";

const MONTHS_FULL = [
  'Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'
];
const MONTH_LABEL_TO_KEY = {
  Jan: 'jan',
  Fev: 'fev',
  Mar: 'mar',
  Abr: 'abr',
  Mai: 'mai',
  Jun: 'jun',
  Jul: 'jul',
  Ago: 'ago',
  Set: 'set',
  Out: 'out',
  Nov: 'nov',
  Dez: 'dez',
};

const monthlyData = [
  { mes: 'Jan', entrada: 0, meta: 0, atr: 0, atrMeta: 0, broca: 0, brocaMeta: 0, vegetal: 0, mineral: 0 },
  { mes: 'Fev', entrada: 0, meta: 0, atr: 0, atrMeta: 0, broca: 0, brocaMeta: 0, vegetal: 0, mineral: 0 },
  { mes: 'Mar', entrada: 0, meta: 0, atr: 0, atrMeta: 0, broca: 0, brocaMeta: 0, vegetal: 0, mineral: 0 },
  { mes: 'Abr', entrada: 0, meta: 0, atr: 0, atrMeta: 0, broca: 0, brocaMeta: 0, vegetal: 0, mineral: 0 },
  { mes: 'Mai', entrada: 0, meta: 0, atr: 0, atrMeta: 0, broca: 0, brocaMeta: 0, vegetal: 0, mineral: 0 },
  { mes: 'Jun', entrada: 0, meta: 0, atr: 0, atrMeta: 0, broca: 0, brocaMeta: 0, vegetal: 0, mineral: 0 },
  { mes: 'Jul', entrada: 0, meta: 0, atr: 0, atrMeta: 0, broca: 0, brocaMeta: 0, vegetal: 0, mineral: 0 },
  { mes: 'Ago', entrada: 0, meta: 0, atr: 0, atrMeta: 0, broca: 0, brocaMeta: 0, vegetal: 0, mineral: 0 },
  { mes: 'Set', entrada: 0, meta: 0, atr: 0, atrMeta: 0, broca: 0, brocaMeta: 0, vegetal: 0, mineral: 0 },
  { mes: 'Out', entrada: 0, meta: 0, atr: 0, atrMeta: 0, broca: 0, brocaMeta: 0, vegetal: 0, mineral: 0 },
  { mes: 'Nov', entrada: 0, meta: 0, atr: 0, atrMeta: 0, broca: 0, brocaMeta: 0, vegetal: 0, mineral: 0 },
  { mes: 'Dez', entrada: 0, meta: 0, atr: 0, atrMeta: 0, broca: 0, brocaMeta: 0, vegetal: 0, mineral: 0 },
];

const weeklyFrontData = [
  { dia: "Seg", f1: 2300, f2: 2250, f3: 3100 },
  { dia: "Ter", f1: 0, f2: 0, f3: 0 },
  { dia: "Qua", f1: 0, f2: 0, f3: 0 },
  { dia: "Qui", f1: 0, f2: 0, f3: 0 },
  { dia: "Sex", f1: 0, f2: 0, f3: 0 },
  { dia: "Sáb", f1: 0, f2: 0, f3: 0 },
  { dia: "Dom", f1: 0, f2: 0, f3: 0 },
];

const frontMonthlyData = [
  { mes: "Abr", f1: 2400, f2: 2300, f3: 3100 },
  { mes: "Mai", f1: 0, f2: 0, f3: 0 },
  { mes: "Jun", f1: 0, f2: 0, f3: 0 },
  { mes: "Jul", f1: 0, f2: 0, f3: 0 },
  { mes: "Ago", f1: 0, f2: 0, f3: 0 },
  { mes: "Set", f1: 0, f2: 0, f3: 0 },
  { mes: "Out", f1: 0, f2: 0, f3: 0 },
  { mes: "Nov", f1: 0, f2: 0, f3: 0 },
  { mes: "Dez", f1: 0, f2: 0, f3: 0 },
];

const hourlyData = [
  { hora: "00:00", realizado: 0, meta: 602 },
  { hora: "01:00", realizado: 0, meta: 602 },
  { hora: "02:00", realizado: 0, meta: 602 },
  { hora: "03:00", realizado: 0, meta: 602 },
  { hora: "04:00", realizado: 0, meta: 602 },
  { hora: "05:00", realizado: 0, meta: 602 },
  { hora: "06:00", realizado: 900, meta: 602 },
  { hora: "07:00", realizado: 610, meta: 602 },
  { hora: "08:00", realizado: 610, meta: 602 },
  { hora: "09:00", realizado: 950, meta: 602 },
  { hora: "10:00", realizado: 800, meta: 602 },
  { hora: "11:00", realizado: 610, meta: 602 },
  { hora: "12:00", realizado: 610, meta: 602 },
  { hora: "13:00", realizado: 610, meta: 602 },
  { hora: "14:00", realizado: 720, meta: 602 },
  { hora: "15:00", realizado: 760, meta: 602 },
  { hora: "16:00", realizado: 700, meta: 602 },
  { hora: "17:00", realizado: 0, meta: 602 },
  { hora: "18:00", realizado: 0, meta: 602 },
  { hora: "19:00", realizado: 0, meta: 602 },
  { hora: "20:00", realizado: 0, meta: 602 },
  { hora: "21:00", realizado: 0, meta: 602 },
  { hora: "22:00", realizado: 0, meta: 602 },
  { hora: "23:00", realizado: 0, meta: 602 },
];

function numberBR(value) {
  const normalized = Number.isFinite(Number(value)) ? Number(value) : 0;
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(normalized);
}

function decimalBR(value, decimals = 2) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatDateBRFromISO(dateISO) {
  const key = String(dateISO || '').slice(0, 10);
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

function formatDateBR(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "--/--/----";
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function getDayProgressPercent(now = new Date()) {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const total = endOfDay.getTime() - startOfDay.getTime();
  const elapsed = Math.min(Math.max(now.getTime() - startOfDay.getTime(), 0), total);
  return Math.round((elapsed / total) * 100);
}

function ensureFullYearMonthlyData(data = []) {
  const source = Array.isArray(data) ? data : [];
  return MONTHS_FULL.map((mes) => {
    const found = source.find((item) => String(item?.mes || '').toLowerCase() === mes.toLowerCase());
    return {
      mes,
      entrada: Number(found?.entrada || 0),
      meta: Number(found?.meta || 0),
      atr: Number(found?.atr || 0),
      atrMeta: Number(found?.atrMeta || 0),
      broca: Number(found?.broca || 0),
      brocaMeta: Number(found?.brocaMeta || 0),
      vegetal: Number(found?.vegetal || 0),
      mineral: Number(found?.mineral || 0),
    };
  });
}

function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#07101d]/95 px-3 py-2 shadow-[0_12px_32px_rgba(0,0,0,0.45)] backdrop-blur-xl">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#97a2bb]">{label}</div>
      <div className="space-y-1.5">
        {payload.map((entry, index) => (
          <div key={`${entry.name}-${index}`} className="flex items-center justify-between gap-5 text-xs">
            <span className="text-[#b7c0d5]">{entry.name}</span>
            <span className="font-semibold" style={{ color: entry.color }}>
              {typeof entry.value === "number" ? numberBR(entry.value) : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}


function DecimalTooltip({ active, payload, label, decimals = 2 }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#07101d]/95 px-3 py-2 shadow-[0_12px_32px_rgba(0,0,0,0.45)] backdrop-blur-xl">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#97a2bb]">{label}</div>
      <div className="space-y-1.5">
        {payload.map((entry, index) => (
          <div key={`${entry.name}-${index}`} className="flex items-center justify-between gap-5 text-xs">
            <span className="text-[#b7c0d5]">{entry.name}</span>
            <span className="font-semibold" style={{ color: entry.color }}>
              {typeof entry.value === "number" ? decimalBR(entry.value, decimals) : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ShellCard({ children, className = "", ...props }) {
  return (
    <div
      {...props}
      className={`overflow-hidden rounded-[24px] border border-[#223149]/60 bg-[linear-gradient(180deg,rgba(8,16,30,0.96),rgba(6,12,22,0.98))] shadow-[0_18px_60px_rgba(0,0,0,0.32)] ${className}`}
    >
      {children}
    </div>
  );
}

function FilterSelect({ icon: Icon, value, onChange, options = [] }) {
  return (
    <div className="flex h-12 items-center gap-2 rounded-xl border border-[#2a3448] bg-[#0c1523]/95 px-3 text-[#dce5f7] shadow-inner shadow-black/20">
      {Icon ? <Icon className="h-4 w-4 text-[#95a0ba]" /> : null}
      <select value={value} onChange={onChange} className="w-full bg-transparent text-sm outline-none">
        {options.map((option) => (
          <option key={option.value} value={option.value} className="text-black">
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function FilterDateInput({ icon: Icon, value, onChange, placeholder }) {
  return (
    <div className="flex h-12 items-center gap-2 rounded-xl border border-[#2a3448] bg-[#0c1523]/95 px-3 text-[#dce5f7] shadow-inner shadow-black/20">
      {Icon ? <Icon className="h-4 w-4 text-[#95a0ba]" /> : null}
      <input
        type="date"
        value={value || ''}
        onChange={onChange}
        aria-label={placeholder}
        className="w-full bg-transparent text-sm outline-none [color-scheme:dark]"
      />
    </div>
  );
}

function HeroMetricCard({ title, value, suffix, icon: Icon, accent = "amber" }) {
  const palette = {
    amber: {
      iconWrap: "border-[#5f4518] bg-[#2a1d0c]",
      icon: "text-[#f0b34f]",
      value: "text-white",
    },
    green: {
      iconWrap: "border-[#174838] bg-[#0c281f]",
      icon: "text-[#30d79f]",
      value: "text-white",
    },
    blue: {
      iconWrap: "border-[#1b3760] bg-[#0d203a]",
      icon: "text-[#69a9ff]",
      value: "text-white",
    },
    purple: {
      iconWrap: "border-[#49306b] bg-[#1e1330]",
      icon: "text-[#bc8cff]",
      value: "text-white",
    },
  }[accent];

  return (
    <ShellCard>
      <div className="flex items-start justify-between gap-4 p-5">
        <div>
          <p className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.14em] text-[#97a2bb]">{title}</p>
          <div className="mt-2 flex items-end gap-2">
            <span className={`text-[18px] font-semibold md:text-[22px] ${palette.value}`}>{value}</span>
            {suffix ? <span className="pb-0.5 text-sm text-[#b7c0d5]">{suffix}</span> : null}
          </div>
        </div>
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${palette.iconWrap}`}>
          <Icon className={`h-5 w-5 ${palette.icon}`} />
        </div>
      </div>
    </ShellCard>
  );
}


function SplitHeroMetricCard({ title, leftLabel, leftValue, rightLabel, rightValue, suffix, icon: Icon, accent = "red" }) {
  const palette = {
    red: {
      iconWrap: "border-[#7f1d1d] bg-[#331313]",
      icon: "text-[#ff7a7a]",
      leftValue: "text-[#ff7a7a]",
      rightValue: "text-[#f0b34f]",
    },
    amber: {
      iconWrap: "border-[#5f4518] bg-[#2a1d0c]",
      icon: "text-[#f0b34f]",
      leftValue: "text-white",
      rightValue: "text-white",
    },
  }[accent] || {
    iconWrap: "border-[#7f1d1d] bg-[#331313]",
    icon: "text-[#ff7a7a]",
    leftValue: "text-[#ff7a7a]",
    rightValue: "text-[#f0b34f]",
  };

  return (
    <ShellCard>
      <div className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0 flex-1">
          <p className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.14em] text-[#97a2bb]">{title}</p>
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-3">
            <div className="min-w-0">
              <div className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.14em] text-[#97a2bb]">{leftLabel}</div>
              <div className="mt-1 flex items-end gap-1">
                <span className={`text-[18px] font-semibold leading-none md:text-[22px] ${palette.leftValue}`}>{leftValue}</span>
                {suffix ? <span className="pb-0.5 text-xs text-[#b7c0d5]">{suffix}</span> : null}
              </div>
            </div>
            <div className="h-9 w-px bg-[#2a3b56]/80" />
            <div className="min-w-0">
              <div className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.14em] text-[#97a2bb]">{rightLabel}</div>
              <div className="mt-1 flex items-end gap-1">
                <span className={`text-[18px] font-semibold leading-none md:text-[22px] ${palette.rightValue}`}>{rightValue}</span>
                {suffix ? <span className="pb-0.5 text-xs text-[#b7c0d5]">{suffix}</span> : null}
              </div>
            </div>
          </div>
        </div>
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${palette.iconWrap}`}>
          <Icon className={`h-5 w-5 ${palette.icon}`} />
        </div>
      </div>
    </ShellCard>
  );
}

function PanelHeader({ icon: Icon, title, subtitle, badge, actions }) {
  return (
    <div className="mb-2 flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#26364f]/70 bg-[#101a2b] text-[#76a7ff]">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-[18px] font-semibold text-white">{title}</h3>
          {subtitle ? <p className="mt-1 text-sm text-[#97a2bb]">{subtitle}</p> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {actions}
        {badge ? (
          <div className="min-h-[50px] min-w-[112px] rounded-2xl border border-[#5c2330] bg-[#34131b] px-3 py-2 text-right text-[#ff8b9f] shadow-inner shadow-black/10">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#97a2bb]">Dia</div>
            <div className="mt-1 text-sm font-semibold leading-none text-current">{badge}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function HeaderTinyMetric({ label, value, suffix, accent = "blue" }) {
  const colors = {
    blue: "border-[#244a82] bg-[#0f1d35] text-[#74a7ff]",
    green: "border-[#1f5a45] bg-[#0b2a22] text-[#39d39a]",
    amber: "border-[#684b1e] bg-[#2b2112] text-[#f0b34f]",
    purple: "border-[#4d3470] bg-[#211735] text-[#c38dff]",
    red: "border-[#7f1d1d] bg-[#331313] text-[#ff7a7a]",
  };

  return (
    <div className={`min-h-[50px] min-w-[112px] rounded-2xl border ${colors[accent]} px-3 py-2 text-right shadow-inner shadow-black/10`}>
      <div className="truncate whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.14em] text-[#97a2bb]">{label}</div>
      <div className="mt-1 flex items-end justify-end gap-1">
        <span className="text-sm font-semibold leading-none text-current">{value}</span>
        {suffix ? <span className="text-[10px] leading-none text-[#c4cee2]">{suffix}</span> : null}
      </div>
    </div>
  );
}

function StatMiniCard({ label, value, suffix, accent = "blue" }) {
  const colors = {
    blue: "from-[#13284b] to-[#0f1d35] text-[#74a7ff]",
    green: "from-[#0d3428] to-[#10261f] text-[#39d39a]",
    amber: "from-[#372915] to-[#231a10] text-[#f0b34f]",
    purple: "from-[#2c1d44] to-[#1d1634] text-[#c38dff]",
    red: "from-[#4a1717] to-[#2a1111] text-[#ff7a7a]",
  };

  return (
    <div className={`rounded-[18px] border border-[#2a3b56]/55 bg-gradient-to-r ${colors[accent]} p-4`}>
      <div className="truncate whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.15em] text-[#97a2bb]">{label}</div>
      <div className="mt-2 flex items-end gap-1.5">
        <span className="text-[18px] font-semibold text-current">{value}</span>
        {suffix ? <span className="pb-0.5 text-xs text-[#c4cee2]">{suffix}</span> : null}
      </div>
    </div>
  );
}


function CompactFrontStatCard({ label, value, suffix, accent = "blue" }) {
  const colors = {
    blue: "from-[#13284b] to-[#0f1d35] text-[#74a7ff]",
    green: "from-[#0d3428] to-[#10261f] text-[#39d39a]",
    amber: "from-[#372915] to-[#231a10] text-[#f0b34f]",
    purple: "from-[#2c1d44] to-[#1d1634] text-[#c38dff]",
    red: "from-[#4a1717] to-[#2a1111] text-[#ff7a7a]",
  };

  return (
    <div className={`rounded-[18px] border border-[#2a3b56]/55 bg-gradient-to-r ${colors[accent]} px-4 py-3`}>
      <div className="truncate text-[11px] font-semibold uppercase tracking-[0.15em] text-[#97a2bb]">{label}</div>
      <div className="mt-2 flex items-end gap-1.5">
        <span className="text-[16px] font-semibold leading-none text-current md:text-[18px]">{value}</span>
        {suffix ? <span className="pb-0.5 text-[11px] text-[#c4cee2]">{suffix}</span> : null}
      </div>
    </div>
  );
}

function FrontTotalsRow({ fronts = [] }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin] [scrollbar-color:#24324a_transparent]">
      {fronts.map((front, index) => (
        <div
          key={front.key || `${front.label}-${index}`}
          className="min-w-[132px] flex-shrink-0 md:min-w-[128px] lg:min-w-[122px] xl:min-w-[116px] 2xl:min-w-[112px]"
        >
          <CompactFrontStatCard
            label={front.label}
            value={numberBR(front.total || 0)}
            suffix="ton"
            accent={index % 3 === 0 ? 'green' : index % 3 === 1 ? 'blue' : 'amber'}
          />
        </div>
      ))}
    </div>
  );
}

function ChartPanel({ children, className = "", pdfSection, pdfKind, pdfGroupTitle }) {
  const pdfProps = pdfSection ? {
    'data-pdf-section': pdfSection,
    'data-pdf-single': 'true',
    ...(pdfKind ? { 'data-pdf-kind': pdfKind } : {}),
    ...(pdfGroupTitle ? { 'data-pdf-group-title': pdfGroupTitle } : {}),
  } : {};
  return <ShellCard className={`h-full ${className}`} {...pdfProps}>{children}</ShellCard>;
}


function HourRealizadoLabel({ x, y, value }) {
  const numericValue = Number(value || 0);
  if (!numericValue || numericValue <= 0 || x == null || y == null) return null;

  const text = formatBrazilianNumber(numericValue, 0, 0);

  return (
    <text
      x={x}
      y={y - 14}
      textAnchor="middle"
      fill="#dffdf4"
      fontSize={12}
      fontWeight={900}
      paintOrder="stroke"
      stroke="#03140f"
      strokeWidth={4}
      strokeLinejoin="round"
    >
      {text}
    </text>
  );
}

function HourChart({ data = [] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 42, right: 18, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="hourGlow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#11f0b1" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#11f0b1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#1b2a40" strokeDasharray="4 4" vertical={false} />
        <XAxis dataKey="hora" tickLine={false} axisLine={false} tick={{ fill: "#7f8aa3", fontSize: 11 }} minTickGap={14} />
        <YAxis tickLine={false} axisLine={false} tick={{ fill: "#7f8aa3", fontSize: 11 }} width={42} />
        <RechartsTooltip content={<DarkTooltip />} />
        <Line type="monotone" dataKey="meta" name="Meta Hora" stroke="#5e8fff" strokeWidth={2} dot={false} strokeDasharray="5 4" />
        <Area
          type="monotone"
          dataKey="realizado"
          name="Volume Real"
          stroke="#00e6a8"
          strokeWidth={3}
          fill="url(#hourGlow)"
          dot={false}
          activeDot={false}
        >
          <LabelList dataKey="realizado" content={<HourRealizadoLabel />} />
        </Area>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function MonthlyVolumeChart({ data = [], tvMode = false }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="monthlyMetaGlow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5f8fff" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#5f8fff" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#1b2a40" strokeDasharray="4 4" vertical={false} />
        <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fill: "#7f8aa3", fontSize: 11 }} />
        <YAxis tickLine={false} axisLine={false} tick={{ fill: "#7f8aa3", fontSize: 11 }} width={58} />
        <RechartsTooltip content={<DarkTooltip />} />
        <Area type="monotone" dataKey="meta" name="Meta Mensal" stroke="#5f8fff" strokeWidth={3} fill="url(#monthlyMetaGlow)" fillOpacity={1} dot={{ r: 3, fill: "#88aefb" }} />
        <Bar dataKey="entrada" name="Realizado" fill="#11e1a3" radius={[6, 6, 0, 0]} barSize={tvMode ? 28 : 14} maxBarSize={tvMode ? 42 : 22} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function WeeklyFrontChart({ data = [], fronts = [], tvMode = false }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#1b2a40" strokeDasharray="4 4" vertical={false} />
        <XAxis dataKey="dia" tickLine={false} axisLine={false} tick={{ fill: "#7f8aa3", fontSize: 11 }} />
        <YAxis tickLine={false} axisLine={false} tick={{ fill: "#7f8aa3", fontSize: 11 }} width={46} />
        <RechartsTooltip content={<DarkTooltip />} />
        <Legend />
        {fronts.map((front) => (
          <Bar key={front.key} dataKey={front.key} name={front.label} fill={front.fill} radius={[6, 6, 0, 0]} barSize={tvMode ? 28 : 14} maxBarSize={tvMode ? 40 : 20} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function FrontVolumeChart({ data = [], tvMode = false }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#1b2a40" strokeDasharray="4 4" vertical={false} />
        <XAxis dataKey="frente" tickLine={false} axisLine={false} tick={{ fill: "#7f8aa3", fontSize: 11 }} />
        <YAxis tickLine={false} axisLine={false} tick={{ fill: "#7f8aa3", fontSize: 11 }} width={46} />
        <RechartsTooltip content={<DarkTooltip />} />
        <Bar dataKey="total" name="Volume" radius={[6, 6, 0, 0]} barSize={tvMode ? 44 : 26} maxBarSize={tvMode ? 54 : 34}>
          {data.map((entry, index) => (
            <Cell key={`${entry.frente}-${index}`} fill={entry.fill || '#5b8fff'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}



function ImpurezaBarLabel({ x, y, width, value }) {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue) || numericValue <= 0 || x == null || y == null) return null;
  const formatted = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(numericValue);
  return (
    <text
      x={x + (width || 0) / 2}
      y={y - 10}
      textAnchor="middle"
      fill="#f8fbff"
      fontSize={12}
      fontWeight={900}
      paintOrder="stroke"
      stroke="#020817"
      strokeWidth={4}
      strokeLinejoin="round"
    >
      {formatted}
    </text>
  );
}

function DensidadeBarLabel({ x, y, width, value }) {
  const numericValue = Number(value || 0);
  if (!numericValue || numericValue <= 0 || x == null || y == null) return null;
  return (
    <text
      x={x + (width || 0) / 2}
      y={y - 10}
      textAnchor="middle"
      fill="#f8fbff"
      fontSize={12}
      fontWeight={900}
      paintOrder="stroke"
      stroke="#020817"
      strokeWidth={4}
      strokeLinejoin="round"
    >
      {formatBrazilianNumber(numericValue, 0, 0)}
    </text>
  );
}

function DensidadeFrenteChart({ data = [], tvMode = false, meta = 0 }) {
  const getFrenteOrder = (value) => {
    const match = String(value ?? '').match(/\d+/);
    return match ? Number(match[0]) : 9999;
  };
  const chartData = (Array.isArray(data) ? data : [])
    .filter((item) => Number(item?.densidade || 0) > 0)
    .sort((a, b) => getFrenteOrder(a?.frenteOriginal ?? a?.frente) - getFrenteOrder(b?.frenteOriginal ?? b?.frente))
    .slice(0, tvMode ? 20 : 14);

  const metaValue = Number(meta || 0);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 34, right: 18, left: 0, bottom: 6 }}>
        <CartesianGrid stroke="#1b2a40" strokeDasharray="4 4" vertical={false} />
        <XAxis dataKey="frente" tickLine={false} axisLine={false} tick={{ fill: "#7f8aa3", fontSize: tvMode ? 13 : 11 }} />
        <YAxis tickLine={false} axisLine={false} tick={{ fill: "#7f8aa3", fontSize: 11 }} tickFormatter={(value) => decimalBR(value, 0)} width={48} domain={[0, (dataMax) => Math.max(Number(dataMax || 0), metaValue) + (metaValue > 0 ? metaValue * 0.12 : 5)]} />
        <RechartsTooltip content={<DecimalTooltip decimals={0} />} />
        {metaValue > 0 ? (
          <ReferenceLine
            y={metaValue}
            stroke="#ef4444"
            strokeWidth={2}
            strokeDasharray="7 6"
            ifOverflow="extendDomain"
            label={<MetaReferenceLabel value={`M ${formatBrazilianNumber(metaValue, 0, 0)}`} tvMode={tvMode} />}
          />
        ) : null}
        <Bar dataKey="densidade" name="Densidade média" radius={[7, 7, 0, 0]} barSize={tvMode ? 46 : 30} maxBarSize={tvMode ? 60 : 42}>
          {chartData.map((entry, index) => (
            <Cell key={`${entry.frente}-${index}`} fill={entry.fill || '#21d6a0'} />
          ))}
          <LabelList dataKey="densidade" content={<DensidadeBarLabel />} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}



function MetaReferenceLabel({ viewBox, value, tvMode = false }) {
  if (!viewBox) return null;

  const x = Number(viewBox.x || 0) + Number(viewBox.width || 0) - 6;
  const y = Number(viewBox.y || 0) - 8;

  return (
    <text
      x={x}
      y={Math.max(12, y)}
      textAnchor="end"
      fill="#fca5a5"
      fontSize={tvMode ? 13 : 12}
      fontWeight={900}
      paintOrder="stroke"
      stroke="#07111f"
      strokeWidth={3}
      strokeLinejoin="round"
    >
      {value}
    </text>
  );
}

function ImpurezaTurnoChart({ data = [], tvMode = false, meta = 0, metaLabel = "M" }) {
  const getFrenteOrder = (value) => {
    const match = String(value ?? '').match(/\d+/);
    return match ? Number(match[0]) : 9999;
  };

  const grouped = new Map();
  (Array.isArray(data) ? data : [])
    .filter((item) => Number(item?.turnoA || 0) > 0 || Number(item?.turnoB || 0) > 0 || Number(item?.turnoC || 0) > 0)
    .forEach((item) => {
      const frenteOriginal = String(item?.frenteOriginal ?? item?.frente ?? "").trim();
      const frente = String(item?.frente || item?.frenteOriginal || "").trim();
      if (!frenteOriginal && !frente) return;
      const key = frenteOriginal || frente;
      const current = grouped.get(key) || { frente, frenteOriginal: key, turnoA: 0, turnoB: 0, turnoC: 0, count: 0 };
      current.turnoA += Number(item?.turnoA || 0);
      current.turnoB += Number(item?.turnoB || 0);
      current.turnoC += Number(item?.turnoC || 0);
      current.count += 1;
      grouped.set(key, current);
    });

  const sourceRows = Array.from(grouped.values())
    .map((item) => ({
      ...item,
      turnoA: item.count ? item.turnoA / item.count : 0,
      turnoB: item.count ? item.turnoB / item.count : 0,
      turnoC: item.count ? item.turnoC / item.count : 0,
    }))
    .sort((a, b) => getFrenteOrder(a?.frenteOriginal ?? a?.frente) - getFrenteOrder(b?.frenteOriginal ?? b?.frente))
    .slice(0, tvMode ? 20 : 14);

  const frentes = sourceRows.map((item) => String(item?.frente || item?.frenteOriginal || '').trim()).filter(Boolean);
  const metaValue = Number(meta || 0);
  const chartData = ['A', 'B', 'C'].map((turno) => {
    const row = { turno: `Turno ${turno}` };
    sourceRows.forEach((item) => {
      const frente = String(item?.frente || item?.frenteOriginal || '').trim();
      if (!frente) return;
      row[frente] = Number(item?.[`turno${turno}`] || 0);
    });
    return row;
  });
  const palette = ['#5b8fff', '#21d6a0', '#f0a83a', '#9a74e8', '#fb7185', '#38bdf8', '#84cc16', '#f97316', '#a78bfa', '#14b8a6', '#eab308', '#ec4899'];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={chartData}
        margin={{ top: 40, right: 90, left: 0, bottom: 6 }}
        barCategoryGap={tvMode ? "24%" : "28%"}
        barGap={tvMode ? 6 : 5}
      >
        <CartesianGrid stroke="#1b2a40" strokeDasharray="4 4" vertical={false} />
        <XAxis dataKey="turno" tickLine={false} axisLine={false} tick={{ fill: "#7f8aa3", fontSize: tvMode ? 14 : 12 }} interval={0} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#7f8aa3", fontSize: 11 }}
          tickFormatter={(value) => decimalBR(value, 1)}
          width={48}
          domain={[0, (dataMax) => Math.max(Number(dataMax || 0), metaValue) + (metaValue > 0 ? metaValue * 0.12 : 1)]}
        />
        {metaValue > 0 ? (
          <ReferenceLine
            y={metaValue}
            stroke="#ef4444"
            strokeWidth={2}
            strokeDasharray="7 6"
            ifOverflow="extendDomain"
            label={<MetaReferenceLabel value={`${metaLabel} ${decimalBR(metaValue, 2)}%`} tvMode={tvMode} />}
          />
        ) : null}
        <RechartsTooltip content={<DecimalTooltip decimals={2} />} />
        <Legend wrapperStyle={{ color: '#cbd5e1', fontSize: 12, paddingTop: 8 }} />
        {frentes.map((frente, index) => (
          <Bar
            key={frente}
            dataKey={frente}
            name={frente}
            fill={palette[index % palette.length]}
            radius={[6, 6, 0, 0]}
            barSize={tvMode ? 30 : 22}
            maxBarSize={tvMode ? 42 : 34}
          >
            <LabelList dataKey={frente} content={<ImpurezaBarLabel />} />
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function MoagemDiaDiaLabel({ x, y, value }) {
  const numericValue = Number(value || 0);
  if (!numericValue || numericValue <= 0 || x == null || y == null) return null;

  return (
    <text
      x={x}
      y={Math.max(12, y - 8)}
      textAnchor="middle"
      fill="#dffdf4"
      fontSize={11}
      fontWeight={900}
      paintOrder="stroke"
      stroke="#03140f"
      strokeWidth={4}
      strokeLinejoin="round"
    >
      {formatBrazilianNumber(numericValue, 0, 0)}
    </text>
  );
}

function MoagemDiaDiaChart({ data = [], metaDia = 0, tvMode = false }) {
  const chartData = (Array.isArray(data) ? data : [])
    .map((item) => ({ ...item, moagem: Math.max(0, Number(item?.moagem || item?.total || 0)) }))
    .filter((item) => Number.isFinite(item.moagem));

  const metaDiaValue = Number(metaDia || 0);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 34, right: 12, left: 0, bottom: 8 }} barCategoryGap="18%">
        <CartesianGrid stroke="#1b2a40" strokeDasharray="4 4" vertical={false} />
        <XAxis dataKey="dia" tickLine={false} axisLine={false} tick={{ fill: "#7f8aa3", fontSize: tvMode ? 12 : 10 }} interval={0} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#7f8aa3", fontSize: 11 }}
          tickFormatter={(value) => formatBrazilianNumber(value, 0, 0)}
          width={52}
          domain={[0, (dataMax) => Math.max(10, Math.ceil(Math.max(Number(dataMax || 0), metaDiaValue || 0) * 1.15))]}
          allowDecimals={false}
        />
        <RechartsTooltip content={<DecimalTooltip decimals={0} />} />
        <Legend wrapperStyle={{ color: '#cbd5e1', fontSize: 12, paddingTop: 8 }} />
        {metaDiaValue > 0 ? (
          <ReferenceLine
            y={metaDiaValue}
            stroke="#f0b34f"
            strokeDasharray="6 5"
            strokeWidth={2}
            label={{
              value: `Meta dia: ${formatBrazilianNumber(metaDiaValue, 0, 0)}`,
              position: 'insideTopRight',
              fill: '#f0b34f',
              fontSize: 12,
              fontWeight: 800,
            }}
          />
        ) : null}
        <Bar dataKey="moagem" name="Moagem dia" fill="#21d6a0" radius={[6, 6, 0, 0]} barSize={tvMode ? 24 : 14} maxBarSize={tvMode ? 34 : 22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function AtrChart({ data = monthlyData, tvMode = false }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="atrMetaGlow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7aa6ff" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#7aa6ff" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#1b2a40" strokeDasharray="4 4" vertical={false} />
        <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fill: "#7f8aa3", fontSize: 11 }} />
        <YAxis tickLine={false} axisLine={false} tick={{ fill: "#7f8aa3", fontSize: 11 }} width={42} />
        <RechartsTooltip content={<DarkTooltip />} />
        <Bar dataKey="atr" name="Realizado" fill="#f0a83a" radius={[6, 6, 0, 0]} barSize={tvMode ? 28 : 14} maxBarSize={tvMode ? 42 : 22} />
        <Area type="monotone" dataKey="atrMeta" name="ATR Meta Mensal" stroke="#6e96ff" strokeWidth={3} fill="url(#atrMetaGlow)" fillOpacity={1} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}


function abbreviateAtrFarmLabel(nome = '') {
  const texto = String(nome || '').trim();
  const codigo = texto.match(/^\s*(\d{3,6})/)?.[1] || '';
  const semCodigo = texto
    .replace(/^\s*\d{3,6}\s*-?\s*/i, '')
    .replace(/\bFAZ(ENDA)?\b\.?/gi, '')
    .replace(/\bAGRO\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const palavras = semCodigo.split(' ').filter(Boolean);
  const uteis = palavras.filter((p) => !['DO', 'DA', 'DE', 'DOS', 'DAS', 'E'].includes(p.toUpperCase()));
  const base = (uteis.length ? uteis : palavras).slice(0, 3).join(' ');
  const reduzido = base.length > 18 ? `${base.slice(0, 17).trim()}.` : base;
  return [codigo, reduzido].filter(Boolean).join(' - ') || texto.slice(0, 18);
}

function AtrFazendaValueLabel({ x = 0, y = 0, width = 0, value }) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return null;
  const label = decimalBR(numericValue, 2);
  const labelX = Number(x) + Number(width) / 2;
  const labelY = Math.max(14, Number(y) - 8);

  return (
    <text
      x={labelX}
      y={labelY}
      textAnchor="middle"
      fill="#f8fbff"
      fontSize={11}
      fontWeight={800}
      stroke="#07101d"
      strokeWidth={3}
      paintOrder="stroke"
    >
      {label}
    </text>
  );
}

function AtrFazendaChart({ data = [], tvMode = false }) {
  const chartData = (Array.isArray(data) ? data : [])
    .filter((item) => Number(item?.atr) > 0)
    .slice(0, tvMode ? 18 : 12)
    .map((item) => ({ ...item, fazendaLabel: abbreviateAtrFarmLabel(item.fazenda) }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 42, right: 18, left: 0, bottom: 18 }}>
        <CartesianGrid stroke="#1b2a40" strokeDasharray="4 4" vertical={false} />
        <XAxis dataKey="fazendaLabel" tickLine={false} axisLine={false} interval={0} angle={-12} textAnchor="end" tick={{ fill: "#7f8aa3", fontSize: tvMode ? 12 : 10 }} height={58} />
        <YAxis tickLine={false} axisLine={false} tick={{ fill: "#7f8aa3", fontSize: 11 }} tickFormatter={(value) => decimalBR(value, 0)} width={46} domain={[0, (dataMax) => Math.ceil(Number(dataMax || 0) * 1.18)]} />
        <RechartsTooltip content={<DecimalTooltip decimals={2} />} />
        <Bar dataKey="atr" name="ATR" fill="#9f7aea" radius={[7, 7, 0, 0]} barSize={tvMode ? 38 : 24} maxBarSize={tvMode ? 52 : 34} isAnimationActive={false}>
          <LabelList dataKey="atr" content={<AtrFazendaValueLabel />} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function BrocaChart({ data = monthlyData, tvMode = false }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="brocaMetaGlow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff8b9f" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#ff8b9f" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#1b2a40" strokeDasharray="4 4" vertical={false} />
        <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fill: "#7f8aa3", fontSize: 11 }} />
        <YAxis tickLine={false} axisLine={false} tick={{ fill: "#7f8aa3", fontSize: 11 }} tickFormatter={(value) => decimalBR(value, 2)} width={50} />
        <RechartsTooltip content={<DecimalTooltip decimals={2} />} />
        <Bar dataKey="broca" name="Realizado" fill="#ff6a84" radius={[6, 6, 0, 0]} barSize={tvMode ? 28 : 14} maxBarSize={tvMode ? 42 : 22} />
        <Area type="monotone" dataKey="brocaMeta" name="Broca Meta Mensal" stroke="#ff8b9f" strokeWidth={3} fill="url(#brocaMetaGlow)" fillOpacity={1} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function HorizontalSingleMetricChart({ data = monthlyData, dataKey, color, name, tvMode = false }) {
  const normalizedData = ensureFullYearMonthlyData(data);
  const baseData = normalizedData.map((item) => ({
    label: String(item.mes || '').toUpperCase(),
    value: Number(item?.[dataKey] || 0),
  }));
  const maxValue = Math.max(...baseData.map((item) => item.value), 0);
  const axisMax = maxValue > 0 ? Number((maxValue * 1.18).toFixed(2)) : 1;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={baseData} layout="vertical" margin={{ top: 6, right: tvMode ? 64 : 46, left: 0, bottom: 4 }} barCategoryGap={tvMode ? "42%" : "48%"}>
        <CartesianGrid stroke="#172334" horizontal={false} vertical={false} />
        <XAxis type="number" domain={[0, axisMax]} tickLine={false} axisLine={false} tick={{ fill: "#7f8aa3", fontSize: 11 }} tickFormatter={(value) => decimalBR(value, 2)} />
        <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#7f8aa3", fontSize: 11 }} width={42} />
        <RechartsTooltip content={<DecimalTooltip decimals={2} />} />
        <Bar dataKey="value" name={name} fill={color} radius={[0, 8, 8, 0]} barSize={tvMode ? 22 : 12} maxBarSize={tvMode ? 28 : 18}>
          {baseData.map((entry, index) => (
            <Cell key={`${entry.label}-${index}`} fill={entry.value > 0 ? color : "rgba(255,255,255,0.03)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function TvContentFrame({ title, subtitle, metrics = null, children }) {
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 md:gap-4">
      <div className="space-y-3">
        <div className="px-1">
          <h3 className="text-lg font-semibold text-white md:text-xl">{title}</h3>
          {subtitle ? <p className="mt-1 text-sm text-[#97a2bb]">{subtitle}</p> : null}
        </div>
        {metrics}
      </div>
      <div className="min-h-0 h-full overflow-hidden rounded-[18px] border border-[#1a2940] bg-[#050b15]/70 p-2 md:p-3">
        {children}
      </div>
    </div>
  );
}

function TvEmptyState({ title = "Sem dados para exibir" }) {
  return (
    <div className="flex h-full min-h-[240px] items-center justify-center rounded-[14px] border border-dashed border-[#23344f] bg-[#040913] text-center">
      <div>
        <p className="text-sm font-medium text-[#cfd8ea]">{title}</p>
        <p className="mt-1 text-xs text-[#7f8aa3]">Ajuste os filtros ou verifique se há dados disponíveis para este gráfico.</p>
      </div>
    </div>
  );
}

function TvSlide({ slides, currentSlide, isPlaying, onClose, onTogglePlay, slideDurationSeconds = 20 }) {
  const slide = slides[currentSlide];

  return (
    <div className="fixed inset-0 z-[9999] overflow-hidden bg-[#02060d] px-3 pb-3 pt-16 text-white sm:px-4 sm:pb-4 sm:pt-20 lg:px-5 lg:pb-5 lg:pt-24">
      <div className="mx-auto grid h-full max-w-[1800px] grid-rows-[auto_minmax(0,1fr)] gap-2">
        <div className="flex min-h-0 items-center justify-end">
          <div className="flex shrink-0 flex-wrap gap-2 sm:gap-3 lg:justify-end">
            <div className="hidden items-center gap-3 rounded-full border border-[#223149]/70 bg-[#09111d]/85 px-3 py-2 text-[11px] text-[#97a2bb] md:flex">
              <span>{`Troca automática a cada ${slideDurationSeconds}s`}</span>
              <span>•</span>
              <span>{`Slide ${currentSlide + 1} de ${slides.length}`}</span>
              <span>•</span>
              <span>Espaço pausa/continua</span>
            </div>
            <Button className="h-10 rounded-full bg-white px-4 text-black hover:bg-slate-200" onClick={onTogglePlay}>
              {isPlaying ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
              {isPlaying ? "Pausar" : "Continuar"}
            </Button>
            <Button className="h-10 rounded-full bg-[#d8ba61] px-4 text-black hover:bg-[#e5c76a]" onClick={onClose}>
              <Minimize className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
        <div className="min-h-0 overflow-hidden rounded-[20px] border border-[#223149]/60 bg-[linear-gradient(180deg,rgba(5,11,21,0.98),rgba(4,8,16,0.98))] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:rounded-[24px] sm:p-4 lg:p-5">
          {slide.content}
        </div>
      </div>
    </div>
  );
}



const PDF_SECTION_TITLES = {
  capa: 'Dashboard CTT - Entrada de Cana',
  'moagem-dia-dia': 'Moagem Dia a Dia',
  'volume-mensal': 'Volume Mensal',
  'entrega-semanal': 'Entrega Semanal por Frente',
  'volume-frente': 'Volume por Frente',
  'atr-mensal': 'ATR Mensal',
  'atr-fazenda-dia': 'ATR Fazenda Dia',
  'densidade-frente': 'Densidade por Frente',
  'broca-mensal': 'Broca Mensal',
  'impureza-mineral-turno': 'Impureza Mineral por Frente e Turno',
  'impureza-vegetal-turno': 'Impureza Vegetal por Frente e Turno',
  'impureza-vegetal-mensal': 'Impureza Vegetal (%)',
  'impureza-mineral-mensal': 'Impureza Mineral (%)',
};


const EXPORTABLE_PDF_SECTIONS = [
  { id: 'capa', label: 'Resumo + Moagem Horária Efetiva', required: true },
  { id: 'moagem-dia-dia', label: 'Moagem Dia a Dia' },
  { id: 'volume-mensal', label: 'Volume Mensal' },
  { id: 'entrega-semanal', label: 'Entrega Semanal por Frente' },
  { id: 'volume-frente', label: 'Volume por Frente' },
  { id: 'atr-mensal', label: 'ATR Mensal' },
  { id: 'atr-fazenda-dia', label: 'ATR Fazenda Dia' },
  { id: 'densidade-frente', label: 'Densidade por Frente' },
  { id: 'broca-mensal', label: 'Broca Mensal' },
  { id: 'impureza-mineral-turno', label: 'Impureza Mineral por Frente e Turno' },
  { id: 'impureza-vegetal-turno', label: 'Impureza Vegetal por Frente e Turno' },
  { id: 'impureza-vegetal-mensal', label: 'Impureza Vegetal (%)' },
  { id: 'impureza-mineral-mensal', label: 'Impureza Mineral (%)' },
];

function canvasRoundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawText(ctx, text, x, y, options = {}) {
  const { size = 26, weight = 700, color = '#f8fbff', align = 'left', maxWidth } = options;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.font = `${weight} ${size}px Inter, Arial, sans-serif`;
  ctx.fillText(String(text || ''), x, y, maxWidth);
}

function drawValueWithSuffix(ctx, value, suffix, x, y, options = {}) {
  const { valueSize = 26, suffixSize = 12, valueColor = '#f8fbff', suffixColor = '#c7d2ea', weight = 900, gap = 10, maxSuffixX } = options;
  const text = String(value || '');
  ctx.font = `${weight} ${valueSize}px Inter, Arial, sans-serif`;
  ctx.fillStyle = valueColor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(text, x, y);
  if (suffix) {
    const measured = ctx.measureText(text).width;
    const suffixX = Math.min(maxSuffixX || Number.POSITIVE_INFINITY, x + measured + gap);
    drawText(ctx, suffix, suffixX, y + Math.max(2, valueSize - suffixSize - 2), { size: suffixSize, weight: 700, color: suffixColor });
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function svgToImage(svgElement) {
  const clone = svgElement.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', svgElement.getBoundingClientRect().width || svgElement.clientWidth || 1200);
  clone.setAttribute('height', svgElement.getBoundingClientRect().height || svgElement.clientHeight || 420);
  clone.querySelectorAll('*').forEach((el) => {
    if (el.style) {
      el.style.fontFamily = 'Inter, Arial, sans-serif';
      el.style.animation = 'none';
      el.style.transition = 'none';
    }
  });
  const svgText = new XMLSerializer().serializeToString(clone);
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  return loadImage(src);
}


function inlineComputedStyles(source, target) {
  if (!source || !target || source.nodeType !== 1 || target.nodeType !== 1) return;

  const computed = window.getComputedStyle(source);
  const important = [
    'align-items','background','background-color','background-image','background-position','background-size','border','border-color','border-radius','border-style','border-width','box-shadow','box-sizing','color','display','flex','flex-basis','flex-direction','flex-grow','flex-shrink','font','font-family','font-size','font-stretch','font-style','font-variant','font-weight','gap','grid-template-columns','height','justify-content','letter-spacing','line-height','margin','max-height','max-width','min-height','min-width','opacity','overflow','padding','position','text-align','text-transform','transform','transform-origin','width','white-space','z-index'
  ];

  important.forEach((prop) => {
    const value = computed.getPropertyValue(prop);
    if (value) target.style.setProperty(prop, value, computed.getPropertyPriority(prop));
  });

  target.style.animation = 'none';
  target.style.transition = 'none';
  target.style.caretColor = 'transparent';
  target.style.textRendering = 'geometricPrecision';
  target.style.webkitFontSmoothing = 'antialiased';

  if (target.tagName?.toLowerCase() === 'svg') {
    target.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const rect = source.getBoundingClientRect();
    if (!target.getAttribute('width')) target.setAttribute('width', Math.max(1, Math.ceil(rect.width || source.clientWidth || 1)));
    if (!target.getAttribute('height')) target.setAttribute('height', Math.max(1, Math.ceil(rect.height || source.clientHeight || 1)));
  }

  Array.from(source.children || []).forEach((child, index) => {
    inlineComputedStyles(child, target.children?.[index]);
  });
}


function trimDashboardCanvas(canvas, options = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const { width, height } = canvas;
  if (!width || !height) return canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const bg = options.bg || [2, 8, 20];
  const threshold = options.threshold ?? 18;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const a = data[idx + 3];
      if (a < 8) continue;
      const diff = Math.abs(data[idx] - bg[0]) + Math.abs(data[idx + 1] - bg[1]) + Math.abs(data[idx + 2] - bg[2]);
      if (diff > threshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return canvas;
  const pad = Math.max(18, Math.round((options.margin || 14) * (window.devicePixelRatio || 2)));
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  if (cropW >= width * 0.98 && cropH >= height * 0.98) return canvas;

  const out = document.createElement('canvas');
  out.width = cropW;
  out.height = cropH;
  const outCtx = out.getContext('2d');
  if (!outCtx) return canvas;
  outCtx.fillStyle = '#020814';
  outCtx.fillRect(0, 0, cropW, cropH);
  outCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
  return out;
}

async function captureNodeExactPng(node, meta = {}) {
  if (!node) throw new Error('Seção do dashboard não encontrada para capturar.');
  const rect = node.getBoundingClientRect();
  const width = Math.max(1, Math.ceil(node.scrollWidth || rect.width || node.clientWidth || 1));
  const height = Math.max(1, Math.ceil(node.scrollHeight || rect.height || node.clientHeight || 1));
  if (width < 20 || height < 20) throw new Error('Seção do dashboard sem tamanho válido para o PDF.');

  const isCover = meta?.kind === 'cover';
  // Para páginas depois da capa, o gráfico precisa sair grande no A4.
  // O bloco é ampliado visualmente antes da captura, sem alterar o dashboard real.
  const visualScale = isCover ? 1 : 1.8;
  const exportWidth = Math.ceil(width * visualScale);
  const exportHeight = Math.ceil(height * visualScale);

  const clone = node.cloneNode(true);
  inlineComputedStyles(node, clone);
  clone.querySelectorAll('[data-pdf-ignore="true"], .recharts-tooltip-wrapper').forEach((el) => el.remove());
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.margin = '0';
  clone.style.transform = isCover ? 'none' : `scale(${visualScale})`;
  clone.style.transformOrigin = 'top left';
  clone.style.overflow = 'visible';
  clone.style.backgroundColor = '#020814';

  const wrapper = document.createElement('div');
  wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  wrapper.style.width = `${exportWidth}px`;
  wrapper.style.height = `${exportHeight}px`;
  wrapper.style.margin = '0';
  wrapper.style.padding = '0';
  wrapper.style.background = '#020814';
  wrapper.style.overflow = 'hidden';
  wrapper.appendChild(clone);

  const serialized = new XMLSerializer().serializeToString(wrapper);
  const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="${exportWidth}" height="${exportHeight}" viewBox="0 0 ${exportWidth} ${exportHeight}"><foreignObject x="0" y="0" width="100%" height="100%">${serialized}</foreignObject></svg>`;
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  const image = await loadImage(src);

  const scale = Math.min(3, Math.max(2, window.devicePixelRatio || 2));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(exportWidth * scale);
  canvas.height = Math.ceil(exportHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível preparar a imagem do PDF.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#020814';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const trimmed = trimDashboardCanvas(canvas, { margin: meta?.kind === 'cover' ? 8 : 18 });
  return trimmed.toDataURL('image/png');
}

function pickMainChartSvg(node) {
  const svgs = Array.from(node?.querySelectorAll('svg') || []);
  if (!svgs.length) return null;
  return svgs
    .map((svg) => {
      const rect = svg.getBoundingClientRect();
      return { svg, area: Math.max(1, rect.width || svg.clientWidth || 0) * Math.max(1, rect.height || svg.clientHeight || 0) };
    })
    .sort((a, b) => b.area - a.area)[0]?.svg || null;
}

function drawPdfIcon(ctx, x, y, size, accent = '#60a5fa', variant = 'chart') {
  canvasRoundRect(ctx, x, y, size, size, 16);
  ctx.fillStyle = `${accent}26`;
  ctx.fill();
  ctx.strokeStyle = `${accent}90`;
  ctx.lineWidth = 2;
  ctx.stroke();

  const cx = x + size / 2;
  const cy = y + size / 2;
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.fillStyle = accent;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (variant === 'trend') {
    ctx.beginPath();
    ctx.moveTo(x + 14, y + size - 16);
    ctx.lineTo(x + 24, y + size - 26);
    ctx.lineTo(x + 33, y + size - 22);
    ctx.lineTo(x + size - 14, y + 15);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + size - 25, y + 15);
    ctx.lineTo(x + size - 14, y + 15);
    ctx.lineTo(x + size - 14, y + 26);
    ctx.stroke();
  } else if (variant === 'target') {
    for (const r of [16, 10, 4]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (variant === 'pulse') {
    ctx.beginPath();
    ctx.moveTo(x + 12, cy);
    ctx.lineTo(x + 22, cy);
    ctx.lineTo(x + 28, y + 18);
    ctx.lineTo(x + 36, y + size - 16);
    ctx.lineTo(x + 44, cy);
    ctx.lineTo(x + size - 12, cy);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(x + 15, y + size - 16);
    ctx.lineTo(x + size - 12, y + size - 16);
    ctx.stroke();
    [0, 1, 2].forEach((i) => {
      const bx = x + 18 + i * 10;
      const bh = 11 + i * 7;
      ctx.beginPath();
      ctx.moveTo(bx, y + size - 20);
      ctx.lineTo(bx, y + size - 20 - bh);
      ctx.stroke();
    });
  }
  ctx.restore();
}

function drawDashboardCard(ctx, x, y, w, h, title, value, suffix, accent = '#60a5fa', icon = 'chart') {
  canvasRoundRect(ctx, x, y, w, h, 22);
  ctx.fillStyle = '#081323';
  ctx.fill();
  ctx.strokeStyle = '#1e2d47';
  ctx.lineWidth = 2;
  ctx.stroke();

  drawText(ctx, String(title || '').toUpperCase(), x + 26, y + 24, { size: 16, weight: 800, color: '#8fa3c5' });
  drawValueWithSuffix(ctx, value, suffix, x + 26, y + 64, { valueSize: 34, suffixSize: 15, valueColor: '#ffffff', suffixColor: '#b8c5dc', maxSuffixX: x + w - 118 });
  drawPdfIcon(ctx, x + w - 72, y + 22, 48, accent, icon);
}

function drawSplitDashboardCard(ctx, x, y, w, h, title, leftLabel, leftValue, rightLabel, rightValue, suffix = '%') {
  canvasRoundRect(ctx, x, y, w, h, 22);
  ctx.fillStyle = '#081323';
  ctx.fill();
  ctx.strokeStyle = '#1e2d47';
  ctx.lineWidth = 2;
  ctx.stroke();

  drawText(ctx, String(title || '').toUpperCase(), x + 26, y + 22, { size: 16, weight: 800, color: '#8fa3c5' });
  drawPdfIcon(ctx, x + w - 72, y + 22, 48, '#ef4444', 'pulse');

  drawText(ctx, String(leftLabel || '').toUpperCase(), x + 26, y + 70, { size: 14, weight: 800, color: '#8fa3c5' });
  drawValueWithSuffix(ctx, leftValue, suffix, x + 26, y + 96, { valueSize: 29, suffixSize: 15, valueColor: '#ff6166', suffixColor: '#ff9ca0', maxSuffixX: x + w / 2 - 22 });

  ctx.strokeStyle = '#31415d';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + w / 2 + 6, y + 70);
  ctx.lineTo(x + w / 2 + 6, y + h - 28);
  ctx.stroke();

  drawText(ctx, String(rightLabel || '').toUpperCase(), x + w / 2 + 32, y + 70, { size: 14, weight: 800, color: '#8fa3c5' });
  drawValueWithSuffix(ctx, rightValue, suffix, x + w / 2 + 32, y + 96, { valueSize: 29, suffixSize: 15, valueColor: '#f2b33d', suffixColor: '#ffd183', maxSuffixX: x + w - 82 });
}

function drawTinyMetric(ctx, x, y, w, label, value, suffix, accent) {
  canvasRoundRect(ctx, x, y, w, 56, 16);
  ctx.fillStyle = `${accent}20`;
  ctx.fill();
  ctx.strokeStyle = `${accent}70`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  drawText(ctx, String(label || '').toUpperCase(), x + 12, y + 11, { size: 11, weight: 800, color: '#98a9c7' });
  drawText(ctx, value, x + w - 46, y + 31, { size: 14, weight: 900, color: accent, align: 'right' });
  if (suffix) drawText(ctx, suffix, x + w - 40, y + 34, { size: 9, weight: 700, color: '#c7d2ea' });
}

async function captureDashboardSectionPng(node, meta = {}) {
  if (!node) throw new Error('Seção do dashboard não encontrada para gerar o PDF.');

  const id = node.getAttribute('data-pdf-section') || '';
  const kind = node.getAttribute('data-pdf-kind') || 'chart';

  // Prioridade: capturar exatamente o bloco que está na tela. Assim o PDF leva
  // o mesmo design, cards, ícones, títulos, espaçamentos e gráfico que o usuário vê.
  try {
    return await captureNodeExactPng(node, { ...meta, kind });
  } catch (exactError) {
    console.warn('Falha na captura exata do bloco do PDF; usando renderização de segurança.', exactError);
  }

  const svg = pickMainChartSvg(node);
  if (!svg) throw new Error(`Não encontrei o gráfico principal da seção ${id || 'sem nome'} para montar o PDF.`);

  const isCover = kind === 'cover';
  const canvas = document.createElement('canvas');
  const renderW = isCover ? 2200 : 2600;
  const renderH = isCover ? 1360 : 980;
  const scale = 3;
  canvas.width = renderW * scale;
  canvas.height = renderH * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível preparar o canvas do PDF.');
  ctx.scale(scale, scale);

  ctx.fillStyle = '#020814';
  ctx.fillRect(0, 0, renderW, renderH);

  if (isCover) {
    const c = meta.cover || {};
    const top = Array.isArray(c.topCards) ? c.topCards : [];
    const topY = 28;
    const gap = 18;
    const cardW = (renderW - 80 - gap * 4) / 5;
    top.forEach((card, index) => {
      const x = 40 + index * (cardW + gap);
      if (card.split) {
        drawSplitDashboardCard(ctx, x, topY, cardW, 138, card.title, card.leftLabel, card.leftValue, card.rightLabel, card.rightValue, card.suffix);
      } else {
        drawDashboardCard(ctx, x, topY, cardW, 138, card.title, card.value, card.suffix, card.accent || '#60a5fa', card.icon || 'chart');
      }
    });

    const panelX = 40;
    const panelY = 194;
    const panelW = renderW - 80;
    const panelH = renderH - panelY - 40;
    canvasRoundRect(ctx, panelX, panelY, panelW, panelH, 26);
    ctx.fillStyle = '#081323';
    ctx.fill();
    ctx.strokeStyle = '#1e2d47';
    ctx.lineWidth = 2;
    ctx.stroke();

    drawText(ctx, 'Moagem Horária Efetiva', panelX + 68, panelY + 28, { size: 29, weight: 900 });
    drawText(ctx, c.subtitle || 'Acompanhamento hora a hora', panelX + 68, panelY + 66, { size: 17, weight: 500, color: '#9aa8c0' });

    const tiny = Array.isArray(c.tinyMetrics) ? c.tinyMetrics : [];
    const tinyGap = 10;
    const tinyTotal = tiny.reduce((sum, item) => sum + (item.w || 156), 0) + tinyGap * Math.max(0, tiny.length - 1);
    let tinyX = Math.max(panelX + 700, panelX + panelW - tinyTotal - 24);
    tiny.forEach((item) => {
      const width = item.w || 156;
      drawTinyMetric(ctx, tinyX, panelY + 24, width, item.label, item.value, item.suffix, item.accent || '#60a5fa');
      tinyX += width + tinyGap;
    });

    const mini = Array.isArray(c.miniCards) ? c.miniCards : [];
    const miniY = panelY + 112;
    const miniGap = 14;
    const miniW = (panelW - 48 - miniGap * 6) / 7;
    mini.forEach((item, index) => {
      const x = panelX + 24 + index * (miniW + miniGap);
      canvasRoundRect(ctx, x, miniY, miniW, 92, 18);
      ctx.fillStyle = `${item.bg || '#13294b'}`;
      ctx.fill();
      ctx.strokeStyle = `${item.border || '#24436d'}`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      drawText(ctx, String(item.label || '').toUpperCase(), x + 18, miniY + 18, { size: 13, weight: 800, color: '#8fa3c5' });
      drawValueWithSuffix(ctx, item.value, item.suffix, x + 18, miniY + 50, { valueSize: 22, suffixSize: 12, valueColor: item.color || '#60a5fa', suffixColor: '#bfcae0', maxSuffixX: x + miniW - 54 });
    });

    const image = await svgToImage(svg);
    const chartX = panelX + 28;
    const chartY = miniY + 118;
    const chartW = panelW - 56;
    const chartH = panelH - (chartY - panelY) - 28;
    const svgRect = svg.getBoundingClientRect();
    const sourceRatio = (svgRect.width || image.width || 1) / Math.max(1, svgRect.height || image.height || 1);
    const targetRatio = chartW / chartH;
    let drawW = chartW;
    let drawH = chartH;
    if (sourceRatio > targetRatio) drawH = chartW / sourceRatio;
    else drawW = chartH * sourceRatio;
    ctx.drawImage(image, chartX + (chartW - drawW) / 2, chartY + (chartH - drawH) / 2, drawW, drawH);
    return canvas.toDataURL('image/png');
  }

  canvasRoundRect(ctx, 24, 24, renderW - 48, renderH - 48, 28);
  ctx.fillStyle = '#07111f';
  ctx.fill();
  ctx.strokeStyle = '#20314d';
  ctx.lineWidth = 2;
  ctx.stroke();

  const title = PDF_SECTION_TITLES[id] || node.getAttribute('data-pdf-group-title') || 'Dashboard CTT';
  const panelTitle = node.querySelector('h2,h3,[data-panel-title]')?.textContent?.trim() || title;
  drawText(ctx, panelTitle, 58, 44, { size: 30, weight: 800 });

  const subtitle = node.querySelector('p,[data-panel-subtitle]')?.textContent?.trim() || '';
  if (subtitle) drawText(ctx, subtitle, 58, 84, { size: 17, weight: 500, color: '#9aa8c0' });

  const svgRect = svg.getBoundingClientRect();
  const image = await svgToImage(svg);
  const chartX = 58;
  const chartY = 126;
  const chartW = renderW - 116;
  const chartH = renderH - chartY - 42;
  const sourceRatio = (svgRect.width || image.width || 1) / Math.max(1, svgRect.height || image.height || 1);
  const targetRatio = chartW / chartH;
  let drawW = chartW;
  let drawH = chartH;
  if (sourceRatio > targetRatio) drawH = chartW / sourceRatio;
  else drawW = chartH * sourceRatio;
  ctx.drawImage(image, chartX + (chartW - drawW) / 2, chartY + (chartH - drawH) / 2, drawW, drawH);

  return canvas.toDataURL('image/png');
}

export default function DashboardCTTPage({ onBack, companyId, session }) {
  const canDashboardEntradaCana = hasModuleAccess(session, "dashboard_entrada_cana");
  const canDashboardTalhoesFechados = hasModuleAccess(session, "dashboard_talhoes_fechados");
  const [activeDashboard, setActiveDashboard] = useState(canDashboardEntradaCana ? "entrada" : "fechamento");
  const [safra, setSafra] = useState("todas");
  const [frente, setFrente] = useState("todas");
  const [fazenda, setFazenda] = useState("todas");
  const [tvMode, setTvMode] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [showPdfOptions, setShowPdfOptions] = useState(false);
  const [selectedPdfSections, setSelectedPdfSections] = useState(() => EXPORTABLE_PDF_SECTIONS.map((item) => item.id));
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const intervalRef = useRef(null);
  const TV_SLIDE_DURATION_MS = 20000;
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const premissasFiltroAplicadoRef = useRef(false);
  const [descricao, setDescricao] = useState("todas");
  const [options, setOptions] = useState({ safras: [], frentes: [], descricoes: [] });
  const [summary, setSummary] = useState(null);
  const requestInFlightRef = useRef(false);

  useEffect(() => {
    if (activeDashboard === "entrada" && !canDashboardEntradaCana && canDashboardTalhoesFechados) {
      setActiveDashboard("fechamento");
    }
    if (activeDashboard === "fechamento" && !canDashboardTalhoesFechados && canDashboardEntradaCana) {
      setActiveDashboard("entrada");
    }
  }, [activeDashboard, canDashboardEntradaCana, canDashboardTalhoesFechados]);

  const normalizedMonthlyData = useMemo(() => ensureFullYearMonthlyData(summary?.monthlyData || monthlyData), [summary?.monthlyData]);
  const atrFazendaData = useMemo(() => Array.isArray(summary?.atrFazendaData) ? summary.atrFazendaData : [], [summary?.atrFazendaData]);
  const densidadeFrenteData = useMemo(() => {
    const getFrenteOrder = (value) => {
      const match = String(value ?? '').match(/\d+/);
      return match ? Number(match[0]) : 9999;
    };
    return Array.isArray(summary?.densidadeFrenteData)
      ? [...summary.densidadeFrenteData].sort((a, b) => getFrenteOrder(a?.frenteOriginal ?? a?.frente) - getFrenteOrder(b?.frenteOriginal ?? b?.frente))
      : [];
  }, [summary?.densidadeFrenteData]);
  const impurezaMineralTurnoData = useMemo(() => Array.isArray(summary?.impurezaMineralTurnoData) ? summary.impurezaMineralTurnoData : [], [summary?.impurezaMineralTurnoData]);
  const impurezaVegetalTurnoData = useMemo(() => Array.isArray(summary?.impurezaVegetalTurnoData) ? summary.impurezaVegetalTurnoData : [], [summary?.impurezaVegetalTurnoData]);
  const impurezaTurnoDataSelecionada = summary?.impurezaTurnoDataSelecionada || impurezaMineralTurnoData?.[0]?.data || impurezaVegetalTurnoData?.[0]?.data || '';
  const impurezaTurnoDataLabel = impurezaTurnoDataSelecionada ? `Data usada: ${formatDateBRFromISO(impurezaTurnoDataSelecionada)}` : 'Dados do dia por frente e turno';
  const moagemDiaDiaData = useMemo(() => Array.isArray(summary?.moagemDiaDiaData) ? summary.moagemDiaDiaData : [], [summary?.moagemDiaDiaData]);
  const currentMonthLabel = MONTHS_FULL[new Date().getMonth()];
  const currentMonthData = useMemo(
    () => normalizedMonthlyData.find((item) => item.mes === currentMonthLabel) || normalizedMonthlyData[new Date().getMonth()] || null,
    [normalizedMonthlyData, currentMonthLabel]
  );
  const currentMonthKey = MONTH_LABEL_TO_KEY[currentMonthLabel] || MONTH_LABEL_TO_KEY[MONTHS_FULL[new Date().getMonth()]];

  const dynamicFronts = summary?.frontConfigs || [
    { key: 'f1', label: 'F - 1', fill: '#21d6a0', frente: '1' },
    { key: 'f2', label: 'F - 2', fill: '#5b8fff', frente: '2' },
    { key: 'f3', label: 'F - 3', fill: '#f0a83a', frente: '3' },
  ];
  const dynamicFrontTotals = summary?.frontTotals || dynamicFronts.map((front, index) => ({ ...front, total: [2400, 2300, 3100][index] || 0 }));

  const premissas = summary?.premissas || {};
  const moagemPrevista = summary?.cards?.moagemPrevista || premissas.moagemPrevista || 0;
  const moagemRealizada = summary?.cards?.moagemRealizada || 0;
  const saldoMoagem = summary?.cards?.saldoMoagem || 0;
  const now = new Date();
  const currentMonthIndexFromClock = getCurrentMonthIndex(now);
  const currentMonthLabelFromClock = MONTHS_FULL[currentMonthIndexFromClock];
  const currentMonthKeyFromClock = MONTH_LABEL_TO_KEY[currentMonthLabelFromClock];
  const effectiveWeekdays = extractEffectiveWeekdays(summary?.weeklyFrontData || weeklyFrontData);
  const { start: currentWeekStart, end: currentWeekEnd } = getCurrentWeekRange(now);
  const currentDateLabel = formatDateBR(now);
  const currentWeekLabel = `Semana de ${formatDateBR(currentWeekStart)} a ${formatDateBR(currentWeekEnd)}`;
  const dayProgressLabel = `${getDayProgressPercent(now)}% do dia`;

  const currentMonthDataByClock = normalizedMonthlyData.find((item) => item.mes === currentMonthLabelFromClock);
  const metaMesAtual = Number(
    summary?.premissas?.metasMensais?.[currentMonthKeyFromClock]?.metaMes
    ?? premissas?.metasMensais?.[currentMonthKeyFromClock]?.metaMes
    ?? currentMonthDataByClock?.meta
    ?? summary?.cards?.metaMesAtual
    ?? premissas?.metaMes
    ?? 0
  );
  const realizadoMesAtual = Number(currentMonthDataByClock?.entrada ?? 0);
  const saldoMensal = metaMesAtual - realizadoMesAtual;
  const diasEfetivosRestantesMes = getRemainingEffectiveDaysOfMonth(now, effectiveWeekdays);

  const atrMetaMesAtual = Number(
    currentMonthData?.atrMeta
    ?? summary?.premissas?.metasMensais?.[currentMonthKey]?.atr
    ?? premissas?.metasMensais?.[currentMonthKey]?.atr
    ?? 0
  );
  const atrReal = Number(summary?.cards?.atrReal ?? currentMonthData?.atr ?? 0);
  const brocaMetaMesAtual = Number(
    currentMonthData?.brocaMeta
    ?? summary?.premissas?.metasMensais?.[currentMonthKey]?.broca
    ?? premissas?.metasMensais?.[currentMonthKey]?.broca
    ?? 0
  );
  const brocaReal = Number(currentMonthData?.broca ?? summary?.cards?.brocaReal ?? 0);
  const metaDia = summary?.cards?.metaDia || premissas.metaDia || 0;
  const metaHora = summary?.cards?.metaHora || premissas.metaHora || 0;
  const realizadoDia = Number(
    summary?.cards?.realizadoDia
    ?? (summary?.hourlyData || []).reduce((sum, item) => sum + Number(item?.realizado || 0), 0)
  );
  const saldoDia = metaDia - realizadoDia;
  const horasEfetivasRestantesDia = getRemainingHoursUntilEndOfDay(now);
  const reprojecaoHora = calculateReprojectedTarget(saldoDia, horasEfetivasRestantesDia);
  const metaAcumulada = metaMesAtual;
  const metaReprojetadaDia = calculateReprojectedTarget(saldoMensal, diasEfetivosRestantesMes);
  const rotacaoMoenda = Number(summary?.cards?.rotacaoMoenda ?? 0);
  const estoqueMoagem = Number(summary?.cards?.estoqueCarretas ?? 0);
  const realizadoUltimaHora = Number(
    summary?.cards?.realizadoUltimaHora ??
    [...(summary?.hourlyData || hourlyData)].reverse().find((item) => Number(item?.realizado || 0) > 0)?.realizado ??
    0
  );
  const moagemDiaAnterior = Number(
    summary?.cards?.moagemDiaAnterior
    ?? summary?.cards?.realizadoDiaAnterior
    ?? 0
  );
  const atrDiaAnterior = Number(summary?.cards?.atrDiaAnterior ?? summary?.atrDiaAnterior ?? 0);
  const densidadeMediaUltimasCargas = Number(
    summary?.cards?.densidadeMedia
    ?? summary?.cards?.densidadeMediaUltimasCargas
    ?? 0
  );
  const paradaIndustriaPercentual = Number(summary?.cards?.paradaIndustriaPercentual ?? 0);
  const paradaAgricolaPercentual = Number(summary?.cards?.paradaAgricolaPercentual ?? 0);
  const paradaIndustriaAcumuladaPercentual = Number(summary?.cards?.paradaIndustriaAcumuladaPercentual ?? summary?.paradaAcumuladaStats?.paradaIndustriaAcumuladaPercentual ?? 0);
  const paradaAgricolaAcumuladaPercentual = Number(summary?.cards?.paradaAgricolaAcumuladaPercentual ?? summary?.paradaAcumuladaStats?.paradaAgricolaAcumuladaPercentual ?? 0);
  const horaEfetivaAtual = Number(summary?.cards?.horaEfetivaAtual ?? 0);
  const moagemPrevistaDia24h = Number(summary?.cards?.moagemPrevistaDia24h ?? (horaEfetivaAtual > 0 ? (realizadoDia / horaEfetivaAtual) * 24 : 0));
  const metaSemana = summary?.cards?.metaSemana || premissas.metaSemana || 0;
  const realizadoSemana = (summary?.weeklyFrontData || weeklyFrontData)
    .filter((row) => {
      if (!row?.data) return true;
      const rowDate = new Date(`${row.data}T00:00:00`);
      return rowDate >= currentWeekStart && rowDate <= currentWeekEnd;
    })
    .reduce((sum, row) => (
      sum + Object.entries(row || {})
        .filter(([key]) => key !== 'dia' && key !== 'data')
        .reduce((acc, [, value]) => acc + Number(value || 0), 0)
    ), 0);
  const saldoSemana = metaSemana - realizadoSemana;
  const diasEfetivosRestantesSemana = getRemainingEffectiveDaysOfWeek(now, effectiveWeekdays);
  const metaReprojetadaSemana = calculateReprojectedTarget(saldoSemana, diasEfetivosRestantesSemana);

  const loadSummary = useCallback(async () => {
    if (!companyId || activeDashboard !== "entrada" || !canDashboardEntradaCana || requestInFlightRef.current) return;
    requestInFlightRef.current = true;

    try {
      const [nextSummary, operacional] = await Promise.all([
        fetchColheitaDashboardSummary(companyId, {
          safra,
          frente,
          descricao,
          dataInicio,
          dataFim,
        }),
        fetchDashboardColheitaOperacional(companyId).catch(() => null),
      ]);

      setSummary({
        ...nextSummary,
        cards: {
          ...(nextSummary?.cards || {}),
          ...(operacional ? {
            rotacaoMoenda: operacional.rotacaoMoenda,
            estoqueCarretas: operacional.estoqueCarretas,
          } : {}),
        },
      });
    } catch (_) {
      // atualização silenciosa
    } finally {
      requestInFlightRef.current = false;
    }
  }, [companyId, activeDashboard, canDashboardEntradaCana, safra, frente, descricao, dataInicio, dataFim]);

  const handleExportPdf = async (sectionsToExport = selectedPdfSections) => {
    if (!companyId || isExportingPdf) return;
    setIsExportingPdf(true);
    document.documentElement.classList.add('dashboard-ctt-pdf-exporting');
    try {
      // O PDF precisa ficar igual ao sistema. Para não quebrar o Vite por dependência
      // externa ausente, a captura é feita com recursos nativos do navegador e o backend
      // apenas monta o PDF final. A capa fica na primeira página e cada gráfico selecionado fica sozinho em sua própria página.
      await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
      const selectedSet = new Set(sectionsToExport || []);
      selectedSet.add('capa');
      const orderedIds = EXPORTABLE_PDF_SECTIONS.map((item) => item.id).filter((id) => selectedSet.has(id));
      const nodes = orderedIds
        .map((id) => {
          if (id === 'capa') return document.querySelector('[data-pdf-section="capa"][data-pdf-kind="cover"]');
          // Garante que depois da capa vamos capturar somente o card/gráfico individual,
          // nunca a linha/grid que contém dois gráficos lado a lado.
          return document.querySelector(`[data-pdf-section="${id}"][data-pdf-single="true"]`);
        })
        .filter(Boolean);
      const sections = [];
      console.info('[PDF CTT] Seções selecionadas:', orderedIds);
      const coverPdfData = {
        subtitle: `Acompanhamento hora a hora — ${currentDateLabel}`,
        topCards: [
          { title: 'Moagem Prevista', value: numberBR(moagemPrevista), suffix: 'ton', accent: '#60a5fa', icon: 'chart' },
          { title: 'Moagem Realizada', value: numberBR(moagemRealizada), suffix: 'ton', accent: '#21d6a0', icon: 'trend' },
          { title: 'Saldo de Moagem', value: numberBR(saldoMoagem), suffix: 'ton', accent: '#f2b33d', icon: 'target' },
          { title: 'ATR Acumulado', value: decimalBR(atrReal, 2), suffix: 'kg/t', accent: '#a875ff', icon: 'pulse' },
          {
            title: 'Parada Acumulada', split: true,
            leftLabel: 'Industrial', leftValue: decimalBR(paradaIndustriaAcumuladaPercentual, 2),
            rightLabel: 'Agrícola', rightValue: decimalBR(paradaAgricolaAcumuladaPercentual, 2), suffix: '%',
          },
        ],
        tinyMetrics: [
          { label: '% Parada Indústria', value: decimalBR(paradaIndustriaPercentual, 2), suffix: '%', accent: '#ff6166', w: 168 },
          { label: '% Parada Agrícola', value: decimalBR(paradaAgricolaPercentual, 2), suffix: '%', accent: '#ff6166', w: 168 },
          { label: 'Moagem Dia Anterior', value: formatBrazilianNumber(moagemDiaAnterior, 0, 0), suffix: 'ton', accent: '#f2b33d', w: 188 },
          { label: 'ATR Dia Anterior', value: atrDiaAnterior > 0 ? decimalBR(atrDiaAnterior, 2) : '--', suffix: 'kg/t', accent: '#a875ff', w: 164 },
          { label: 'Rotação', value: rotacaoMoenda > 0 ? formatBrazilianNumber(rotacaoMoenda, 0, 0) : '--', suffix: 'rpm', accent: '#21d6a0', w: 142 },
          { label: 'Densidade Média', value: formatBrazilianNumber(densidadeMediaUltimasCargas, 0, 0), suffix: 't/carga', accent: '#21d6a0', w: 164 },
          { label: 'Estoque', value: estoqueMoagem > 0 ? formatBrazilianNumber(estoqueMoagem, 0, 0) : '--', suffix: 'carretas', accent: '#f2b33d', w: 132 },
        ],
        miniCards: [
          { label: 'Meta Dia', value: numberBR(metaDia), suffix: 'ton', color: '#60a5fa', bg: '#13294b', border: '#24436d' },
          { label: 'Meta/Hora', value: numberBR(metaHora), suffix: 'ton', color: '#60a5fa', bg: '#13294b', border: '#24436d' },
          { label: 'Realizado', value: formatBrazilianNumber(realizadoDia, 0, 0), suffix: 'ton', color: '#21d6a0', bg: '#0d3326', border: '#1c5b45' },
          { label: 'Realizado Última Hora', value: formatBrazilianNumber(realizadoUltimaHora, 0, 0), suffix: 'ton', color: '#21d6a0', bg: '#0d3326', border: '#1c5b45' },
          { label: 'Saldo', value: numberBR(saldoDia), suffix: 'ton', color: '#f2b33d', bg: '#3a2812', border: '#70501c' },
          { label: 'Moagem Prevista', value: formatBrazilianNumber(moagemPrevistaDia24h, 0, 0), suffix: 'ton', color: '#60a5fa', bg: '#13294b', border: '#24436d' },
          { label: 'Meta Reprojetada', value: formatBrazilianNumber(reprojecaoHora, 0, 0), suffix: 'ton/h', color: '#c084fc', bg: '#261a3f', border: '#553379' },
        ],
      };
      for (const node of nodes) {
        const isCoverNode = (node.getAttribute('data-pdf-kind') || '') === 'cover';
        const image = await captureDashboardSectionPng(node, isCoverNode ? { cover: coverPdfData } : {});
        sections.push({
          id: node.getAttribute('data-pdf-section') || '',
          kind: node.getAttribute('data-pdf-kind') || 'chart',
          title: PDF_SECTION_TITLES[node.getAttribute('data-pdf-section') || ''] || '',
          groupTitle: '',
          pageMode: isCoverNode ? 'cover' : 'single',
          forceSinglePage: true,
          image,
        });
      }
      if (!sections.length) throw new Error('Nenhum bloco do dashboard foi encontrado para gerar o PDF.');
      await downloadColheitaDashboardRenderedPdf(companyId, { safra, frente, descricao, dataInicio, dataFim }, sections);
      setShowPdfOptions(false);
    } catch (error) {
      console.error('Erro ao gerar PDF visual do dashboard CTT:', error);
      alert(error?.message || 'Erro ao gerar PDF visual do dashboard CTT.');
    } finally {
      document.documentElement.classList.remove('dashboard-ctt-pdf-exporting');
      setIsExportingPdf(false);
    }
  };

  const slides = useMemo(
    () => [
      {
        title: "Moagem Horária Efetiva",
        content: (
          <TvContentFrame
            title="Moagem Horária Efetiva"
            subtitle={`Acompanhamento hora a hora — ${currentDateLabel}`}
            metrics={(
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
                  <StatMiniCard label="% Parada Indústria" value={decimalBR(paradaIndustriaPercentual, 2)} suffix="%" accent="red" />
                  <StatMiniCard label="% Parada Agrícola" value={decimalBR(paradaAgricolaPercentual, 2)} suffix="%" accent="red" />
                  <StatMiniCard label="Moagem Dia Anterior" value={formatBrazilianNumber(moagemDiaAnterior, 0, 0)} suffix="ton" accent="amber" />
                  <StatMiniCard label="ATR Dia Anterior" value={atrDiaAnterior > 0 ? decimalBR(atrDiaAnterior, 2) : '--'} suffix="kg/t" accent="purple" />
                  <StatMiniCard label="Rotação" value={rotacaoMoenda > 0 ? formatBrazilianNumber(rotacaoMoenda, 0, 0) : '--'} suffix="rpm" accent="green" />
                  <StatMiniCard label="Densidade Média" value={formatBrazilianNumber(densidadeMediaUltimasCargas, 0, 0)} suffix="t/carga" accent="green" />
                  <StatMiniCard label="Estoque" value={estoqueMoagem > 0 ? formatBrazilianNumber(estoqueMoagem, 0, 0) : '--'} suffix="carretas" accent="amber" />
                </div>
                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
                  <StatMiniCard label="Meta Dia" value={numberBR(metaDia)} suffix="ton" accent="blue" />
                  <StatMiniCard label="Meta/Hora" value={numberBR(metaHora)} suffix="ton" accent="blue" />
                  <StatMiniCard label="Realizado" value={formatBrazilianNumber(realizadoDia, 0, 0)} suffix="ton" accent="green" />
                  <StatMiniCard label="Realizado Última Hora" value={formatBrazilianNumber(realizadoUltimaHora, 0, 0)} suffix="ton" accent="green" />
                  <StatMiniCard label="Saldo" value={numberBR(saldoDia)} suffix="ton" accent="amber" />
                  <StatMiniCard label="Moagem Prevista" value={formatBrazilianNumber(moagemPrevistaDia24h, 0, 0)} suffix="ton" accent="blue" />
                  <StatMiniCard label="Meta Reprojetada" value={formatBrazilianNumber(reprojecaoHora, 0, 0)} suffix="ton/h" accent="purple" />
                </div>
              </div>
            )}
          >
            {(summary?.hourlyData || hourlyData)?.length ? <HourChart data={summary?.hourlyData || hourlyData} /> : <TvEmptyState title="Sem dados de moagem horária" />}
          </TvContentFrame>
        ),
      },
      {
        title: "Volume Mensal",
        content: (
          <TvContentFrame
            title="Volume Mensal"
            subtitle="Meta × Realizado por mês"
            metrics={(
              <div className="grid gap-3 md:grid-cols-4">
                <StatMiniCard label="Meta Acumulada" value={formatBrazilianNumber(metaAcumulada, 0, 0)} suffix="ton" accent="blue" />
                <StatMiniCard label="Moagem Prevista" value={numberBR(moagemPrevista)} suffix="ton" accent="blue" />
                <StatMiniCard label="Realizado" value={formatBrazilianNumber(realizadoMesAtual, 0, 0)} suffix="ton" accent="green" />
                <StatMiniCard label="Meta Reprojetada" value={formatBrazilianNumber(metaReprojetadaDia, 0, 0)} suffix="ton/dia" accent="purple" />
              </div>
            )}
          >
            <MonthlyVolumeChart data={normalizedMonthlyData} tvMode />
          </TvContentFrame>
        ),
      },
      {
        title: "Entrega Semanal por Frente",
        content: (
          <TvContentFrame
            title="Entrega Semanal por Frente"
            subtitle={summary?.weekRange?.label || currentWeekLabel}
            metrics={(
              <div className="grid gap-3 md:grid-cols-4">
                <StatMiniCard label="Meta Semana" value={numberBR(metaSemana)} suffix="ton" accent="blue" />
                <StatMiniCard label="Realizado" value={formatBrazilianNumber(realizadoSemana, 0, 0)} suffix="ton" accent="green" />
                <StatMiniCard label="Saldo" value={numberBR(saldoSemana)} suffix="ton" accent="amber" />
                <StatMiniCard label="Meta Reprojetada" value={formatBrazilianNumber(metaReprojetadaSemana, 0, 0)} suffix="ton/dia" accent="purple" />
              </div>
            )}
          >
            {(summary?.weeklyFrontData || weeklyFrontData)?.length ? <WeeklyFrontChart data={summary?.weeklyFrontData || weeklyFrontData} fronts={dynamicFronts} tvMode /> : <TvEmptyState title="Sem dados de entrega semanal" />}
          </TvContentFrame>
        ),
      },
      {
        title: "Volume por Frente",
        content: (
          <TvContentFrame
            title="Volume por Frente"
            subtitle={`Volume mensal entregue por frente de colheita${summary?.currentMonthLabel ? ` — ${summary.currentMonthLabel}` : ""}`}
            metrics={<FrontTotalsRow fronts={dynamicFrontTotals} />}
          >
            {(summary?.frontVolumeData || summary?.frontMonthlyData || dynamicFrontTotals)?.length ? <FrontVolumeChart data={summary?.frontVolumeData || summary?.frontMonthlyData || dynamicFrontTotals.map((front) => ({ frente: front.label, total: front.total || 0, fill: front.fill }))} tvMode /> : <TvEmptyState title="Sem dados de volume por frente" />}
          </TvContentFrame>
        ),
      },
      {
        title: "Densidade por Frente",
        content: (
          <TvContentFrame
            title="Densidade por Frente"
            subtitle="Média das últimas 4 entregas por frente"
          >
            {densidadeFrenteData.length ? <DensidadeFrenteChart data={densidadeFrenteData} tvMode meta={premissas.metaDensidade || 0} /> : <TvEmptyState title="Sem dados de densidade por frente" />}
          </TvContentFrame>
        ),
      },
      {
        title: "Impureza Mineral por Frente e Turno",
        render: () => (
          <TvContentFrame
            title="Impureza Mineral por Frente e Turno"
            subtitle={impurezaTurnoDataLabel}
          >
            {impurezaMineralTurnoData.length ? <ImpurezaTurnoChart data={impurezaMineralTurnoData} tvMode meta={premissas.impurezaMineral || 0} /> : <TvEmptyState title="Sem dados de impureza mineral por turno" />}
          </TvContentFrame>
        )
      },
      {
        title: "Impureza Vegetal por Frente e Turno",
        render: () => (
          <TvContentFrame
            title="Impureza Vegetal por Frente e Turno"
            subtitle={impurezaTurnoDataLabel}
          >
            {impurezaVegetalTurnoData.length ? <ImpurezaTurnoChart data={impurezaVegetalTurnoData} tvMode meta={premissas.impurezaVegetal || 0} /> : <TvEmptyState title="Sem dados de impureza vegetal por turno" />}
          </TvContentFrame>
        )
      },
      {
        title: "Broca Mensal",
        content: (
          <TvContentFrame
            title="Broca Mensal"
            subtitle="Meta vs Realizado de Broca mês a mês"
            metrics={(
              <div className="grid gap-3 md:grid-cols-2">
                <StatMiniCard label={`Broca Meta (${currentMonthLabel})`} value={decimalBR(brocaMetaMesAtual, 2)} accent="amber" />
                <StatMiniCard label="Broca Realizada" value={decimalBR(brocaReal, 2)} accent="green" />
              </div>
            )}
          >
            <BrocaChart data={normalizedMonthlyData} tvMode />
          </TvContentFrame>
        ),
      },
      {
        title: "ATR Mensal",
        content: (
          <TvContentFrame
            title="ATR Mensal"
            subtitle="Meta vs Realizado de ATR mês a mês"
            metrics={(
              <div className="grid gap-3 md:grid-cols-2">
                <StatMiniCard label={`ATR Meta (${currentMonthLabel})`} value={decimalBR(atrMetaMesAtual, 2)} accent="blue" />
                <StatMiniCard label="ATR Realizado" value={decimalBR(atrReal, 2)} accent="green" />
              </div>
            )}
          >
            <AtrChart data={normalizedMonthlyData} tvMode />
          </TvContentFrame>
        ),
      },
      {
        title: "ATR Fazenda Dia",
        content: (
          <TvContentFrame
            title="ATR Fazenda Dia"
            subtitle="ATR direto do relatório de laboratório, sem cálculo por cana entregue"
          >
            {atrFazendaData.length ? <AtrFazendaChart data={atrFazendaData} tvMode /> : <TvEmptyState title="Sem dados de ATR Fazenda Dia" />}
          </TvContentFrame>
        ),
      },
      {
        title: "Impureza Vegetal",
        content: (
          <TvContentFrame
            title="Impureza Vegetal (%)"
            subtitle="Média ponderada por volume, mês a mês"
            metrics={(
              <div className="grid gap-3 md:grid-cols-2">
                <StatMiniCard label="Meta" value={decimalBR(premissas.impurezaVegetal || 0, 2)} suffix="%" accent="blue" />
                <StatMiniCard label="Safra" value={decimalBR(currentMonthData?.vegetal ?? 0, 2)} suffix="%" accent="green" />
              </div>
            )}
          >
            <HorizontalSingleMetricChart data={normalizedMonthlyData} dataKey="vegetal" color="#22c77c" name="Impureza Vegetal" tvMode />
          </TvContentFrame>
        ),
      },
      {
        title: "Impureza Mineral",
        content: (
          <TvContentFrame
            title="Impureza Mineral (%)"
            subtitle="Média ponderada por volume, mês a mês"
            metrics={(
              <div className="grid gap-3 md:grid-cols-2">
                <StatMiniCard label="Meta" value={decimalBR(premissas.impurezaMineral || 0, 2)} suffix="%" accent="blue" />
                <StatMiniCard label="Safra" value={decimalBR(currentMonthData?.mineral ?? 0, 2)} suffix="%" accent="amber" />
              </div>
            )}
          >
            <HorizontalSingleMetricChart data={normalizedMonthlyData} dataKey="mineral" color="#f07d2f" name="Impureza Mineral" tvMode />
          </TvContentFrame>
        ),
      },
    ],
    [
      atrFazendaData,
      atrReal,
      atrMetaMesAtual,
      brocaMetaMesAtual,
      brocaReal,
      currentMonthData,
      currentMonthLabel,
      dynamicFrontTotals,
      dynamicFronts,
      densidadeFrenteData,
      densidadeMediaUltimasCargas,
      estoqueMoagem,
      metaAcumulada,
      metaDia,
      metaHora,
      metaReprojetadaDia,
      metaReprojetadaSemana,
      metaSemana,
      moagemDiaAnterior,
      moagemPrevista,
      moagemPrevistaDia24h,
      moagemRealizada,
      premissas.impurezaMineral,
      premissas.impurezaVegetal,
      paradaAgricolaAcumuladaPercentual,
      paradaAgricolaPercentual,
      paradaIndustriaAcumuladaPercentual,
      paradaIndustriaPercentual,
      realizadoDia,
      realizadoUltimaHora,
      realizadoSemana,
      reprojecaoHora,
      rotacaoMoenda,
      saldoDia,
      saldoSemana,
      summary,
    ],
  );


  useEffect(() => {
    if (!companyId || premissasFiltroAplicadoRef.current) return;
    premissasFiltroAplicadoRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        const config = await getColheitaPremissas(companyId);
        if (cancelled || !config) return;
        if (!dataInicio && config.dataInicioSafra) setDataInicio(config.dataInicioSafra);
        if (!dataFim && config.dataFimSafra) setDataFim(config.dataFimSafra);
        if ((safra === 'todas' || !safra) && config.anoSafra) setSafra(String(config.anoSafra));
      } catch (_) {
        // mantém filtros manuais caso as premissas não carreguem
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    fetchDadosDashboardFilterOptions(companyId).then(setOptions).catch(() => {});
  }, [companyId]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (!companyId) return undefined;
    const pollId = window.setInterval(() => {
      loadSummary();
    }, 15000);
    return () => window.clearInterval(pollId);
  }, [companyId, loadSummary]);

  useEffect(() => {
    if (!tvMode || !isPlaying) return undefined;

    intervalRef.current = window.setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, TV_SLIDE_DURATION_MS);

    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [tvMode, isPlaying, slides.length, TV_SLIDE_DURATION_MS]);

  useEffect(() => {
    if (!tvMode) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setCurrentSlide((prev) => (prev + 1) % slides.length);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
      } else if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        setIsPlaying((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tvMode, slides.length]);

  useEffect(() => {
    document.body.classList.toggle("overflow-hidden", tvMode);
    return () => document.body.classList.remove("overflow-hidden");
  }, [tvMode]);

  if (!canDashboardEntradaCana && !canDashboardTalhoesFechados) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[#040814] p-6 text-white">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center">
          <h2 className="text-lg font-semibold">Acesso negado ao Dashboard de Colheita</h2>
          <p className="mt-2 text-sm text-white/60">Peça para liberar Entrada de Cana ou Talhões Fechados no Gerenciamento de Usuários.</p>
          <Button onClick={onBack} className="mt-4 rounded-full bg-[#d8ba61] text-black hover:bg-[#e5c76a]">Voltar</Button>
        </div>
      </div>
    );
  }

  if (tvMode) {
    return (
      <TvSlide
        slides={slides}
        currentSlide={currentSlide}
        isPlaying={isPlaying}
        onClose={() => setTvMode(false)}
        onTogglePlay={() => setIsPlaying((prev) => !prev)}
        slideDurationSeconds={Math.round(TV_SLIDE_DURATION_MS / 1000)}
      />
    );
  }

  return (
    <div className="relative min-h-full overflow-hidden bg-[#020814] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(21,58,116,0.18),transparent_30%),radial-gradient(circle_at_top_right,rgba(184,138,43,0.12),transparent_22%),linear-gradient(180deg,rgba(3,8,18,0.9),rgba(3,8,18,1))]" />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(212,170,74,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(212,170,74,0.08)_1px,transparent_1px)] [background-size:120px_120px]" />

      {showPdfOptions && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-2xl rounded-3xl border border-[#263a5e] bg-[#07101d] p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">Escolher gráficos do PDF</h2>
                <p className="mt-1 text-sm text-[#9aa8c0]">Marque quais páginas quer gerar. A capa sempre entra primeiro. Cada item marcado depois dela sai sozinho em uma página A4, sem agrupar com outro gráfico.</p>
              </div>
              <button type="button" className="rounded-full border border-white/10 px-3 py-1 text-sm text-[#cbd5e1] hover:bg-white/10" onClick={() => setShowPdfOptions(false)}>Fechar</button>
            </div>

            <div className="grid max-h-[55vh] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {EXPORTABLE_PDF_SECTIONS.map((item) => {
                const checked = selectedPdfSections.includes(item.id);
                return (
                  <label key={item.id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-3 text-sm transition ${checked ? 'border-[#3b82f6]/70 bg-[#0f2340]' : 'border-[#24324a] bg-[#09111d] hover:bg-[#0d1828]'}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={item.required || isExportingPdf}
                      onChange={(event) => {
                        const isChecked = event.target.checked;
                        setSelectedPdfSections((prev) => {
                          const base = new Set(prev);
                          if (isChecked) base.add(item.id);
                          else base.delete(item.id);
                          base.add('capa');
                          return EXPORTABLE_PDF_SECTIONS.filter((option) => base.has(option.id)).map((option) => option.id);
                        });
                      }}
                      className="h-4 w-4 accent-[#3b82f6]"
                    />
                    <span className="font-semibold text-[#e5eefc]">{item.label}</span>
                  </label>
                );
              })}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#1f2d46] pt-4">
              <div className="flex gap-2">
                <Button type="button" variant="ghost" className="rounded-full border border-[#263a5e] text-[#dbeafe] hover:bg-white/10" onClick={() => setSelectedPdfSections(EXPORTABLE_PDF_SECTIONS.map((item) => item.id))}>Marcar todos</Button>
                <Button type="button" variant="ghost" className="rounded-full border border-[#263a5e] text-[#dbeafe] hover:bg-white/10" onClick={() => setSelectedPdfSections(['capa'])}>Só capa</Button>
              </div>
              <Button
                type="button"
                disabled={isExportingPdf || selectedPdfSections.length === 0}
                className="rounded-full bg-[#d8ba61] px-5 text-black hover:bg-[#e5c76a] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => handleExportPdf(selectedPdfSections)}
              >
                <FileDown className="mr-2 h-4 w-4" />
                {isExportingPdf ? 'Gerando...' : 'Gerar PDF selecionado'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="relative px-2 py-2 sm:px-3 xl:px-3 2xl:px-4">
        <div className="w-full">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[#8994ad]">
            <span>AgroSystem</span>
            <span>›</span>
            <span>Agrícola</span>
            <span>›</span>
            <span>Dashboard</span>
            <span>›</span>
            <span className="font-semibold text-[#d4aa4a]">{activeDashboard === "entrada" ? "CTT - Entrada de Cana" : "Talhões Fechados"}</span>
          </div>

          <div className="mb-2 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button onClick={onBack} variant="ghost" className="rounded-full border border-[#273248] bg-[#0b1321] text-[#e6edf8] hover:bg-[#10192b]">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
              <div>
                <div className="flex items-center gap-3">
                  <ChevronLeft className="h-5 w-5 text-[#d4aa4a]" />
                  <h1 className="text-[24px] font-semibold tracking-tight text-white">{activeDashboard === "entrada" ? "CTT - Entrada de Cana" : "Dashboard de Talhões Fechados"}</h1>
                </div>
              </div>
            </div>
            {activeDashboard === "entrada" && (
              <Button
                type="button"
                onClick={() => setShowPdfOptions(true)}
                disabled={isExportingPdf}
                className="rounded-full border border-[#2b4770] bg-[#10213a] text-[#dbeafe] hover:bg-[#173154] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FileDown className="mr-2 h-4 w-4" />
                {isExportingPdf ? "Gerando PDF..." : "Baixar PDF"}
              </Button>
            )}
          </div>

          <div className="mb-2 flex flex-wrap gap-2 rounded-2xl border border-[#223149]/70 bg-[#07101d]/80 p-2">
            {canDashboardEntradaCana && <button type="button" onClick={() => setActiveDashboard("entrada")} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${activeDashboard === "entrada" ? "bg-[#d8ba61] text-black" : "text-[#aab5cd] hover:bg-white/5 hover:text-white"}`}>Entrada de Cana</button>}
            {canDashboardTalhoesFechados && <button type="button" onClick={() => setActiveDashboard("fechamento")} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${activeDashboard === "fechamento" ? "bg-[#d8ba61] text-black" : "text-[#aab5cd] hover:bg-white/5 hover:text-white"}`}>Talhões Fechados</button>}
          </div>

          {activeDashboard === "fechamento" ? (
            <DashboardFechamentoOC safra={safra} setSafra={setSafra} fazenda={fazenda} setFazenda={setFazenda} dataInicio={dataInicio} setDataInicio={setDataInicio} dataFim={dataFim} setDataFim={setDataFim} options={{ ...options, companyId }} />
          ) : (
            <>

          <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[140px_minmax(180px,1fr)_minmax(180px,1fr)_minmax(180px,1fr)_minmax(180px,1fr)_minmax(180px,1fr)]">
            <div className="flex h-12 items-center gap-2 rounded-xl border border-[#2a3448] bg-[#0c1523]/95 px-3 text-sm font-semibold uppercase tracking-[0.14em] text-[#aab5cd]">
              <Filter className="h-4 w-4" /> Filtros
            </div>
            <FilterSelect
              value={safra}
              onChange={(e) => setSafra(e.target.value)}
              options={[{ value: "todas", label: "Todas Safras" }, ...(options.safras || []).map((item) => ({ value: item, label: item }))]}
            />
            <FilterDateInput
              icon={Calendar}
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              placeholder="Data Início"
            />
            <FilterDateInput
              icon={Calendar}
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              placeholder="Data Fim"
            />
            <FilterSelect
              value={frente}
              onChange={(e) => setFrente(e.target.value)}
              options={[{ value: "todas", label: "Todas Frentes" }, ...(options.frentes || []).map((item) => ({ value: item, label: `Frente ${item}` }))]}
            />
            <FilterSelect
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              options={[{ value: "todas", label: "Todas Descrições" }, ...(options.descricoes || []).map((item) => ({ value: item, label: item }))]}
            />
          </div>

          <div data-pdf-section="capa" data-pdf-kind="cover" className="rounded-[26px] bg-[#020814] pb-4">
          <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <HeroMetricCard title="Moagem Prevista" value={numberBR(moagemPrevista)} suffix="ton" icon={BarChart3} accent="blue" />
            <HeroMetricCard title="Moagem Realizada" value={numberBR(moagemRealizada)} suffix="ton" icon={TrendingUp} accent="green" />
            <HeroMetricCard title="Saldo de Moagem" value={numberBR(saldoMoagem)} suffix="ton" icon={Target} accent="amber" />
            <HeroMetricCard title="ATR Acumulado" value={decimalBR(atrReal, 2)} suffix="kg/t" icon={Activity} accent="purple" />
            <SplitHeroMetricCard title="Parada Acumulada" leftLabel="Industrial" leftValue={decimalBR(paradaIndustriaAcumuladaPercentual, 2)} rightLabel="Agrícola" rightValue={decimalBR(paradaAgricolaAcumuladaPercentual, 2)} suffix="%" icon={Activity} accent="red" />
          </div>

          <div className="grid gap-4">
            <ChartPanel>
              <PanelHeader
                icon={Activity}
                title="Moagem Horária Efetiva"
                subtitle={`Acompanhamento hora a hora — ${currentDateLabel}`}
                badge={dayProgressLabel}
                actions={
                  <>
                    <HeaderTinyMetric label="% Parada Indústria" value={decimalBR(paradaIndustriaPercentual, 2)} suffix="%" accent="red" />
                    <HeaderTinyMetric label="% Parada Agrícola" value={decimalBR(paradaAgricolaPercentual, 2)} suffix="%" accent="red" />
                    <HeaderTinyMetric label="Moagem Dia Anterior" value={formatBrazilianNumber(moagemDiaAnterior, 0, 0)} suffix="ton" accent="amber" />
                    <HeaderTinyMetric label="ATR Dia Anterior" value={atrDiaAnterior > 0 ? decimalBR(atrDiaAnterior, 2) : '--'} suffix="kg/t" accent="purple" />
                    <HeaderTinyMetric label="Rotação" value={rotacaoMoenda > 0 ? formatBrazilianNumber(rotacaoMoenda, 0, 0) : '--'} suffix="rpm" accent="green" />
                    <HeaderTinyMetric label="Densidade Média" value={formatBrazilianNumber(densidadeMediaUltimasCargas, 0, 0)} suffix="t/carga" accent="green" />
                    <HeaderTinyMetric label="Estoque" value={estoqueMoagem > 0 ? formatBrazilianNumber(estoqueMoagem, 0, 0) : '--'} suffix="carretas" accent="amber" />
                  </>
                }
              />
              <div className="grid gap-3 px-5 md:grid-cols-3 xl:grid-cols-7">
                <StatMiniCard label="Meta Dia" value={numberBR(metaDia)} suffix="ton" accent="blue" />
                <StatMiniCard label="Meta/Hora" value={numberBR(metaHora)} suffix="ton" accent="blue" />
                <StatMiniCard label="Realizado" value={formatBrazilianNumber(realizadoDia, 0, 0)} suffix="ton" accent="green" />
                <StatMiniCard label="Realizado Última Hora" value={formatBrazilianNumber(realizadoUltimaHora, 0, 0)} suffix="ton" accent="green" />
                <StatMiniCard label="Saldo" value={numberBR(saldoDia)} suffix="ton" accent="amber" />
                <StatMiniCard label="Moagem Prevista" value={formatBrazilianNumber(moagemPrevistaDia24h, 0, 0)} suffix="ton" accent="blue" />
                <StatMiniCard label="Meta Reprojetada" value={formatBrazilianNumber(reprojecaoHora, 0, 0)} suffix="ton/h" accent="purple" />
              </div>
              <div className="mt-3 h-[360px] px-3 pb-4 2xl:h-[400px]">
                <HourChart data={summary?.hourlyData || hourlyData} />
              </div>
            </ChartPanel>
          </div>
          </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <ChartPanel pdfSection="moagem-dia-dia">
                <PanelHeader icon={Calendar} title="Moagem Dia a Dia" subtitle="Volume diário do mês, dividido em 1ª e 2ª quinzena" />
                <div className="h-[86px]" />
                <div className="mt-3 h-[360px] px-3 pb-4 2xl:h-[400px]">
                  {moagemDiaDiaData.length ? <MoagemDiaDiaChart data={moagemDiaDiaData} metaDia={metaDia} /> : <TvEmptyState title="Sem dados de moagem dia a dia" />}
                </div>
              </ChartPanel>

              <ChartPanel pdfSection="volume-mensal">
                <PanelHeader icon={Calendar} title="Volume Mensal" subtitle="Meta × Realizado por mês" />
                <div className="grid gap-3 px-5 md:grid-cols-2 xl:grid-cols-4">
                  <StatMiniCard label="Meta Acumulada" value={formatBrazilianNumber(metaAcumulada, 0, 0)} suffix="ton" accent="blue" />
                  <StatMiniCard label="Realizado" value={formatBrazilianNumber(realizadoMesAtual, 0, 0)} suffix="ton" accent="green" />
                  <StatMiniCard label="Saldo" value={numberBR(saldoMensal)} suffix="ton" accent="amber" />
                  <StatMiniCard label="Meta Reprojetada" value={formatBrazilianNumber(metaReprojetadaDia, 0, 0)} suffix="ton/dia" accent="purple" />
                </div>
                <div className="mt-3 h-[360px] px-3 pb-4 2xl:h-[400px]">
                  <MonthlyVolumeChart data={normalizedMonthlyData} />
                </div>
              </ChartPanel>
            </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <ChartPanel pdfSection="entrega-semanal">
              <PanelHeader icon={Truck} title="Entrega Semanal por Frente" subtitle={summary?.weekRange?.label || currentWeekLabel} />
              <div className="grid gap-3 px-5 md:grid-cols-4">
                <StatMiniCard label="Meta Semana" value={numberBR(metaSemana)} suffix="ton" accent="blue" />
                <StatMiniCard label="Realizado" value={formatBrazilianNumber(realizadoSemana, 0, 0)} suffix="ton" accent="green" />
                <StatMiniCard label="Saldo" value={numberBR(saldoSemana)} suffix="ton" accent="amber" />
                <StatMiniCard label="Meta Reprojetada" value={formatBrazilianNumber(metaReprojetadaSemana, 0, 0)} suffix="ton/dia" accent="purple" />
              </div>
              <div className="mt-3 h-[320px] px-3 pb-4 2xl:h-[360px]">
                <WeeklyFrontChart data={summary?.weeklyFrontData || weeklyFrontData} fronts={dynamicFronts} />
              </div>
            </ChartPanel>

            <ChartPanel pdfSection="volume-frente">
              <PanelHeader icon={Truck} title="Volume por Frente" subtitle={`Volume mensal entregue por frente de colheita${summary?.currentMonthLabel ? ` — ${summary.currentMonthLabel}` : ""}`} />
              <div className="px-5">
                <FrontTotalsRow fronts={dynamicFrontTotals} />
              </div>
              <div className="mt-3 h-[320px] px-3 pb-4 2xl:h-[360px]">
                <FrontVolumeChart data={summary?.frontVolumeData || summary?.frontMonthlyData || dynamicFrontTotals.map((front) => ({ frente: front.label, total: front.total || 0, fill: front.fill }))} />
              </div>
            </ChartPanel>
          </div>


          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <ChartPanel pdfSection="atr-mensal">
              <PanelHeader icon={Wheat} title="ATR Mensal" subtitle="Meta vs Realizado de ATR mês a mês" />
              <div className="grid gap-3 px-5 md:grid-cols-2">
                <StatMiniCard label={`ATR Meta (${currentMonthLabel})`} value={decimalBR(atrMetaMesAtual, 2)} accent="blue" />
                <StatMiniCard label="ATR Realizado" value={decimalBR(atrReal, 2)} accent="green" />
              </div>
              <div className="mt-2 h-[320px] px-3 pb-4">
                <AtrChart data={normalizedMonthlyData} />
              </div>
            </ChartPanel>

            <ChartPanel pdfSection="atr-fazenda-dia">
              <PanelHeader icon={Activity} title="ATR Fazenda Dia" subtitle="ATR direto do relatório de laboratório, sem cálculo por cana entregue" />
              <div className="mt-2 h-[390px] px-3 pb-4 2xl:h-[430px]">
                <AtrFazendaChart data={atrFazendaData} />
              </div>
            </ChartPanel>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <ChartPanel pdfSection="densidade-frente">
              <PanelHeader icon={Activity} title="Densidade por Frente" subtitle="Média das últimas 4 entregas por frente" />
              <div className="h-[85px] px-5 md:h-[85px]" />
              <div className="mt-3 h-[320px] px-3 pb-4 2xl:h-[360px]">
                {densidadeFrenteData.length ? <DensidadeFrenteChart data={densidadeFrenteData} meta={premissas.metaDensidade || 0} /> : <TvEmptyState title="Sem dados de densidade por frente" />}
              </div>
            </ChartPanel>

            <ChartPanel pdfSection="broca-mensal">
              <PanelHeader icon={Wheat} title="Broca Mensal" subtitle="Meta vs Realizado de Broca mês a mês" />
              <div className="grid gap-3 px-5 md:grid-cols-2">
                <StatMiniCard label={`Broca Meta (${currentMonthLabel})`} value={decimalBR(brocaMetaMesAtual, 2)} accent="amber" />
                <StatMiniCard label="Broca Realizada" value={decimalBR(brocaReal, 2)} accent="green" />
              </div>
              <div className="mt-3 h-[320px] px-3 pb-4 2xl:h-[360px]">
                <BrocaChart data={normalizedMonthlyData} />
              </div>
            </ChartPanel>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <ChartPanel pdfSection="impureza-mineral-turno">
              <PanelHeader icon={Wheat} title="Impureza Mineral por Frente e Turno" subtitle={impurezaTurnoDataLabel} />
              <div className="mt-2 h-[360px] px-3 pb-4 2xl:h-[400px]">
                {impurezaMineralTurnoData.length ? <ImpurezaTurnoChart data={impurezaMineralTurnoData} meta={premissas.impurezaMineral || 0} /> : <TvEmptyState title="Sem dados de impureza mineral por turno" />}
              </div>
            </ChartPanel>

            <ChartPanel pdfSection="impureza-vegetal-turno">
              <PanelHeader icon={Wheat} title="Impureza Vegetal por Frente e Turno" subtitle={impurezaTurnoDataLabel} />
              <div className="mt-2 h-[360px] px-3 pb-4 2xl:h-[400px]">
                {impurezaVegetalTurnoData.length ? <ImpurezaTurnoChart data={impurezaVegetalTurnoData} meta={premissas.impurezaVegetal || 0} /> : <TvEmptyState title="Sem dados de impureza vegetal por turno" />}
              </div>
            </ChartPanel>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <ChartPanel pdfSection="impureza-vegetal-mensal">
              <PanelHeader icon={Wheat} title="Impureza Vegetal (%)" subtitle="Média ponderada por volume, mês a mês" />
              <div className="grid gap-3 px-5 md:grid-cols-2">
                <StatMiniCard label="Meta" value={decimalBR(premissas.impurezaVegetal || 0, 2)} suffix="%" accent="blue" />
                <StatMiniCard label="Safra" value={decimalBR(currentMonthData?.vegetal ?? 0, 2)} suffix="%" accent="green" />
              </div>
              <div className="mt-2 h-[320px] px-3 pb-4 2xl:h-[360px]">
                <HorizontalSingleMetricChart data={normalizedMonthlyData} dataKey="vegetal" color="#22c77c" name="Impureza Vegetal" />
              </div>
            </ChartPanel>

            <ChartPanel pdfSection="impureza-mineral-mensal">
              <PanelHeader icon={Wheat} title="Impureza Mineral (%)" subtitle="Média ponderada por volume, mês a mês" />
              <div className="grid gap-3 px-5 md:grid-cols-2">
                <StatMiniCard label="Meta" value={decimalBR(premissas.impurezaMineral || 0, 2)} suffix="%" accent="blue" />
                <StatMiniCard label="Safra" value={decimalBR(currentMonthData?.mineral ?? 0, 2)} suffix="%" accent="amber" />
              </div>
              <div className="mt-2 h-[320px] px-3 pb-4 2xl:h-[360px]">
                <HorizontalSingleMetricChart data={normalizedMonthlyData} dataKey="mineral" color="#f07d2f" name="Impureza Mineral" />
              </div>
            </ChartPanel>
          </div>

            </>
          )}

          <div className="mt-5 flex justify-end">
            <Button className="rounded-full bg-[#d8ba61] text-black hover:bg-[#e5c76a]" onClick={() => setTvMode(true)}>
              <Maximize className="mr-2 h-4 w-4" />
              Abrir modo TV
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
