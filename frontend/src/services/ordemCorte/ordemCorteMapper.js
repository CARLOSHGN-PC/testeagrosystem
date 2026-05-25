/**
 * ordemCorteMapper.js
 *
 * O que este bloco faz:
 * Monta e formata objetos Javascript que representam os registros de
 * Ordem de Corte (cabeçalho) e seus Vínculos (talhões), padronizando os nomes
 * dos campos antes de irem pro Dexie ou pro PostgreSQL.
 *
 * Por que ele existe:
 * Evitar "espalhar" a montagem de objetos nos controllers/services de UI. Se um
 * campo novo surgir no negócio, basta arrumar aqui.
 */

import { ORDEM_CORTE_STATUS } from './ordemCorteConstants';

/**
 * Cria payload para uma Nova Ordem de Corte.
 * @returns {Object} Payload formatado
 */
export const buildNovaOrdemCorte = ({
    companyId,
    safra,
    sequencial,
    codigoVisual,
    talhaoIds,
    talhoesNomes,
    rodadaOrigem,
    usuario,
    frenteServico,
    tipoCana,
    tipoColheita,
    matricula,
    nomeColaborador,
    fazendaId,
    fazendaNome,
    fundoAgricola,
    fazendaDescricao
}) => {
    const isoDate = new Date().toISOString();
    const ordemCorteId = `${companyId}_${safra.replace('/', '-')}_OC_${sequencial}`;

    return {
        id: ordemCorteId,
        companyId,
        safra,
        sequencial,
        codigo: codigoVisual,
        status: ORDEM_CORTE_STATUS.AGUARDANDO,
        numeroEmpresa: '',
        talhaoIds,
        talhoesNomes: talhoesNomes || [],
        rodadaOrigem,
        frenteServico: frenteServico || '',
        tipoCana: tipoCana || '',
        tipoColheita: tipoColheita || '',
        matricula: matricula || '',
        nomeColaborador: nomeColaborador || '',
        fazendaId: fazendaId || '',
        fazendaNome: fazendaNome || '',
        id_fazenda: fazendaId || '',
        nome_fazenda: fazendaNome || '',
        fundo_agricola: fundoAgricola || '',
        fazendaDescricao: fazendaDescricao || '',
        openedAt: isoDate,
        openedBy: usuario || 'Sistema',
        closedAt: null,
        closedBy: null,
        createdAt: isoDate,
        updatedAt: isoDate,
        syncStatus: 'pending' // Sinaliza offline-first
    };
};

/**
 * Cria payload para um Vínculo (Ordem x Talhão).
 * @returns {Object} Payload formatado
 */
export const buildVinculoOrdemTalhao = ({
    ordemBase,
    talhaoId,
    talhaoNome,
    fazendaId,
    fazendaNome,
    fundo_agricola,
    fazendaDescricao
}) => {
    const vinculoId = `${ordemBase.id}_${talhaoId}`;

    return {
        id: vinculoId,
        companyId: ordemBase.companyId,
        safra: ordemBase.safra,
        talhaoId: talhaoId,
        talhaoNome: talhaoNome || talhaoId,
        fazendaId: fazendaId || '',
        fazendaNome: fazendaNome || '',
        id_fazenda: fazendaId || '',
        nome_fazenda: fazendaNome || '',
        fundo_agricola: fundo_agricola || '',
        fazendaDescricao: fazendaDescricao || '',
        ordemCorteId: ordemBase.id,
        ordemCodigo: ordemBase.codigo,
        frenteServico: ordemBase.frenteServico || '',
        status: ORDEM_CORTE_STATUS.AGUARDANDO,
        rodadaOrigem: ordemBase.rodadaOrigem,
        openedAt: ordemBase.openedAt,
        closedAt: null,
        updatedAt: ordemBase.updatedAt,
        syncStatus: 'pending'
    };
};
