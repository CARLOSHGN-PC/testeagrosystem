import { v4 as uuidv4 } from 'uuid';
import db from '../localDb';
import { postgresReadService, usePostgresReads } from '../postgresReadService';


const getNomeProtocolo = (protocolo) => {
  if (!protocolo) return null;
  // Origem correta: tabela `protocolos`, campo persistido `nome`.
  return protocolo.raw?.nome
    || protocolo.nome
    || protocolo.label
    || null;
};


export const PLANEJAMENTO_TRATOS_STATUS = {
  PLANEJADO: 'ABERTA',
  CANCELADO: 'CANCELADO'
};

export const PLANEJAMENTO_TRATOS_COLECOES = {
  MESTRE: 'planejamento_tratos',
  VINCULO: 'planejamento_tratos_talhoes'
};

export const criarPlanejamentoTratos = async ({
  companyId,
  safra,
  talhaoIds,
  talhoesNomes,
  operacao,
  protocoloOriginal,
  subProtocoloSelecionado = null,
  protocoloEditadoItens,
  custoTotalOriginal,
  custoTotalOS,
  justificativaAprovacao,
  usuario,
  selectedTalhoesData = []
}) => {
  if (!companyId || !safra) {
    return { success: false, message: 'Empresa e safra são obrigatórias para salvar o planejamento.' };
  }

  if (!Array.isArray(talhaoIds) || talhaoIds.length === 0) {
    return { success: false, message: 'Selecione ao menos um talhão para planejar.' };
  }

  try {
    const id = uuidv4();
    const createdAt = new Date().toISOString();
    const usuarioNome = typeof usuario === 'string'
      ? usuario
      : usuario?.nome || usuario?.name || usuario?.displayName || usuario?.email || 'Sistema';
    const usuarioEmail = typeof usuario === 'object' ? (usuario?.email || '') : '';

    const planejamentosExistentes = await db.planejamentoTratos
      .where('[companyId+safra]')
      .equals([companyId, safra])
      .toArray();

    const sequencial = (planejamentosExistentes.reduce((acc, item) => Math.max(acc, Number(item.sequencial) || 0), 0)) + 1;

    const fazendas = [...new Set((selectedTalhoesData || []).map(item => item?.fazenda).filter(Boolean))];

    const mestre = {
      id,
      sequencial,
      companyId,
      safra,
      status: PLANEJAMENTO_TRATOS_STATUS.PLANEJADO,
      operacao: operacao || null,
      protocoloOriginalId: protocoloOriginal?.value || protocoloOriginal?.id || protocoloOriginal?.raw?.id || null,
      protocoloNome: getNomeProtocolo(protocoloOriginal),
      subProtocolo: subProtocoloSelecionado || 'Protocolo I',
      protocoloEditado: protocoloEditadoItens || [],
      custoTotalOriginal: Number(custoTotalOriginal) || 0,
      custoTotalPlanejado: Number(custoTotalOS) || 0,
      justificativaApoio: justificativaAprovacao || null,
      totalTalhoes: talhaoIds.length,
      totalFazendas: fazendas.length,
      fazendas,
      createdAt,
      updatedAt: createdAt,
      createdBy: usuarioNome,
      createdByEmail: usuarioEmail,
      syncStatus: 'pending'
    };

    const vinculos = talhaoIds.map((talhaoId, index) => {
      const talhaoData = selectedTalhoesData.find(item => item.id === talhaoId) || {};
      return {
        id: uuidv4(),
        planejamentoId: id,
        companyId,
        safra,
        talhaoId,
        talhaoNome: talhoesNomes[index] || talhaoData.nome || talhaoId,
        fazenda: talhaoData.fazenda || '',
        corte: talhaoData.corte || '',
        area: Number(talhaoData.area) || 0,
        status: PLANEJAMENTO_TRATOS_STATUS.PLANEJADO,
        createdAt,
        updatedAt: createdAt,
        syncStatus: 'pending'
      };
    });

    await db.transaction('rw', db.planejamentoTratos, db.planejamentoTratosTalhoes, async () => {
      await db.planejamentoTratos.put(mestre);
      await db.planejamentoTratosTalhoes.bulkPut(vinculos);
    });

    if (usePostgresReads && navigator.onLine) {
      try {
        await postgresReadService.createPlanningTreatment({ mestre, vinculos });

        await db.transaction('rw', db.planejamentoTratos, db.planejamentoTratosTalhoes, async () => {
          await db.planejamentoTratos.update(mestre.id, { syncStatus: 'synced' });
          for (const vinculo of vinculos) {
            await db.planejamentoTratosTalhoes.update(vinculo.id, { syncStatus: 'synced' });
          }
        });
      } catch (error) {
        console.warn('[planejamentoTratos] salvo localmente; envio PostgreSQL falhou:', error?.message || error);
      }
    }

    return {
      success: true,
      codigo: sequencial,
      totalTalhoes: vinculos.length,
      totalFazendas: fazendas.length
    };
  } catch (error) {
    console.error('Erro ao criar planejamento de tratos:', error);
    return { success: false, message: error.message || 'Erro ao salvar planejamento de tratos.' };
  }
};
