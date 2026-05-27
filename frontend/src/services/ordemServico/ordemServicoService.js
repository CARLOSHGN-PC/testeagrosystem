import { v4 as uuidv4 } from 'uuid';
import { ORDEM_SERVICO_STATUS } from './ordemServicoConstants';
import { saveOrdemServico, updateOrdemServico } from './ordemServicoRepository';
import { logAuditoria } from '../logService';
import db from '../localDb';
import { processQueue, enqueueTask } from '../syncService';
import { ORDEM_SERVICO_COLECOES } from './ordemServicoConstants';

/**
 * Cria uma nova Ordem de Serviço (Tratos Culturais).
 */
export const criarOrdemServico = async (
    companyId,
    safra,
    talhaoIds,
    talhoesNomes,
    selectedTalhoesData,
    operacao,
    protocoloOriginal,
    subProtocoloSelecionado,
    protocoloEditadoItens,
    custoTotalOriginal,
    custoTotalOS,
    isPendente,
    justificativaAprovacao,
    usuario
) => {
    try {
        const id = uuidv4();
        const createdAt = new Date().toISOString();

        // Verifica se houve alteração no protocolo
        let houveAlteracao = false;
        if (operacao && operacao.id && protocoloEditadoItens) {
            // Compara os itens originais com os editados
            // protocoloOriginal.itens (do banco localDb.protocoloItens) vs protocoloEditadoItens
            const originalItemsMap = new Map();
            const originalItens = await db.protocoloItens.where('protocoloId').equals(operacao.id).toArray();

            originalItens.forEach(item => originalItemsMap.set(item.id, item));

            if (originalItens.length !== protocoloEditadoItens.length) {
                houveAlteracao = true;
            } else {
                for (const itemEditado of protocoloEditadoItens) {
                    const itemOriginal = originalItemsMap.get(itemEditado.id);
                    if (!itemOriginal ||
                        String(itemOriginal.dosagem) !== String(itemEditado.dosagem) ||
                        itemOriginal.insumoId !== itemEditado.insumoId ||
                        itemOriginal.produtoId !== itemEditado.produtoId) {
                        houveAlteracao = true;
                        break;
                    }
                }
            }
        }

        const status = isPendente ? ORDEM_SERVICO_STATUS.PENDENTE_APROVACAO : ORDEM_SERVICO_STATUS.APROVADA;
        const requerAprovacaoGerencial = Boolean(isPendente);
        const usuarioNome = typeof usuario === 'string'
            ? usuario
            : usuario?.nome || usuario?.name || usuario?.displayName || usuario?.email || 'Sistema';
        const usuarioEmail = typeof usuario === 'object' ? (usuario?.email || '') : '';

        // Número sequencial da OS (buscar o maior do Dexie e somar 1)
        let maxSequencial = 0;
        const ordensExistentes = await db.ordensServico.where('[companyId+safra]').equals([companyId, safra]).toArray();
        if (ordensExistentes.length > 0) {
            maxSequencial = Math.max(...ordensExistentes.map(o => o.sequencial || 0));
        }
        const sequencial = maxSequencial + 1;
        const fazendasSelecionadas = new Map();
        const talhaoMetaMap = new Map();
        (selectedTalhoesData || []).forEach((talhao) => {
            const nomeTalhao = talhao?.nome || talhao?.talhao || talhao?.talhaoNome || '';
            const fazendaId = String(talhao?.fazendaId || talhao?.id_fazenda || '').trim();
            const fundoAgricola = talhao?.fundoAgricola || talhao?.fundo_agricola || talhao?.FUNDO_AGR || '';
            const fazendaDescricao = talhao?.fazendaDescricao || talhao?.fazenda || talhao?.fazendaNome || talhao?.nome_fazenda || '';
            const fazendaNome = buildFazendaDisplay(fundoAgricola, fazendaDescricao);
            const keyById = normalizeText(talhao?.id);
            const keyByNome = normalizeText(nomeTalhao);

            const metaTalhao = {
                fazendaId,
                id_fazenda: fazendaId,
                fazendaNome,
                nome_fazenda: fazendaNome,
                fundo_agricola: fundoAgricola,
                fazendaDescricao,
                talhaoNome: nomeTalhao
            };

            if (keyById) talhaoMetaMap.set(keyById, metaTalhao);
            if (keyByNome) talhaoMetaMap.set(keyByNome, metaTalhao);
            if (fazendaNome) {
                fazendasSelecionadas.set(normalizeText(fazendaNome), {
                    fazendaId,
                    fazendaNome,
                    nome_fazenda: fazendaNome,
                    fundo_agricola: fundoAgricola,
                    fazendaDescricao
                });
            }
        });

        const fazendasUnicas = Array.from(fazendasSelecionadas.values());
        const fazendaPrincipal = fazendasUnicas.length === 1
            ? fazendasUnicas[0]
            : { fazendaId: '', fazendaNome: '', nome_fazenda: '', fundo_agricola: '', fazendaDescricao: '' };

        const subProtocoloNomeResolvido = resolveSubProtocoloNome(
            subProtocoloSelecionado,
            protocoloEditadoItens,
            protocoloOriginal
        );

        // Ordem Mestre (Cabeçalho)
        const ordemMestre = {
            id,
            sequencial,
            companyId,
            safra,
            operacao: operacao || null,
            protocoloOriginalId: operacao?.id || null,
            protocoloId: protocoloOriginal?.id || protocoloOriginal?.value || null,
            subProtocolo: subProtocoloNomeResolvido || null,
            protocoloNome: subProtocoloNomeResolvido || protocoloOriginal?.label || protocoloOriginal?.value || null,
            houveAlteracao,
            protocoloEditado: protocoloEditadoItens, // Salva o snapshot dos itens para referência
            custoTotalOriginal,
            custoTotalOS,
            justificativaAprovacao,
            status,
            requerAprovacaoGerencial,
            passouPorAprovacaoGerencial: false,
            createdAt,
            createdBy: usuarioNome,
            createdByEmail: usuarioEmail,
            nomeColaborador: usuarioNome,
            solicitanteNome: usuarioNome,
            fazendaId: fazendaPrincipal.fazendaId,
            id_fazenda: fazendaPrincipal.fazendaId,
            fazendaNome: fazendaPrincipal.fazendaNome,
            nome_fazenda: fazendaPrincipal.nome_fazenda,
            fundoAgricola: fazendaPrincipal.fundo_agricola,
            fundo_agricola: fazendaPrincipal.fundo_agricola,
            fazendaDescricao: fazendaPrincipal.fazendaDescricao,
            fazendasNomes: fazendasUnicas.map((item) => item.fazendaNome).filter(Boolean),
            syncStatus: 'pending'
        };

        // Vínculos (Talhões da Ordem)
        const talhoesVinculos = talhaoIds.map((talhaoId, index) => ({
            ...(talhaoMetaMap.get(normalizeText(talhaoId)) || talhaoMetaMap.get(normalizeText(talhoesNomes[index])) || {}),
            id: uuidv4(),
            ordemServicoId: id,
            companyId,
            safra,
            talhaoId,
            talhaoNome: talhoesNomes[index] || talhaoId,
            status, // O Vínculo herda o status da Ordem
            createdAt,
            syncStatus: 'pending'
        }));

        await saveOrdemServico(ordemMestre, talhoesVinculos);

        // Auditoria
        await logAuditoria(
            'ordensServico',
            id,
            'CREATE',
            { diff: ordemMestre },
            usuario,
            companyId
        );

        return { success: true, codigo: sequencial, status };

    } catch (err) {
        console.error("Erro ao criar Ordem de Serviço:", err);
        return { success: false, message: err.message };
    }
};

