import { getActiveCompanyId } from '../../services/companyContext.js';
import React from 'react';
import { palette } from '../../constants/theme.js';
import { Leaf, Sprout } from 'lucide-react';

import { MapPin, Wrench, Tractor, ClipboardList } from 'lucide-react';
import FazendasList from './fazendas/FazendasList.jsx';
import VariedadesList from './variedades/VariedadesList.jsx';
import OperacoesList from './operacoes/OperacoesList.jsx';
import InsumosList from './insumos/InsumosList.jsx';
import ProducaoAgricolaList from './producao_agricola/ProducaoAgricolaList.jsx';
import ApontamentoInsumoList from './apontamentos_insumo/ApontamentoInsumoList.jsx';
import { hydrateCadastroGeral } from '../../services/cadastros_mestres/cadastrosPostgresService.js';

/**
 * @file CadastrosMestresModule.jsx
 * @description Módulo de Cadastro Geral (Fazendas, Produtos, Unidades, Categorias).
 * @module CadastrosMestres
 */

export default function CadastrosMestresModule() {
  const [activeTab, setActiveTab] = React.useState('fazendas');
  const companyId = getActiveCompanyId();

  React.useEffect(() => {
    if (!companyId) return;
    let cancelled = false;

    hydrateCadastroGeral(activeTab, companyId)
      .then((result) => {
        if (!cancelled) {
          const total = Object.values(result || {}).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0);
          console.log(`[CadastroGeral] ${activeTab} carregado do PostgreSQL/Dexie: ${total} registro(s)`);
        }
      })
      .catch((error) => console.error('[CadastroGeral] Falha no carregamento inicial:', error));

    return () => {
      cancelled = true;
    };
  }, [activeTab, companyId]);

  // Listeners de Produção e Apontamento removidos para otimização de memória.
  // As abas farão comunicação direta com o PostgreSQL sob demanda via paginação.

  return (
    <div className="h-full flex flex-col p-6 animate-fade-in text-white overflow-y-auto custom-scrollbar" style={{ background: palette.background }}>
      <div className="mb-6 shrink-0">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Cadastro Geral</h1>
        <p className="text-[15px] text-white/60">
          Gerencie propriedades agrícolas, produtos, categorias, unidades de medida e variedades de cana.
        </p>
      </div>

      {/* Navegação por Abas */}
      <div className="flex items-center border-b border-white/10 mb-6 gap-6 shrink-0">
        <button
          onClick={() => setActiveTab('fazendas')}
          className={`pb-3 font-semibold transition-all relative flex items-center gap-2 ${
            activeTab === 'fazendas' ? 'text-white' : 'text-white/40 hover:text-white/80'
          }`}
        >
          <MapPin className="w-4 h-4" /> Fazendas e Talhões
          {activeTab === 'fazendas' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: palette.gold }}></div>
          )}
        </button>
        <button
          onClick={() => setActiveTab('variedades')}
          className={`pb-3 font-semibold transition-all relative flex items-center gap-2 ${
            activeTab === 'variedades' ? 'text-white' : 'text-white/40 hover:text-white/80'
          }`}
        >
          <Leaf className="w-4 h-4" /> Variedades
          {activeTab === 'variedades' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: palette.gold }}></div>
          )}
        </button>
        <button
          onClick={() => setActiveTab('operacoes')}
          className={`pb-3 font-semibold transition-all relative flex items-center gap-2 ${
            activeTab === 'operacoes' ? 'text-white' : 'text-white/40 hover:text-white/80'
          }`}
        >
          <Wrench className="w-4 h-4" /> Operações
          {activeTab === 'operacoes' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: palette.gold }}></div>
          )}
        </button>
        <button
          onClick={() => setActiveTab('insumos')}
          className={`pb-3 font-semibold transition-all relative flex items-center gap-2 ${
            activeTab === 'insumos' ? 'text-white' : 'text-white/40 hover:text-white/80'
          }`}
        >
          <Sprout className="w-4 h-4" /> Insumos
          {activeTab === 'insumos' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: palette.gold }}></div>
          )}
        </button>
        <button
          onClick={() => setActiveTab('producao')}
          className={`pb-3 font-semibold transition-all relative flex items-center gap-2 ${
            activeTab === 'producao' ? 'text-white' : 'text-white/40 hover:text-white/80'
          }`}
        >
          <Tractor className="w-4 h-4" /> Produção Agrícola
          {activeTab === 'producao' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: palette.gold }}></div>
          )}
        </button>
        <button
          onClick={() => setActiveTab('apontamento_insumo')}
          className={`pb-3 font-semibold transition-all relative flex items-center gap-2 ${
            activeTab === 'apontamento_insumo' ? 'text-white' : 'text-white/40 hover:text-white/80'
          }`}
        >
          <ClipboardList className="w-4 h-4" /> Apontamento Insumo
          {activeTab === 'apontamento_insumo' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: palette.gold }}></div>
          )}
        </button>
      </div>

      {/* Renderização Condicional da Aba */}
      <div className="flex-1 flex flex-col min-h-0 relative">
          {activeTab === 'fazendas' && <FazendasList />}
          {activeTab === 'variedades' && <VariedadesList />}
          {activeTab === 'operacoes' && <OperacoesList />}
          {activeTab === 'insumos' && <InsumosList />}
          {activeTab === 'producao' && <ProducaoAgricolaList />}
          {activeTab === 'apontamento_insumo' && <ApontamentoInsumoList />}
      </div>
    </div>
  );
}
