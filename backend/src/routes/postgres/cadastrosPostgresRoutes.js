import express from 'express';
import { authenticateRequest } from '../../middlewares/authMiddleware.js';
import { enforceCompanyScope, requireModuleAccess, requireWriteAccess } from '../../middlewares/permissionMiddleware.js';
import {
  listCadastro,
  saveCadastro,
  bulkSaveCadastro,
  inactivateCadastro,
} from '../../controllers/postgres/cadastrosPostgresController.js';

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ success: true, message: 'Rotas Cadastro Geral PostgreSQL ativas' });
});

router.use(authenticateRequest, requireModuleAccess('cadastros_mestres'), enforceCompanyScope);

router.get('/:resource', listCadastro);
router.post('/:resource/bulk', requireWriteAccess('cadastros_mestres'), bulkSaveCadastro);
router.post('/:resource', requireWriteAccess('cadastros_mestres'), saveCadastro);
router.put('/:resource/:id', requireWriteAccess('cadastros_mestres'), saveCadastro);
router.patch('/:resource/:id/inactivate', requireWriteAccess('cadastros_mestres'), inactivateCadastro);
router.delete('/:resource/:id', requireWriteAccess('cadastros_mestres'), inactivateCadastro);

export default router;
