import db from '../localDb';
export const ordemService = {
  getOrdensCorteByCompany: async (companyId) => db.ordensCorte.where('companyId').equals(companyId).toArray(),
  getOrdensServicoByCompany: async (companyId) => db.ordensServico.where('companyId').equals(companyId).toArray()
};
