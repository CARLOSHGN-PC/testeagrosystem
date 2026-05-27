import PDFDocument from 'pdfkit';
import { addHeader } from './helpers/pdfHeader.js';
import { addFooter } from './helpers/pdfFooter.js';
import { drawTableRow } from './helpers/pdfTable.js';
import { formatarNumero } from '../../utils/formatarNumero.js';

export const gerarRelatorioPorCortePdf = (data, filtros, res) => {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            layout: 'landscape',
            bufferPages: true,
            margins: { top: 50, bottom: 50, left: 30, right: 30 }
        });

        // Pipe do PDF pra resposta HTTP direto
        doc.pipe(res);

        // Define Título
        const title = 'Relatório de Estimativa x Reestimativa por Corte';

        // Configuração de Página e Cabeçalho Inicial
        addHeader(doc, title, filtros, doc.page.width);

        // Desenhar Bloco de Resumo Topo
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#2d3748').text('Resumo da Safra', 30, doc.y + 20);
        doc.moveDown(0.5);

        const r = data.resumo;
        const yResumo = doc.y;

        // Estilo dos blocos de resumo
        const wBloco = 250;
        const hBloco = 60;

        // Bloco Estimativa (Laranja/Marrom)
        doc.rect(30, yResumo, wBloco, hBloco).fill('#e28743').stroke();
        doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text('ESTIMATIVA', 40, yResumo + 10);
        doc.font('Helvetica').text(`Área: ${formatarNumero(r.areaEstimada)} ha`, 40, yResumo + 25);
        doc.text(`TCH: ${formatarNumero(r.tchEstimado)} | TON: ${formatarNumero(r.tonEstimada)}`, 40, yResumo + 40);

        // Bloco Reestimativa (Azul/Verde)
        doc.rect(30 + wBloco + 10, yResumo, wBloco, hBloco).fill('#219ebc').stroke();
        doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text('REESTIMATIVA', 30 + wBloco + 20, yResumo + 10);
        doc.font('Helvetica').text(`Área: ${formatarNumero(r.areaReestimada)} ha`, 30 + wBloco + 20, yResumo + 25);
        doc.text(`TCH: ${formatarNumero(r.tchReestimado)} | TON: ${formatarNumero(r.tonReestimada)}`, 30 + wBloco + 20, yResumo + 40);

        // Bloco Variação (Destaque Vermelho/Verde)
        const corVar = r.variacaoTon < 0 ? '#e53e3e' : '#38a169';
        doc.rect(30 + (wBloco * 2) + 20, yResumo, wBloco, hBloco).fill(corVar).stroke();
        doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text('VARIAÇÃO', 30 + (wBloco * 2) + 30, yResumo + 10);
        doc.font('Helvetica').text(`Variação (TON): ${formatarNumero(r.variacaoTon)}`, 30 + (wBloco * 2) + 30, yResumo + 25);
        doc.text(`Variação (%): ${formatarNumero(r.variacaoPercentual)}%`, 30 + (wBloco * 2) + 30, yResumo + 40);

        doc.y = yResumo + hBloco + 30;

        // Tabela de Dados (Por Corte)
        const colunasWidth = [120, 80, 80, 100, 80, 80, 100, 80, 60];
        const headers = ['Tipo Propriedade', 'Corte', 'Área Est.', 'TON Est.', 'Área Reest.', 'TON Reest.', 'Var. TON', 'Var. %'];

        // Desenhar Cabeçalho Tabela
        drawTableRow(doc, doc.y, colunasWidth, headers, '#4a5568', '#ffffff', { isHeader: true });
        doc.y += 20;

        // Loop nos Grupos (Tipo Propriedade -> Cortes)
        data.grupos.forEach(grupo => {
            // Verifica quebra de página
            if (doc.y > doc.page.height - 100) {
                doc.addPage();
                addHeader(doc, title, filtros, doc.page.width);
                drawTableRow(doc, doc.y, colunasWidth, headers, '#4a5568', '#ffffff', { isHeader: true });
                doc.y += 20;
            }

            grupo.itens.forEach(item => {
                const row = [
                    grupo.tipoPropriedade,
                    item.corte,
                    formatarNumero(item.areaEstimada),
                    formatarNumero(item.tonEstimada),
                    formatarNumero(item.areaReestimada),
                    formatarNumero(item.tonReestimada),
                    formatarNumero(item.variacaoTon),
                    `${formatarNumero(item.variacaoPercentual)}%`
                ];

                // Destacar variação negativa
                const varColor = item.variacaoTon < 0 ? '#f56565' : '#1a202c';

                drawTableRow(doc, doc.y, colunasWidth, row, null, varColor);
                doc.y += 20;
            });

            // Subtotal do Grupo
            const st = grupo.subtotal;
            const subtotalRow = [
                `Subtotal: ${grupo.tipoPropriedade}`,
                '',
                formatarNumero(st.areaEstimada),
                formatarNumero(st.tonEstimada),
                formatarNumero(st.areaReestimada),
                formatarNumero(st.tonReestimada),
                formatarNumero(st.variacaoTon),
                `${formatarNumero(st.variacaoPercentual)}%`
            ];
            drawTableRow(doc, doc.y, colunasWidth, subtotalRow, '#edf2f7', '#1a202c', { isSubtotal: true });
            doc.y += 25;
        });

        // Total Geral
        const tg = data.totalGeral;
        const tgRow = [
            'TOTAL GERAL',
            '',
            formatarNumero(tg.areaEstimada),
            formatarNumero(tg.tonEstimada),
            formatarNumero(tg.areaReestimada),
            formatarNumero(tg.tonReestimada),
            formatarNumero(tg.variacaoTon),
            `${formatarNumero(tg.variacaoPercentual)}%`
        ];
        drawTableRow(doc, doc.y, colunasWidth, tgRow, '#2d3748', '#ffffff', { isTotal: true });

        // Finaliza o documento e adiciona rodapé em todas as páginas
        addFooter(doc, 0);
        doc.end();

        resolve();
    });
};
