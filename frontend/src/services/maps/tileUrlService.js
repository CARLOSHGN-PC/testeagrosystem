export function getTileUrl(companyId, layer) {
  return `/api/maps/${companyId}/tiles/${layer}/{z}/{x}/{y}.pbf`;
}
