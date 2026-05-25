import express from 'express';
import { addMapRealtimeClient } from '../services/mapRealtimeService.js';
import { authenticateRequest } from '../middlewares/authMiddleware.js';
import { enforceCompanyScope, resolveScopedCompanyId } from '../middlewares/permissionMiddleware.js';
import { getOrdemCorteMapState } from '../services/mapLayerCacheService.js';

const router = express.Router();

// SSE leve para invalidar/recarregar camadas do mapa sem polling pesado.
// Não envia geometrias nem dados sensíveis; apenas avisa que a camada mudou.
router.get('/events', (req, res) => {
  addMapRealtimeClient(req, res);
});

// Estado enxuto/cacheado da camada de Ordem de Corte para o mapa.
// O front deixa de baixar e processar páginas grandes de ordens no React.
router.get('/ordem-corte-state', authenticateRequest, enforceCompanyScope, async (req, res) => {
  try {
    const companyId = resolveScopedCompanyId(req, req.query);
    const safra = req.query.safra || '';
    const result = await getOrdemCorteMapState(companyId, safra);
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Erro ao carregar estado do mapa.' });
  }
});

export default router;
