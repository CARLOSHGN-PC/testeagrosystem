import { Router } from 'express';
import Controller from '../controllers/RelatorioEstimativaController.js';
import { verifyAuth } from '../../../middlewares/verifyAuth.js';
import { enforceCompanyScope } from '../../../middlewares/permissionMiddleware.js';

const router = Router();

// Middleware de autenticação em todas as rotas (PostgreSQL Token)
router.use(verifyAuth, enforceCompanyScope);

/**
 * Endpoint de Consulta de Filtros Disponíveis
 */
router.get('/filtros', Controller.getFiltros);

/**
 * Endpoints Unificados de Relatórios (Gera JSON por Padrão ou o especificado no Body)
 * Ex: {"tipoRelatorio": "POR_CORTE", "formatoSaida": "JSON"}
 */
router.post('/por-corte', Controller.gerarRelatorio);
router.post('/por-fazenda-talhao', Controller.gerarRelatorio);

/**
 * Endpoints Exclusivos para Exportação (Apesar de post('/por-corte') suportar isso via formatoSaida, mantemos as rotas solicitadas)
 * Exige um JSON body com os filtros, forçará a saída pra PDF ou Excel independentemente
 */
router.post('/exportar/pdf', (req, res, next) => {
    req.body.formatoSaida = 'PDF';
    Controller.gerarRelatorio(req, res);
});

router.post('/exportar/excel', (req, res, next) => {
    req.body.formatoSaida = 'EXCEL';
    Controller.gerarRelatorio(req, res);
});

export default router;