/**
 * ordemCorteSelectors.js
 *
 * Mantém a mesma regra visual usada em produção para pintar Ordem de Corte.
 * Importante: o mapa deve cruzar pelo talhaoId do GeoJSON/Mapbox. Não usamos
 * talhaoNome, fieldId ou outros aliases aqui, porque números pequenos de talhão
 * podem existir em várias fazendas e acabam pintando polígonos errados.
 */

import { ORDEM_CORTE_STATUS } from '../../../services/ordemCorte/ordemCorteConstants';

function normalizeStatus(status) {
    return String(status || '').toUpperCase().trim();
}

function normalizeTalhaoId(id) {
    if (id === undefined || id === null || id === '') return null;
    const text = String(id).trim();
    if (!text) return null;
    const numeric = Number(text);
    return Number.isFinite(numeric) ? numeric : text;
}

function idsTalhao(vinculo) {
    const id = normalizeTalhaoId(vinculo?.talhaoId);
    if (id === null) return [];
    const text = String(id).trim();
    const numeric = Number(text);
    const values = [id, text];
    if (Number.isFinite(numeric)) values.push(numeric);
    return [...new Set(values)];
}

function hasSameTalhaoId(vinculo, talhaoId) {
    const targetText = String(talhaoId ?? '').trim();
    const targetNumber = Number(targetText);
    return idsTalhao(vinculo).some((id) => {
        if (id === talhaoId) return true;
        if (String(id).trim() === targetText) return true;
        return Number.isFinite(targetNumber) && Number(id) === targetNumber;
    });
}

function uniqueTalhaoIds(vinculos) {
    const ids = [];
    vinculos.forEach((v) => ids.push(...idsTalhao(v)));
    return [...new Set(ids)];
}

function isAberta(status) {
    const value = normalizeStatus(status);
    return value === ORDEM_CORTE_STATUS.ABERTA || value === 'ABERTO' || value === 'OPEN';
}

function isAguardando(status) {
    const value = normalizeStatus(status);
    return value === ORDEM_CORTE_STATUS.AGUARDANDO || value === 'PENDENTE' || value === 'PENDENTE_APROVACAO';
}

function isFinalizada(status) {
    const value = normalizeStatus(status);
    return value === ORDEM_CORTE_STATUS.FINALIZADA || value === 'FECHADA' || value === 'FECHADO' || value === 'EXECUTADA';
}

function isAtiva(status) {
    return isAberta(status) || isAguardando(status) || ['RASCUNHO', 'APROVADA'].includes(normalizeStatus(status));
}

export const selecionarVinculoDoTalhao = (talhaoId, todosVinculosSafra) => {
    if (!todosVinculosSafra || !todosVinculosSafra.length) return null;

    const vinculosFiltrados = todosVinculosSafra.filter((v) => hasSameTalhaoId(v, talhaoId));

    const aberto = vinculosFiltrados.find((v) => isAtiva(v.status));
    if (aberto) return aberto;

    if (vinculosFiltrados.length > 0) {
        vinculosFiltrados.sort((a, b) => new Date(b.closedAt || b.updatedAt || 0) - new Date(a.closedAt || a.updatedAt || 0));
        return vinculosFiltrados[0];
    }

    return null;
};

export const selecionarIdsOcultosDaSafra = (todosVinculosSafra) => {
    if (!todosVinculosSafra || !todosVinculosSafra.length) return [];

    const fechados = todosVinculosSafra.filter((v) => isFinalizada(v.status));
    const ativos = todosVinculosSafra.filter((v) => isAtiva(v.status));
    const idsAtivos = new Set(uniqueTalhaoIds(ativos).map((id) => String(id).trim()));

    const exclusivosFechados = [];
    fechados.forEach((v) => {
        const ids = idsTalhao(v);
        const temAtivo = ids.some((id) => idsAtivos.has(String(id).trim()));
        if (!temAtivo) exclusivosFechados.push(...ids);
    });

    return [...new Set(exclusivosFechados)];
};

export const selecionarIdsAbertosDaSafra = (todosVinculosSafra) => {
    if (!todosVinculosSafra || !todosVinculosSafra.length) return [];
    return uniqueTalhaoIds(todosVinculosSafra.filter((v) => isAberta(v.status)));
};

export const selecionarIdsAguardandoDaSafra = (todosVinculosSafra) => {
    if (!todosVinculosSafra || !todosVinculosSafra.length) return [];
    return uniqueTalhaoIds(todosVinculosSafra.filter((v) => isAguardando(v.status)));
};

export const selecionarIdsAguardandoAnalistaDaSafra = (todosVinculosSafra) => {
    if (!todosVinculosSafra || !todosVinculosSafra.length) return [];
    return uniqueTalhaoIds(todosVinculosSafra.filter((v) => ['APROVADA', 'RASCUNHO'].includes(normalizeStatus(v.status))));
};

export const selecionarIdsAguardandoAprovacaoDaSafra = (todosVinculosSafra) => {
    if (!todosVinculosSafra || !todosVinculosSafra.length) return [];
    return uniqueTalhaoIds(todosVinculosSafra.filter((v) => normalizeStatus(v.status) === 'PENDENTE_APROVACAO'));
};
