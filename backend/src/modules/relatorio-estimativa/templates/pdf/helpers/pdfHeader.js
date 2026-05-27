export const addHeader = (doc, title, filters, docWidth) => {
    const margin = 30;

    // Configurações do cabeçalho
    doc.rect(margin, margin, docWidth - margin * 2, 70).fillAndStroke('#2d3748', '#1a202c');

    // Título do Sistema
    doc.fillColor('#e2e8f0').fontSize(14).text('AGROSYSTEM', margin + 10, margin + 10, { width: 200 });

    // Título do Relatório
    doc.fillColor('#f6e05e').fontSize(16).text(title, margin, margin + 30, { align: 'center', width: docWidth - margin * 2 });

    // Informações adicionais / Filtros resumidos
    const dataEmissao = new Date().toLocaleString('pt-BR');
    doc.fillColor('#cbd5e0').fontSize(9).text(`Emitido em: ${dataEmissao}`, docWidth - margin - 150, margin + 10, { align: 'right', width: 140 });

    doc.moveDown(2);
};
