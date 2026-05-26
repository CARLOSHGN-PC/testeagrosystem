import { useState } from 'react';
import Swal from 'sweetalert2';
import { abrirOrdemCorte, fecharOrdemCorte } from '../../services/ordemCorte/ordemCorteService';
import { showSuccess, showError } from '../../utils/alert';
import { palette } from '../../constants/theme';

/**
 * useOrdemCorteActions.js
 *
 * O que este bloco faz:
 * É um React Hook utilitário que lida com o "clique do usuário".
 * Exibe popups de confirmação, chama o Service que manipula o Banco, e emite erros amigáveis.
 *
 * Por que ele existe:
 * Evitar sujeira no arquivo de UI (OrdemCorteActions.jsx) com "Swal.fire" ou try/catch
 * complexos. Este Hook fornece funções limpas como "handleAbrir()" ou "handleFechar()".
 */

export const useOrdemCorteActions = () => {
    const [isProcessing, setIsProcessing] = useState(false);

    const handleAbrirOrdem = async ({ companyId, safra, talhaoIds, talhoesNomes, rodadaOrigem, usuario, formDadosAdicionais, selectedTalhoesData }) => {
        if (!talhaoIds || talhaoIds.length === 0) {
            showError("Atenção", "Selecione ao menos um talhão no mapa para abrir uma Ordem de Corte.");
            return false;
        }

        setIsProcessing(true);
        try {
            const result = await abrirOrdemCorte(companyId, safra, talhaoIds, talhoesNomes, rodadaOrigem, usuario, formDadosAdicionais, selectedTalhoesData);

            if (result.success) {
                showSuccess("Sucesso!", `Ordem de Corte ${result.codigo} aberta e salva offline.`);
                return true;
            } else {
                showError("Não foi possível abrir", result.message);
                return false;
            }
        } catch (err) {
            console.error(err);
            showError("Erro do Sistema", "Ocorreu um problema ao registrar a Ordem.");
            return false;
        } finally {
            setIsProcessing(false);
        }
    };

    const handleFecharOrdem = async (ordemCorteId, codigoVisual, talhoesIdsDesejados, usuario) => {
        const numTalhoes = talhoesIdsDesejados.length;
        if (numTalhoes === 0) {
            showError("Atenção", "Selecione ao menos um talhão da ordem para fechá-la.");
            return false;
        }

        const confirm = await Swal.fire({
            title: 'Fechar Ordem de Corte?',
            text: `Você está prestes a fechar ${numTalhoes} talhão(ões) da Ordem ${codigoVisual}. ${numTalhoes > 1 ? 'Eles ficarão ocultos' : 'Ele ficará oculto'} do mapa nesta safra.`,
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
             // Apenas chama o método do repo orquestrador passando os IDs desejados a fechar e o usuário autenticado
             const result = await fecharOrdemCorte(ordemCorteId, talhoesIdsDesejados, usuario);

             if (result.success) {
                 showSuccess("Ordem Atualizada!", `${numTalhoes} talhão(ões) da ordem ${codigoVisual} encerrado(s) com sucesso.`);
                 return true;
             } else {
                 showError("Falha ao fechar", result.message);
                 return false;
             }
        } catch (err) {
             console.error(err);
             showError("Erro do Sistema", "Ocorreu um problema ao fechar partes da Ordem.");
             return false;
        } finally {
             setIsProcessing(false);
        }
    };

    return {
        isProcessing,
        handleAbrirOrdem,
        handleFecharOrdem
    };
};
