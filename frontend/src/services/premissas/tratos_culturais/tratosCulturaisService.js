import db from '../../localDb.js';
import { v4 as uuidv4 } from 'uuid';
import { logAuditoria } from '../../logService.js';
import { apiRequest } from '../../apiClient.js';

/**
 * Persistência do módulo Premissas > Tratos Culturais.
 * Produção usava PostgreSQL + Dexie. Na migração, mantemos o mesmo formato no Dexie,
 * mas quem alimenta/salva é o backend PostgreSQL.
 */

const MODULO_ID = 'tratos-culturais';

function safeCompanyId(companyId) {
    const raw = String(companyId || '').trim();
    if (!raw) return '';
    const normalized = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalized === '002' || normalized === '2' || normalized === 'usinacacu') return '002';
    if (normalized === '001' || normalized === '1' || normalized === 'agrosystem') return '001';
    return raw;
}

function toCanonicalCompanyId(companyId) {
    const raw = String(companyId || '').trim();
    const normalized = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalized === '002' || normalized === '2' || normalized === 'usinacacu') return '002';
    if (normalized === '001' || normalized === '1' || normalized === 'agrosystem') return '001';
    return raw;
}

function normalizeProtocolPayload(protocol, companyId) {
    const canonicalCompanyId = toCanonicalCompanyId(companyId || protocol.companyId);
    const raw = protocol.rawData || protocol;
    const nome = raw.nome || protocol.nome || protocol.name || 'Protocolo sem nome';
    return {
        ...raw,
        ...protocol,
        id: protocol.id || raw.id,
        companyId: canonicalCompanyId,
        moduloId: raw.moduloId || protocol.moduloId || MODULO_ID,
        nome,
        name: nome,
        observacoesTecnicas: raw.observacoesTecnicas || protocol.observacoesTecnicas || protocol.description || '',
        status: raw.status || protocol.status || 'ATIVO',
        subProtocolos: Array.isArray(raw.subProtocolos) ? raw.subProtocolos : Array.isArray(protocol.subProtocolos) ? protocol.subProtocolos : [],
        syncStatus: 'synced'
    };
}

function normalizeOperacaoRow(op, protocolo, index, companyId) {
    const canonicalCompanyId = toCanonicalCompanyId(companyId || protocolo.companyId);
    const nome = op.nome || op.operacaoNome || op.deOperacao || op.name || protocolo.nome;
    return {
        ...op,
        id: op.id || `${protocolo.id}_op_${index + 1}`,
        protocoloId: protocolo.id,
        protocoloNome: protocolo.nome,
        companyId: canonicalCompanyId,
        nome,
        label: nome,
        value: op.value || op.id || nome,
        ordem: Number(op.ordem || index + 1),
        status: op.status || 'ATIVO',
        syncStatus: 'synced'
    };
}

function normalizeItemRow(item, protocolo, index, companyId) {
    const canonicalCompanyId = toCanonicalCompanyId(companyId || protocolo.companyId);
    const subProtocolo = item.subProtocolo || item.subprotocolo || item.subProtocoloNome || 'Protocolo I';
    return {
        ...item,
        id: item.id || `${protocolo.id}_item_${index + 1}`,
        protocoloId: protocolo.id,
        protocoloNome: protocolo.nome,
        companyId: canonicalCompanyId,
        produtoId: item.produtoId || item.insumoId || item.inputId || '',
        insumoId: item.insumoId || item.produtoId || item.inputId || '',
        subProtocolo,
        ordem: Number(item.ordem || index + 1),
        status: item.status || 'ATIVO',
        syncStatus: 'synced'
    };
}

async function syncProtocolosFromApi(companyId) {
    const company = safeCompanyId(companyId);
    if (!company) return [];

    const response = await apiRequest(`/api/protocolos?companyId=${encodeURIComponent(company)}`);
    const protocolos = Array.isArray(response?.data) ? response.data : [];

    const protocoloRows = [];
    const operacoesRows = [];
    const itensRows = [];

    for (const protocolo of protocolos) {
        const normalized = normalizeProtocolPayload(protocolo, company);
        protocoloRows.push(normalized);

        const operacoes = Array.isArray(protocolo.protocoloOperacoes) ? protocolo.protocoloOperacoes : [];
        const itens = Array.isArray(protocolo.protocoloItens) ? protocolo.protocoloItens : [];

        operacoesRows.push(...operacoes.map((op, index) => normalizeOperacaoRow(op, normalized, index, company)));

        itensRows.push(...itens.map((item, index) => normalizeItemRow(item, normalized, index, company)));
    }

    if (protocoloRows.length) await db.protocolos.bulkPut(protocoloRows);

    for (const protocolo of protocoloRows) {
        const oldOps = await db.protocoloOperacoes.where('protocoloId').equals(protocolo.id).toArray();
        if (oldOps.length) await db.protocoloOperacoes.bulkDelete(oldOps.filter(o => o.syncStatus !== 'pending').map(o => o.id));

        const oldItens = await db.protocoloItens.where('protocoloId').equals(protocolo.id).toArray();
        if (oldItens.length) await db.protocoloItens.bulkDelete(oldItens.filter(i => i.syncStatus !== 'pending').map(i => i.id));
    }

    if (operacoesRows.length) await db.protocoloOperacoes.bulkPut(operacoesRows);
    if (itensRows.length) await db.protocoloItens.bulkPut(itensRows);

    return protocoloRows;
}

