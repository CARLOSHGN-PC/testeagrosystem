import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useOrdensServico } from '../../hooks/estimativas/useOrdensServico';
import { ORDEM_SERVICO_STATUS } from '../../services/ordemServico/ordemServicoConstants';
import AprovacaoSolicitacoesServicoList from './components/AprovacaoSolicitacoesServicoList';

const FILTERS = {
  pendentes: 'pendentes',
  aprovadas: 'aprovadas',
  reprovadas: 'reprovadas',
  divergencia: 'divergencia',
};

export default function AprovacaoSolicitacoesServicoPage({ companyId, safra, session }) {
  const { ordensSafra } = useOrdensServico(companyId, safra);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState(FILTERS.pendentes);

  const baseOrdens = useMemo(() => {
    const lista = [...(ordensSafra || [])].filter((ordem) => {
      const passaFluxoGerencia = Boolean(
        ordem.requerAprovacaoGerencial
        || ordem.passouPorAprovacaoGerencial
        || ordem.status === ORDEM_SERVICO_STATUS.PENDENTE_APROVACAO
        || ordem.status === ORDEM_SERVICO_STATUS.REPROVADA
      );
      return passaFluxoGerencia;
    });

    if (!searchTerm.trim()) {
      return lista.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }

    const lower = searchTerm.toLowerCase();
    return lista
      .filter((ordem) =>
        String(ordem.sequencial || '').toLowerCase().includes(lower)
        || String(ordem.numeroEmpresa || '').toLowerCase().includes(lower)
        || String(ordem.frenteServico || '').toLowerCase().includes(lower)
        || String(ordem.fazendaNome || '').toLowerCase().includes(lower)
        || String(ordem.nomeColaborador || ordem.createdBy || '').toLowerCase().includes(lower)
        || String(ordem.protocoloNome || '').toLowerCase().includes(lower)
        || String(ordem.operacao?.nome || ordem.operacaoNome || ordem.operacao || '').toLowerCase().includes(lower)
      )
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [ordensSafra, searchTerm]);

  const resumo = useMemo(() => ({
    pendentes: baseOrdens.filter((ordem) => ordem.status === ORDEM_SERVICO_STATUS.PENDENTE_APROVACAO).length,
    aprovadas: baseOrdens.filter((ordem) => ordem.status === ORDEM_SERVICO_STATUS.APROVADA).length,
    reprovadas: baseOrdens.filter((ordem) => ordem.status === ORDEM_SERVICO_STATUS.REPROVADA).length,
    comDivergencia: baseOrdens.filter((ordem) => ordem.houveAlteracao).length,
  }), [baseOrdens]);

  const filteredOrdens = useMemo(() => {
    switch (activeFilter) {
      case FILTERS.aprovadas:
        return baseOrdens.filter((ordem) => ordem.status === ORDEM_SERVICO_STATUS.APROVADA);
      case FILTERS.reprovadas:
        return baseOrdens.filter((ordem) => ordem.status === ORDEM_SERVICO_STATUS.REPROVADA);
      case FILTERS.divergencia:
        return baseOrdens.filter((ordem) => ordem.houveAlteracao);
      case FILTERS.pendentes:
      default:
        return baseOrdens.filter((ordem) => ordem.status === ORDEM_SERVICO_STATUS.PENDENTE_APROVACAO);
    }
  }, [baseOrdens, activeFilter]);

  return (
    <div className="h-full w-full overflow-y-auto p-4 sm:p-6" style={{ background: '#0e1014' }}>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Aprovação de Solicitações</h1>
          <p className="mt-1 text-sm" style={{ color: '#aebccb' }}>
            Gerência visualiza divergências de protocolos e aprova ou reprova as solicitações pendentes da safra {safra}.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <ResumoCard titulo="Pendentes" valor={resumo.pendentes} active={activeFilter === FILTERS.pendentes} onClick={() => setActiveFilter(FILTERS.pendentes)} />
          <ResumoCard titulo="Aprovadas" valor={resumo.aprovadas} active={activeFilter === FILTERS.aprovadas} onClick={() => setActiveFilter(FILTERS.aprovadas)} />
          <ResumoCard titulo="Reprovadas" valor={resumo.reprovadas} active={activeFilter === FILTERS.reprovadas} onClick={() => setActiveFilter(FILTERS.reprovadas)} />
          <ResumoCard titulo="Com divergência" valor={resumo.comDivergencia} active={activeFilter === FILTERS.divergencia} onClick={() => setActiveFilter(FILTERS.divergencia)} />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border shadow-sm" style={{ background: '#111a2d', borderColor: 'rgba(255,255,255,0.12)' }}>
        <div className="border-b p-4" style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.2)' }}>
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: '#aebccb' }} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por número, protocolo, frente ou solicitante..."
              className="w-full rounded-xl border px-4 py-2 pl-9 text-sm text-white outline-none transition-colors"
              style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.12)' }}
            />
          </div>
        </div>

        <AprovacaoSolicitacoesServicoList ordens={filteredOrdens} session={session} />
      </div>
    </div>
  );
}

function ResumoCard({ titulo, valor, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border px-4 py-3 text-left transition-all"
      style={{
        background: active ? 'rgba(59,130,246,0.14)' : 'rgba(255,255,255,0.04)',
        borderColor: active ? 'rgba(59,130,246,0.55)' : 'rgba(255,255,255,0.10)',
        boxShadow: active ? '0 0 0 1px rgba(59,130,246,0.20) inset' : 'none'
      }}
    >
      <p className="text-xs uppercase tracking-wide" style={{ color: '#aebccb' }}>{titulo}</p>
      <p className="mt-1 text-xl font-semibold text-white">{valor}</p>
    </button>
  );
}
