import { ref, uploadBytes, getDownloadURL, uploadString } from "firebase/storage";
import { storage } from "./firebase";
import db from "./localDb";
import { apiRequest } from "./apiClient";

/**
 * storage.js (Offline-First Refactor)
 *
 * O que mudou:
 * O `fetchLatestGeoJson` agora salva a string do mapa convertido dentro do Dexie (`localDb.mapData`).
 * Se não houver internet, ele retorna diretamente a versão armazenada localmente sem disparar erros 403 do PostgreSQL.
 */

export const uploadFile = async (path, file) => {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return await getDownloadURL(storageRef);
};

export const uploadJson = async (path, jsonObject) => {
  const storageRef = ref(storage, path);
  const jsonString = JSON.stringify(jsonObject);
  await uploadString(storageRef, jsonString, "raw", {
    contentType: "application/json",
  });
  return await getDownloadURL(storageRef);
};

export const fetchLatestGeoJson = async (companyId, fazendaId = null, options = {}) => {
  const { suppressUpdateEvent = false, filters = null, activeMapModule = null, safra = null, forceRemote = false } = options;
  let cachedData = null;
  let localTimestamp = 0;

  // Usa ID cache composto caso fazenda seja passada.
  // v4 separa cache oficial do backend e evita reaproveitar cache v3 filtrado incompleto.
  const cacheVersion = 'v4';
  const buildFilterSuffix = (filterPayload) => {
    if (!filterPayload) return '';
    try {
      return `_${btoa(unescape(encodeURIComponent(JSON.stringify(filterPayload)))).slice(0, 80)}`;
    } catch (_) {
      return '';
    }
  };
  const filterCachePayload = (filters || activeMapModule || safra)
    ? {
        filters: filters || {},
        activeMapModule,
        safra
      }
    : null;
  const filterCacheSuffix = buildFilterSuffix(filterCachePayload);
  const legacyCacheVersion = 'v3';
  const defaultCacheId = `${companyId}_${cacheVersion}_default`;
  const legacyDefaultCacheId = `${companyId}_${legacyCacheVersion}_default`;
  const cacheId = fazendaId ? `${companyId}_${cacheVersion}_${fazendaId}${filterCacheSuffix}` : `${defaultCacheId}${filterCacheSuffix}`;
  const legacyCacheId = fazendaId ? `${companyId}_${legacyCacheVersion}_${fazendaId}${filterCacheSuffix}` : `${legacyDefaultCacheId}${filterCacheSuffix}`;

  const readCachedMap = async (id) => {
    if (!id) return null;
    const localMap = await db.mapData.get(id);
    if (!localMap?.geojson) return null;
    return {
      data: JSON.parse(localMap.geojson),
      mapView: localMap.mapView || null,
      timestamp: localMap.mapTimestamp || 0,
      id: localMap.id,
      updatedAt: localMap.updatedAt || null,
    };
  };

  const readLatestCompanyMap = async () => {
    const records = await db.mapData.where('companyId').equals(companyId).toArray();
    const valid = records
      .filter((item) => {
        const id = String(item.id || '');
        return item?.geojson && (id.includes(`_${cacheVersion}_`) || id.includes(`_${legacyCacheVersion}_`));
      })
      .sort((a, b) => {
        const at = Number(a.mapTimestamp || 0) || Date.parse(a.updatedAt || 0) || 0;
        const bt = Number(b.mapTimestamp || 0) || Date.parse(b.updatedAt || 0) || 0;
        return bt - at;
      });
    if (!valid.length) return null;
    const selected = valid.find((item) => item.id === defaultCacheId) || valid[0];
    return {
      data: JSON.parse(selected.geojson),
      mapView: selected.mapView || null,
      timestamp: selected.mapTimestamp || 0,
      id: selected.id,
      updatedAt: selected.updatedAt || null,
    };
  };

  const loadLocalCache = async ({ allowBroadFallback = false, exactOnly = false } = {}) => {
    try {
      let local = await readCachedMap(cacheId);
      if (local) local.cacheMatch = 'exact';

      if (!local) {
        local = await readCachedMap(legacyCacheId);
        if (local) local.cacheMatch = 'legacyExact';
      }

      // Offline precisa abrir o mapa mesmo quando o usuário entrou com filtro/camada
      // que ainda não tem cache próprio. Nesse caso usamos a camada base da empresa.
      // Online + forceRemote NÃO pode cair na base, senão a camada filtrada nunca é
      // baixada/salva quando o timestamp é igual ao cache base.
      if (!exactOnly) {
        if (!local && cacheId !== defaultCacheId) {
          local = await readCachedMap(defaultCacheId);
          if (local) local.cacheMatch = 'default';
        }
        if (!local && legacyCacheId !== legacyDefaultCacheId) {
          local = await readCachedMap(legacyDefaultCacheId);
          if (local) local.cacheMatch = 'legacyDefault';
        }
        if (!local && allowBroadFallback) {
          local = await readLatestCompanyMap();
          if (local) local.cacheMatch = 'latestCompany';
        }
      }

      if (local?.data?.features) return local;
    } catch (err) {
      console.error("Erro critico ao ler mapa do IndexedDB. Tentando recuperar...", err);
      await db.mapData.delete(cacheId).catch(() => {});
    }
    return null;
  };

  // 1. OBTENÇÃO LOCAL
  // Online + forceRemote usa somente cache EXATO da camada/filtro. Isso obriga o
  // backend a baixar e salvar cada camada acessada, deixando disponível offline.
  // Offline usa cache exato, depois cache base, depois último cache válido da empresa.
  const localCache = await loadLocalCache({
    allowBroadFallback: !navigator.onLine,
    exactOnly: navigator.onLine && forceRemote,
  });
  if (localCache) {
    cachedData = localCache.data;
    localTimestamp = localCache.timestamp;
  }

  // 2. VERIFICAÇÃO DE REDE EM BACKGROUND (Se online, baixa mapa novo da nova API)
  if (navigator.onLine) {
     const fetchFromRemote = async () => {
         try {
             // Chama o backend, passando fazendaId opcional
             let url = `/api/map/talhoes?companyId=${encodeURIComponent(companyId)}`;
             if (fazendaId) {
                 url += `&fazendaId=${encodeURIComponent(fazendaId)}`;
             }
             if (activeMapModule) url += `&activeMapModule=${encodeURIComponent(activeMapModule)}`;
             if (safra) url += `&safra=${encodeURIComponent(safra)}`;
             if (filters && typeof filters === 'object') {
                 Object.entries(filters).forEach(([key, value]) => {
                     if (value === undefined || value === null || value === '' || value === 'all') return;
                     const finalValue = Array.isArray(value) ? value.join(',') : value;
                     if (finalValue !== '') url += `&${encodeURIComponent(key)}=${encodeURIComponent(finalValue)}`;
                 });
             }

             const jsonRes = await apiRequest(url);

             if (jsonRes.success && jsonRes.data) {
                 const remoteTimestamp = jsonRes.timestamp || 0;
                 const remoteMeta = {
                     bbox: jsonRes.bbox || jsonRes.data?.bbox || jsonRes.data?._serverBbox || jsonRes.mapView?.bounds?.flat?.() || null,
                     center: jsonRes.center || jsonRes.data?._serverCenter || jsonRes.mapView?.center || null,
                     zoomHint: jsonRes.zoomHint || jsonRes.data?._serverZoomHint || null,
                     mapView: jsonRes.mapView || jsonRes.data?._serverMapView || null,
                     featureCount: jsonRes.featureCount,
                     totalFeatureCount: jsonRes.totalFeatureCount,
                     filterOptions: jsonRes.filterOptions || null,
                 };

                     // Se local ta desatualizado, não existe, ou é uma camada/filtro ainda
                     // sem cache exato, salva o retorno oficial do backend neste cacheId.
                     const precisaSalvarCacheExato = !localCache || localCache.cacheMatch !== 'exact';
                     if (!cachedData || remoteTimestamp > localTimestamp || precisaSalvarCacheExato) {
                         console.log(`Nova versão do mapa via API detectada. Baixando e otimizando...`);
                         const json = {
                             ...jsonRes.data,
                             bbox: remoteMeta.bbox || jsonRes.data?.bbox || null,
                             _serverBbox: remoteMeta.bbox,
                             _serverCenter: remoteMeta.center,
                             _serverZoomHint: remoteMeta.zoomHint,
                             _serverMapView: remoteMeta.mapView,
                             _serverFeatureCount: remoteMeta.featureCount,
                             _serverTotalFeatureCount: remoteMeta.totalFeatureCount,
                             _serverFilterOptions: remoteMeta.filterOptions,
                         };

                         // ATUALIZAÇÃO DO CACHE: Salva/Sobrescreve no Dexie pra usar offline depois
                         await db.mapData.put({
                             id: cacheId,
                             companyId,
                             geojson: JSON.stringify(json),
                             mapView: remoteMeta.mapView,
                             updatedAt: new Date().toISOString(),
                             mapTimestamp: remoteTimestamp
                         });

                         // Só dispara evento quando já havia mapa em tela/cache.
                         // No primeiro carregamento pós clear site data, disparar este evento
                         // causa um segundo ciclo de recarga que limpa as camadas em alguns fluxos.
                         if (!suppressUpdateEvent && cachedData) {
                             window.dispatchEvent(new CustomEvent('map-updated', { detail: { companyId, fazendaId, source: 'background-sync', remoteTimestamp } }));
                         }

                         return json;
                     } else {
                         console.log(`Mapa local já está atualizado (${localTimestamp}). Nenhuma ação necessária.`);
                         return cachedData ? {
                             ...cachedData,
                             bbox: cachedData._serverBbox || cachedData.bbox || remoteMeta.bbox || null,
                             _serverBbox: cachedData._serverBbox || remoteMeta.bbox || cachedData.bbox || null,
                             _serverCenter: cachedData._serverCenter || remoteMeta.center || null,
                             _serverZoomHint: cachedData._serverZoomHint || remoteMeta.zoomHint || null,
                             _serverMapView: cachedData._serverMapView || localCache?.mapView || remoteMeta.mapView || null,
                         } : null;
                     }
             }
         } catch (error) {
            console.error("Error fetching remote GeoJSON from API:", error);
         }
         return null;
     };

     // Quando forceRemote=true, não usa fallback local online: espera a resposta
     // oficial do backend. O cache só fica para uso offline.
     if (forceRemote || !cachedData) {
         try {
             const remoteJson = await fetchFromRemote();
             if (remoteJson) {
                 return { data: remoteJson, mapView: remoteJson?._serverMapView || null, error: null, source: 'remote' };
             }
             // Não apaga o mapa quando o backend falha ou demora: mantém o cache exato
             // da camada/filtro. O fallback amplo continua restrito ao offline para não
             // pintar camada errada como se fosse resposta oficial do servidor.
             if (cachedData) {
                 return { data: cachedData, mapView: cachedData?._serverMapView || localCache?.mapView || null, error: null, source: 'local_exact_fallback' };
             }
             return { data: null, error: "Nenhum mapa encontrado no servidor.", source: 'remote' };
         } catch (e) {
             return { data: null, error: "Erro de permissão ou falha de rede ao baixar mapa da API.", source: 'remote' };
         }
     }

     // Sem forceRemote, mantém o comportamento offline-first da carga base.
     setTimeout(() => {
         fetchFromRemote().catch(e => console.warn("Background map sync failed:", e));
     }, 1000);

     return { data: cachedData, mapView: cachedData?._serverMapView || localCache?.mapView || null, error: null, source: 'local' };
  }

  // 3. CENÁRIO OFFLINE (ou Sem Resposta)
  if (cachedData) {
      return { data: cachedData, mapView: cachedData?._serverMapView || localCache?.mapView || null, error: null, source: 'local_fallback' };
  }

  return { data: null, error: "Você está offline e ainda não baixou nenhum mapa para visualização." };
};
