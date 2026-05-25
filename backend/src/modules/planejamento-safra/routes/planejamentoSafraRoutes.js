import { Router } from 'express';
import { previewPlanejamentoController, savePlanejamentoController } from '../controllers/planejamentoSafraController.js';
import { authenticateRequest } from '../../../middlewares/authMiddleware.js';

const router = Router();

router.post('/preview', authenticateRequest, previewPlanejamentoController);
router.post('/save', authenticateRequest, savePlanejamentoController);

export default router;
