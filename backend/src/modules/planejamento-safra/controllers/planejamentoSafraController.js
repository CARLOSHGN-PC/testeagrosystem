import { previewPlanejamento, savePlanejamento } from '../services/planejamentoSafraBackendService.js';

export async function previewPlanejamentoController(req, res) {
  try {
    const data = await previewPlanejamento(req.body || {});
    res.json({ success: true, data });
  } catch (error) {
    console.error('[planejamentoSafra.preview]', error);
    res.status(400).json({ success: false, message: error.message || 'Erro ao calcular prévia do planejamento.' });
  }
}

export async function savePlanejamentoController(req, res) {
  try {
    const data = await savePlanejamento(req.body || {});
    res.json({ success: true, data });
  } catch (error) {
    console.error('[planejamentoSafra.save]', error);
    res.status(400).json({ success: false, message: error.message || 'Erro ao salvar planejamento.' });
  }
}
