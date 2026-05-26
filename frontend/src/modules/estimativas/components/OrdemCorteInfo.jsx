import React from 'react';
import { Layers } from 'lucide-react';
import { palette } from '../../../constants/theme';
import { OrdemCorteStatusBadge } from './OrdemCorteStatusBadge';
import { ORDEM_CORTE_STATUS } from '../../../services/ordemCorte/ordemCorteConstants';

/**
 * OrdemCorteInfo.jsx
 *
 * O que este bloco faz:
 * É um container visual que mostra o código e status da ordem do talhão selecionado.
 * Também alerta se a ordem está fechada e, portanto, se os dados podem estar ocultos.
 *
 * Por que ele existe:
 * Concentrar como os detalhes da "Ordem" são mostrados na tela. O Módulo de Estimativas
 * se importa em mostrar Estimativas. Este componente se importa em exibir as Ordens ativas
 * e deixar o código legível.
 */

export const OrdemCorteInfo = ({ vinculo }) => {
    if (!vinculo) return null;

    return (
        <div className="rounded-xl border p-3 flex flex-col gap-2 mt-3" style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-500/10 text-blue-400">
                        <Layers className="w-4 h-4" />
                    </div>
                    <div>
                        <div className="text-xs font-medium" style={{ color: palette.text2 }}>Ordem de Corte</div>
                        <div className="text-sm font-semibold text-white">#{vinculo.ordemCodigo}</div>
                    </div>
                </div>
                <OrdemCorteStatusBadge status={vinculo.status} />
            </div>

            {vinculo.status === ORDEM_CORTE_STATUS.FINALIZADA && (
                <div className="mt-1 text-[11px] bg-yellow-500/10 text-yellow-500 p-2 rounded border border-yellow-500/20">
                    Aviso: O talhão encontra-se oculto da safra vigente por pertencer a uma Ordem já encerrada.
                </div>
            )}
        </div>
    );
};