export const getProtocolos = async (companyId) => {
    try {
        const remote = await syncProtocolosFromApi(companyId);
        if (remote.length) return remote;
    } catch (error) {
        console.warn('[Protocolos] Falha ao ler PostgreSQL/API. Usando Dexie local.', error);
    }

    return await db.protocolos.where('companyId').equals(safeCompanyId(companyId)).toArray();
};

export const getProtocoloItens = async (protocoloId) => {
    const itens = await db.protocoloItens.where('protocoloId').equals(protocoloId).toArray();
    return itens.sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0));
};

export const getProtocoloOperacoes = async (protocoloId) => {
    const operacoes = await db.protocoloOperacoes.where('protocoloId').equals(protocoloId).toArray();
    return operacoes.sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0));
};

export const saveProtocolo = async (protocolo, operacoes, itens, usuarioId, companyId) => {
    const isNew = !protocolo.id;
    const protocoloId = isNew ? uuidv4() : protocolo.id;

    const payloadProtocolo = {
        ...protocolo,
        id: protocoloId,
        moduloId: MODULO_ID,
        companyId,
        status: protocolo.status || 'ATIVO',
        syncStatus: 'pending',
        updatedAt: new Date().toISOString(),
        updatedBy: usuarioId,
        protocoloOperacoes: operacoes || [],
        protocoloItens: itens || []
    };

    if (isNew) {
        payloadProtocolo.createdAt = new Date().toISOString();
        payloadProtocolo.createdBy = usuarioId;
    }

    await db.protocolos.put(payloadProtocolo);

    const oldOperacoes = await db.protocoloOperacoes.where('protocoloId').equals(protocoloId).toArray();
    if (oldOperacoes.length) await db.protocoloOperacoes.bulkDelete(oldOperacoes.map(o => o.id));

    const normalizedOps = (operacoes || []).map((op, index) => ({
        ...op,
        id: op.id || uuidv4(),
        protocoloId,
        protocoloNome: payloadProtocolo.nome,
        companyId,
        ordem: Number(op.ordem || index + 1),
        syncStatus: 'pending',
        status: op.status || 'ATIVO'
    }));

    if (normalizedOps.length) await db.protocoloOperacoes.bulkPut(normalizedOps);

    const oldItens = await db.protocoloItens.where('protocoloId').equals(protocoloId).toArray();
    if (oldItens.length) await db.protocoloItens.bulkDelete(oldItens.map(i => i.id));

    const normalizedItens = (itens || []).map((item, index) => ({
        ...item,
        id: item.id || uuidv4(),
        protocoloId,
        protocoloNome: payloadProtocolo.nome,
        subProtocolo: item.subProtocolo || 'Protocolo I',
        companyId,
        ordem: Number(item.ordem || index + 1),
        syncStatus: 'pending',
        status: item.status || 'ATIVO'
    }));

    if (normalizedItens.length) await db.protocoloItens.bulkPut(normalizedItens);

    try {
        const response = await apiRequest('/api/protocolos', {
            method: 'POST',
            body: JSON.stringify({
                ...payloadProtocolo,
                protocoloOperacoes: normalizedOps,
                protocoloItens: normalizedItens,
            })
        });

        const remote = response?.data;
        if (remote) {
            await db.protocolos.put({ ...payloadProtocolo, ...remote, syncStatus: 'synced' });
            await db.protocoloOperacoes.bulkPut(normalizedOps.map(op => ({ ...op, syncStatus: 'synced' })));
            await db.protocoloItens.bulkPut(normalizedItens.map(item => ({ ...item, syncStatus: 'synced' })));
        }
    } catch (error) {
        console.error('[Protocolos] Erro ao salvar no PostgreSQL/API', error);
        throw error;
    }

    await logAuditoria(
        'protocolos',
        protocoloId,
        isNew ? 'CREATE' : 'UPDATE',
        { diff: payloadProtocolo },
        usuarioId,
        companyId
    ).catch(() => {});

    return payloadProtocolo;
};

/**
 * Mantém compatibilidade com a produção: componentes ainda chamam subscribe,
 * mas na migração não usamos PostgreSQL realtime. Apenas atualizamos via API uma vez.
 */
export const subscribeToProtocolosRealtime = (companyId) => {
    syncProtocolosFromApi(companyId)
        .then(() => window.dispatchEvent(new CustomEvent('sync-completed')))
        .catch((error) => console.warn('[Protocolos] Falha ao sincronizar PostgreSQL/API:', error));

    return () => {};
};
