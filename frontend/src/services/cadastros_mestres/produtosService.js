import db from '../localDb.js';
import { enqueueTask } from '../syncService.js';
import { v4 as uuidv4 } from 'uuid';
import { logAuditoria } from '../logService.js';

/**
 * @file produtosService.js
 * @description Lógica de negócios e persistência do Cadastro Mestre de Produtos.
 */

export const getProdutos = async (companyId) => {
    return await db.produtos.where('companyId').equals(companyId).toArray();
};

export const getCategorias = async (companyId) => {
    return await db.categoriasProduto.where('companyId').equals(companyId).toArray();
};

export const getUnidades = async (companyId) => {
    return await db.unidadesMedida.where('companyId').equals(companyId).toArray();
};

export const saveProduto = async (produto, usuarioId, companyId) => {
    const isNew = !produto.id;
    const id = isNew ? uuidv4() : produto.id;

    const payload = {
        ...produto,
        id,
        companyId,
        status: produto.status || 'ATIVO',
        syncStatus: 'pending',
        updatedAt: new Date().toISOString(),
        updatedBy: usuarioId
    };

    if (isNew) {
        payload.createdAt = new Date().toISOString();
        payload.createdBy = usuarioId;
    }

    // 1. Salvar no banco local (Dexie)
    await db.produtos.put(payload);

    // 2. Sincronizar na nuvem (PostgreSQL)
    await enqueueTask('createOrUpdate', 'produtos', id, payload);

    // 3. Auditoria
    await logAuditoria(
        'produtos',
        id,
        isNew ? 'CREATE' : 'UPDATE',
        { diff: payload },
        usuarioId,
        companyId
    );

    return payload;
};

export const inactivateProduto = async (id, usuarioId, companyId) => {
    const produto = await db.produtos.get(id);
    if (!produto) throw new Error('Produto não encontrado');

    const payload = {
        ...produto,
        status: 'INATIVO',
        syncStatus: 'pending',
        updatedAt: new Date().toISOString(),
        updatedBy: usuarioId
    };

    await db.produtos.put(payload);
    await enqueueTask('createOrUpdate', 'produtos', id, payload);

    await logAuditoria(
        'produtos',
        id,
        'INACTIVATE',
        { reason: 'User requested inactivation' },
        usuarioId,
        companyId
    );
};
