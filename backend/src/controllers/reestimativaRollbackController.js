import { previewReestimativaRollback, applyReestimativaRollback } from '../services/reestimativaRollbackService.js';

function handleError(res, error) {
  console.error('[reestimativaRollbackController]', error);
  return res.status(error.status || 400).json({
    success: false,
    message: error.message || 'Erro ao processar reversão de reestimativa.',
  });
}

export const reestimativaRollbackController = {
  async preview(req, res) {
    try {
      const result = await previewReestimativaRollback(req.body || {}, req);
      return res.json(result);
    } catch (error) {
      return handleError(res, error);
    }
  },

  async apply(req, res) {
    try {
      const result = await applyReestimativaRollback(req.body || {}, req);
      return res.json(result);
    } catch (error) {
      return handleError(res, error);
    }
  },
};
