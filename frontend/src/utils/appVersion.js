export async function fetchServerAppVersion() {
  const response = await fetch(`/version.json?t=${Date.now()}`, {
    cache: "no-store",
    headers: {
      "cache-control": "no-cache",
      pragma: "no-cache",
    },
  });

  if (!response.ok) {
    throw new Error(`Falha ao consultar versão do app: ${response.status}`);
  }

  return response.json();
}

const MAP_CACHE_KEYWORDS = [
  "mapbox",
  "maps",
  "tiles",
  "satellite",
  "agrosystem-map",
];

export async function clearAppCaches({ preserveMapCaches = true } = {}) {
  if (!("caches" in window)) return;

  const keys = await caches.keys();
  const keysToDelete = keys.filter((key) => {
    const normalized = String(key || "").toLowerCase();
    const isMapCache = MAP_CACHE_KEYWORDS.some((keyword) => normalized.includes(keyword));
    return !(preserveMapCaches && isMapCache);
  });

  await Promise.all(keysToDelete.map((key) => caches.delete(key)));
}

export async function unregisterServiceWorkers() {
  // Não removemos mais o service worker automaticamente.
  // Remover o SW quebrava o funcionamento offline logo após atualização em produção.
  return;
}
