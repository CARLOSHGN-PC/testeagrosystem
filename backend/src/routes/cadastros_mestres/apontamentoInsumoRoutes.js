import express from 'express';
import { apontamentoInsumoController } from '../../controllers/cadastros_mestres/apontamentoInsumoController.js';
import { verifyAuth } from '../../middlewares/verifyAuth.js';

const router = express.Router();

// Aumentando o limite para garantir que um chunk considerável de JSON passe sem erro Payload Too Large
router.use(express.json({ limit: '10mb' }));

// Rota recebe um array de objetos (um lote da planilha) processado no cliente
router.post('/import-chunk', verifyAuth, apontamentoInsumoController.importChunk);

// Rota de utilitário para migração (rodar apenas uma vez para ajustar banco)
router.post('/migrar-datas', verifyAuth, apontamentoInsumoController.migrarDatasParaIso);

export default router;
