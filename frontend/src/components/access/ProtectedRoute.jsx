import React from 'react';
import { hasModuleAccess } from '../../utils/accessControl';

export default function ProtectedRoute({ session, moduleKey, fallback = null, children }) {
  if (!hasModuleAccess(session, moduleKey)) {
    return fallback;
  }

  return <>{children}</>;
}
