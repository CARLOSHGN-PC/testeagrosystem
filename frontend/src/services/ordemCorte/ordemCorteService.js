import * as repo from './ordemCorteRepository';
import { buildNovaOrdemCorte, buildVinculoOrdemTalhao } from './ordemCorteMapper';
import { validatePodeAbrirOrdem } from './ordemCorteRules';
import { formatarCodigoOrdem } from '../../modules/estimativas/utils/ordemCorteHelpers';
import { enqueueTask, processQueue } from '../syncService';
import db from '../localDb';
import { ORDEM_CORTE_COLECOES, ORDEM_CORTE_STATUS } from './ordemCorteConstants';
import { fetchLatestGeoJson } from '../storage';

/**
 * ordemCorteService.js
 *
 * O que este bloco faz:
 * Orquestra as ações de abrir e fechar ordem de corte.
 * Chama os validadores (`Rules`), o repositório (`Repository`) e o formatador (`Mapper`).
 * Retorna sucesso ou erro estruturado para a interface (UI).
 *
 * Por que ele existe:
 * Concentrar a "Receita de Bolo" num único Service que delega para as peças (Mapper, Rules, Repo).
 * Nenhuma regra UI (React) entra aqui, garantindo pureza da camada.
 */

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

export const abrirOrdemCorte = async (companyId, safra, talhaoIds, talhoesNomes, rodadaOrigem, usuario, formDadosAdicionais = {}, selectedTalhoesData = [], mapOptions = {}) => {
    try {
        // Passo 1: Puxa todos os vínculos existentes dessa safra para passar na validação de regras.
        // Precisamos saber se qualquer ID do array 'talhaoIds' já tem algo ABERTO.
        const todosVinculosSafra = await repo.getVinculosDaSafra(companyId, safra);

        // Passo 2: Validar!
        const isValid = validatePodeAbrirOrdem(talhaoIds, todosVinculosSafra);

        // Se a regra barrar (O conflictId seria o id que falhou na avaliação), jogamos o erro amigável.
        if (!isValid.canOpen) {
             return { success: false, message: `Um ou mais talhões selecionados já possuem uma Ordem de Corte ABERTA na Safra atual. Feche-as antes de criar novas.` };
        }

        // Passo 3: Criar sequencial. Se não houver, o DB diz que é 1.
        const sequencialNumber = await repo.getNextSequencialPorSafra(companyId, safra);
        const codigoFormatado = formatarCodigoOrdem(sequencialNumber);

        const talhaoMetaMap = new Map();
        const fazendasSelecionadas = new Map();
        (selectedTalhoesData || []).forEach((talhao) => {
            const keyById = normalizeText(talhao?.id);
            const keyByNome = normalizeText(talhao?.nome || talhao?.talhao || '');
            const fazendaId = talhao?.fazendaId || talhao?.id_fazenda || '';
            const fundoAgricola = talhao?.fundoAgricola || talhao?.fundo_agricola || talhao?.FUNDO_AGR || '';
            const fazendaDescricao = talhao?.fazendaDescricao || talhao?.fazenda || talhao?.fazendaNome || talhao?.nome_fazenda || '';
            const fazendaNome = buildFazendaDisplay(fundoAgricola, fazendaDescricao);

            if (keyById) talhaoMetaMap.set(keyById, { fazendaId, fazendaNome, fundo_agricola: fundoAgricola, fazendaDescricao });
            if (keyByNome) talhaoMetaMap.set(keyByNome, { fazendaId, fazendaNome, fundo_agricola: fundoAgricola, fazendaDescricao });
            if (fazendaNome) fazendasSelecionadas.set(normalizeText(fazendaNome), { fazendaId, fazendaNome, fundo_agricola: fundoAgricola, fazendaDescricao });
        });

        const fazendasUnicas = Array.from(fazendasSelecionadas.values());
        const fazendaPrincipal = fazendasUnicas.length === 1
            ? fazendasUnicas[0]
            : { fazendaId: '', fazendaNome: '', fundo_agricola: '', fazendaDescricao: '' };

        // Passo 4: Usa o Mapper para criar objetos perfeitos para salvar
        const payloadOrdem = buildNovaOrdemCorte({
            companyId,
            safra,
            sequencial: sequencialNumber,
            codigoVisual: codigoFormatado,
            talhaoIds,
            talhoesNomes,
            rodadaOrigem,
            usuario,
            frenteServico: formDadosAdicionais.frenteServico,
            tipoCana: formDadosAdicionais.tipoCana,
            tipoColheita: formDadosAdicionais.tipoColheita,
            matricula: formDadosAdicionais.matricula,
            nomeColaborador: formDadosAdicionais.nomeColaborador,
            fazendaId: fazendaPrincipal.fazendaId,
            fazendaNome: fazendaPrincipal.fazendaNome,
            fundoAgricola: fazendaPrincipal.fundo_agricola,
            fazendaDescricao: fazendaPrincipal.fazendaDescricao
        });

        // E constrói as filhas (Vínculos), que referenciam o pai.
        const payloadVinculos = talhaoIds.map((tId, index) => buildVinculoOrdemTalhao({
            ordemBase: payloadOrdem,
            talhaoId: tId,
            talhaoNome: talhoesNomes ? talhoesNomes[index] : null,
            ...(talhaoMetaMap.get(normalizeText(tId)) || talhaoMetaMap.get(normalizeText(talhoesNomes ? talhoesNomes[index] : '')) || {})
        }));

        // Passo 5: Online-first para camada de mapa via backend.
        if (navigator.onLine) {
            console.log("[ordemCorte][abrir] enviada ao backend", { ordemId: payloadOrdem.id, totalVinculos: payloadVinculos.length });
            const response = await repo.saveOrdemCorteOnlineFirst(payloadOrdem, payloadVinculos);
            console.log("[ordemCorte][abrir] backend salvou", response);
            console.log("[ordemCorte][map reload] activeMapModule", "ordemCorte");
            await fetchLatestGeoJson(companyId, null, {
                filters: mapOptions?.appliedFilters || null,
                activeMapModule: 'ordemCorte',
                safra,
                forceRemote: true,
                forceRefresh: true,
                cacheBust: Date.now()
            });
        } else {
            await repo.saveOrdemCorteAndVinculos(payloadOrdem, payloadVinculos);
        }

        return { success: true, codigo: codigoFormatado };

    } catch (err) {
        console.error("Falha orquestrando abertura de Ordem:", err);
        return { success: false, message: "Erro fatal no serviço de Abertura de Ordem de Corte." };
    }
};

