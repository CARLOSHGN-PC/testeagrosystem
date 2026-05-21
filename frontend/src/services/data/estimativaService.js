import db from '../localDb';
import { fetchWithOffline } from './baseDataService';
import { postgresReadService } from '../postgresReadService';

export const estimativaService = {
  getByCompany(companyId) {
    return fetchWithOffline({
      companyId,
      cacheStore: db.estimativas,
      request: async () => {
        const result = await postgresReadService.listAllEstimates({ companyId, limit: 1000 });
        return result.data || [];
      }
    });
  }
};
