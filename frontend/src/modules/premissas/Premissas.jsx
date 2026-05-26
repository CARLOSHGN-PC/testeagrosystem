import React, { useState } from 'react';
import { Leaf, Tractor, Sun, Droplet, Sprout, ArrowRight } from 'lucide-react';
import { palette } from '../../constants/theme.js';
import TratosCulturaisModule from './tratos_culturais/TratosCulturaisModule.jsx';
import ColheitaPremissasModule from './colheita/ColheitaPremissasModule.jsx';

/**
 * @file Premissas.jsx
 * @description Módulo principal de Premissas que atua como dashboard para configurações operacionais.
 * @module Premissas
 */

/**
 * Módulo principal de Premissas.
 *
 * O que este bloco faz: Renderiza os cards dos 5 módulos (Colheita, Preparo, Plantio, Tratos Culturais e Desenvolvimento).
 * Por que ele existe: Para servir como a central de configurações mestre (dashboard) de todos os processos agrícolas.
 * O que entra e sai: Recebe estado interno para controlar se estamos no dashboard de cards ou dentro de um módulo específico.
 *
 * @returns {JSX.Element} Tela de dashboard de Premissas ou a tela interna do submódulo selecionado.
 */
export default function Premissas({ companyId, session }) {
  const [activeSubModule, setActiveSubModule] = useState(null);

  // Se um submódulo estiver ativo, renderiza ele (atualmente apenas Tratos Culturais tem tela interna)
  if (activeSubModule === 'tratos_culturais') {
    return <TratosCulturaisModule onBack={() => setActiveSubModule(null)} companyId={companyId} session={session} />;
  }

  if (activeSubModule === 'colheita') {
    return <ColheitaPremissasModule onBack={() => setActiveSubModule(null)} companyId={companyId} session={session} />;
  }

  // Cards dos módulos operacionais
  const cards = [
    { id: 'colheita', title: 'Colheita', icon: Tractor, active: true, desc: 'Configurar padrões automáticos do Planejamento Safra' },
    { id: 'preparo', title: 'Preparo', icon: Sun, active: false, desc: 'Em Breve' },
    { id: 'plantio', title: 'Plantio', icon: Sprout, active: false, desc: 'Em Breve' },
    { id: 'tratos_culturais', title: 'Tratos Culturais', icon: Droplet, active: true, desc: 'Configurar Operações e Protocolos' },
    { id: 'desenvolvimento', title: 'Desenvolvimento', icon: Leaf, active: false, desc: 'Em Breve' },
  ];

  return (
    <div className="h-full flex flex-col p-6 animate-fade-in text-white overflow-y-auto" style={{ background: palette.background }}>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Premissas</h1>
        <p className="text-[15px]" style={{ color: palette.text2 }}>
          Painel de controle e configurações mestras de módulos operacionais do sistema.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.id}
              onClick={() => card.active && setActiveSubModule(card.id)}
              className={`relative overflow-hidden rounded-[24px] border p-6 flex flex-col justify-between h-[200px] transition-all duration-300 ${
                card.active
                  ? 'cursor-pointer hover:-translate-y-1 hover:shadow-xl'
                  : 'cursor-not-allowed opacity-60'
              }`}
              style={{
                background: card.active ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)",
                borderColor: card.active ? "rgba(230,199,107,0.3)" : "rgba(255,255,255,0.05)"
              }}
            >
              <div className="flex items-start justify-between">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner"
                  style={{
                    background: card.active ? "rgba(212,175,55,0.15)" : "rgba(255,255,255,0.05)",
                    color: card.active ? palette.gold : palette.text2
                  }}
                >
                  <Icon className="w-7 h-7" />
                </div>
                {!card.active && (
                  <span className="text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider" style={{ background: "rgba(255,255,255,0.1)", color: palette.text2 }}>
                    Em Breve
                  </span>
                )}
                {card.active && (
                  <span className="text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider bg-green-500/20 text-green-400 border border-green-500/30">
                    Ativo
                  </span>
                )}
              </div>

              <div className="mt-4">
                <h2 className="text-xl font-bold text-white mb-1">{card.title}</h2>
                <p className="text-sm line-clamp-2" style={{ color: palette.text2 }}>
                  {card.desc}
                </p>
              </div>

              {card.active && (
                <div className="absolute bottom-6 right-6">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center transition-colors" style={{ background: "rgba(212,175,55,0.2)", color: palette.gold }}>
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