/**
 * Corrige solicitações (ordens de corte) sem fazenda vinculada usando o ID do sistema.
 * Fluxo: ID da ordem -> vínculos da ordem -> talhão -> fazenda.
 */
export const corrigirFazendaSolicitacoesOrdemCorte = async (companyId, safra) => {
    if (!companyId || !safra) return { totalOrdensAtualizadas: 0, totalVinculosAtualizados: 0 };

    const ordensAbertas = await db.ordensCorte
        .where('[companyId+safra]')
        .equals([companyId, safra])
        .filter((ordem) => ordem.status !== ORDEM_CORTE_STATUS.FINALIZADA)
        .toArray();

    const ordensSemFazenda = ordensAbertas.filter((ordem) => !String(ordem.id_fazenda || ordem.fazendaId || ordem.nome_fazenda || ordem.fazendaNome || '').trim());
    if (!ordensSemFazenda.length) return { totalOrdensAtualizadas: 0, totalVinculosAtualizados: 0 };

    const [vinculosSafra, talhoes, fazendas] = await Promise.all([
        db.ordensCorteTalhoes.where('[companyId+safra]').equals([companyId, safra]).toArray(),
        db.talhoes.where('companyId').equals(companyId).toArray(),
        db.fazendas.where('companyId').equals(companyId).toArray()
    ]);

    const fazendaById = new Map(fazendas.map((f) => [String(f.id), f]));
    const talhaoById = new Map(talhoes.map((t) => [String(t.id), t]));
    const talhaoByNome = new Map();

    talhoes.forEach((talhao) => {
        const key = normalizeText(talhao.talhao || talhao.TALHAO);
        if (!key) return;
        const list = talhaoByNome.get(key) || [];
        list.push(talhao);
        talhaoByNome.set(key, list);
    });

    let totalOrdensAtualizadas = 0;
    let totalVinculosAtualizados = 0;

    for (const ordem of ordensSemFazenda) {
        const ordemId = ordem.id; // ID do sistema
        const vinculosDaOrdem = vinculosSafra.filter((v) => v.ordemCorteId === ordemId);
        const fazendasDetectadas = new Map();

        for (const vinculo of vinculosDaOrdem) {
            let talhao = talhaoById.get(String(vinculo.talhaoId));
            if (!talhao) {
                const candidates = talhaoByNome.get(normalizeText(vinculo.talhaoNome));
                if (candidates?.length === 1) talhao = candidates[0];
            }

            const fazenda = talhao ? fazendaById.get(String(talhao.fazendaId)) : null;
            const fazendaNome = resolveFazendaNome(fazenda);
            if (!fazenda || !fazendaNome) continue;

            const fundoAgricola = getText(talhao?.fundo_agricola, talhao?.FUNDO_AGR, fazenda?.fundoAgricola, fazenda?.codFaz);
            const fazendaDescricao = getText(fazenda?.desFazenda, fazenda?.nome, vinculo?.fazendaDescricao, talhao?.fazenda, talhao?.FAZENDA);
            fazendasDetectadas.set(String(fazenda.id), { fazendaId: String(fazenda.id), fazendaNome, fundo_agricola: fundoAgricola, fazendaDescricao });

            if (!String(vinculo.id_fazenda || vinculo.fazendaId || vinculo.nome_fazenda || vinculo.fazendaNome || '').trim()) {
                const updatedAt = new Date().toISOString();
                const payloadVinculo = {
                    ...vinculo,
                    fazendaId: String(fazenda.id),
                    fazendaNome,
                    id_fazenda: String(fazenda.id),
                    nome_fazenda: fazendaNome,
                    fundo_agricola: fundoAgricola,
                    fazendaDescricao,
                    updatedAt,
                    syncStatus: 'pending'
                };
                await db.ordensCorteTalhoes.put(payloadVinculo);
                await enqueueTask('createOrUpdate', ORDEM_CORTE_COLECOES.VINCULO, vinculo.id, payloadVinculo);
                totalVinculosAtualizados += 1;
            }
        }

        if (fazendasDetectadas.size === 1) {
            const unica = Array.from(fazendasDetectadas.values())[0];
            const updatedAt = new Date().toISOString();
            const payloadOrdem = {
                ...ordem,
                fazendaId: unica.fazendaId,
                fazendaNome: unica.fazendaNome,
                id_fazenda: unica.fazendaId,
                nome_fazenda: unica.fazendaNome,
                fundo_agricola: unica.fundo_agricola || '',
                fazendaDescricao: unica.fazendaDescricao || '',
                updatedAt,
                syncStatus: 'pending'
            };
            await db.ordensCorte.put(payloadOrdem);
            await enqueueTask('createOrUpdate', ORDEM_CORTE_COLECOES.MESTRE, ordemId, payloadOrdem);
            totalOrdensAtualizadas += 1;
        }
    }

    if ((totalOrdensAtualizadas > 0 || totalVinculosAtualizados > 0) && navigator.onLine) {
        processQueue();
    }

    return { totalOrdensAtualizadas, totalVinculosAtualizados };
};

