import db from './localDb';

/**
 * mapProjectionService.js
 *
 * Serviço agregador responsável por montar a "Map Projection Layer".
 * Ele lê os dados locais já sincronizados no Dexie e consolida essas informações
 * em um registro único por talhão/feature.
 *
 * O objetivo é que, no futuro, os hooks do mapa (ex: useMapFilters) passem a ler
 * exclusivamente desta tabela em vez de cruzar `talhoes`, `estimativas`,
 * `ordensCorte`, `ordensServico`, `planejamentoSafra` dinamicamente no frontend.
 */

export const mapProjectionService = {
  /**
   * Reconstrói a projeção consolidada inteira do zero.
   * Utilizado nesta primeira fase para garantir segurança e consistência total.
   *
   * @param {string} companyId - ID da empresa
   * @param {string} safra - Safra atual (opcional, pode ser puxada das configurações ou passada)
   */
  async rebuildMapProjection(companyId, safra = new Date().getFullYear().toString()) {
    console.log(`[MapProjection] Iniciando reconstrução da projeção consolidada... Company: ${companyId}, Safra: ${safra}`);
    try {
      // 1. Limpar a store completamente para rebuild do zero (estratégia inicial)
      await db.mapProjection.clear();
      console.log(`[MapProjection] Tabela limpa com sucesso.`);

      // 2. Carregar dados brutos (O(1) lookups)
      // Buscamos apenas os talhoes desta empresa para reduzir consumo
      const talhoes = await db.talhoes.where('companyId').equals(companyId).toArray();
      const fazendas = await db.fazendas.where('companyId').equals(companyId).toArray();
      const estimativas = await db.estimativas.where('[companyId+safra]').equals([companyId, safra]).toArray();
      const planejamento = await db.planejamentoSafra.where('[companyId+safra]').equals([companyId, safra]).toArray();
      const ordensCorteTalhoes = await db.ordensCorteTalhoes.where('[companyId+safra]').equals([companyId, safra]).toArray();
      const ordensServicoTalhoes = await db.ordensServicoTalhoes.where('[companyId+safra]').equals([companyId, safra]).toArray();

      // Lookups em memória para acesso rápido
      const fazendaMap = new Map(fazendas.map(f => [f.id || f.codFaz, f]));
      const estimativaMap = new Map(estimativas.map(e => [e.talhaoId, e]));
      const planejamentoMap = new Map(planejamento.map(p => [p.talhaoId, p]));
      const ocTalhaoMap = new Map(ordensCorteTalhoes.map(oc => [oc.talhaoId, oc]));
      const osTalhaoMap = new Map(ordensServicoTalhoes.map(os => [os.talhaoId, os]));

      // 3. Montar projeção consolidada
      const projectionBatch = [];

      for (const t of talhoes) {
        const fazenda = fazendaMap.get(t.fazendaId) || {};
        const est = estimativaMap.get(t.id) || {};
        const plan = planejamentoMap.get(t.id) || {};
        const oc = ocTalhaoMap.get(t.id) || {};
        const os = osTalhaoMap.get(t.id) || {};

        // Normalização de chaves para compatibilidade com o GeoJSON (evitando erros de formatação)
        const codFazStr = String(fazenda.codFaz || t.fazendaId || '').replace(/\.0+$/, '').toUpperCase();
        const talhaoStr = String(t.talhao || t.id || '').replace(/\.0+$/, '').toUpperCase();

        const projectionRecord = {
          id: `${companyId}_${safra}_${t.id}`,
          talhaoId: t.id,
          featureId: `${codFazStr}_${talhaoStr}`, // Ex: chave única cruzável no Shapefile (FUNDO_AGR_TALHAO)
          safra: safra,
          companyId: companyId,
          codFaz: codFazStr,
          fazendaNome: fazenda.desFazenda || fazenda.nome || '',
          talhao: talhaoStr,
          variedade: t.variedade || '',
          corte: t.corte || 0,
          frente: est.frente || '',
          tipoPropriedade: fazenda.tipoPropriedade || '',
          estimado: est.estimado || 0,
          planejamentoStatus: plan.statusPlanejamento || '',
          sequenciaPlanejamento: plan.sequencia || null,
          ordemCorteStatus: oc.status || '',
          ordemServicoStatus: os.status || '',
          refPlanejada: t.REF_PLANEJADA || t.refPlanejada || '',
          vencContrato: t.VENC_CONTRATO || t.vencContrato || '',
          updatedAt: new Date().toISOString()
        };

        projectionBatch.push(projectionRecord);
      }

      // 4. Salvar tudo usando bulkPut
      if (projectionBatch.length > 0) {
        // Divide o batch se for muito grande
        const BATCH_SIZE = 500;
        for (let i = 0; i < projectionBatch.length; i += BATCH_SIZE) {
          const chunk = projectionBatch.slice(i, i + BATCH_SIZE);
          await db.mapProjection.bulkPut(chunk);
        }
        console.log(`[MapProjection] Projeção consolidada criada com ${projectionBatch.length} registros.`);
      } else {
        console.log(`[MapProjection] Nenhum talhão encontrado para gerar a projeção.`);
      }

    } catch (error) {
      console.error(`[MapProjection] Erro ao reconstruir a projeção:`, error);
    }
  }
};
