import ExcelJS from 'exceljs';

export const gerarRelatorioPorFazendaTalhaoExcel = async (data, filtros, res) => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AgroSystem';
    workbook.lastModifiedBy = 'AgroSystem';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Fazenda x Talhão');

    // Header do Relatório
    sheet.mergeCells('A1:L1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'Relatório Analítico de Estimativa: Fazenda x Talhão';
    titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D3748' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

    sheet.addRow([]);

    // Resumo
    const r = data.resumo;
    sheet.addRow(['Resumo da Safra']);
    sheet.getCell(`A${sheet.lastRow.number}`).font = { bold: true };

    sheet.addRow(['Fazendas', r.fazendas]);
    sheet.addRow(['Talhões', r.talhoes]);
    sheet.addRow(['TON Estimada', r.tonEstimada]);
    sheet.addRow(['TON Reestimada', r.tonReestimada]);
    sheet.addRow(['Variação TON', r.variacaoTon]);
    sheet.addRow(['Variação %', r.variacaoPercentual]);

    sheet.addRow([]);

    // Tabela
    const headers = ['Fazenda', 'Talhão', 'Tipo', 'Corte', 'Variedade', 'Área', 'TCH Estimado', 'TON Estimada', 'TCH Reestimado', 'TON Reestimada', 'Variação TON', 'Variação %'];
    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A5568' } };
    });

    data.fazendas.forEach(fazenda => {
        const titleRow = sheet.addRow([`Fazenda: ${fazenda.fazendaNome}`]);
        titleRow.getCell(1).font = { bold: true };

        fazenda.itens.forEach(item => {
            const row = sheet.addRow([
                '',
                item.talhaoNome,
                item.tipoPropriedade,
                item.corte,
                item.variedade,
                item.areaEstimada,
                item.tchEstimado,
                item.tonEstimada,
                item.tchReestimado,
                item.tonReestimada,
                item.variacaoTon,
                item.variacaoPercentual
            ]);

            // Formatação de variação negativa
            if (item.variacaoTon < 0) {
                 row.getCell(11).font = { color: { argb: 'FFF56565' } };
                 row.getCell(12).font = { color: { argb: 'FFF56565' } };
            }
        });

        const st = fazenda.subtotal;
        const subRow = sheet.addRow([
            `Subtotal: ${fazenda.fazendaNome}`,
            '', '', '', '',
            st.areaEstimada,
            st.tchEstimado,
            st.tonEstimada,
            st.tchReestimado,
            st.tonReestimada,
            st.variacaoTon,
            st.variacaoPercentual
        ]);
        subRow.eachCell((cell) => {
            cell.font = { bold: true };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDF2F7' } };
        });
    });

    const tg = data.totalGeral;
    const tgRow = sheet.addRow([
        'TOTAL GERAL',
        '', '', '', '',
        tg.areaEstimada,
        tg.tchEstimado,
        tg.tonEstimada,
        tg.tchReestimado,
        tg.tonReestimada,
        tg.variacaoTon,
        tg.variacaoPercentual
    ]);
    tgRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D3748' } };
    });

    // Ajuste de largura e formatação numérica
    sheet.columns.forEach((column, index) => {
        if (index >= 5) { // Da área em diante
             column.numFmt = '#,##0.00';
        }
        column.width = 15;
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=' + 'relatorio_estimativa_por_fazenda_talhao.xlsx');

    await workbook.xlsx.write(res);
    res.end();
};