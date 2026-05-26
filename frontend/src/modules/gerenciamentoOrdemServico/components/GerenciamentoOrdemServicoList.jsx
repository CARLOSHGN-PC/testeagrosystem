import React, { useState } from 'react';
import { Eye, Edit3, FileDown, Play } from 'lucide-react';
import Swal from 'sweetalert2';
import { ORDEM_SERVICO_STATUS } from '../../../services/ordemServico/ordemServicoConstants';
import { updateOrdemServico } from '../../../services/ordemServico/ordemServicoRepository';
import OrdemServicoInfoModal from './OrdemServicoInfoModal';
import OrdemServicoViewModal from './OrdemServicoViewModal';
import OrdemServicoPdfModal from './OrdemServicoPdfModal';

const formatarIdSistemaOS = (valor) => {
  const text = String(valor ?? '').trim();
  if (!text) return '-';
  if (/^O\.?S\b/i.test(text) || /^O\.?S\s*/i.test(text)) return text.replace(/^OS\s*/i, 'O.S ');
  return `O.S ${text}`;
};

const getFazendaDisplay = (ordem) => {
  const fundo = String(ordem?.fundo_agricola || ordem?.fundoAgricola || ordem?.FUNDO_AGR || '').trim();
  const descricao = String(ordem?.fazendaDescricao || '').trim();
  if (fundo && descricao) return `${fundo} - ${descricao}`;
  return ordem?.nome_fazenda || ordem?.fazendaNome || fundo || descricao || '-';
};

