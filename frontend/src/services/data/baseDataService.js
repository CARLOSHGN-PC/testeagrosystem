import db from '../localDb';

export async function fetchWithOffline({ request, cacheStore, companyId, cacheKey = 'id' }) {
  if (!companyId) return [];
  if (!navigator.onLine) return cacheStore.where('companyId').equals(companyId).toArray();
  try {
    const data = await request();
    if (Array.isArray(data) && data.length) {
      await cacheStore.bulkPut(data.map((item) => ({ ...item, [cacheKey]: item[cacheKey] || item.id, companyId, syncStatus: 'synced' })));
    }
    return data;
  } catch {
    return cacheStore.where('companyId').equals(companyId).toArray();
  }
}

export async function enqueueSync(operation) {
  await db.syncQueue.put({ id: `${operation.type}:${Date.now()}`, ...operation, status: 'queued', createdAt: Date.now() });
}
