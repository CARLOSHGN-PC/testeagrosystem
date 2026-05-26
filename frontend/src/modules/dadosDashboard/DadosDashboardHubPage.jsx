
import React, { useMemo, useState } from "react";
import { BarChart3, ChevronRight, Leaf, Plane, Sprout, Tractor, TrendingUp, Database } from "lucide-react";
import ColheitaDadosPage from "./ColheitaDadosPage";

const MODULES = [
  {
    key: "colheita",
    title: "Colheita",
    subtitle: "Importação da base que alimenta os gráficos do dashboard operacional.",
    icon: Tractor,
    accent: "from-[#7a4f17]/55 via-[#25190c]/70 to-[#0b111a]",
    iconColor: "text-[#f4b14f]",
    iconBg: "bg-[#5e3d14]/45 border-[#8f6428]/35",
    enabled: true,
    badge: "Disponível",
  },
  {
    key: "tratos-soca",
    title: "Tratos Soca",
    subtitle: "Operações de tratos culturais em áreas de soqueira.",
    icon: Sprout,
    accent: "from-[#0f5a4f]/45 via-[#062122]/75 to-[#081019]",
    iconColor: "text-[#45d7a6]",
    iconBg: "bg-[#123c34]/45 border-[#1f6353]/35",
    enabled: false,
    badge: "Em breve",
  },
  {
    key: "preparo",
    title: "Preparo",
    subtitle: "Preparação do solo para novas áreas de plantio.",
    icon: Plane,
    accent: "from-[#6a341e]/45 via-[#22110d]/75 to-[#081019]",
    iconColor: "text-[#ff9755]",
    iconBg: "bg-[#4d2617]/45 border-[#7c4128]/35",
    enabled: false,
    badge: "Em breve",
  },
  {
    key: "plantio",
    title: "Plantio",
    subtitle: "Acompanhamento das operações de plantio e mudas.",
    icon: Leaf,
    accent: "from-[#0d5f39]/45 via-[#0b2318]/75 to-[#081019]",
    iconColor: "text-[#4cdf81]",
    iconBg: "bg-[#143923]/45 border-[#1f6137]/35",
    enabled: false,
    badge: "Em breve",
  },
  {
    key: "tratos-planta",
    title: "Tratos Planta",
    subtitle: "Tratos culturais em áreas de cana planta.",
    icon: Sprout,
    accent: "from-[#3f6516]/38 via-[#15230b]/75 to-[#081019]",
    iconColor: "text-[#97dd47]",
    iconBg: "bg-[#2e4813]/45 border-[#4f7124]/35",
    enabled: false,
    badge: "Em breve",
  },
  {
    key: "desenvolvimento",
    title: "Desenvolvimento",
    subtitle: "Indicadores de desenvolvimento vegetativo e biométrico.",
    icon: TrendingUp,
    accent: "from-[#104a74]/42 via-[#0a1725]/80 to-[#081019]",
    iconColor: "text-[#55bbff]",
    iconBg: "bg-[#15334c]/45 border-[#1e567e]/35",
    enabled: false,
    badge: "Em breve",
  },
];

function Card({ item, onOpen }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      disabled={!item.enabled}
      onClick={() => item.enabled && onOpen(item.key)}
      className={`group relative min-h-[148px] overflow-hidden rounded-[22px] border border-white/8 bg-gradient-to-br ${item.accent} p-6 text-left shadow-[0_16px_60px_rgba(0,0,0,0.35)] transition duration-300 hover:-translate-y-0.5 hover:border-white/15 disabled:cursor-not-allowed`}
    >
      <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/[0.04] blur-sm" />
      <div className="absolute right-10 top-6 h-12 w-12 rounded-full bg-white/[0.03]" />
      <div className="relative flex h-full flex-col justify-between gap-5">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${item.iconBg}`}>
          <Icon className={`h-6 w-6 ${item.iconColor}`} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[18px] font-semibold text-white">{item.title}</h3>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-slate-300">{item.badge}</span>
          </div>
          <p className="max-w-[30rem] text-sm leading-6 text-slate-300/90">{item.subtitle}</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
          <span>{item.enabled ? "Abrir módulo" : "Módulo em preparação"}</span>
          <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </div>
      </div>
    </button>
  );
}

export default function DadosDashboardHubPage({ companyId, session }) {
  const [selected, setSelected] = useState(null);

  const content = useMemo(() => {
    if (selected === "colheita") return <ColheitaDadosPage companyId={companyId} session={session} onBack={() => setSelected(null)} />;
    return null;
  }, [selected, companyId, session]);

  if (content) return content;

  return (
    <div className="min-h-full bg-[#040814] px-4 py-5 text-white sm:px-6 xl:px-8 2xl:px-10">
      <div className="mb-6 flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#293040] bg-[#0f1624] text-[#d8b15b] shadow-lg shadow-black/20">
          <Database className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-white">Dados Dashboard</h1>
          <p className="mt-1 text-sm text-[#96a0b8]">Módulo operacional para importar bases e alimentar os dashboards reais do sistema.</p>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {MODULES.map((item) => <Card key={item.key} item={item} onOpen={setSelected} />)}
      </div>
    </div>
  );
}
