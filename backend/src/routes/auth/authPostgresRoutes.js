import express from 'express';
import {
  loginPostgres,
  logoutPostgres,
  mePostgres,
  refreshPostgres,
} from '../../controllers/authPostgresController.js';
import { authenticateJwtRequest } from '../../middlewares/jwtAuthMiddleware.js';

const router = express.Router();

router.post('/login', loginPostgres);
router.post('/refresh', refreshPostgres);
router.post('/logout', logoutPostgres);
router.get('/me', authenticateJwtRequest, mePostgres);

export default router;
