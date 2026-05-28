import React, { useState } from 'react';
import { Layers } from 'lucide-react';
import { useOrdemCorteActions } from '../../../hooks/estimativas/useOrdemCorteActions';
import { ORDEM_CORTE_STATUS } from '../../../services/ordemCorte/ordemCorteConstants';
import { OrdemCorteInfo } from './OrdemCorteInfo';
import { OrdemCorteFormModal } from './OrdemCorteFormModal';
import { showError } from '../../../utils/alert';

export const OrdemCorteActions = ({
  vinculoAtivo,
  talhoesIds,
  talhoesNomes,
  hasUnestimatedTalhao,
  hasClosedOrdem,
  companyId,
  safra,
  rodadaOrigem,
  usuario,
  selectedTalhoesData = [],
  reloadMapWithFilters = null,
  appliedFilters = {},
  onOrdemCorteLayerStale = null,
  readOnlyMode = false
}) => {
  const { handleAbrirOrdem, handleFecharOrdem, isProcessing } = useOrdemCorteActions();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const onAbrirClick = () => {
    if (readOnlyMode) {
      return;
    }
    if (hasUnestimatedTalhao || hasClosedOrdem) return;
    setIsModalOpen(true);
  };

  const handleConfirmarAbertura = async (dadosAdicionais) => {
    if (readOnlyMode) {
      setIsModalOpen(false);
      return;
    }
    setIsModalOpen(false);
    await handleAbrirOrdem({
      companyId,
      safra,
      talhaoIds: talhoesIds,
      talhoesNomes,
      rodadaOrigem,
      usuario,
      formDadosAdicionais: dadosAdicionais,
      selectedTalhoesData,
      reloadMapWithFilters,
      appliedFilters,
      onOrdemCorteLayerStale
    });
  };

  const onFecharClick = async () => {
    if (readOnlyMode) {
      return;
    }
    if (!vinculoAtivo) return;
    await handleFecharOrdem(vinculoAtivo.ordemCorteId, vinculoAtivo.ordemCodigo, talhoesIds, usuario, {
      reloadMapWithFilters,
      appliedFilters,
      onOrdemCorteLayerStale
    });
  };

  return (
    <div className="mt-4 flex flex-col gap-3">
      {vinculoAtivo && <OrdemCorteInfo vinculo={vinculoAtivo} />}

      {readOnlyMode && (
        <div className="rounded-2xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-3 text-sm font-semibold text-yellow-100">
        </div>
      )}

      {!readOnlyMode && (!vinculoAtivo || vinculoAtivo.status === ORDEM_CORTE_STATUS.FINALIZADA ? (
        <button
          onClick={onAbrirClick}
          disabled={isProcessing || talhoesIds.length === 0 || hasUnestimatedTalhao || hasClosedOrdem}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg ${
            (hasUnestimatedTalhao || hasClosedOrdem) ? 'bg-gray-600 hover:bg-gray-600' : 'bg-blue-500 hover:bg-blue-600'
          }`}
        >
          <Layers className="w-5 h-5" />
          <span>{hasClosedOrdem ? 'Ordem Fechada' : hasUnestimatedTalhao ? 'Estime para abrir Ordem' : 'Abrir Ordem de Corte'}</span>
        </button>
      ) : vinculoAtivo.status === ORDEM_CORTE_STATUS.ABERTA ? (
        <button
          onClick={onFecharClick}
          disabled={isProcessing || talhoesIds.length === 0}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-600 bg-red-500 text-white shadow-lg"
        >
          <Layers className="w-5 h-5" />
          <span>Fechar {talhoesIds.length > 1 ? `${talhoesIds.length} talhões da Ordem` : 'talhão da Ordem'}</span>
        </button>
      ) : null)}

      {isModalOpen && (
        <OrdemCorteFormModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onConfirm={handleConfirmarAbertura}
          talhoesCount={talhoesIds.length}
          companyId={companyId}
        />
      )}
    </div>
  );
};
