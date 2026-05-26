import express from 'express';
import * as userController from '../controllers/userController.js';
import { authenticateRequest } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/change-password', authenticateRequest, userController.changeOwnPassword);

export default router;

