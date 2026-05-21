import express from 'express';
import { authenticateRequest } from '../middlewares/authMiddleware.js';
import { requireModuleAccess, requireWriteAccess, enforceCompanyScope, resolveScopedCompanyId } from '../middlewares/permissionMiddleware.js';
import {
  getDiretrizVinhacaPostgres,
  saveDiretrizVinhacaPostgres,
} from '../services/premissasPostgresService.js';

const router = express.Router();

router.use(authenticateRequest, requireModuleAccess('premissas'), enforceCompanyScope);

router.get('/', async (req, res) => {
  try {
    const companyId = resolveScopedCompanyId(req, req.query);
    const data = await getDiretrizVinhacaPostgres(companyId);
    res.json({ success: true, data });
  } catch (error) {
    console.error('[Premissas Tratos Vinhaça PostgreSQL] Erro ao carregar:', error);
    res.status(400).json({ success: false, message: error.message || 'Erro ao carregar diretriz de vinhaça.' });
  }
});

router.post('/', requireWriteAccess('premissas'), async (req, res) => {
  try {
    const companyId = resolveScopedCompanyId(req, req.body);
    const data = await saveDiretrizVinhacaPostgres(companyId, req.body, req.authUser.uid || req.authUser.id);
    res.json({ success: true, data });
  } catch (error) {
    console.error('[Premissas Tratos Vinhaça PostgreSQL] Erro ao salvar:', error);
    res.status(400).json({ success: false, message: error.message || 'Erro ao salvar diretriz de vinhaça.' });
  }
});

export default router;
