export function getStoredJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getActiveCompanyId(fallback = '002') {
  const auth = getStoredJson('@AgroSystem:auth');
  const session = getStoredJson('@AgroSystem:session');

  return (
    auth?.companyId ||
    session?.user?.companyId ||
    session?.company?.code ||
    session?.company?.id ||
    fallback
  );
}

export function getActiveUserId(fallback = 'system') {
  const auth = getStoredJson('@AgroSystem:auth');
  const session = getStoredJson('@AgroSystem:session');

  return (
    auth?.uid ||
    session?.user?.uid ||
    session?.user?.id ||
    fallback
  );
}
