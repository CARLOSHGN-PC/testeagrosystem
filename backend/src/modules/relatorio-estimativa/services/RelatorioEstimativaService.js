import Repository from '../repositories/RelatorioEstimativaRepository.js';
import { agruparDados } from '../utils/agruparDados.js';
import { calcularTotais } from '../utils/calcularTotais.js';
import { TIPO_RELATORIO, FORMATO_SAIDA } from '../constants/relatorioEstimativaConstants.js';

// Geradores PDF
import { gerarRelatorioPorCortePdf } from '../templates/pdf/relatorioPorCortePdf.js';
import { gerarRelatorioPorFazendaTalhaoPdf } from '../templates/pdf/relatorioPorFazendaTalhaoPdf.js';

// Geradores Excel
import { gerarRelatorioPorCorteExcel } from '../templates/excel/relatorioPorCorteExcel.js';
import { gerarRelatorioPorFazendaTalhaoExcel } from '../templates/excel/relatorioPorFazendaTalhaoExcel.js';

class RelatorioEstimativaService {
    async processarRelatorio(filtros, res = null) {
        try {
            // 1. Busca os dados brutos
            const itensBrutos = await Repository.fetchEstimativas(filtros);

            if (!itensBrutos || itensBrutos.length === 0) {
                 return { error: 'Nenhum dado encontrado para os filtros informados.' };
            }

            // 2. Normaliza os dados para o padrão de cálculo
            const dadosNormalizados = this._normalizarDados(itensBrutos, filtros);

            // 3. Verifica o tipo de relatório e processa o agrupamento
            let resultadoFinal = {};
            if (filtros.tipoRelatorio === TIPO_RELATORIO.POR_CORTE) {
                resultadoFinal = this._processarPorCorte(dadosNormalizados);
            } else if (filtros.tipoRelatorio === TIPO_RELATORIO.POR_FAZENDA_TALHAO) {
                resultadoFinal = this._processarPorFazendaTalhao(dadosNormalizados);
            } else {
                return { error: 'Tipo de relatório não suportado.' };
            }

            // 4. Retorna JSON caso seja o formato solicitado, ou delega pra gerar arquivo (Streaming via res)
            if (filtros.formatoSaida === FORMATO_SAIDA.JSON) {
                 if (res) return res.status(200).json(resultadoFinal);
                 return { data: resultadoFinal };
            } else if (filtros.formatoSaida === FORMATO_SAIDA.PDF) {
                 if (!res) throw new Error('Response object required for PDF streaming');
                 res.setHeader('Content-Type', 'application/pdf');

                 if (filtros.tipoRelatorio === TIPO_RELATORIO.POR_CORTE) {
                     return gerarRelatorioPorCortePdf(resultadoFinal, filtros, res);
                 } else {
                     return gerarRelatorioPorFazendaTalhaoPdf(resultadoFinal, filtros, res);
                 }
            } else if (filtros.formatoSaida === FORMATO_SAIDA.EXCEL) {
                 if (!res) throw new Error('Response object required for Excel streaming');

                 if (filtros.tipoRelatorio === TIPO_RELATORIO.POR_CORTE) {
                     return gerarRelatorioPorCorteExcel(resultadoFinal, filtros, res);
                 } else {
                     return gerarRelatorioPorFazendaTalhaoExcel(resultadoFinal, filtros, res);
                 }
            }

            return { data: resultadoFinal };

        } catch (error) {
            console.error('Erro no RelatorioEstimativaService:', error);
            throw error;
        }
    }