export default function GerenciamentoOrdemServicoList({ ordens, companyId, safra }) {
  const [selectedOrdem, setSelectedOrdem] = useState(null);
  const [modalType, setModalType] = useState(null);

  const openModal = (ordem, type) => {
    setSelectedOrdem(ordem);
    setModalType(type);
  };

  const closeModal = () => {
    setSelectedOrdem(null);
    setModalType(null);
  };

  const handleLiberarOrdem = async (ordem) => {
    if (!ordem.numeroEmpresa) {
      Swal.fire({
        icon: 'error',
        title: 'Atenção',
        text: 'É necessário informar o número da Ordem Empresa antes de liberar.',
        confirmButtonColor: '#3b82f6',
        confirmButtonText: 'Entendi'
      });
      return;
    }

    const result = await Swal.fire({
      title: 'Liberar Ordem?',
      text: `Deseja liberar a ordem ${ordem.numeroEmpresa}? O status mudará para ABERTA no mapa.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#9ca3af',
      confirmButtonText: 'Sim, liberar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        await updateOrdemServico(ordem.id, { status: ORDEM_SERVICO_STATUS.ABERTA });
        Swal.fire({
          icon: 'success',
          title: 'Ordem Liberada!',
          text: 'A ordem de serviço foi liberada com sucesso.',
          timer: 2000,
          showConfirmButton: false
        });
      } catch (error) {
        Swal.fire({
          icon: 'error',
          title: 'Erro',
          text: 'Não foi possível liberar a ordem de serviço.',
          confirmButtonColor: '#3b82f6'
        });
      }
    }
  };

  const handleFinalizarOrdem = async (ordem) => {
    const result = await Swal.fire({
      title: 'Finalizar Ordem de Serviço?',
      text: `Deseja marcar a OS-${ordem.sequencial} como executada?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#9ca3af',
      confirmButtonText: 'Sim, finalizar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        await updateOrdemServico(ordem.id, { status: ORDEM_SERVICO_STATUS.EXECUTADA, closedAt: new Date().toISOString() });
        Swal.fire({
          icon: 'success',
          title: 'Ordem Finalizada!',
          text: 'A ordem de serviço foi finalizada com sucesso.',
          timer: 2000,
          showConfirmButton: false
        });
      } catch (error) {
        Swal.fire({
          icon: 'error',
          title: 'Erro',
          text: 'Não foi possível finalizar a ordem de serviço.',
          confirmButtonColor: '#3b82f6'
        });
      }
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case ORDEM_SERVICO_STATUS.PENDENTE_APROVACAO:
        return <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase border bg-red-500/10 border-red-500/20 text-red-400">Aguardando Aprovação</span>;
      case ORDEM_SERVICO_STATUS.APROVADA:
        return <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase border bg-emerald-500/10 border-emerald-500/20 text-emerald-400">Aprovada</span>;
      case ORDEM_SERVICO_STATUS.REPROVADA:
        return <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase border bg-red-500/10 border-red-500/20 text-red-400">Reprovada</span>;
      case ORDEM_SERVICO_STATUS.ABERTA:
        return <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase border bg-amber-500/10 border-amber-500/20 text-amber-400">Aberta</span>;
      case ORDEM_SERVICO_STATUS.EXECUTADA:
        return <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase border bg-emerald-500/10 border-emerald-500/20 text-emerald-400">Finalizada</span>;
      case ORDEM_SERVICO_STATUS.CANCELADA:
        return <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase border bg-gray-500/10 border-gray-500/20 text-gray-400">Cancelada</span>;
      default:
        return <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase border bg-gray-500/10 border-gray-500/20 text-gray-400">{status}</span>;
    }
  };

  return (
    <div className="w-full">
      <table className="w-full text-left text-sm" style={{ color: '#aebccb' }}>
        <thead className="border-b" style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.02)' }}>
          <tr>
            <th className="px-6 py-3 font-semibold text-white">Data Abertura</th>
            <th className="px-6 py-3 font-semibold text-white">Frente</th>
            <th className="px-6 py-3 font-semibold text-white">Fazenda</th>
            <th className="px-6 py-3 font-semibold text-white">ID do sistema</th>
            <th className="px-6 py-3 font-semibold text-white">Nº Ordem Empresa</th>
            <th className="px-6 py-3 font-semibold text-white">Responsável</th>
            <th className="px-6 py-3 font-semibold text-white">Status</th>
            <th className="px-6 py-3 font-semibold text-white">Data Finalização</th>
            <th className="px-6 py-3 font-semibold text-white text-center">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y" style={{ divideColor: 'rgba(255,255,255,0.08)' }}>
          {ordens.length === 0 ? (
            <tr>
              <td colSpan="9" className="px-6 py-12 text-center text-gray-500">
                Nenhuma ordem encontrada para os filtros aplicados.
              </td>
            </tr>
          ) : (
            ordens.map(ordem => (
              <tr key={ordem.id} className="transition-colors hover:bg-white/5">
                <td className="px-6 py-4 whitespace-nowrap">
                  {new Date(ordem.createdAt).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-6 py-4 font-medium text-white uppercase">
                  {ordem.frenteServico || 'FRENTE 1'}
                </td>
                <td className="px-6 py-4">
                  {getFazendaDisplay(ordem)}
                </td>
                <td className="px-6 py-4 font-mono text-sm" style={{ color: '#aebccb' }}>
                  {formatarIdSistemaOS(String(ordem.sequencial || '').padStart(2, '0'))}
                </td>
                <td className="px-6 py-4">
                  {ordem.numeroEmpresa ? (
                    <span className="font-semibold text-white">{ordem.numeroEmpresa}</span>
                  ) : (
                    <button
                      onClick={() => openModal(ordem, 'info')}
                      className="text-amber-400 hover:text-amber-300 font-medium hover:underline text-xs px-2 py-1 rounded"
                      style={{ background: 'rgba(251, 191, 36, 0.1)' }}
                    >
                      Informar número
                    </button>
                  )}
                </td>
                <td className="px-6 py-4 uppercase">
                  {ordem.nomeColaborador || ordem.createdBy || '-'}
                </td>
                <td className="px-6 py-4">
                  {getStatusBadge(ordem.status)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {ordem.status === ORDEM_SERVICO_STATUS.EXECUTADA && ordem.closedAt
                    ? new Date(ordem.closedAt).toLocaleDateString('pt-BR')
                    : '-'}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-center gap-2">
                    {ordem.status === ORDEM_SERVICO_STATUS.APROVADA && (
                      <button
                        onClick={() => handleLiberarOrdem(ordem)}
                        className="p-2 text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors flex items-center justify-center border"
                        style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)' }}
                        title="Liberar Ordem"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => openModal(ordem, 'view')}
                      className="p-2 text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors flex items-center justify-center border"
                      style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)' }}
                      title="Ver Ordem"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openModal(ordem, 'edit')}
                      className="p-2 text-amber-400 hover:bg-amber-400/10 rounded-lg transition-colors flex items-center justify-center border"
                      style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)' }}
                      title="Editar Ordem"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openModal(ordem, 'pdf')}
                      className="p-2 text-purple-400 hover:bg-purple-400/10 rounded-lg transition-colors flex items-center justify-center border"
                      style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)' }}
                      title="Gerar PDF"
                    >
                      <FileDown className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Renderização Condicional dos Modais */}
      {modalType === 'info' && selectedOrdem && (
        <OrdemServicoInfoModal
          isOpen={true}
          onClose={closeModal}
          ordem={selectedOrdem}
        />
      )}

      {modalType === 'view' && selectedOrdem && (
        <OrdemServicoViewModal
          isOpen={true}
          onClose={closeModal}
          ordem={selectedOrdem}
          onOpenPdf={() => setModalType('pdf')}
        />
      )}

      {modalType === 'edit' && selectedOrdem && (
        <OrdemServicoInfoModal
          isOpen={true}
          onClose={closeModal}
          ordem={selectedOrdem}
          isEditMode={true}
        />
      )}

      {modalType === 'pdf' && selectedOrdem && (
        <OrdemServicoPdfModal
          isOpen={true}
          onClose={closeModal}
          ordem={selectedOrdem}
          companyId={companyId}
        />
      )}
    </div>
  );
}
