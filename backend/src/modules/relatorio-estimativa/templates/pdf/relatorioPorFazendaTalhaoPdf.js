import PDFDocument from 'pdfkit';
import { addHeader } from './helpers/pdfHeader.js';
import { addFooter } from './helpers/pdfFooter.js';
import { drawTableRow } from './helpers/pdfTable.js';
import { formatarNumero } from '../../utils/formatarNumero.js';
import { formatarData } from '../../utils/formatarData.js';

export const gerarRelatorioPorFazendaTalhaoPdf = (data, filtros, res) => {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            layout: 'landscape',
            bufferPages: true,
            margins: { top: 50, bottom: 50, left: 30, right: 30 }
        });

        doc.pipe(res);

        const title = 'Relatório de Estimativa Analítico: Fazenda e Talhão';
        addHeader(doc, title, filtros, doc.page.width);

        // Bloco Resumo Topo
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#2d3748').text('Resumo da Safra', 30, doc.y + 20);
        doc.moveDown(0.5);

        const r = data.resumo;
        const yResumo = doc.y;

        const wBloco = 250;
        const hBloco = 60;

        // Estimativa (Laranja)
        doc.rect(30, yResumo, wBloco, hBloco).fill('#e28743').stroke();
        doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text('ESTIMATIVA', 40, yResumo + 10);
        doc.font('Helvetica').text(`Área: ${formatarNumero(r.areaEstimada)} ha`, 40, yResumo + 25);
        doc.text(`TCH: ${formatarNumero(r.tchEstimado)} | TON: ${formatarNumero(r.tonEstimada)}`, 40, yResumo + 40);

        // Reestimativa (Azul)
        doc.rect(30 + wBloco + 10, yResumo, wBloco, hBloco).fill('#219ebc').stroke();
        doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text('REESTIMATIVA', 30 + wBloco + 20, yResumo + 10);
        doc.font('Helvetica').text(`Área: ${formatarNumero(r.areaReestimada)} ha`, 30 + wBloco + 20, yResumo + 25);
        doc.text(`TCH: ${formatarNumero(r.tchReestimado)} | TON: ${formatarNumero(r.tonReestimada)}`, 30 + wBloco + 20, yResumo + 40);

        // Variação
        const corVar = r.variacaoTon < 0 ? '#e53e3e' : '#38a169';
        doc.rect(30 + (wBloco * 2) + 20, yResumo, wBloco, hBloco).fill(corVar).stroke();
        doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text('VARIAÇÃO', 30 + (wBloco * 2) + 30, yResumo + 10);
        doc.font('Helvetica').text(`Variação (TON): ${formatarNumero(r.variacaoTon)}`, 30 + (wBloco * 2) + 30, yResumo + 25);
        doc.text(`Variação (%): ${formatarNumero(r.variacaoPercentual)}%`, 30 + (wBloco * 2) + 30, yResumo + 40);

        doc.y = yResumo + hBloco + 30;

        // Tabela Analítica
        // Colunas: Fazenda, Talhão, Tipo, Corte, Var, Área, TCH Est, TON Est, TCH Reest, TON Reest, Var TON, Var %
        const colunasWidth = [90, 50, 60, 40, 60, 50, 50, 60, 50, 60, 50, 40];
        const headers = ['Fazenda', 'Talhão', 'Tipo', 'Cte', 'Var.', 'Área', 'TCH(E)', 'TON(E)', 'TCH(R)', 'TON(R)', 'Var(T)', 'Var(%)'];

        drawTableRow(doc, doc.y, colunasWidth, headers, '#4a5568', '#ffffff', { isHeader: true });
        doc.y += 20;

        data.fazendas.forEach(fazenda => {
            if (doc.y > doc.page.height - 100) {
                doc.addPage();
                addHeader(doc, title, filtros, doc.page.width);
                drawTableRow(doc, doc.y, colunasWidth, headers, '#4a5568', '#ffffff', { isHeader: true });
                doc.y += 20;
            }

            // Cabeçalho de Agrupamento Fazenda
            doc.font('Helvetica-Bold').fillColor('#2d3748').fontSize(10).text(`Fazenda: ${fazenda.fazendaNome}`, 35, doc.y + 5);
            doc.y += 20;

            fazenda.itens.forEach(item => {
                const row = [
                    '', // Fazenda nome já no agrupador
                    item.talhaoNome,
                    item.tipoPropriedade,
                    item.corte,
                    item.variedade,
                    formatarNumero(item.areaEstimada),
                    formatarNumero(item.tchEstimado),
                    formatarNumero(item.tonEstimada),
                    formatarNumero(item.tchReestimado),
                    formatarNumero(item.tonReestimada),
                    formatarNumero(item.variacaoTon),
                    `${formatarNumero(item.variacaoPercentual)}%`
                ];

                const textColor = item.variacaoTon < 0 ? '#f56565' : '#1a202c';
                drawTableRow(doc, doc.y, colunasWidth, row, null, textColor);
                doc.y += 20;

                if (doc.y > doc.page.height - 50) {
                    doc.addPage();
                    addHeader(doc, title, filtros, doc.page.width);
                    drawTableRow(doc, doc.y, colunasWidth, headers, '#4a5568', '#ffffff', { isHeader: true });
                    doc.y += 20;
                }
            });

            // Subtotal da Fazenda
            const st = fazenda.subtotal;
            const subtotalRow = [
                `Subtotal: ${fazenda.fazendaNome}`, '', '', '', '',
                formatarNumero(st.areaEstimada),
                formatarNumero(st.tchEstimado),
                formatarNumero(st.tonEstimada),
                formatarNumero(st.tchReestimado),
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
            'TOTAL GERAL', '', '', '', '',
            formatarNumero(tg.areaEstimada),
            formatarNumero(tg.tchEstimado),
            formatarNumero(tg.tonEstimada),
            formatarNumero(tg.tchReestimado),
            formatarNumero(tg.tonReestimada),
            formatarNumero(tg.variacaoTon),
            `${formatarNumero(tg.variacaoPercentual)}%`
        ];
        drawTableRow(doc, doc.y, colunasWidth, tgRow, '#2d3748', '#ffffff', { isTotal: true });

        addFooter(doc, 0);
        doc.end();
        resolve();
    });
};