import express from 'express';
import { estimativaController } from '../controllers/estimativaController.js';
import { verifyAuth } from '../middlewares/verifyAuth.js';

const router = express.Router();

router.use(express.json({ limit: '50mb' }));

router.post('/import-chunk', verifyAuth, estimativaController.importChunk);

export default router;
