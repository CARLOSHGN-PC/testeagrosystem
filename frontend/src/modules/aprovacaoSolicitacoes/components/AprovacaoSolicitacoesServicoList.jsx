import React, { useMemo, useState } from 'react';
import { Eye, Play, X } from 'lucide-react';
import Swal from 'sweetalert2';
import { updateOrdemServico } from '../../../services/ordemServico/ordemServicoRepository';
import { ORDEM_SERVICO_STATUS } from '../../../services/ordemServico/ordemServicoConstants';
import OrdemServicoViewModal from '../../gerenciamentoOrdemServico/components/OrdemServicoViewModal';

export default function AprovacaoSolicitacoesServicoList({ ordens, session }) {
  const [selectedOrdem, setSelectedOrdem] = useState(null);

  const gerenteNome = useMemo(
    () => session?.user?.nome || session?.user?.name || session?.user?.displayName || session?.user?.email || 'Gerência',
    [session]
  );

  const aprovar = async (ordem) => {
    if (ordem.status === ORDEM_SERVICO_STATUS.APROVADA) return;

    const result = await Swal.fire({
      title: 'Aprovar solicitação?',
      text: `A solicitação OS-${ordem.sequencial} será enviada como APROVADA para o analista.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#9ca3af',
      confirmButtonText: 'Aprovar',
      cancelButtonText: 'Cancelar',
    });

    if (!result.isConfirmed) return;

    try {
      await updateOrdemServico(ordem.id, {
        status: ORDEM_SERVICO_STATUS.APROVADA,
        aprovadoPor: gerenteNome,
        observacaoGerencia: ordem.observacaoGerencia || '',
        dataDecisao: new Date().toISOString(),
        requerAprovacaoGerencial: true,
        passouPorAprovacaoGerencial: true,
      });
      await Swal.fire({ icon: 'success', title: 'Solicitação aprovada', timer: 1700, showConfirmButton: false });
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'Erro', text: 'Não foi possível aprovar a solicitação.' });
    }
  };

  const reprovar = async (ordem) => {
    const result = await Swal.fire({
      title: 'Reprovar solicitação?',
      input: 'textarea',
      inputLabel: 'Informe o motivo da reprovação',
      inputPlaceholder: 'Ex.: revisar dose, custo acima do permitido, divergência no protocolo...',
      inputAttributes: { maxlength: 400 },
      inputValidator: (value) => (!String(value || '').trim() ? 'Informe o motivo da reprovação.' : undefined),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#9ca3af',
      confirmButtonText: 'Reprovar',
      cancelButtonText: 'Cancelar',
    });

    if (!result.isConfirmed) return;

    try {
      await updateOrdemServico(ordem.id, {
        status: ORDEM_SERVICO_STATUS.REPROVADA,
        reprovadoPor: gerenteNome,
        observacaoGerencia: String(result.value || '').trim(),
        dataDecisao: new Date().toISOString(),
        requerAprovacaoGerencial: true,
        passouPorAprovacaoGerencial: true,
      });
      await Swal.fire({ icon: 'success', title: 'Solicitação reprovada', timer: 1700, showConfirmButton: false });
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'Erro', text: 'Não foi possível reprovar a solicitação.' });
    }
  };

  if (!ordens.length) {
    return <div className="p-10 text-center text-sm" style={{ color: '#aebccb' }}>Nenhuma solicitação encontrada para esta safra.</div>;
  }

  return (
    <>
      <div className="hidden xl:block overflow-auto">
        <table className="min-w-full text-left text-sm" style={{ color: '#aebccb' }}>
          <thead className="border-b" style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.02)' }}>
            <tr>
              <th className="px-4 py-3 font-semibold text-white">OS</th>
              <th className="px-4 py-3 font-semibold text-white">Data</th>
              <th className="px-4 py-3 font-semibold text-white">Solicitante</th>
              <th className="px-4 py-3 font-semibold text-white">Operação</th>
              <th className="px-4 py-3 font-semibold text-white">Fazenda</th>
              <th className="px-4 py-3 font-semibold text-white">Protocolo</th>
              <th className="px-4 py-3 font-semibold text-white">Status</th>
              <th className="px-4 py-3 font-semibold text-white">Divergência</th>
              <th className="px-4 py-3 font-semibold text-white whitespace-nowrap">Valor Original</th>
              <th className="px-4 py-3 font-semibold text-white whitespace-nowrap">Custo Solicitado</th>
              <th className="px-4 py-3 font-semibold text-white whitespace-nowrap">Diferença</th>
              <th className="px-4 py-3 font-semibold text-white text-center">Ações</th>
            </tr>
          </thead>
          <tbody>
            {ordens.map((ordem) => {
              const diff = getDifference(ordem);
              return (
                <tr key={ordem.id} className="border-b transition-colors hover:bg-white/5" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                  <td className="px-4 py-4 font-semibold text-white whitespace-nowrap">OS-{ordem.sequencial}</td>
                  <td className="px-4 py-4 whitespace-nowrap">{formatDate(ordem.createdAt)}</td>
                  <td className="px-4 py-4">{getSolicitanteNome(ordem)}</td>
                  <td className="px-4 py-4">{getOperacaoNome(ordem)}</td>
                  <td className="px-4 py-4">{getFazendaNome(ordem)}</td>
                  <td className="px-4 py-4">{ordem.protocoloNome || '-'}</td>
                  <td className="px-4 py-4"><StatusBadge status={ordem.status} /></td>
                  <td className="px-4 py-4 whitespace-nowrap">{ordem.houveAlteracao ? 'Com divergência' : 'Sem divergência'}</td>
                  <td className="px-4 py-4 whitespace-nowrap text-white">{formatCurrency(ordem.custoTotalOriginal)}</td>
                  <td className="px-4 py-4 whitespace-nowrap text-white">{formatCurrency(ordem.custoTotalOS)}</td>
                  <td className={`px-4 py-4 whitespace-nowrap font-medium ${diff >= 0 ? 'text-amber-300' : 'text-emerald-300'}`}>{formatSignedCurrency(diff)}</td>
                  <td className="px-4 py-4">
                    <Acoes setSelectedOrdem={setSelectedOrdem} ordem={ordem} aprovar={aprovar} reprovar={reprovar} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-4 p-4 xl:hidden">
        {ordens.map((ordem) => {
          const diff = getDifference(ordem);
          return (
            <div key={ordem.id} className="rounded-2xl border p-4" style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.10)' }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-white">OS-{ordem.sequencial}</p>
                  <p className="text-xs" style={{ color: '#aebccb' }}>{formatDateTime(ordem.createdAt)}</p>
                </div>
                <StatusBadge status={ordem.status} />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm">
                <Info label="Solicitante" value={getSolicitanteNome(ordem)} />
                <Info label="Operação" value={getOperacaoNome(ordem)} />
                <Info label="Fazenda" value={getFazendaNome(ordem)} />
                <Info label="Protocolo" value={ordem.protocoloNome || '-'} />
                <Info label="Divergência" value={ordem.houveAlteracao ? 'Com divergência' : 'Sem divergência'} />
                <Info label="Valor original" value={formatCurrency(ordem.custoTotalOriginal)} />
                <Info label="Custo solicitado" value={formatCurrency(ordem.custoTotalOS)} />
                <Info label="Diferença" value={formatSignedCurrency(diff)} valueClassName={diff >= 0 ? 'text-amber-300' : 'text-emerald-300'} />
                <Info label="Status" value={getStatusLabel(ordem.status)} />
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <Acoes setSelectedOrdem={setSelectedOrdem} ordem={ordem} aprovar={aprovar} reprovar={reprovar} />
              </div>
            </div>
          );
        })}
      </div>

      {selectedOrdem && (
        <OrdemServicoViewModal
          isOpen={Boolean(selectedOrdem)}
          onClose={() => setSelectedOrdem(null)}
          ordem={selectedOrdem}
        />
      )}
    </>
  );
}

function Acoes({ ordem, setSelectedOrdem, aprovar, reprovar }) {
  const isPendente = ordem.status === ORDEM_SERVICO_STATUS.PENDENTE_APROVACAO;

  return (
    <div className="flex items-center justify-center gap-2">
      <button
        onClick={() => setSelectedOrdem(ordem)}
        className="rounded-lg border p-2 text-blue-400 transition-colors hover:bg-blue-400/10"
        style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)' }}
        title="Ver comparação"
      >
        <Eye className="h-4 w-4" />
      </button>
      <button
        onClick={() => aprovar(ordem)}
        disabled={!isPendente}
        className="rounded-lg border p-2 text-emerald-400 transition-colors hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-40"
        style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)' }}
        title="Aprovar"
      >
        <Play className="h-4 w-4" />
      </button>
      <button
        onClick={() => reprovar(ordem)}
        disabled={!isPendente}
        className="rounded-lg border p-2 text-red-400 transition-colors hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-40"
        style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)' }}
        title="Reprovar"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function StatusBadge({ status }) {
  const config = {
    [ORDEM_SERVICO_STATUS.PENDENTE_APROVACAO]: {
      label: 'Pendente',
      className: 'text-amber-300 border-amber-400/20 bg-amber-400/10',
    },
    [ORDEM_SERVICO_STATUS.APROVADA]: {
      label: 'Aprovada',
      className: 'text-emerald-300 border-emerald-400/20 bg-emerald-400/10',
    },
    [ORDEM_SERVICO_STATUS.REPROVADA]: {
      label: 'Reprovada',
      className: 'text-red-300 border-red-400/20 bg-red-400/10',
    },
  };

  const item = config[status] || { label: status || '-', className: 'text-slate-200 border-white/10 bg-white/5' };
  return <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase ${item.className}`}>{item.label}</span>;
}

function Info({ label, value, valueClassName = 'text-white' }) {
  return (
    <div className="rounded-xl border px-3 py-2" style={{ background: 'rgba(0,0,0,0.18)', borderColor: 'rgba(255,255,255,0.08)' }}>
      <p className="text-[11px] uppercase tracking-wide" style={{ color: '#aebccb' }}>{label}</p>
      <p className={`mt-1 text-sm break-words ${valueClassName}`}>{value}</p>
    </div>
  );
}

function getSolicitanteNome(ordem) {
  return ordem.solicitanteNome || ordem.nomeColaborador || ordem.createdBy || ordem.createdByEmail || '-';
}

function getOperacaoNome(ordem) {
  return ordem.operacao?.nome || ordem.operacao?.deOperacao || ordem.operacao?.de0peracao || '-';
}

function getFazendaNome(ordem) {
  if (ordem.fazendaNome) return ordem.fazendaNome;
  if (Array.isArray(ordem.fazendasNomes) && ordem.fazendasNomes.length > 0) return ordem.fazendasNomes.join(', ');
  return '-';
}

function getStatusLabel(status) {
  switch (status) {
    case ORDEM_SERVICO_STATUS.PENDENTE_APROVACAO:
      return 'Pendente aprovação';
    case ORDEM_SERVICO_STATUS.APROVADA:
      return 'Aprovada';
    case ORDEM_SERVICO_STATUS.REPROVADA:
      return 'Reprovada';
    default:
      return status || '-';
  }
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR');
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getDifference(ordem) {
  return Number(ordem.custoTotalOS || 0) - Number(ordem.custoTotalOriginal || 0);
}

function formatSignedCurrency(value) {
  const absolute = formatCurrency(Math.abs(Number(value || 0)));
  if (Number(value || 0) === 0) return absolute;
  return `${Number(value) > 0 ? '+' : '-'} ${absolute}`;
}
