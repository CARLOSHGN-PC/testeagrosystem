import { fetchLatestGeoJson } from "./storage";

/**
 * bootstrapService.js
 *
 * Pós-migração PostgreSQL -> PostgreSQL:
 * - Auth oficial: PostgreSQL/JWT
 * - Dados operacionais: APIs backend/PostgreSQL
 * - Mapa/arquivos grandes: backend acessa somente o Storage de mapas
 *
 * Este arquivo NÃO deve chamar PostgreSQL no frontend.
 * Mantemos as funções exportadas por compatibilidade com telas antigas.
 */

export const runAuthBootstrap = async (companyId) => {
  if (!companyId) return;
  console.log("[Bootstrap] Auth PostgreSQL/JWT ativo. PostgreSQL bootstrap desativado.");
};

export const runMapBootstrap = async (companyId) => {
  if (!companyId) return;
  if (!navigator.onLine) {
    console.log("[Bootstrap] Offline. Pulando carregamento inicial do mapa.");
    return;
  }

  console.log("[Bootstrap] Carregando mapa via backend + Storage de mapas.");

  try {
    await fetchLatestGeoJson(companyId);
  } catch (error) {
    console.warn("[Bootstrap] Erro ao buscar mapa inicial:", error);
  }
};

export const runDashboardBootstrap = async (companyId) => {
  if (!companyId) return;
  console.log("[Bootstrap] Dashboard agora usa PostgreSQL/API. PostgreSQL bootstrap desativado.");
};

export const runCadastrosBootstrap = async (companyId) => {
  if (!companyId) return;
  console.log("[Bootstrap] Cadastros agora usam PostgreSQL/API. PostgreSQL bootstrap desativado.");
};

export const runGlobalBootstrap = async (companyId) => {
  await runAuthBootstrap(companyId);
  await runMapBootstrap(companyId);
  await runDashboardBootstrap(companyId);
  await runCadastrosBootstrap(companyId);
};