    _normalizarDados(itensBrutos, filtros) {
        // Mapeia os dados do PostgreSQL/App para o padrão de cálculo do relatório
        return itensBrutos.map(item => {
            // No app, area, tch e toneladas podem vir como strings com vírgula (ex: "16,06" ou "1.234,56")
            const parseNumber = (val) => {
                if (!val) return 0;
                if (typeof val === 'number') return val;
                // Remove pontos (separador de milhar) e troca vírgula por ponto (decimal)
                return Number(String(val).replace(/\./g, '').replace(',', '.')) || 0;
            };

            const areaEst = parseNumber(item.area);

            // Simula a lógica de Estimativa vs Reestimativa (no app, as rodadas definem isso)
            const isReestimativa = (item.rodada && item.rodada !== 'Estimativa') || (item.rodadaKey && item.rodadaKey !== 'Estimativa');

            // Se o item tem 'rodadaKey' > 0 e for reestimativa, o TCH fica na reestimativa
            // Para simplificar o MVP, mapeamos propriedades diretas ou inferimos:
            let tchEst = 0;
            let tchReest = 0;
            let tonEst = 0;
            let tonReest = 0;

            const baseTch = parseNumber(item.tch);
            const baseTon = parseNumber(item.toneladas) || (areaEst * baseTch);

            if (isReestimativa) {
                tchReest = baseTch;
                tonReest = baseTon;
                // Como não temos o TCH original da estimativa na reestimativa diretamente no payload base,
                // no mundo ideal pegaríamos do histórico. Vamos assumir que a base é 0 ou igual pra não quebrar
                tchEst = parseNumber(item.tch_estimativa) || 0;
                tonEst = parseNumber(item.toneladas_estimativa) || (areaEst * tchEst);
            } else {
                tchEst = baseTch;
                tonEst = baseTon;
                tchReest = parseNumber(item.tch_reestimativa) || 0;
                tonReest = parseNumber(item.toneladas_reestimativa) || (areaEst * tchReest);
            }

            const varTon = tonReest - tonEst;
            const varPercent = tonEst > 0 ? (varTon / tonEst) * 100 : 0;

            return {
                id: item.id,
                tipoPropriedade: item.tipoPropriedade || 'PROPRIA',
                fazendaNome: item.fazenda || item.fazendaNome || 'N/A',
                fazendaId: item.fazendaId || item.fazenda,
                talhaoNome: item.talhao || item.talhaoId || 'N/A', // O talhão pode ser extraído do talhaoId se não existir
                talhaoId: item.talhaoId || item.talhao,
                corte: item.corte || item.ecorte || 1,
                variedade: item.variedade || 'N/A',
                areaEstimada: areaEst,
                tchEstimado: tchEst,
                tonEstimada: tonEst,
                areaReestimada: areaEst, // Área geralmente não muda na cana, mas pode no futuro
                tchReestimado: tchReest,
                tonReestimada: tonReest,
                variacaoTon: varTon,
                variacaoPercentual: varPercent,
                dataEstimativa: item.dataEstimativa || item.updatedAt || null,
                dataReestimativa: isReestimativa ? (item.dataReestimativa || item.updatedAt || null) : null,
                situacao: item.status || (isReestimativa ? 'REESTIMADO' : 'ESTIMADO')
            };
        });
    }

    _processarPorCorte(itens) {
        // Agrupa por Tipo Propriedade -> Corte
        const agruparPorTipoProp = (item) => item.tipoPropriedade;
        const gruposTipoProp = agruparDados(itens, agruparPorTipoProp);

        const gruposFinais = gruposTipoProp.map(grupo => {
            const agruparPorCorte = (i) => i.corte;
            const cortesAgrupados = agruparDados(grupo.itens, agruparPorCorte);

            // Itens da linha (cada corte)
            const itensLinha = cortesAgrupados.map(c => {
                 const totaisCorte = calcularTotais(c.itens);
                 return {
                     corte: c.chave,
                     ...totaisCorte
                 };
            });

            // Ordena por corte ASC
            itensLinha.sort((a, b) => Number(a.corte) - Number(b.corte));

            return {
                tipoPropriedade: grupo.chave,
                itens: itensLinha,
                subtotal: grupo.subtotal
            };
        });

        // Ordena grupos (ex: PROPRIA, PARCERIA, ARRENDADA)
        gruposFinais.sort((a, b) => a.tipoPropriedade.localeCompare(b.tipoPropriedade));

        const totalGeral = calcularTotais(itens);

        return {
            resumo: totalGeral, // No relatório de corte o resumo e total batem, ou pode ter infos adcs
            grupos: gruposFinais,
            totalGeral
        };
    }

    _processarPorFazendaTalhao(itens) {
        // Agrupa por Fazenda -> Talhões
        const agruparPorFazenda = (item) => `${item.fazendaId}|${item.fazendaNome}`;
        const gruposFazenda = agruparDados(itens, agruparPorFazenda);

        const fazendasFinais = gruposFazenda.map(grupo => {
            const [fazendaId, fazendaNome] = grupo.chave.split('|');

            // Ordenar talhões
            const itensTalhao = [...grupo.itens].sort((a, b) => String(a.talhaoNome).localeCompare(String(b.talhaoNome), 'pt-BR', { numeric: true }));

            return {
                fazendaId,
                fazendaNome,
                itens: itensTalhao,
                subtotal: grupo.subtotal
            };
        });

        // Ordena fazendas alfabeticamente
        fazendasFinais.sort((a, b) => a.fazendaNome.localeCompare(b.fazendaNome));

        const totalGeral = calcularTotais(itens);

        // Resumo customizado pro topo do fazenda/talhao
        const resumo = {
             fazendas: fazendasFinais.length,
             talhoes: itens.length,
             ...totalGeral
        };

        return {
            resumo,
            fazendas: fazendasFinais,
            totalGeral
        };
    }
}

export default new RelatorioEstimativaService();