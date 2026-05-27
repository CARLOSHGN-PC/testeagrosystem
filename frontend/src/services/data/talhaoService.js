import db from '../localDb';
export const talhaoService = { getByCompany: async (companyId) => db.talhoes.where('companyId').equals(companyId).toArray() };