const normalizeText = (value) => String(value ?? '').trim().toUpperCase();

const getText = (...values) => {
    for (const value of values) {
        if (value == null) continue;
        const text = String(value).trim();
        if (text) return text;
    }
    return '';
};

const buildFazendaDisplay = (fundoAgricola, fazendaDescricao) => {
    const fundo = getText(fundoAgricola);
    const descricao = getText(fazendaDescricao);
    if (fundo && descricao) return `${fundo} - ${descricao}`;
    return fundo || descricao || '';
};

const resolveFazendaNome = (fazenda) => buildFazendaDisplay(
    fazenda?.fundoAgricola || fazenda?.fundo_agricola || fazenda?.FUNDO_AGR || fazenda?.codFaz,
    fazenda?.desFazenda || fazenda?.nome || fazenda?.descricao || fazenda?.fazendaDescricao
);

/**
 * Corrige ordens de serviço já abertas que não possuem fazenda vinculada.
 * A rotina usa vínculos com talhões + cadastro de talhões/fazendas para identificar
 * a fazenda de forma automática e confiável.
 */
export const corrigirFazendaOrdensServicoAbertas = async (companyId, safra) => {
    if (!companyId || !safra) return { totalOrdensAtualizadas: 0, totalVinculosAtualizados: 0 };

    const ordensAbertas = await db.ordensServico
        .where('[companyId+safra]')
        .equals([companyId, safra])
        .filter((ordem) => ordem.status !== ORDEM_SERVICO_STATUS.EXECUTADA && ordem.status !== ORDEM_SERVICO_STATUS.CANCELADA)
        .toArray();

    const ordensSemFazenda = ordensAbertas.filter((ordem) => !String(ordem.fazendaNome || ordem.fazendaId || '').trim());
    if (!ordensSemFazenda.length) return { totalOrdensAtualizadas: 0, totalVinculosAtualizados: 0 };

    const [vinculosSafra, talhoes, fazendas] = await Promise.all([
        db.ordensServicoTalhoes.where('[companyId+safra]').equals([companyId, safra]).toArray(),
        db.talhoes.where('companyId').equals(companyId).toArray(),
        db.fazendas.where('companyId').equals(companyId).toArray()
    ]);

    const fazendaById = new Map(fazendas.map((f) => [String(f.id), f]));
    const talhaoById = new Map(talhoes.map((t) => [String(t.id), t]));
    const talhaoByNome = new Map();

    talhoes.forEach((talhao) => {
        const key = normalizeText(talhao.talhao || talhao.TALHAO);
        if (!key) return;
        const existing = talhaoByNome.get(key) || [];
        existing.push(talhao);
        talhaoByNome.set(key, existing);
    });

    let totalOrdensAtualizadas = 0;
    let totalVinculosAtualizados = 0;

    for (const ordem of ordensSemFazenda) {
        const vinculosDaOrdem = vinculosSafra.filter((v) => v.ordemServicoId === ordem.id);
        const fazendasDetectadas = new Map();

        for (const vinculo of vinculosDaOrdem) {
            let talhao = talhaoById.get(String(vinculo.talhaoId));

            if (!talhao) {
                const possiveis = talhaoByNome.get(normalizeText(vinculo.talhaoNome));
                if (possiveis?.length === 1) {
                    talhao = possiveis[0];
                }
            }

            const fazenda = talhao ? fazendaById.get(String(talhao.fazendaId)) : null;
            const fazendaNome = resolveFazendaNome(fazenda);

            if (fazenda && fazendaNome) {
                const fundoAgricola = getText(talhao?.fundo_agricola, talhao?.FUNDO_AGR, fazenda?.fundoAgricola, fazenda?.codFaz);
                const fazendaDescricao = getText(fazenda?.desFazenda, fazenda?.nome, vinculo?.fazendaDescricao, talhao?.fazenda, talhao?.FAZENDA);
                fazendasDetectadas.set(String(fazenda.id), {
                    fazendaId: String(fazenda.id),
                    fazendaNome,
                    nome_fazenda: fazendaNome,
                    fundo_agricola: fundoAgricola,
                    fazendaDescricao
                });

                if (!String(vinculo.fazendaId || vinculo.id_fazenda || vinculo.fazendaNome || vinculo.nome_fazenda || '').trim()) {
                    const vinculoAtualizado = {
                        ...vinculo,
                        fazendaId: String(fazenda.id),
                        id_fazenda: String(fazenda.id),
                        fazendaNome,
                        nome_fazenda: fazendaNome,
                        fundo_agricola: fundoAgricola,
                        fazendaDescricao,
                        updatedAt: new Date().toISOString(),
                        syncStatus: 'pending'
                    };
                    await db.ordensServicoTalhoes.put(vinculoAtualizado);
                    await enqueueTask('createOrUpdate', ORDEM_SERVICO_COLECOES.VINCULO, vinculo.id, vinculoAtualizado);
                    totalVinculosAtualizados += 1;
                }
            }
        }

        if (fazendasDetectadas.size === 1) {
            const unicaFazenda = Array.from(fazendasDetectadas.values())[0];
            const ordemAtualizada = {
                ...ordem,
                fazendaId: unicaFazenda.fazendaId,
                id_fazenda: unicaFazenda.fazendaId,
                fazendaNome: unicaFazenda.fazendaNome,
                nome_fazenda: unicaFazenda.nome_fazenda || unicaFazenda.fazendaNome,
                fundoAgricola: unicaFazenda.fundo_agricola || '',
                fundo_agricola: unicaFazenda.fundo_agricola || '',
                fazendaDescricao: unicaFazenda.fazendaDescricao || '',
                fazendasNomes: [unicaFazenda.fazendaNome],
                updatedAt: new Date().toISOString(),
                syncStatus: 'pending'
            };
            await db.ordensServico.put(ordemAtualizada);
            await enqueueTask('createOrUpdate', ORDEM_SERVICO_COLECOES.MESTRE, ordem.id, ordemAtualizada);
            totalOrdensAtualizadas += 1;
        }
    }

    if ((totalOrdensAtualizadas > 0 || totalVinculosAtualizados > 0) && navigator.onLine) {
        processQueue();
    }

    return { totalOrdensAtualizadas, totalVinculosAtualizados };
};

