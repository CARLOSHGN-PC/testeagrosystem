import React, { useMemo, useState } from 'react';
import { Bug, ChevronRight, ClipboardPenLine, Leaf, Scale, ShieldCheck } from 'lucide-react';
import { hasModuleAccess } from '../../utils/accessControl';
import InfestacaoBrocaPage from './InfestacaoBrocaPage';
import LancamentoPerdaPage from './LancamentoPerdaPage';
import GerenciarApontamentosPage from './GerenciarApontamentosPage';
import ComplexoMurchaPage from './ComplexoMurchaPage';

const MODULES = [
  {
    key: 'infestacao-broca',
    moduleKey: 'apontamentos_broca',
    title: 'Apontamento Broca',
    subtitle: 'Apontamento de inspeção de broca com cálculo automático e sincronização offline/online.',
    icon: Bug,
    accent: 'from-[#6a341e]/45 via-[#22110d]/75 to-[#081019]',
    iconColor: 'text-[#ffb35b]',
    iconBg: 'bg-[#4d2617]/45 border-[#7c4128]/35',
    enabled: true,
    badge: 'Disponível',
  },
  {
    key: 'lancamento-perda',
    moduleKey: 'apontamentos_perda',
    title: 'Apontamento Perda',
    subtitle: 'Registro de perda de cana em kg com total automático e sincronização offline/online.',
    icon: Scale,
    accent: 'from-[#0f5132]/45 via-[#0b2b22]/75 to-[#081019]',
    iconColor: 'text-[#86efac]',
    iconBg: 'bg-[#0f5132]/45 border-[#2f855a]/35',
    enabled: true,
    badge: 'Disponível',
  },
  {
    key: 'complexo-murcha',
    moduleKey: 'apontamentos_complexo_murcha',
    title: 'Complexo de Murcha',
    subtitle: 'Avaliação de murcha com cálculo automático e sincronização offline/online.',
    icon: Leaf,
    accent: 'from-[#14532d]/45 via-[#102a1d]/75 to-[#081019]',
    iconColor: 'text-[#86efac]',
    iconBg: 'bg-[#14532d]/45 border-[#22c55e]/30',
    enabled: true,
    badge: 'Disponível',
  },
  {
    key: 'gerenciar-apontamentos',
    moduleKey: 'gerenciar_apontamentos',
    title: 'Gerenciar Apontamentos',
    subtitle: 'Consultar, editar e cancelar apontamentos de Broca, Perda e Complexo de Murcha sem mexer direto no banco.',
    icon: ShieldCheck,
    accent: 'from-[#164e63]/45 via-[#102a43]/75 to-[#081019]',
    iconColor: 'text-[#67e8f9]',
    iconBg: 'bg-[#164e63]/45 border-[#22d3ee]/25',
    enabled: true,
    badge: 'Admin',
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
          <span>Abrir módulo</span>
          <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </div>
      </div>
    </button>
  );
}

export default function LancamentosHubPage({ companyId, session }) {
  const [selected, setSelected] = useState(null);
  const availableModules = useMemo(() => MODULES.filter((item) => hasModuleAccess(session, item.moduleKey)), [session]);

  const content = useMemo(() => {
    if (selected === 'infestacao-broca' && hasModuleAccess(session, 'apontamentos_broca')) {
      return <InfestacaoBrocaPage companyId={companyId} session={session} onBack={() => setSelected(null)} />;
    }
    if (selected === 'lancamento-perda' && hasModuleAccess(session, 'apontamentos_perda')) {
      return <LancamentoPerdaPage companyId={companyId} session={session} onBack={() => setSelected(null)} />;
    }
    if (selected === 'complexo-murcha' && hasModuleAccess(session, 'apontamentos_complexo_murcha')) {
      return <ComplexoMurchaPage companyId={companyId} session={session} onBack={() => setSelected(null)} />;
    }
    if (selected === 'gerenciar-apontamentos' && hasModuleAccess(session, 'gerenciar_apontamentos')) {
      return <GerenciarApontamentosPage companyId={companyId} session={session} onBack={() => setSelected(null)} />;
    }
    return null;
  }, [selected, companyId, session]);

  if (content) return content;

  return (
    <div className="min-h-full bg-[#040814] px-4 py-5 text-white sm:px-6 xl:px-8 2xl:px-10">
      <div className="mb-6 flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#293040] bg-[#0f1624] text-[#d8b15b] shadow-lg shadow-black/20">
          <ClipboardPenLine className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-white">Apontamentos</h1>
          <p className="mt-1 text-sm text-[#96a0b8]">Módulo para apontamentos operacionais feitos no campo com suporte offline.</p>
        </div>
      </div>
      {availableModules.length === 0 && (
        <div className="rounded-3xl border border-white/10 bg-[#0b1220] p-8 text-sm text-slate-300">
          Nenhum apontamento está liberado para esta empresa. Habilite Broca, Perda ou Complexo de Murcha na configuração SaaS da empresa.
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {availableModules.map((item) => <Card key={item.key} item={item} onOpen={setSelected} />)}
      </div>
    </div>
  );
}