export const editarOrdemCorte = async (ordemCorteId, dados) => {
    try {
        const ordemAtualizada = await repo.updateOrdemCorte(ordemCorteId, dados);

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('ordem-corte-atualizada', { detail: { ordemCorteId, dados, ordem: ordemAtualizada } }));
        }

        if (navigator.onLine) {
            processQueue();
        }

        return { success: true };
    } catch (err) {
        console.error("Falha editando a Ordem de Corte:", err);
        return { success: false, message: "Erro fatal ao editar Ordem de Corte." };
    }
};

export const fecharOrdemCorte = async (ordemCorteId, talhoesIdsDesejados, usuario) => {
    try {
        if (!talhoesIdsDesejados || talhoesIdsDesejados.length === 0) {
            return { success: false, message: "Nenhum talhão selecionado para fechar." };
        }

        // O repositório lida com buscar os detalhes, filtrar os que vão fechar e checar se deve fechar o mestre.
        await repo.fecharOrdemCorte(ordemCorteId, talhoesIdsDesejados, usuario);

        // Garante que a fila do background inicie imediatamente após o repository confirmar o enfileiramento (enqueueTask)
        if (navigator.onLine) {
            processQueue();
        }

        return { success: true };
    } catch (err) {
        console.error("Falha orquestrando fechamento de Ordem:", err);
        return { success: false, message: "Erro fatal no serviço de Fechar Ordem de Corte." };
    }
};
