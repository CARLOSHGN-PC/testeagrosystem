import ExcelJS from 'exceljs';

export const gerarRelatorioPorCorteExcel = async (data, filtros, res) => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AgroSystem';
    workbook.lastModifiedBy = 'AgroSystem';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Relatório por Corte');

    // Header do Relatório
    sheet.mergeCells('A1:I1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'Relatório de Estimativa x Reestimativa por Corte';
    titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D3748' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

    sheet.addRow([]);

    // Resumo
    const r = data.resumo;
    sheet.addRow(['Resumo da Safra']);
    sheet.getCell(`A${sheet.lastRow.number}`).font = { bold: true };

    sheet.addRow(['Estimativa']);
    sheet.getCell(`A${sheet.lastRow.number}`).font = { bold: true, color: { argb: 'FFE28743' } };
    sheet.addRow(['Área Estimada (ha)', r.areaEstimada]);
    sheet.addRow(['TCH Estimado', r.tchEstimado]);
    sheet.addRow(['TON Estimada', r.tonEstimada]);

    sheet.addRow([]);
    sheet.addRow(['Reestimativa']);
    sheet.getCell(`A${sheet.lastRow.number}`).font = { bold: true, color: { argb: 'FF219EBC' } };
    sheet.addRow(['Área Reestimada (ha)', r.areaReestimada]);
    sheet.addRow(['TCH Reestimado', r.tchReestimado]);
    sheet.addRow(['TON Reestimada', r.tonReestimada]);

    sheet.addRow([]);
    sheet.addRow(['Variação']);
    const corVar = r.variacaoTon < 0 ? 'FFE53E3E' : 'FF38A169';
    sheet.getCell(`A${sheet.lastRow.number}`).font = { bold: true, color: { argb: corVar } };
    sheet.addRow(['Variação TON', r.variacaoTon]);
    sheet.addRow(['Variação %', r.variacaoPercentual]);

    sheet.addRow([]);

    // Tabela
    const headers = ['Tipo Propriedade', 'Corte', 'Área Estimada', 'TON Estimada', 'Área Reestimada', 'TON Reestimada', 'Variação TON', 'Variação %'];
    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A5568' } };
    });

    data.grupos.forEach(grupo => {
        grupo.itens.forEach(item => {
            const row = sheet.addRow([
                grupo.tipoPropriedade,
                item.corte,
                item.areaEstimada,
                item.tonEstimada,
                item.areaReestimada,
                item.tonReestimada,
                item.variacaoTon,
                item.variacaoPercentual
            ]);

            // Destaca variação negativa
            if (item.variacaoTon < 0) {
                 row.getCell(7).font = { color: { argb: 'FFF56565' } };
                 row.getCell(8).font = { color: { argb: 'FFF56565' } };
            }
        });

        const st = grupo.subtotal;
        const subRow = sheet.addRow([
            `Subtotal: ${grupo.tipoPropriedade}`,
            '',
            st.areaEstimada,
            st.tonEstimada,
            st.areaReestimada,
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
        '',
        tg.areaEstimada,
        tg.tonEstimada,
        tg.areaReestimada,
        tg.tonReestimada,
        tg.variacaoTon,
        tg.variacaoPercentual
    ]);
    tgRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D3748' } };
    });

    // Formatação Numérica
    sheet.columns.forEach((column, index) => {
        if (index >= 2) {
             column.numFmt = '#,##0.00';
        }
        column.width = 15;
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=' + 'relatorio_estimativa_por_corte.xlsx');

    await workbook.xlsx.write(res);
    res.end();
};
