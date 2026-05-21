import express from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { authenticateRequest } from '../middlewares/authMiddleware.js';
import { requireModuleAccess, requireWriteAccess, enforceCompanyScope, resolveScopedCompanyId } from '../middlewares/permissionMiddleware.js';
import { resolveCompanyIds, normalizeText } from '../controllers/postgres/postgresControllerUtils.js';

const router = express.Router();

router.use(authenticateRequest, requireModuleAccess('premissas'), enforceCompanyScope);

async function resolveCompanyIdOrThrow(companyRef) {
  const aliases = {
    '002': 'usinacacu',
    '2': 'usinacacu',
    '001': 'agro-system',
    '1': 'agro-system',
  };
  const raw = String(companyRef || '').trim();
  const candidate = aliases[normalizeText(raw)] || raw || 'usinacacu';
  const ids = await resolveCompanyIds(candidate);
  if (ids && ids.length > 0) return ids[0];
  throw new Error(`Empresa não encontrada: ${companyRef || 'vazio'}`);
}

function normalizeStatus(value) {
  return String(value || '').toUpperCase() === 'INATIVO' ? 'INATIVO' : 'ATIVO';
}

function normalizeProtocol(row) {
  const raw = row.rawData || {};
  const operacoes = Array.isArray(raw.protocoloOperacoes) ? raw.protocoloOperacoes : Array.isArray(raw.operacoes) ? raw.operacoes : [];
  let itens = Array.isArray(raw.protocoloItens) ? raw.protocoloItens : Array.isArray(raw.itens) ? raw.itens : [];
  if (!itens.length && Array.isArray(raw.subProtocolos)) {
    // Compatibilidade com documentos antigos que tinham só a capa e a lista de subProtocolos.
    itens = raw.subProtocolos.map((sub, index) => ({
      id: `${row.id}_sub_${index + 1}`,
      protocoloId: row.id,
      subProtocolo: sub || `Protocolo ${index + 1}`,
      ordem: index + 1,
      status: 'ATIVO',
    }));
  }

  return {
    ...raw,
    id: row.id,
    companyId: raw.companyId || row.companyId,
    moduloId: raw.moduloId || 'tratos-culturais',
    nome: raw.nome || row.name,
    observacoesTecnicas: raw.observacoesTecnicas || row.description || '',
    status: raw.status || row.status || 'ATIVO',
    syncStatus: 'synced',
    protocoloOperacoes: operacoes.map((item, index) => ({
      ...item,
      id: item.id || `${row.id}_op_${index + 1}`,
      protocoloId: row.id,
      protocoloNome: raw.nome || row.name,
      companyId: raw.companyId || row.companyId,
      ordem: Number(item.ordem || index + 1),
      status: item.status || 'ATIVO',
      syncStatus: 'synced',
    })),
    protocoloItens: itens.map((item, index) => ({
      ...item,
      id: item.id || `${row.id}_item_${index + 1}`,
      protocoloId: row.id,
      protocoloNome: raw.nome || row.name,
      companyId: raw.companyId || row.companyId,
      ordem: Number(item.ordem || index + 1),
      status: item.status || 'ATIVO',
      syncStatus: 'synced',
    })),
  };
}

router.get('/', async (req, res) => {
  try {
    const companyId = await resolveCompanyIdOrThrow(resolveScopedCompanyId(req, req.query));
    let rows = await prisma.protocol.findMany({
      where: { companyId },
      orderBy: [{ name: 'asc' }],
    });

    // Alguns protocolos antigos foram migrados com companyId original dentro do rawData.
    // Se a busca pelo ID interno não trouxer nada, faz fallback seguro filtrando em memória.
    if (!rows.length) {
      const allRows = await prisma.protocol.findMany({ orderBy: [{ name: 'asc' }] });
      const rawCompanyRef = String(resolveScopedCompanyId(req, req.query) || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      rows = allRows.filter((row) => {
        const rawRef = String(row.rawData?.companyId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return rawRef === rawCompanyRef || (rawCompanyRef === '002' && rawRef === 'usinacacu') || (rawCompanyRef === '001' && rawRef === 'agrosystem');
      });
    }

    res.json({
      success: true,
      total: rows.length,
      data: rows.map(normalizeProtocol),
    });
  } catch (error) {
    console.error('[Protocolos PostgreSQL] Erro ao carregar:', error);
    res.status(400).json({ success: false, message: error.message || 'Erro ao carregar protocolos.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await prisma.protocol.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ success: false, message: 'Protocolo não encontrado.' });
    res.json({ success: true, data: normalizeProtocol(row) });
  } catch (error) {
    console.error('[Protocolos PostgreSQL] Erro ao carregar protocolo:', error);
    res.status(400).json({ success: false, message: error.message || 'Erro ao carregar protocolo.' });
  }
});

router.post('/', requireWriteAccess('premissas'), async (req, res) => {
  try {
    const companyId = await resolveCompanyIdOrThrow(resolveScopedCompanyId(req, req.body));
    const payload = req.body || {};
    const id = payload.id || crypto.randomUUID();
    const name = String(payload.nome || payload.name || 'Protocolo sem nome').trim();
    const rawData = {
      ...payload,
      id,
      companyId: resolveScopedCompanyId(req, payload),
      nome: name,
      moduloId: payload.moduloId || 'tratos-culturais',
      status: payload.status || 'ATIVO',
      protocoloOperacoes: Array.isArray(payload.protocoloOperacoes) ? payload.protocoloOperacoes : Array.isArray(payload.operacoes) ? payload.operacoes : [],
      protocoloItens: Array.isArray(payload.protocoloItens) ? payload.protocoloItens : Array.isArray(payload.itens) ? payload.itens : [],
      updatedAt: new Date().toISOString(),
      updatedBy: req.authUser.uid || req.authUser.id,
    };

    const row = await prisma.protocol.upsert({
      where: { id },
      update: {
        companyId,
        name,
        description: payload.observacoesTecnicas || payload.description || null,
        status: normalizeStatus(payload.status),
        rawData,
      },
      create: {
        id,
        companyId,
        name,
        description: payload.observacoesTecnicas || payload.description || null,
        status: normalizeStatus(payload.status),
        rawData,
      },
    });

    res.json({ success: true, data: normalizeProtocol(row) });
  } catch (error) {
    console.error('[Protocolos PostgreSQL] Erro ao salvar:', error);
    res.status(400).json({ success: false, message: error.message || 'Erro ao salvar protocolo.' });
  }
});

export default router;