export const fecharOrdemServico = async (ordemServicoId, talhoesIdsDesejados, usuario) => {
    try {
        if (!talhoesIdsDesejados || talhoesIdsDesejados.length === 0) {
            return { success: false, message: "Nenhum talhão selecionado para fechar." };
        }

        const updatedAt = new Date().toISOString();

        // 1. Encontra todos os vínculos dessa ordem para os talhões selecionados
        const vinculos = await db.ordensServicoTalhoes
            .where('ordemServicoId')
            .equals(ordemServicoId)
            .toArray();

        const vinculosParaFechar = vinculos.filter(v => talhoesIdsDesejados.includes(v.talhaoId) && v.status !== ORDEM_SERVICO_STATUS.EXECUTADA);

        if (vinculosParaFechar.length === 0) {
            return { success: false, message: "Os talhões selecionados já estão fechados ou não pertencem a esta ordem." };
        }

        // 2. Atualiza os vínculos para EXECUTADA
        for (const v of vinculosParaFechar) {
            const vinculoPayload = {
                 ...v,
                 status: ORDEM_SERVICO_STATUS.EXECUTADA,
                 closedAt: updatedAt,
                 updatedAt,
                 syncStatus: 'pending'
            };
            await db.ordensServicoTalhoes.update(v.id, vinculoPayload);
            await enqueueTask('createOrUpdate', ORDEM_SERVICO_COLECOES.VINCULO, v.id, vinculoPayload);
        }

        // 3. Verifica se sobraram talhões abertos nessa ordem
        const vinculosAtualizados = await db.ordensServicoTalhoes
            .where('ordemServicoId')
            .equals(ordemServicoId)
            .toArray();

        const temAbertos = vinculosAtualizados.some(v => v.status !== ORDEM_SERVICO_STATUS.EXECUTADA && v.status !== ORDEM_SERVICO_STATUS.CANCELADA);

        // 4. Se não tem mais abertos, fecha a ordem mestre
        if (!temAbertos) {
            const ordemMestre = await db.ordensServico.get(ordemServicoId);
            if (ordemMestre) {
                const ordemPayload = {
                    ...ordemMestre,
                    status: ORDEM_SERVICO_STATUS.EXECUTADA,
                    closedAt: updatedAt,
                    updatedAt,
                    syncStatus: 'pending'
                };
                await db.ordensServico.update(ordemServicoId, ordemPayload);
                await enqueueTask('createOrUpdate', ORDEM_SERVICO_COLECOES.MESTRE, ordemServicoId, ordemPayload);
            }
        }

        if (navigator.onLine) {
            processQueue();
        }

        // Auditoria
        await logAuditoria(
            'ordensServico',
            ordemServicoId,
            'FECHAR_PARCIAL',
            { fechadosCount: vinculosParaFechar.length, temAbertos },
            usuario
        );

        return { success: true };
    } catch (err) {
        console.error("Falha ao fechar partes da Ordem de Servico:", err);
        return { success: false, message: "Erro fatal no serviço de Fechamento." };
    }
};


const UUID_LIKE_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuidLike = (value) => UUID_LIKE_REGEX.test(String(value ?? '').trim());

const resolveSubProtocoloNome = (subProtocoloSelecionado, protocoloEditadoItens = [], protocoloOriginal = null) => {
    const candidatos = [];

    const pushCandidato = (value) => {
        const text = String(value ?? '').trim();
        if (!text || isUuidLike(text)) return;
        candidatos.push(text);
    };

    pushCandidato(subProtocoloSelecionado?.label);
    pushCandidato(subProtocoloSelecionado?.value);
    pushCandidato(subProtocoloSelecionado);

    (Array.isArray(protocoloEditadoItens) ? protocoloEditadoItens : []).forEach((item) => {
        pushCandidato(item?.subProtocolo);
        pushCandidato(item?.subprotocolo);
        pushCandidato(item?.subProtocoloNome);
    });

    pushCandidato(protocoloOriginal?.subProtocolo);
    pushCandidato(protocoloOriginal?.subProtocoloNome);

    if (candidatos.length > 0) {
        return Array.from(new Set(candidatos))[0];
    }

    return 'Protocolo I';
};
