import PDFDocument from 'pdfkit';

const COLORS = {
  bg: '#020814',
  muted: '#7f8ca5',
  text: '#f8fbff',
  gold: '#d4aa4a',
};

function nowBR() {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());
}

function imageBufferFromDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const base64 = dataUrl.includes(',') ? dataUrl.split(',').pop() : dataUrl;
  if (!base64) return null;
  return Buffer.from(base64, 'base64');
}

function paintBackground(doc) {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLORS.bg);
}

function drawHeader(doc, title, subtitle) {
  doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(13).text(title || 'Dashboard CTT - Entrada de Cana', 22, 16, { width: 520 });
  if (subtitle) {
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7).text(subtitle, 22, 34, { width: 520 });
  }
  doc.fillColor(COLORS.gold).font('Helvetica').fontSize(6.6).text(`AgroSystem - Gerado em ${nowBR()}`, 610, 18, { width: 205, align: 'right' });
}

function drawImageContain(doc, buffer, x, y, w, h, { allowUpscale = true, align = 'center' } = {}) {
  if (!buffer) return;
  try {
    const image = doc.openImage(buffer);
    const iw = Number(image?.width || 1);
    const ih = Number(image?.height || 1);
    if (!iw || !ih) throw new Error('Imagem inválida');

    let scale = Math.min(w / iw, h / ih);
    if (!allowUpscale) scale = Math.min(1, scale);
    const drawW = iw * scale;
    const drawH = ih * scale;
    const drawX = x + (w - drawW) / 2;
    const drawY = align === 'top' ? y : y + (h - drawH) / 2;
    doc.image(buffer, drawX, drawY, { width: drawW, height: drawH });
  } catch (error) {
    doc.fillColor('#ff6166').font('Helvetica-Bold').fontSize(10).text('Erro ao renderizar imagem do gráfico no PDF.', x, y + 20, { width: w, align: 'center' });
  }
}

function sectionTitle(section) {
  return section?.title || section?.id || 'Dashboard CTT - Entrada de Cana';
}

function drawFooter(doc) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(i);
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7).text(`Página ${i + 1} de ${range.count}`, 720, 574, { width: 95, align: 'right' });
  }
}

function addPageIfNeeded(doc, firstPageUsed) {
  if (firstPageUsed) doc.addPage();
  paintBackground(doc);
}

export async function gerarDashboardCttRenderedPdf(payload = {}) {
  const sections = Array.isArray(payload.sections) ? payload.sections.filter((item) => item?.image) : [];
  if (!sections.length) {
    throw new Error('Nenhuma imagem do dashboard foi enviada para montar o PDF.');
  }

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, bufferPages: true });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  let firstPageUsed = false;
  const cover = sections.find((item) => item.kind === 'cover') || sections[0];
  addPageIfNeeded(doc, firstPageUsed);
  firstPageUsed = true;
  drawHeader(doc, 'Dashboard CTT - Entrada de Cana', 'Resumo operacional e moagem horária conforme visual do sistema');
  drawImageContain(doc, imageBufferFromDataUrl(cover.image), 12, 50, 818, 512, { allowUpscale: true });

  const chartSections = sections.filter((item) => item !== cover && item.kind !== 'cover');
  for (const section of chartSections) {
    addPageIfNeeded(doc, firstPageUsed);
    firstPageUsed = true;
    drawHeader(doc, sectionTitle(section), 'Gráfico selecionado em página única no A4, sem agrupar com outro gráfico');

    // Regra fixa: depois da capa, NUNCA agrupar gráficos.
    // Cada imagem recebida do frontend vira exatamente uma página A4 landscape.
    // A área útil é quase toda a folha para o gráfico não ficar pequeno no canto.
    drawImageContain(doc, imageBufferFromDataUrl(section.image), 14, 56, 814, 508, { allowUpscale: true, align: 'center' });
  }

  drawFooter(doc);
  doc.end();
  return done;
}
