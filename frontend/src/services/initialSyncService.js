import { fetchLatestGeoJson, syncAllMapLayers } from "./storage";
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

  const year = new Date().getFullYear();
  const currentSafra = `${year}/${year + 1}`;

  try {
    await syncAllMapLayers(companyId, currentSafra);
  } catch (error) {
    console.warn("[InitialSync] Erro ao buscar mapa inicial:", error);
  }

  try {
    await mapProjectionService.rebuildMapProjection(companyId, String(year));
  } catch (error) {
    console.warn("[InitialSync] Falha ao reconstruir projeção local do mapa:", error);
  }
};
