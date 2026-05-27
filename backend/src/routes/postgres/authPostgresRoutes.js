import express from 'express';
import {
  loginPostgres,
  mePostgres,
  refreshPostgres,
  logoutPostgres,
} from '../../controllers/postgres/authPostgresController.js';

const router = express.Router();

router.post('/login', loginPostgres);
router.get('/me', mePostgres);
router.post('/refresh', refreshPostgres);
router.post('/logout', logoutPostgres);

export default router;
