import db from '../localDb';
export const talhaoService = { listByCompany: (companyId) => db.talhoes.where('companyId').equals(companyId).toArray() };
