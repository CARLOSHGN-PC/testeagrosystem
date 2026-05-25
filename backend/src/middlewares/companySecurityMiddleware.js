export function enforceCompanyScope(req, res, next) {
  try {
    const tokenCompanyId = req.authUser?.companyId || req.user?.companyId;
    const tokenCompanyDbId = req.authUser?.companyDbId || req.user?.companyDbId;

    if (!tokenCompanyId && req.authUser?.role !== 'super_admin' && req.user?.role !== 'super_admin') {
      return res.status(401).json({ success: false, message: 'Empresa não encontrada no token/JWT.' });
    }

    req.companyId = tokenCompanyId;
    req.companyDbId = tokenCompanyDbId;

    const requestedCompanyId = req.params?.companyId || req.query?.companyId || req.body?.companyId;
    const isSuperAdmin = req.authUser?.role === 'super_admin' || req.user?.role === 'super_admin';

    if (requestedCompanyId && !isSuperAdmin) {
      const normalize = (value) => String(value || '').trim().toLowerCase();
      if (normalize(requestedCompanyId) !== normalize(tokenCompanyId)) {
        return res.status(403).json({ success: false, message: 'Acesso cruzado entre empresas não permitido.' });
      }
    }

    next();
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Erro no middleware de segurança multiempresa.' });
  }
}
