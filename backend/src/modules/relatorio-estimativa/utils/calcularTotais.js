/**
 * Calcula a Tonelada e Variações Baseado nos Itens Fornecidos
 * @param {Array} items Lista de itens a serem somados
 * @returns {Object} Objeto contendo os totais agregados e variações
 */
export const calcularTotais = (items) => {
    let areaEstimada = 0;
    let areaReestimada = 0;

    // Para média ponderada
    let somaTchVezesAreaEstimada = 0;
    let somaTchVezesAreaReestimada = 0;

    let tonEstimada = 0;
    let tonReestimada = 0;

    items.forEach(item => {
        // Assume que as propriedades de item são numéricas ou parseáveis
        const aEst = Number(item.areaEstimada || item.area || 0);
        const aReest = Number(item.areaReestimada || item.area || 0);

        const tchEst = Number(item.tchEstimado || 0);
        const tchReest = Number(item.tchReestimado || 0);

        const tonEst = Number(item.tonEstimada || (aEst * tchEst));
        const tonReest = Number(item.tonReestimada || (aReest * tchReest));

        areaEstimada += aEst;
        areaReestimada += aReest;

        somaTchVezesAreaEstimada += (aEst * tchEst);
        somaTchVezesAreaReestimada += (aReest * tchReest);

        tonEstimada += tonEst;
        tonReestimada += tonReest;
    });

    const tchEstimado = areaEstimada > 0 ? somaTchVezesAreaEstimada / areaEstimada : 0;
    const tchReestimado = areaReestimada > 0 ? somaTchVezesAreaReestimada / areaReestimada : 0;

    const variacaoTon = tonReestimada - tonEstimada;
    const variacaoPercentual = tonEstimada > 0 ? (variacaoTon / tonEstimada) * 100 : 0;

    return {
        areaEstimada,
        tchEstimado,
        tonEstimada,
        areaReestimada,
        tchReestimado,
        tonReestimada,
        variacaoTon,
        variacaoPercentual
    };
};
