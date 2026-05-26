import React, { useEffect, useState } from 'react';
import { Search, Map as MapIcon, CheckCircle, Clock, XCircle, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import GerenciamentoList from './components/GerenciamentoList';
import { ORDEM_CORTE_STATUS } from '../../services/ordemCorte/ordemCorteConstants';
import { fetchOrdensCortePaginadas } from '../../services/ordemCorte/ordemCorteAdminApi';

const PAGE_SIZE = 20;

const STATUS_CARDS = [
  { key: 'aguardando', label: 'Aguardando', status: ORDEM_CORTE_STATUS.AGUARDANDO, icon: Clock, accent: '#eab308' },
  { key: 'aberto', label: 'Aberto', status: ORDEM_CORTE_STATUS.ABERTA, icon: CheckCircle, accent: '#22c55e' },
  { key: 'fechado', label: 'Finalizado', status: ORDEM_CORTE_STATUS.FINALIZADA, icon: XCircle, accent: '#ef4444' }
];

function StatusFilterCard({ item, active, count, onClick }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[58px] rounded-xl border px-3 py-2 text-left transition-all hover:-translate-y-0.5"
      style={{
        background: active ? `${item.accent}22` : 'rgba(255,255,255,0.045)',
        borderColor: active ? item.accent : 'rgba(255,255,255,0.12)',
        boxShadow: active ? `0 8px 22px ${item.accent}18` : 'none'
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${item.accent}22`, color: item.accent }}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: '#aebccb' }}>{item.label}</p>
            <p className="mt-0.5 text-lg font-black text-white">{count || 0}</p>
          </div>
        </div>
      </div>
    </button>
  );
}

export default function GerenciamentoOrdemCortePage({ companyId, safra, setActiveModule }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('aguardando');
  const [page, setPage] = useState(1);
  const [remoteState, setRemoteState] = useState({ data: [], total: 0, totalPages: 1, counts: {}, loading: false, error: '' });
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, dateFilter, statusFilter, companyId, safra]);


  useEffect(() => {
    const refresh = () => setReloadTick((value) => value + 1);
    window.addEventListener('ordem-corte-atualizada', refresh);
    return () => window.removeEventListener('ordem-corte-atualizada', refresh);
  }, []);

  useEffect(() => {
    let active = true;
    async function loadPage() {
      if (!companyId) return;
      setRemoteState((prev) => ({ ...prev, loading: true, error: '' }));
      try {
        const response = await fetchOrdensCortePaginadas({
          companyId,
          safra,
          status: statusFilter,
          search: searchTerm,
          date: dateFilter,
          page,
          limit: PAGE_SIZE
        });
        if (!active) return;
        setRemoteState({
          data: Array.isArray(response?.data) ? response.data : [],
          total: Number(response?.total || 0),
          totalPages: Math.max(1, Number(response?.totalPages || 1)),
          counts: response?.counts || {},
          loading: false,
          error: ''
        });
      } catch (error) {
        if (!active) return;
        setRemoteState((prev) => ({ ...prev, loading: false, error: error.message || 'Falha ao carregar as ordens.' }));
      }
    }
    loadPage();
    return () => { active = false; };
  }, [companyId, safra, statusFilter, searchTerm, dateFilter, page, reloadTick]);

  const currentRows = remoteState.data;
  const totalItems = remoteState.total;
  const totalPages = remoteState.totalPages;
  const counts = remoteState.counts;

  return (
    <div className="h-full w-full overflow-y-auto p-6" style={{ background: '#0e1014' }}>
      <div className="mb-5 grid grid-cols-1 items-center gap-4 xl:grid-cols-[420px_minmax(520px,1fr)_auto]">
        <div>
          <h1 className="text-2xl font-bold text-white">Gerenciamento de Ordem de Corte</h1>
          <p className="mt-1 text-sm" style={{ color: '#aebccb' }}>Safra {safra}</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {STATUS_CARDS.map((item) => (
            <StatusFilterCard
              key={item.key}
              item={item}
              active={statusFilter === item.key}
              count={counts?.[item.key] || 0}
              onClick={() => setStatusFilter(item.key)}
            />
          ))}
        </div>

        <button
          onClick={() => setActiveModule('estimativa')}
          className="flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-white/10"
          style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)' }}
        >
          <MapIcon className="h-4 w-4" />
          Abrir no Mapa
        </button>
      </div>

      <div className="flex min-h-[500px] flex-col overflow-hidden rounded-2xl border shadow-sm" style={{ background: '#111a2d', borderColor: 'rgba(255,255,255,0.12)' }}>
        <div className="flex flex-col gap-4 border-b p-4 sm:flex-row" style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.2)' }}>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: '#aebccb' }} />
            <input
              type="text"
              placeholder="Buscar por frente, ID, número ou responsável..."
              className="w-full rounded-xl py-2 pl-9 pr-4 text-sm text-white placeholder-gray-500 outline-none transition-colors focus:border-yellow-500"
              style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.12)', borderStyle: 'solid', borderWidth: '1px' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-48">
            <input
              type="date"
              className="w-full rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 outline-none transition-colors focus:border-yellow-500"
              style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.12)', borderStyle: 'solid', borderWidth: '1px', colorScheme: 'dark' }}
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
          </div>
        </div>

        {remoteState.loading ? (
          <div className="flex flex-1 items-center justify-center gap-3 py-16 text-sm text-white/70">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando 20 registros...
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            {remoteState.error ? (
              <div className="border-b px-4 py-2 text-xs text-amber-300" style={{ borderColor: 'rgba(255,255,255,0.10)', background: 'rgba(251,191,36,0.08)' }}>
                {remoteState.error}
              </div>
            ) : null}
            <GerenciamentoList ordens={currentRows} companyId={companyId} safra={safra} />
          </div>
        )}

        <div className="flex flex-col items-center justify-between gap-3 border-t px-4 py-3 text-sm sm:flex-row" style={{ borderColor: 'rgba(255,255,255,0.12)', color: '#aebccb' }}>
          <span>
            Exibindo {currentRows.length} de {totalItems} registro(s) • Página {Math.min(page, totalPages)} de {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1 || remoteState.loading}
              className="flex items-center gap-1 rounded-lg border px-3 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)' }}
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages || remoteState.loading}
              className="flex items-center gap-1 rounded-lg border px-3 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)' }}
            >
              Próxima
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
