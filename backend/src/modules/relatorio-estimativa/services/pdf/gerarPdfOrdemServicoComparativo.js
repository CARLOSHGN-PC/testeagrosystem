import PDFDocument from 'pdfkit';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logoPath = path.resolve(__dirname, '../../../../../public/icon-192x192.png');

export function gerarPdfOrdemServicoComparativo(reportData, res) {
  const {
    companyName,
    ordem,
    talhoes,
    produtosComparativos = [],
    companyCode = '',
  } = reportData;

  const doc = new PDFDocument({ size: 'A4', margin: 32, bufferPages: true });
  doc.pipe(res);

  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = 32;
  const contentWidth = pageWidth - margin * 2;
  const footerHeight = 26;
  const bodyBottom = pageHeight - margin - footerHeight;
  let y = 108;

  const formatDate = (value, withTime = false) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return withTime ? date.toLocaleString('pt-BR') : date.toLocaleDateString('pt-BR');
  };

  const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const clean = (value) => {
    const text = value == null ? '-' : String(value);
    return text.replace(/\s+/g, ' ').trim() || '-';
  };

  const difference = Number(ordem.custoTotalOS || 0) - Number(ordem.custoTotalOriginal || 0);
  const differencePct = Number(ordem.custoTotalOriginal || 0) > 0
    ? (difference / Number(ordem.custoTotalOriginal || 0)) * 100
    : 0;
  const statusLabel = {
    PENDENTE_APROVACAO: 'PENDENTE_APROVACAO',
    APROVADA: 'APROVADA',
    REPROVADA: 'REPROVADA',
    ABERTA: 'ABERTA',
    EXECUTADA: 'EXECUTADA',
  }[ordem.status] || clean(ordem.status);
  const solicitante = clean(ordem.solicitanteNome || ordem.nomeColaborador || ordem.createdBy || ordem.createdByEmail);
  const operacao = clean(ordem.operacao?.nome || ordem.operacao?.deOperacao || ordem.operacao?.de0peracao);
  const protocolo = clean(ordem.protocoloNome);
  const gerente = clean(ordem.aprovadoPor || ordem.reprovadoPor);
  const periodoTexto = `${formatDate(ordem.createdAt)} a ${formatDate(ordem.dataDecisao || ordem.createdAt)}`;
  const diferencaTexto = `${money(difference)} (${differencePct.toFixed(2)}%)`;

  const comparativoResumo = [
    ['Protocolo', protocolo, protocolo, ordem.houveAlteracao ? 'Sim' : 'Não', ordem.houveAlteracao ? 'Revisar itens alterados no protocolo' : 'Sem alteração do nome do protocolo'],
    ['Operação', operacao, operacao, 'Não', 'Mesma operação vinculada'],
    ['Custo original', money(ordem.custoTotalOriginal), money(ordem.custoTotalOriginal), 'Não', 'Valor base do protocolo'],
    ['Custo solicitado', money(ordem.custoTotalOriginal), money(ordem.custoTotalOS), difference !== 0 ? 'Sim' : 'Não', difference !== 0 ? `Ajuste de ${money(difference)}` : 'Sem alteração de custo'],
    ['Diferença', money(0), money(difference), difference !== 0 ? 'Sim' : 'Não', difference !== 0 ? `Variação de ${differencePct.toFixed(2)}%` : 'Sem diferença financeira'],
  ];

  function currentPageNumber() {
    return doc.bufferedPageRange().count;
  }

  function drawHeader() {
    doc.save();
    doc.rect(0, 0, pageWidth, 82).fill('#f2f2f2');

    try {
      doc.image(logoPath, margin, 18, { fit: [34, 34], align: 'left' });
    } catch {
      doc.rect(margin, 18, 34, 34).fill('#0f2f24');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7).text('AGRO', margin + 5, 31);
    }

    doc.fillColor('#111111');
    doc.font('Helvetica-Bold').fontSize(10).text(clean(companyName), margin + 44, 18, { width: 230 });
    doc.font('Helvetica').fontSize(9)
      .text('Relatório de Plantio - Modelo A (Resumo Comparativo)', margin + 44, 31)
      .text('Cultura: Cana-de-açúcar', margin + 44, 44);

    doc.font('Helvetica-Bold').fontSize(10)
      .text('Relatório de Solicitação - Comparativo para Aprovação Gerencial', 0, 30, { width: pageWidth, align: 'center' });

    doc.font('Helvetica').fontSize(8.5)
      .text(`Data/Hora: ${formatDate(new Date().toISOString(), true)}`, pageWidth - 160, 18, { width: 128, align: 'right' })
      .text(`Período: ${periodoTexto}`, pageWidth - 190, 31, { width: 158, align: 'right' })
      .text(`Página: ${currentPageNumber()}`, pageWidth - 100, 44, { width: 68, align: 'right' });

    doc.restore();
    y = 94;
  }

  function drawFooter(pageNumber, totalPages) {
    doc.font('Helvetica').fontSize(8).fillColor('#111111')
      .text(
        `Gerado por: ${solicitante.toLowerCase().replace(/\s+/g, '')} em ${formatDate(new Date().toISOString(), true)} - Página ${pageNumber} de ${totalPages}`,
        margin,
        pageHeight - 18,
        { width: contentWidth, align: 'left' }
      );
  }

  function ensureSpace(minHeight = 24) {
    if (y + minHeight <= bodyBottom) return;
    doc.addPage();
    drawHeader();
  }

  function drawDividerLine(x1, x2, yy) {
    doc.moveTo(x1, yy).lineTo(x2, yy).lineWidth(1).stroke('#111111');
  }

  function drawMiniTable(rows, widths, options = {}) {
    const { headerFill = '#d9d9d9', rowFill = '#ffffff', fontSize = 8.5, headerFontSize = 8.5 } = options;
    const x = margin;
    const baseRowHeight = 22;

    rows.forEach((row, rowIndex) => {
      const prepared = row.map((cell) => clean(cell));
      const contentHeights = prepared.map((text, index) => {
        const width = widths[index] - 10;
        return doc.heightOfString(text, { width, align: index === 0 ? 'left' : 'center' });
      });
      const rowHeight = Math.max(baseRowHeight, Math.max(...contentHeights) + 10);
      ensureSpace(rowHeight + 4);

      let cursorX = x;
      prepared.forEach((text, index) => {
        doc.rect(cursorX, y, widths[index], rowHeight).fillAndStroke(rowIndex === 0 ? headerFill : rowFill, '#bdbdbd');
        doc.fillColor('#111111').font(rowIndex === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(rowIndex === 0 ? headerFontSize : fontSize);
        doc.text(text, cursorX + 5, y + 5, {
          width: widths[index] - 10,
          align: index === 0 ? 'left' : 'center',
        });
        cursorX += widths[index];
      });
      y += rowHeight;
    });
    y += 8;
  }

  function drawSectionHeader(title, left = margin, width = contentWidth) {
    ensureSpace(24);
    doc.fillColor('#111111').font('Helvetica-Bold').fontSize(8.5).text(title, left, y);
    drawDividerLine(left, left + width, y + 12);
    y += 18;
  }

  function drawResumeLine() {
    ensureSpace(24);
    const topY = y;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111111');
    doc.text(`OS: ${clean(`OS-${ordem.sequencial || '-'}`)}`, margin, topY, { width: 110 });
    doc.text(`Solicitante: ${solicitante}`, margin + 140, topY, { width: 200 });
    doc.text(`Status: ${statusLabel}`, margin + 365, topY, { width: 160 });
    y += 14;
    doc.text(`Operação: ${operacao}`, margin, y, { width: 320 });
    if (companyCode) doc.text(`Código: ${companyCode}`, margin + 365, y, { width: 160 });
    y += 18;
  }

  function drawTextBlock(title, content) {
    drawSectionHeader(title);
    const text = clean(content);
    const height = Math.max(22, doc.heightOfString(text, { width: contentWidth - 10 }) + 10);
    ensureSpace(height + 2);
    doc.rect(margin, y, contentWidth, height).fillAndStroke('#ffffff', '#bdbdbd');
    doc.font('Helvetica').fontSize(8.5).fillColor('#111111').text(text, margin + 5, y + 5, { width: contentWidth - 10, align: 'left' });
    y += height + 8;
  }

  function drawTalhoesBlock() {
    drawSectionHeader('Talhões vinculados');
    const lista = (talhoes || []).map((talhao) => clean(talhao.talhaoNome || talhao.nomeTalhao || talhao.talhaoId));
    const text = lista.length ? lista.join('\n') : 'Nenhum talhão vinculado';
    const height = Math.max(22, doc.heightOfString(text, { width: contentWidth - 10 }) + 10);
    ensureSpace(height + 2);
    doc.rect(margin, y, contentWidth, height).fillAndStroke('#ffffff', '#bdbdbd');
    doc.font('Helvetica').fontSize(8.5).fillColor('#111111').text(text, margin + 5, y + 5, { width: contentWidth - 10, align: 'left' });
    y += height + 8;
  }

  function drawDecisionBlock() {
    drawSectionHeader('Decisão gerencial');
    const lines = [
      `Status atual: ${statusLabel}`,
      `Gerente: ${gerente}`,
      `Data da decisão: ${formatDate(ordem.dataDecisao, true)}`,
    ];
    const text = lines.join('\n');
    const height = Math.max(22, doc.heightOfString(text, { width: contentWidth - 10 }) + 10);
    ensureSpace(height + 2);
    doc.rect(margin, y, contentWidth, height).fillAndStroke('#ffffff', '#bdbdbd');
    doc.font('Helvetica').fontSize(8.5).fillColor('#111111').text(text, margin + 5, y + 5, { width: contentWidth - 10, align: 'left' });
    y += height + 8;
  }

  function drawFinancialBlock() {
    drawSectionHeader('Resumo financeiro');
    const lines = [
      `Custo original: ${money(ordem.custoTotalOriginal)}`,
      `Custo solicitado: ${money(ordem.custoTotalOS)}`,
      `Diferença: ${diferencaTexto}`,
    ];
    const text = lines.join('\n');
    const height = Math.max(22, doc.heightOfString(text, { width: contentWidth - 10 }) + 10);
    ensureSpace(height + 2);
    doc.rect(margin, y, contentWidth, height).fillAndStroke('#ffffff', '#bdbdbd');
    doc.font('Helvetica').fontSize(8.5).fillColor('#111111').text(text, margin + 5, y + 5, { width: contentWidth - 10, align: 'left' });
    y += height + 8;
  }

  function drawProductComparison() {
    drawSectionHeader('Comparação de produtos do protocolo');
    const widths = [170, 100, 100, 72, 81];
    const rows = [
      ['Produto', 'Original', 'Solicitado', 'Divergência', 'Observação'],
      ...(produtosComparativos.length
        ? produtosComparativos.map((item) => [
            item.nome,
            item.originalDose,
            item.solicitadoDose,
            item.divergencia,
            item.observacao,
          ])
        : [['Nenhum item comparativo encontrado', '-', '-', '-', '-']]),
    ];
    drawMiniTable(rows, widths);
  }

  drawHeader();
  drawResumeLine();

  drawSectionHeader('Resumo Comparativo');
  drawMiniTable(
    [
      ['Campo', 'Original', 'Solicitado', 'Divergência', 'Observação'],
      ...comparativoResumo,
    ],
    [110, 100, 110, 72, 159]
  );

  drawProductComparison();
  drawTextBlock('Justificativa do solicitante', ordem.justificativaAprovacao || 'Sem justificativa informada.');
  drawTalhoesBlock();
  drawDecisionBlock();
  drawFinancialBlock();
  drawTextBlock(
    'Observações para aprovação',
    ordem.observacaoGerencia || 'Este relatório foi gerado pelo servidor para conferência gerencial do comparativo entre protocolo original e solicitado.'
  );

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    drawFooter(i - range.start + 1, range.count);
  }

  doc.end();
}
