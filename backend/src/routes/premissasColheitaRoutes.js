import express from 'express';
import { authenticateRequest } from '../middlewares/authMiddleware.js';
import { requireModuleAccess, requireWriteAccess, enforceCompanyScope, resolveScopedCompanyId } from '../middlewares/permissionMiddleware.js';
import {
  getColheitaPremissasPostgres,
  saveColheitaPremissasPostgres,
} from '../services/premissasPostgresService.js';

const router = express.Router();

router.use(authenticateRequest, requireModuleAccess('premissas'), enforceCompanyScope);

router.get('/', async (req, res) => {
  try {
    const companyId = resolveScopedCompanyId(req, req.query);
    const data = await getColheitaPremissasPostgres(companyId);
    res.json({ success: true, data });
  } catch (error) {
    console.error('[Premissas Colheita PostgreSQL] Erro ao carregar:', error);
    res.status(400).json({ success: false, message: error.message || 'Erro ao carregar premissas de colheita.' });
  }
});

router.post('/', requireWriteAccess('premissas'), async (req, res) => {
  try {
    const companyId = resolveScopedCompanyId(req, req.body);
    const data = await saveColheitaPremissasPostgres(companyId, req.body, req.authUser.uid || req.authUser.id);
    res.json({ success: true, data });
  } catch (error) {
    console.error('[Premissas Colheita PostgreSQL] Erro ao salvar:', error);
    res.status(400).json({ success: false, message: error.message || 'Erro ao salvar premissas de colheita.' });
  }
});

export default router;
