import React, { useState, useEffect } from 'react';
import { Search, Map as MapIcon } from 'lucide-react';
import { useOrdensServico } from '../../hooks/estimativas/useOrdensServico';
import GerenciamentoOrdemServicoList from './components/GerenciamentoOrdemServicoList';

export default function GerenciamentoOrdemServicoPage({ companyId, safra, setActiveModule }) {
  const { ordensSafra } = useOrdensServico(companyId, safra);

  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [filteredOrdens, setFilteredOrdens] = useState([]);

  useEffect(() => {
    let result = [...(ordensSafra || [])].filter(o => ![
      'PENDENTE_APROVACAO',
      'REPROVADA'
    ].includes(o.status));

    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      result = result.filter(o =>
        (o.id && o.id.toLowerCase().includes(lowerTerm)) ||
        (o.sequencial && String(o.sequencial).includes(lowerTerm)) ||
        (o.frenteServico && o.frenteServico.toLowerCase().includes(lowerTerm)) ||
        (String(o.nome_fazenda || o.fazendaNome || '').toLowerCase().includes(lowerTerm)) ||
        (Array.isArray(o.fazendasNomes) && o.fazendasNomes.some((fazenda) => String(fazenda || '').toLowerCase().includes(lowerTerm))) ||
        (o.nomeColaborador && o.nomeColaborador.toLowerCase().includes(lowerTerm))
      );
    }

    if (dateFilter) {
      result = result.filter(o => o.createdAt && o.createdAt.startsWith(dateFilter));
    }

    // Ordenar do mais novo pro mais antigo
    result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    setFilteredOrdens(result);
  }, [ordensSafra, searchTerm, dateFilter]);

  return (
    <div className="h-full w-full overflow-y-auto p-6" style={{ background: '#0e1014' }}>

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Gerenciamento de Ordem de Serviço</h1>
          <p className="text-sm mt-1" style={{ color: '#aebccb' }}>Safra {safra}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveModule('estimativa')}
            className="px-4 py-2 text-white font-semibold text-sm rounded-xl border shadow-sm transition-colors flex items-center gap-2 hover:bg-white/10"
            style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)' }}
          >
            <MapIcon className="w-4 h-4" />
            Abrir no Mapa
          </button>
        </div>
      </div>

      {/* FILTROS E TABELA */}
      <div className="border rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[500px]" style={{ background: '#111a2d', borderColor: 'rgba(255,255,255,0.12)' }}>
        {/* Barra de Filtros */}
        <div className="p-4 border-b flex flex-col sm:flex-row gap-4" style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.2)' }}>
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#aebccb' }} />
            <input
              type="text"
              placeholder="Buscar por frente, fazenda, ID, número ou responsável..."
              className="w-full pl-9 pr-4 py-2 text-sm rounded-xl outline-none focus:border-yellow-500 transition-colors text-white placeholder-gray-500"
              style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.12)', borderStyle: 'solid', borderWidth: '1px' }}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-48">
             <input
                type="date"
                className="w-full px-4 py-2 text-sm rounded-xl outline-none focus:border-yellow-500 transition-colors text-white placeholder-gray-500"
                style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.12)', borderStyle: 'solid', borderWidth: '1px', colorScheme: 'dark' }}
                value={dateFilter}
                onChange={e => setDateFilter(e.target.value)}
             />
          </div>
        </div>

        {/* Tabela de Listagem */}
        <div className="flex-1 overflow-auto">
          <GerenciamentoOrdemServicoList
             ordens={filteredOrdens}
             companyId={companyId}
             safra={safra}
          />
        </div>
      </div>
    </div>
  );
}
