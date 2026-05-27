import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { hasModuleAccess, moduleRequiresCompanyContext, hasCompanyContext, isSuperAdmin } from '../../utils/accessControl';

function DefaultFallback({ message }) {
  return (
    <div className="p-6 md:p-10 text-white h-full flex items-center justify-center">
      <div className="max-w-xl rounded-3xl border border-white/10 bg-black/30 backdrop-blur-xl p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-300">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h3 className="text-2xl font-semibold">Acesso indisponível</h3>
        <p className="mt-3 text-sm text-white/70">{message}</p>
      </div>
    </div>
  );
}

export default function ProtectedModule({ session, moduleKey, fallback = null, children }) {
  if (isSuperAdmin(session)) return <>{children}</>;

  if (moduleRequiresCompanyContext(moduleKey) && !hasCompanyContext(session)) {
    return fallback || <DefaultFallback message="Esse módulo precisa de uma empresa vinculada ao usuário. Entre com uma conta da empresa ou conclua a configuração inicial." />;
  }

  if (!hasModuleAccess(session, moduleKey)) {
    return fallback || <DefaultFallback message="Seu usuário não possui permissão para acessar este módulo ou ele não está habilitado para a empresa." />;
  }

  return <>{children}</>;
}
