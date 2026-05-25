import Service from '../services/RelatorioEstimativaService.js';
import { filtroRelatorioEstimativaSchema } from '../validators/relatorioEstimativaValidator.js';
import { FORMATO_SAIDA } from '../constants/relatorioEstimativaConstants.js';

class RelatorioEstimativaController {

    // Método para o endpoint GET /filtros
    async getFiltros(req, res) {
        try {
            // Em uma implementação real, o repository poderia buscar safras distintas,
            // unidades e fazendas baseadas nos acessos do req.user (middleware auth).
            // Aqui estamos retornando uma estrutura basica.
            const filtrosDisponiveis = {
                safras: ['2024/2025', '2025/2026'],
                tiposPropriedade: ['PROPRIA', 'PARCERIA', 'ARRENDADA', 'TODAS'],
                agruparPor: ['CORTE', 'FAZENDA', 'FAZENDA_E_TALHAO', 'TIPO_PROPRIEDADE'],
                modosExibicao: ['RESUMIDO', 'DETALHADO', 'RESUMIDO_DETALHADO'],
                formatosSaida: Object.values(FORMATO_SAIDA)
            };

            return res.status(200).json(filtrosDisponiveis);
        } catch (error) {
            console.error('Erro em getFiltros:', error);
            return res.status(500).json({ error: 'Erro interno ao buscar filtros.' });
        }
    }

    // Processa relatório (Por Corte ou Por Fazenda/Talhão) dependendo da URL ou Body
    // Como a lógica e validação são centralizadas e o payload é rico, a Service lida com o Switch
    async gerarRelatorio(req, res) {
        try {
            // 1. Validação de Entrada usando Zod
            const validData = filtroRelatorioEstimativaSchema.safeParse(req.body);

            if (!validData.success) {
                return res.status(400).json({
                    error: 'Dados de entrada inválidos.',
                    details: validData.error.issues
                });
            }

            const filtros = validData.data;

            // 2. Chama a Service delegando o response para Streaming caso seja PDF/Excel
            // Se for JSON a service retornará via res.json()
            const resultado = await Service.processarRelatorio(filtros, res);

            // Note: Service.processarRelatorio can sometimes return a pure object/error if validation inside fails
            if (resultado && resultado.error) {
                if (!res.headersSent) {
                    return res.status(400).json({ error: resultado.error });
                }
            }

        } catch (error) {
            console.error('Erro em gerarRelatorio:', error);
            if (!res.headersSent) {
                return res.status(500).json({ error: 'Erro interno ao gerar o relatório.' });
            }
        }
    }
}

export default new RelatorioEstimativaController();