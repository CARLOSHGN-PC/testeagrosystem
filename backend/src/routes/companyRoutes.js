import express from 'express';
import * as companyController from '../controllers/companyController.js';
import { authenticateRequest } from '../middlewares/authMiddleware.js';
import { requireRoles } from '../middlewares/roleMiddleware.js';
import { requireModuleAccess, requireWriteAccess } from '../middlewares/permissionMiddleware.js';

const router = express.Router();
router.use(authenticateRequest, requireRoles('super_admin', 'admin_empresa'), requireModuleAccess('configuracao_empresa'));


router.get('/', companyController.listCompanies);
router.post('/', requireWriteAccess('configuracao_empresa'), companyController.createCompany);
router.put('/:companyId', requireWriteAccess('configuracao_empresa'), companyController.updateCompany);
router.patch('/:companyId/status', requireWriteAccess('configuracao_empresa'), companyController.updateCompanyStatus);
router.patch('/:companyId/config', requireWriteAccess('configuracao_empresa'), companyController.updateCompanyConfig);
router.post('/:companyId/actions/fix-ordem-corte-fazenda', requireWriteAccess('configuracao_empresa'), companyController.runFixOrdemCorteFazendaBatch);

export default router;
