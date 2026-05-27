export const addFooter = (doc, totalPages) => {
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);

      const oldBottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0; // Para desenhar o rodapé ignorando a margem de texto

      const bottom = doc.page.height - 30;
      doc.fontSize(8).fillColor('#a0aec0').text(
        `AgroSystem - Página ${i + 1} de ${pages.count}`,
        50,
        bottom,
        {
          align: 'center',
          width: doc.page.width - 100
        }
      );

      doc.page.margins.bottom = oldBottomMargin;
    }
};