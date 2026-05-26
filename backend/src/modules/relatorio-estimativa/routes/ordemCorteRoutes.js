import { Router } from 'express';
import Controller from '../controllers/OrdemCorteRelatorioController.js';
import { verifyAuth } from '../../../middlewares/verifyAuth.js';
import { enforceCompanyScope } from '../../../middlewares/permissionMiddleware.js';

const router = Router();

router.use(verifyAuth, enforceCompanyScope);

/**
 * Endpoint de Geração do PDF Operacional de Ordem de Corte
 * Rota que atende: /api/estimativas/:companyId/relatorios/ordem-corte/pdf
 */
router.get('/:companyId/relatorios/ordem-corte/pdf', Controller.gerarPdfOperacional);

export default router;