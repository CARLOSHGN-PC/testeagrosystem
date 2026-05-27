export const drawTableRow = (doc, y, columnWidths, rowData, bgColor, textColor = '#1a202c', options = {}) => {
    const { isHeader = false, isSubtotal = false, isTotal = false } = options;
    const padding = 5;
    const margin = 30;

    // Desenha o background da linha se houver cor
    if (bgColor) {
        doc.rect(margin, y - padding, doc.page.width - margin * 2, 20).fill(bgColor);
    }

    // Configura a fonte para cabeçalho ou totais
    if (isHeader || isSubtotal || isTotal) {
        doc.font('Helvetica-Bold');
    } else {
        doc.font('Helvetica');
    }

    doc.fillColor(textColor);

    // Desenha os textos
    let currentX = margin + padding;
    rowData.forEach((data, index) => {
        const text = String(data);
        const width = columnWidths[index];
        // Alinhamento padrão: Primeira coluna esquerda, restante direita para números
        const align = index === 0 ? 'left' : 'right';

        doc.text(text, currentX, y, { width: width - padding * 2, align });
        currentX += width;
    });
};