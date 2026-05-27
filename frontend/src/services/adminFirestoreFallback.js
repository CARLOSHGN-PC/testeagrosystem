// Firebase Auth/Firestore fallback removido da autenticação.
// O sistema agora deve usar PostgreSQL + JWT para empresas, usuários e sessão.
// Firebase fica reservado somente para Storage dos mapas/arquivos.

function disabledFallback() {
  throw new Error('Fallback Firebase removido. Use as APIs PostgreSQL/JWT.');
}

export const adminFirestoreFallback = {
  listCompanies: disabledFallback,
  createCompany: disabledFallback,
  updateCompany: disabledFallback,
  toggleCompanyStatus: disabledFallback,
  listUsers: disabledFallback,
  createUser: disabledFallback,
  updateUser: disabledFallback,
  toggleUserStatus: disabledFallback,
  resetPassword: disabledFallback,
};
