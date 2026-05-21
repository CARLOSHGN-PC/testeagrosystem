import express from 'express';
import { verifyAuth } from '../middlewares/verifyAuth.js';
import { enforceCompanyScope } from '../middlewares/permissionMiddleware.js';
import { reestimativaRollbackController } from '../controllers/reestimativaRollbackController.js';

const router = express.Router();

router.use(express.json({ limit: '10mb' }));
router.use(verifyAuth, enforceCompanyScope);

router.post('/preview', reestimativaRollbackController.preview);
router.post('/apply', reestimativaRollbackController.apply);

export default router;
