import express from 'express';
import { authenticateRequest } from '../middlewares/authMiddleware.js';
import { prisma } from '../lib/prisma.js';

const router = express.Router();
router.use(authenticateRequest);

const allowedRoles = new Set(['gestao', 'encarregado', 'admin', 'super_admin']);

function deny(res) {
  return res.status(403).json({ error: 'Sem permissão para este recurso.', code: 'FORBIDDEN' });
}

router.post('/', async (req, res) => {
  if (!allowedRoles.has(req.user?.role)) return deny(res);
  const { frente, fazenda, talhao, ponto_carregamento, tipo_rota, nome, observacao } = req.body || {};
  if (!frente || !fazenda || !tipo_rota || !nome) {
    return res.status(422).json({ error: 'Campos obrigatórios ausentes.', code: 'VALIDATION_ERROR' });
  }
  const data = await prisma.rotas_caminhoes.create({ data: { company_id: req.user.companyDbId, frente, fazenda, talhao, ponto_carregamento, tipo_rota, nome, observacao, criado_por: req.user.id } });
  return res.status(201).json({ data: { id: data.id, status: data.status }, message: 'ok' });
});

router.get('/', async (req, res) => {
  if (!allowedRoles.has(req.user?.role)) return deny(res);
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  const where = { company_id: req.user.companyDbId };
  if (req.query.frente) where.frente = req.query.frente;
  if (req.query.status) where.status = req.query.status;
  const [data, total] = await Promise.all([
    prisma.rotas_caminhoes.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { criado_em: 'desc' } }),
    prisma.rotas_caminhoes.count({ where }),
  ]);
  return res.json({ data, total, page, limit });
});

router.post('/:id/pontos/batch', async (req, res) => {
  if (!allowedRoles.has(req.user?.role)) return deny(res);
  const rota = await prisma.rotas_caminhoes.findFirst({ where: { id: req.params.id, company_id: req.user.companyDbId } });
  if (!rota) return res.status(404).json({ error: 'Rota não encontrada.', code: 'NOT_FOUND' });
  const pontos = Array.isArray(req.body?.pontos) ? req.body.pontos : [];
  await prisma.$transaction([
    prisma.pontos_rota_caminhoes.deleteMany({ where: { rota_id: req.params.id } }),
    prisma.pontos_rota_caminhoes.createMany({ data: pontos.map((p) => ({ rota_id: req.params.id, ordem: p.ordem, latitude: p.latitude, longitude: p.longitude, velocidade: p.velocidade, precisao: p.precisao })) }),
  ]);
  return res.json({ data: { total_pontos: pontos.length }, message: 'ok' });
});

router.post('/:id/avisos', async (req, res) => {
  if (!allowedRoles.has(req.user?.role)) return deny(res);
  const rota = await prisma.rotas_caminhoes.findFirst({ where: { id: req.params.id, company_id: req.user.companyDbId } });
  if (!rota) return res.status(404).json({ error: 'Rota não encontrada.', code: 'NOT_FOUND' });
  const { tipo_aviso, descricao, latitude, longitude, distancia_alerta_metros } = req.body || {};
  if (!tipo_aviso || latitude == null || longitude == null) return res.status(422).json({ error: 'Dados de aviso inválidos.', code: 'VALIDATION_ERROR' });
  const aviso = await prisma.avisos_rota_caminhoes.create({ data: { rota_id: req.params.id, tipo_aviso, descricao, latitude, longitude, distancia_alerta_metros } });
  return res.status(201).json({ data: { id: aviso.id }, message: 'ok' });
});

export default router;
