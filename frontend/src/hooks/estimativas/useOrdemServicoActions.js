import { useState } from 'react';
import { showError, showSuccess } from '../../utils/alert';
import { criarOrdemServico, fecharOrdemServico } from '../../services/ordemServico/ordemServicoService';
import Swal from 'sweetalert2';
import { palette } from '../../constants/theme';

export const useOrdemServicoActions = () => {
    const [isProcessing, setIsProcessing] = useState(false);

    const handleAbrirOrdemServico = async ({ companyId, safra, talhaoIds, talhoesNomes, selectedTalhoesData, operacao, protocoloOriginal, subProtocoloSelecionado, protocoloEditadoItens, custoTotalOriginal, custoTotalOS, isPendente, justificativaAprovacao, usuario }) => {
        if (!talhaoIds || talhaoIds.length === 0) {
            showError("Atenção", "Selecione ao menos um talhão no mapa para abrir uma Ordem de Serviço.");
            return false;
        }

        setIsProcessing(true);
        try {
            const result = await criarOrdemServico(
                companyId,
                safra,
                talhaoIds,
                talhoesNomes,
                selectedTalhoesData,
                operacao,
                protocoloOriginal,
                subProtocoloSelecionado,
                protocoloEditadoItens,
                custoTotalOriginal,
                custoTotalOS,
                isPendente,
                justificativaAprovacao,
                usuario
            );

            if (result.success) {
                if (result.status === 'PENDENTE_APROVACAO') {
                    showSuccess(
                        "Enviado para Aprovação!",
                        `A Ordem de Serviço OS-${result.codigo} foi criada e está pendente de aprovação devido às alterações no protocolo.`
                    );
                } else {
                    showSuccess(
                        "Ordem Aberta!",
                        `A Ordem de Serviço OS-${result.codigo} foi criada e já ficou aprovada para o analista seguir com a abertura.`
                    );
                }
                return true;
            } else {
                showError("Não foi possível criar", result.message);
                return false;
            }
        } catch (error) {
            console.error(error);
            showError("Erro do Sistema", "Ocorreu um problema ao registrar a Ordem de Serviço.");
            return false;
        } finally {
            setIsProcessing(false);
        }
    };

    const handleFecharOrdemServico = async (ordemServicoId, sequencial, talhoesIdsDesejados, usuario) => {
        const numTalhoes = talhoesIdsDesejados.length;
        if (numTalhoes === 0) {
            showError("Atenção", "Selecione ao menos um talhão da Ordem de Serviço para fechá-la.");
            return false;
        }

        const confirm = await Swal.fire({
            title: 'Fechar Ordem de Serviço?',
            text: `Você está prestes a finalizar ${numTalhoes} talhão(ões) da OS-${sequencial}.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: palette.gold,
            cancelButtonColor: '#ef4444',
            confirmButtonText: 'Sim, Fechar',
            cancelButtonText: 'Cancelar',
            background: 'rgba(14,16,20,0.96)',
            color: palette.white
        });

        if (!confirm.isConfirmed) return false;

        setIsProcessing(true);
        try {
            const result = await fecharOrdemServico(ordemServicoId, talhoesIdsDesejados, usuario);

            if (result.success) {
                showSuccess("Ordem Executada!", `${numTalhoes} talhão(ões) da OS-${sequencial} executado(s) com sucesso.`);
                return true;
            } else {
                showError("Falha ao fechar", result.message);
                return false;
            }
        } catch (err) {
            console.error(err);
            showError("Erro do Sistema", "Ocorreu um problema ao fechar partes da Ordem de Serviço.");
            return false;
        } finally {
            setIsProcessing(false);
        }
    };

    return {
        isProcessing,
        handleAbrirOrdemServico,
        handleFecharOrdemServico
    };
};
