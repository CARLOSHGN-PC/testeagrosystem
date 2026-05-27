import { fetchLatestGeoJson } from "./storage";
import { mapProjectionService } from "./mapProjectionService";

/**
 * initialSyncService.js
 *
 * Mantido apenas por compatibilidade.
 * Depois da migração, o frontend não deve sincronizar PostgreSQL diretamente.
 * Tudo deve vir via backend/PostgreSQL, exceto o mapa que continua vindo do
 * Storage através do backend.
 */

export const runGlobalInitialSync = async (companyId) => {
  if (!companyId) return;
  if (!navigator.onLine) {
    console.log("[InitialSync] Offline. Pulando sync inicial.");
    return;
  }

  console.log("[InitialSync] PostgreSQL/JWT ativo. PostgreSQL sync desativado.");

  try {
    await fetchLatestGeoJson(companyId);
  } catch (error) {
    console.warn("[InitialSync] Erro ao buscar mapa inicial:", error);
  }

  const currentYear = new Date().getFullYear().toString();
  try {
    await mapProjectionService.rebuildMapProjection(companyId, currentYear);
  } catch (error) {
    console.warn("[InitialSync] Falha ao reconstruir projeção local do mapa:", error);
  }
};
