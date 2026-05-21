import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { fileURLToPath } from 'url';
import relatorioEstimativaRoutes from './modules/relatorio-estimativa/routes/relatorioEstimativaRoutes.js';
import ordemCorteRoutes from './modules/relatorio-estimativa/routes/ordemCorteRoutes.js';
import ordemServicoRoutes from './modules/relatorio-estimativa/routes/ordemServicoRoutes.js';
import apontamentoInsumoRoutes from './routes/cadastros_mestres/apontamentoInsumoRoutes.js';
import estimativaRoutes from './routes/estimativaRoutes.js';
import mapRoutes from './routes/map/mapRoutes.js';
import companyRoutes from './routes/companyRoutes.js';
import userRoutes from './routes/userRoutes.js';
import userSelfRoutes from './routes/userSelfRoutes.js';
import planejamentoSafraRoutes from './modules/planejamento-safra/routes/planejamentoSafraRoutes.js';
import dadosDashboardRoutes from './routes/dadosDashboardRoutes.js';
import premissasColheitaRoutes from './routes/premissasColheitaRoutes.js';
import premissasTratosVinhacaRoutes from './routes/premissasTratosVinhacaRoutes.js';
import protocolosRoutes from './routes/protocolosRoutes.js';
import ordensCorteAdminRoutes from './routes/ordensCorteAdminRoutes.js';
import postgresTestRoutes from './routes/postgresTestRoutes.js';
import companyPostgresRoutes from './routes/postgres/companyPostgresRoutes.js';
import userPostgresRoutes from './routes/postgres/userPostgresRoutes.js';
import agroPostgresRoutes from './routes/postgres/agroPostgresRoutes.js';
import cadastrosPostgresRoutes from './routes/postgres/cadastrosPostgresRoutes.js';
import syncPostgresRoutes from './routes/postgres/syncPostgresRoutes.js';
import authPostgresRoutes from './routes/auth/authPostgresRoutes.js';
import reestimativaRollbackRoutes from './routes/reestimativaRollbackRoutes.js';
import mapRealtimeRoutes from './routes/mapRealtimeRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:4173',
    'https://agrosystem.site',
    'https://www.agrosystem.site',
    'https://sistema.agrosystem.site',
    'https://agro-system-hrbb.onrender.com',
];

app.use(cors({
    origin: function (origin, callback) {
        // allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            var msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true
}));

// Aumentando o limite global do body-parser para suportar o recebimento de chunks em JSON maiores que 100kb
app.use(express.json({ limit: '300mb' }));

// Future API routes can be added here
app.get('/api/status', (req, res) => {
    res.json({ status: 'AgroSystem API is running' });
});

// Registrar rotas de módulos REST do Backend
app.use('/api/relatorios/estimativa', relatorioEstimativaRoutes);
app.use('/api/estimativas', ordemCorteRoutes);
app.use('/api/estimativas', ordemServicoRoutes);
app.use('/api/cadastros/apontamentos-insumo', apontamentoInsumoRoutes);
app.use('/api/estimativa', estimativaRoutes);
app.use('/api/map', mapRoutes);
app.use('/api/maps', mapRoutes);
app.use('/api/admin/companies', companyRoutes);
app.use('/api/admin/users', userRoutes);
app.use('/api/user', userSelfRoutes);
app.use('/api/planejamento-safra', planejamentoSafraRoutes);
app.use('/api/dados-dashboard', dadosDashboardRoutes);
app.use('/api/premissas-colheita', premissasColheitaRoutes);
app.use('/api/premissas-tratos-vinhaca', premissasTratosVinhacaRoutes);
app.use('/api/protocolos', protocolosRoutes);
app.use('/api/ordens-corte', ordensCorteAdminRoutes);
app.use('/api/realtime/maps', mapRealtimeRoutes);
app.use('/api/auth', authPostgresRoutes);
app.use('/api/admin/reestimativas/rollback', reestimativaRollbackRoutes);
app.use('/api/postgres-test', postgresTestRoutes);
app.use('/api/postgres/companies', companyPostgresRoutes);
app.use('/api/postgres/users', userPostgresRoutes);
app.use('/api/postgres/agro', agroPostgresRoutes);
app.use('/api/postgres/sync', syncPostgresRoutes);
app.get('/api/postgres/cadastros-health', (req, res) => {
    res.json({ success: true, message: 'Cadastro Geral PostgreSQL ativo' });
});
app.use('/api/postgres/cadastros', cadastrosPostgresRoutes);
app.use('/api/postgres/cadastro-geral', cadastrosPostgresRoutes);

const frontendDistPath = path.join(__dirname, '../../frontend/dist');
const frontendIndexPath = path.join(frontendDistPath, 'index.html');

// Serve static files from the React Vite build only when dist exists.
// Em desenvolvimento local com Vite na porta 5173, esse dist normalmente não existe;
// sem essa proteção o backend quebrava com ENOENT tentando abrir frontend/dist/index.html.
if (fs.existsSync(frontendDistPath)) {
    app.use(express.static(frontendDistPath));
}

// Error handler global de API para garantir retorno em JSON e evitar HTML Trace de erros internos do Express (Ex: PayloadTooLargeError)
app.use('/api', (err, req, res, next) => {
    console.error("Express /api error:", err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Erro interno no servidor.',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

// Fallback 404 handler estrito para rotas /api não encontradas
app.all(/^\/api\/(.*)/, (req, res) => {
    res.status(404).json({ success: false, message: 'Endpoint da API não encontrado.' });
});

// Catch-all handler for React SPA (Single Page Application) routing
// If a request doesn't match an API route or a static file, serve index.html
app.get(/^(?!\/api).+/, (req, res) => {
    if (fs.existsSync(frontendIndexPath)) {
        return res.sendFile(frontendIndexPath);
    }

    return res.status(404).json({
        success: false,
        message: 'Frontend dist não encontrado. Em desenvolvimento, acesse o Vite em http://localhost:5173 ou rode npm run build antes de servir pelo backend.',
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
