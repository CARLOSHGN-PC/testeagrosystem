import React, { useState } from 'react';
import { Eye, Edit3, FileDown, Clock, CheckCircle, CheckCheck, AlertCircle, Play } from 'lucide-react';
import Swal from 'sweetalert2';
import { ORDEM_CORTE_STATUS } from '../../../services/ordemCorte/ordemCorteConstants';
import { editarOrdemCorte } from '../../../services/ordemCorte/ordemCorteService';
import OrdemCorteInfoModal from './OrdemCorteInfoModal';
import OrdemCortePdfModal from './OrdemCortePdfModal';
import OrdemCorteViewModal from './OrdemCorteViewModal';

const getFazendaDisplay = (ordem) => {
  const fundo = String(ordem?.fundo_agricola || ordem?.fundoAgricola || ordem?.FUNDO_AGR || '').trim();
  const descricao = String(ordem?.fazendaDescricao || '').trim();
  if (fundo && descricao) return `${fundo} - ${descricao}`;
  return ordem?.nome_fazenda || ordem?.fazendaNome || fundo || descricao || '-';
};

export default function GerenciamentoList({ ordens, companyId, safra }) {
  const [selectedOrdem, setSelectedOrdem] = useState(null);
  const [modalType, setModalType] = useState(null); // 'info', 'view', 'edit', 'pdf'

  const openModal = (ordem, type) => {
    setSelectedOrdem(ordem);
    setModalType(type);
  };

  const closeModal = () => {
    setSelectedOrdem(null);
    setModalType(null);
  };


  const isConferidaOutroSistema = (ordem) => {
    return Boolean(
      ordem?.conferidoOutroSistema ||
      ordem?.fechadoOutroSistema ||
      ordem?.conferidoSistemaExterno ||
      ordem?.rawData?.conferidoOutroSistema ||
      ordem?.rawData?.fechadoOutroSistema ||
      ordem?.rawData?.conferidoSistemaExterno
    );
  };

  const handleToggleConferenciaOutroSistema = async (ordem) => {
    const jaConferida = isConferidaOutroSistema(ordem);
    const novoValor = !jaConferida;

    const result = await Swal.fire({
      title: novoValor ? 'Marcar como conferida?' : 'Remover conferência?',
      text: novoValor
        ? 'Confirma que esta Ordem de Corte já foi fechada/conferida no outro sistema?'
        : 'Deseja remover a marcação de conferência do outro sistema?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: novoValor ? '#10b981' : '#f59e0b',
      cancelButtonColor: '#9ca3af',
      confirmButtonText: novoValor ? 'Sim, conferir' : 'Sim, remover',
      cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) return;

    try {
      const now = new Date().toISOString();
      await editarOrdemCorte(ordem.id, {
        conferidoOutroSistema: novoValor,
        fechadoOutroSistema: novoValor,
        conferidoSistemaExterno: novoValor,
        conferidoOutroSistemaEm: novoValor ? now : null,
        conferidoOutroSistemaPor: novoValor ? 'Analista' : null
      });

      Swal.fire({
        icon: 'success',
        title: novoValor ? 'Ordem conferida!' : 'Conferência removida!',
        text: novoValor
          ? 'A ordem foi marcada como fechada/conferida no outro sistema.'
          : 'A marcação foi removida desta ordem.',
        timer: 1800,
        showConfirmButton: false
      });
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Erro',
        text: 'Não foi possível atualizar a conferência da ordem.',
        confirmButtonColor: '#3b82f6'
      });
    }
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
        await editarOrdemCorte(ordem.id, { status: ORDEM_CORTE_STATUS.ABERTA });
        Swal.fire({
          icon: 'success',
          title: 'Ordem Liberada!',
          text: 'A ordem de corte foi liberada com sucesso.',
          timer: 2000,
          showConfirmButton: false
        });
      } catch (error) {
        Swal.fire({
          icon: 'error',
          title: 'Erro',
          text: 'Não foi possível liberar a ordem de corte.',
          confirmButtonColor: '#3b82f6'
        });
      }
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case ORDEM_CORTE_STATUS.AGUARDANDO:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"><Clock className="w-3 h-3 mr-1" /> Aguardando</span>;
      case ORDEM_CORTE_STATUS.ABERTA:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800"><CheckCircle className="w-3 h-3 mr-1" /> Aberta</span>;
      case ORDEM_CORTE_STATUS.FINALIZADA:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800"><CheckCircle className="w-3 h-3 mr-1" /> Finalizada</span>;
      default:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{status}</span>;
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
                <td className="px-6 py-4 font-medium text-white">
                  {ordem.frenteServico || '-'}
                </td>
                <td className="px-6 py-4">
                  {getFazendaDisplay(ordem)}
                </td>
                <td className="px-6 py-4 font-mono text-xs" style={{ color: '#aebccb' }}>
                  {getIdSistema(ordem)}
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
                <td className="px-6 py-4">
                  {ordem.nomeColaborador || '-'}
                </td>
                <td className="px-6 py-4">
                  {getStatusBadge(ordem.status)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {ordem.status === ORDEM_CORTE_STATUS.FINALIZADA && ordem.closedAt
                    ? new Date(ordem.closedAt).toLocaleDateString('pt-BR')
                    : '-'}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-center gap-2">
                    {ordem.status === ORDEM_CORTE_STATUS.AGUARDANDO && (
                      <button
                        onClick={() => handleLiberarOrdem(ordem)}
                        className="p-2 text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors flex items-center justify-center border"
                        style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)' }}
                        title="Liberar Ordem"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                    {ordem.status === ORDEM_CORTE_STATUS.FINALIZADA && (
                      <button
                        onClick={() => handleToggleConferenciaOutroSistema(ordem)}
                        className={`p-2 rounded-lg transition-colors flex items-center justify-center border ${isConferidaOutroSistema(ordem) ? 'text-emerald-300 hover:bg-emerald-400/10' : 'text-gray-400 hover:bg-gray-400/10'}`}
                        style={{ borderColor: isConferidaOutroSistema(ordem) ? 'rgba(16,185,129,0.45)' : 'rgba(255,255,255,0.12)', background: isConferidaOutroSistema(ordem) ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.04)' }}
                        title={isConferidaOutroSistema(ordem) ? 'Conferida no outro sistema. Clique para remover.' : 'Marcar como fechada/conferida no outro sistema'}
                      >
                        <CheckCheck className="w-4 h-4" />
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
        <OrdemCorteInfoModal
          isOpen={true}
          onClose={closeModal}
          ordem={selectedOrdem}
        />
      )}

      {modalType === 'view' && selectedOrdem && (
        <OrdemCorteViewModal
          isOpen={true}
          onClose={closeModal}
          ordem={selectedOrdem}
          onOpenPdf={() => setModalType('pdf')}
        />
      )}

      {modalType === 'edit' && selectedOrdem && (
        <OrdemCorteInfoModal
          isOpen={true}
          onClose={closeModal}
          ordem={selectedOrdem}
          isEditMode={true}
        />
      )}

      {modalType === 'pdf' && selectedOrdem && (
        <OrdemCortePdfModal
          isOpen={true}
          onClose={closeModal}
          ordem={selectedOrdem}
          companyId={companyId}
        />
      )}
    </div>
  );
}

function getIdSistema(ordem) {
  if (ordem?.codigo) return `OC-${ordem.codigo}`;
  if (ordem?.sequencial != null) return `OC-${String(ordem.sequencial).padStart(2, '0')}`;
  return ordem?.id || '-';
}
