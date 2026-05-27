import PDFDocument from 'pdfkit';

const parseNumber = (value) => {
  const n = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const formatNumber = (value, digits = 2) => parseNumber(value).toFixed(digits);

const cleanText = (value, fallback = '-') => {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text || fallback;
};

const normalizeTipoCorte = (value) => cleanText(value, 'CRUA').toUpperCase();

const textSafe = (doc, text, x, y, options = {}) => {
  doc.text(cleanText(text, ''), x, y, options);
};

const drawLabelValue = (doc, label, value, x, y, width, options = {}) => {
  const fontSize = options.fontSize || 9;
  const labelText = `${label}: `;
  doc.font('Helvetica-Bold').fontSize(fontSize).fillColor('#000000');
  const labelWidth = doc.widthOfString(labelText);
  doc.text(labelText, x, y, { width: labelWidth, continued: true });
  doc.font('Helvetica').fontSize(fontSize).fillColor('#000000');
  doc.text(cleanText(value, ''), { width: Math.max(width - labelWidth, 20), continued: false });
};

const resolveTalhaoLabel = (t = {}) => {
  // Ordem proposital: primeiro campos de nome/número real do talhão.
  // NÃO usa talhaoId/id interno como fallback para evitar imprimir UUID/documentId no PDF.
  return cleanText(
    t.talhaoNome ??
      t.talhaoNumero ??
      t.numeroTalhao ??
      t.nomeTalhao ??
      t.codigoTalhao ??
      t.talhao ??
      t.TALHAO,
    '-'
  );
};

/**
 * Gera o PDF operacional da Ordem de Corte.
 * Refatoração real do layout: posições fixas e alturas controladas para não sobrepor cabeçalho/tabela.
 */
export function gerarPdfOrdemCorte(reportData, res) {
  const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
  doc.pipe(res);

  const left = 70;
  const right = 525;
  const width = right - left;
  const bottom = 770;
  let y = 58;

  const ensureSpace = (needed = 40) => {
    if (y + needed <= bottom) return;
    doc.addPage();
    y = 58;
  };

  const drawTitle = () => {
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#000000')
      .text('Ordem de Corte', 40, y, { width: 515, align: 'center' });
    y += 31;

    doc.font('Helvetica').fontSize(10).fillColor('#000000')
      .text('CACU COMERCIO E INDUSTRIA DE ACUCAR E ALCOOL LTDA', 40, y, { width: 515, align: 'center' });
    y += 34;
  };

  const drawHeader = () => {
    const col1X = left;
    const col2X = left + 190;
    const col3X = left + 360;
    const col1W = 170;
    const col2W = 145;
    const col3W = 95;
    const rowGap = 14;

    // Linha 1: campos curtos em colunas separadas.
    drawLabelValue(doc, 'ID', reportData.idSistema, col1X, y, col1W);
    drawLabelValue(doc, 'Status', reportData.status, col2X, y, col2W);
    drawLabelValue(doc, 'Nº Empresa', reportData.numeroEmpresa, col3X, y, col3W);
    y += rowGap;

    // Fazenda ocupa a largura útil para não bater em Frente/Nº Empresa.
    doc.font('Helvetica-Bold').fontSize(9).text('Fazenda: ', col1X, y, { continued: true });
    doc.font('Helvetica').fontSize(9).text(cleanText(reportData.fazenda, ''), {
      width,
      continued: false
    });
    y += Math.max(14, doc.heightOfString(`Fazenda: ${cleanText(reportData.fazenda, '')}`, { width }));

    // Linha 3: Frente/Data/Hora sem sobrepor.
    drawLabelValue(doc, 'Frente', reportData.frente, col1X, y, col1W);
    drawLabelValue(doc, 'Data', reportData.data, col2X, y, col2W);
    drawLabelValue(doc, 'Hora', reportData.hora, col3X, y, col3W);
    y += rowGap;

    // Linha 4: Responsável + Tipo de Cana.
    drawLabelValue(doc, 'Responsável', reportData.responsavel, col1X, y, 300);
    drawLabelValue(doc, 'Tipo de Cana', reportData.tipoCana, col3X, y, col3W);
    y += 27;
  };

  const columns = {
    talhao: { x: left, w: 80, align: 'left' },
    area: { x: left + 118, w: 55, align: 'right' },
    corte: { x: left + 205, w: 115, align: 'left' },
    tch: { x: left + 335, w: 55, align: 'right' },
    ton: { x: left + 400, w: 55, align: 'right' }
  };

  const drawTableHeader = () => {
    ensureSpace(45);
    doc.moveTo(left, y).lineTo(right, y).lineWidth(1).strokeColor('#333333').stroke();
    y += 8;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#000000');
    doc.text('Talhão', columns.talhao.x, y, { width: columns.talhao.w, align: columns.talhao.align });
    doc.text('Área', columns.area.x, y, { width: columns.area.w, align: columns.area.align });
    doc.text('Queima/Corte', columns.corte.x, y, { width: columns.corte.w, align: columns.corte.align });
    doc.text('TCH Est.', columns.tch.x, y, { width: columns.tch.w, align: columns.tch.align });
    doc.text('Ton Est.', columns.ton.x, y, { width: columns.ton.w, align: columns.ton.align });
    y += 14;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(1).strokeColor('#333333').stroke();
    y += 9;
  };

  const drawTalhaoRow = (t) => {
    ensureSpace(24);
    doc.font('Helvetica').fontSize(8.5).fillColor('#000000');
    doc.text(resolveTalhaoLabel(t), columns.talhao.x, y, { width: columns.talhao.w, align: columns.talhao.align });
    doc.text(formatNumber(t.area, 2), columns.area.x, y, { width: columns.area.w, align: columns.area.align });
    doc.text(normalizeTipoCorte(t.queimaCorte), columns.corte.x, y, { width: columns.corte.w, align: columns.corte.align });
    doc.text(formatNumber(t.tchEstimado ?? t.tch, 2), columns.tch.x, y, { width: columns.tch.w, align: columns.tch.align });
    doc.text(formatNumber(t.tonEstimado ?? t.tonEstimada ?? t.toneladas, 2), columns.ton.x, y, { width: columns.ton.w, align: columns.ton.align });
    y += 14;
  };

  drawTitle();
  drawHeader();
  drawTableHeader();

  const talhoes = Array.isArray(reportData.talhoes) ? reportData.talhoes : [];
  talhoes.forEach((t) => {
    if (y > bottom - 45) {
      doc.addPage();
      y = 58;
      drawTableHeader();
    }
    drawTalhaoRow(t);
  });

  y += 10;
  ensureSpace(75);
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#000000')
    .text(`Total Área: ${formatNumber(reportData.totalArea, 2)} | Total Ton Est.: ${formatNumber(reportData.totalTon, 2)}`, left, y, { width });
  y += 30;

  doc.font('Helvetica-Bold').fontSize(9.5).text('Observação:', left, y);
  y += 15;
  doc.font('Helvetica').fontSize(9).text(cleanText(reportData.observacao, ''), left, y, { width });

  doc.end();
}
