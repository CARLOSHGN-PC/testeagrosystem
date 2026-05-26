import express from 'express';
import * as userController from '../controllers/userController.js';
import { authenticateRequest } from '../middlewares/authMiddleware.js';
import { requireRoles } from '../middlewares/roleMiddleware.js';
import { requireModuleAccess, requireWriteAccess } from '../middlewares/permissionMiddleware.js';

const router = express.Router();
router.use(authenticateRequest, requireRoles('super_admin', 'admin_empresa'), requireModuleAccess('gerenciamento_usuarios'));

router.get('/', userController.listUsers);
router.post('/', requireWriteAccess('gerenciamento_usuarios'), userController.createUser);
router.put('/:uid', requireWriteAccess('gerenciamento_usuarios'), userController.updateUser);
router.patch('/:uid/status', requireWriteAccess('gerenciamento_usuarios'), userController.updateUserStatus);
router.post('/:uid/reset-password', requireWriteAccess('gerenciamento_usuarios'), userController.resetPassword);

export default router;
