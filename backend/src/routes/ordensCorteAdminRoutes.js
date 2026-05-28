import express from 'express';
import { authenticateRequest } from '../middlewares/authMiddleware.js';
import { requireModuleAccess, enforceCompanyScope, resolveScopedCompanyId } from '../middlewares/permissionMiddleware.js';
import { listOrdensCortePaginadas, updateOrdemCortePostgres, fecharTalhoesOrdemCortePostgres, createOrUpdateOrdemCorteCompletaPostgres } from '../services/ordensCorteAdminService.js';
import { publishMapRealtimeEvent } from '../services/mapRealtimeService.js';
import { invalidateMapLayerCache } from '../services/mapLayerCacheService.js';
import { invalidateProjectedMapResponseCache } from './map/mapRoutes.js';

const router = express.Router();

router.use(authenticateRequest, requireModuleAccess('gerenciamento_ordem_corte'), enforceCompanyScope);

router.get('/', async (req, res) => {
  try {
    const companyId = resolveScopedCompanyId(req, req.query);
    const result = await listOrdensCortePaginadas(companyId, req.query.safra, {
      status: req.query.status,
      search: req.query.search,
      date: req.query.date,
      page: req.query.page,
      limit: req.query.limit
    });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Erro ao listar ordens de corte.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const data = await createOrUpdateOrdemCorteCompletaPostgres(req.body || {}, req.authUser);
    invalidateMapLayerCache({ companyId: data?.ordem?.companyId || req.authUser?.companyId, safra: data?.ordem?.safra });
    invalidateProjectedMapResponseCache({ companyId: data?.ordem?.companyId || req.authUser?.companyId });
    publishMapRealtimeEvent({
      type: 'ordem-corte-updated',
      action: 'abrir-ordem',
      companyId: data?.ordem?.companyId || req.authUser?.companyId,
      safra: data?.ordem?.safra,
      ordemCorteId: data?.ordem?.id,
      updatedAt: data?.ordem?.updatedAt || new Date().toISOString(),
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Erro ao abrir ordem de corte.' });
  }
});


router.post('/:id/fechar-talhoes', async (req, res) => {
  try {
    const talhoesIds = Array.isArray(req.body?.talhoesIds)
      ? req.body.talhoesIds
      : (Array.isArray(req.body?.talhaoIds) ? req.body.talhaoIds : []);
    const data = await fecharTalhoesOrdemCortePostgres(req.params.id, talhoesIds, req.authUser);
    invalidateMapLayerCache({ companyId: data?.ordem?.companyId || req.authUser?.companyId, safra: data?.ordem?.safra });
    invalidateProjectedMapResponseCache({ companyId: data?.ordem?.companyId || req.authUser?.companyId });
    publishMapRealtimeEvent({
      type: 'ordem-corte-updated',
      action: 'fechar-talhoes',
      companyId: data?.ordem?.companyId || req.authUser?.companyId,
      safra: data?.ordem?.safra,
      ordemCorteId: req.params.id,
      talhoesIds,
      updatedAt: data?.closedAt || new Date().toISOString(),
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Erro ao fechar talhões da ordem de corte.' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const data = await updateOrdemCortePostgres(req.params.id, req.body || {}, req.authUser);
    invalidateMapLayerCache({ companyId: data?.companyId || req.authUser?.companyId, safra: data?.safra });
    invalidateProjectedMapResponseCache({ companyId: data?.companyId || req.authUser?.companyId });
    publishMapRealtimeEvent({
      type: 'ordem-corte-updated',
      action: 'update-ordem',
      companyId: data?.companyId || req.authUser?.companyId,
      safra: data?.safra,
      ordemCorteId: req.params.id,
      updatedAt: data?.updatedAt || new Date().toISOString(),
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Erro ao atualizar ordem de corte.' });
  }
});

export default router;
