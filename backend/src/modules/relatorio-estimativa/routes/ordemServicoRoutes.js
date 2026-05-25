import { Router } from 'express';
import Controller from '../controllers/OrdemServicoRelatorioController.js';
import { verifyAuth } from '../../../middlewares/verifyAuth.js';
import { enforceCompanyScope } from '../../../middlewares/permissionMiddleware.js';

const router = Router();

router.use(verifyAuth, enforceCompanyScope);

router.get('/:companyId/relatorios/ordem-servico/pdf', Controller.gerarPdfComparativo);
router.post('/:companyId/relatorios/ordem-servico/pdf', Controller.gerarPdfComparativo);

export default router;
