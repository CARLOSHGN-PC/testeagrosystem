import React, { useState } from 'react';
import { Layers } from 'lucide-react';
import { useOrdemServicoActions } from '../../../../hooks/estimativas/useOrdemServicoActions';
import { showError, showSuccess } from '../../../../utils/alert';
import { OrdemServicoFormModal } from './OrdemServicoFormModal';
import { ORDEM_SERVICO_STATUS } from '../../../../services/ordemServico/ordemServicoConstants';
import { criarPlanejamentoTratos } from '../../../../services/planejamentoTratos/planejamentoTratosService';

export const OrdemServicoActions = ({
  vinculoAtivo,
  talhoesIds,
  talhoesNomes,
  totalArea,
  companyId,
  safra,
  usuario,
  planningMode = false,
  selectedTalhoesData = [],
  selectedOperacaoPlanejamento = null,
  readOnlyMode = false
}) => {
  const { handleAbrirOrdemServico, handleFecharOrdemServico, isProcessing } = useOrdemServicoActions();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const onAbrirClick = () => {
    if (readOnlyMode) {
      return;
    }
    if (!talhoesIds || talhoesIds.length === 0) return;
    setIsModalOpen(true);
  };

  const handleConfirmarAbertura = async (dadosDaOs) => {
    if (readOnlyMode) {
      setIsModalOpen(false);
      return;
    }

    const { operacaoId, operacaoNome, protocoloOriginal, subProtocoloSelecionado, protocoloEditadoItens, custoTotalOriginal, custoTotalOS, isPendente, justificativaAprovacao } = dadosDaOs;
    setIsModalOpen(false);

    if (planningMode) {
      const result = await criarPlanejamentoTratos({
        companyId,
        safra,
        talhaoIds: talhoesIds,
        talhoesNomes,
        operacao: { id: operacaoId, nome: operacaoNome },
        protocoloOriginal,
        subProtocoloSelecionado,
        protocoloEditadoItens,
        custoTotalOriginal,
        custoTotalOS,
        justificativaAprovacao,
        usuario,
        selectedTalhoesData
      });

      if (result.success) {
        await showSuccess('Planejamento salvo', `Planejamento PT-${result.codigo} salvo para ${result.totalTalhoes} talhão(ões) em ${result.totalFazendas} fazenda(s). O cálculo exibido continua apenas como apoio.`);
      } else {
        showError('Falha ao salvar planejamento', result.message || 'Não foi possível gravar o planejamento no banco local.');
      }
      return;
    }

    await handleAbrirOrdemServico({
      companyId,
      safra,
      talhaoIds: talhoesIds,
      talhoesNomes,
      selectedTalhoesData,
      operacao: { id: operacaoId, nome: operacaoNome },
      protocoloOriginal,
      subProtocoloSelecionado,
      protocoloEditadoItens,
      custoTotalOriginal,
      custoTotalOS,
      isPendente,
      justificativaAprovacao,
      usuario
    });
  };

  const onFecharClick = async () => {
    if (readOnlyMode) {
      return;
    }
    if (!vinculoAtivo) return;
    const sequencial = vinculoAtivo.sequencial || vinculoAtivo.ordemCodigo || '...';
    await handleFecharOrdemServico(vinculoAtivo.ordemServicoId, sequencial, talhoesIds, usuario);
  };

  return (
    <div className="mt-4 flex flex-col gap-3">
      {readOnlyMode && (
        <div className="rounded-2xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-3 text-sm font-semibold text-yellow-100">
        </div>
      )}

      {!readOnlyMode && (planningMode || !vinculoAtivo || vinculoAtivo.status === ORDEM_SERVICO_STATUS.EXECUTADA || vinculoAtivo.status === ORDEM_SERVICO_STATUS.CANCELADA ? (
        <button
          onClick={onAbrirClick}
          disabled={isProcessing || talhoesIds.length === 0}
          className="w-full rounded-2xl py-3 flex items-center justify-center gap-2 font-semibold text-[15px] transition-transform hover:scale-[1.02] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: '#3b82f6', color: '#ffffff' }}
        >
          <Layers className="w-4 h-4" />
          {planningMode ? 'Planejar Protocolo' : 'Abrir Ordem de Serviço'}
        </button>
      ) : !planningMode && (vinculoAtivo.status === ORDEM_SERVICO_STATUS.ABERTA || vinculoAtivo.status === ORDEM_SERVICO_STATUS.PENDENTE_APROVACAO || vinculoAtivo.status === ORDEM_SERVICO_STATUS.RASCUNHO) ? (
        <button
          onClick={onFecharClick}
          disabled={isProcessing || talhoesIds.length === 0}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-600 bg-red-500 text-white shadow-lg"
        >
          <Layers className="w-5 h-5" />
          <span>Fechar {talhoesIds.length > 1 ? `${talhoesIds.length} talhões da OS` : 'talhão da OS'}</span>
        </button>
      ) : null)}

      {isModalOpen && (
        <OrdemServicoFormModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onConfirm={handleConfirmarAbertura}
          talhoesCount={talhoesIds.length}
          selectedTalhoesNomes={talhoesNomes}
          totalArea={totalArea}
          companyId={companyId}
          planningMode={planningMode}
          selectedTalhoesData={selectedTalhoesData}
          selectedOperacaoContext={selectedOperacaoPlanejamento}
        />
      )}
    </div>
  );
};
