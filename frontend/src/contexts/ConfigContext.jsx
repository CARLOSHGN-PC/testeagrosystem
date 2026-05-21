import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiRequest } from '../services/apiClient';

const ConfigContext = createContext();

export function ConfigProvider({ children, currentCompanyId }) {
  const [logoColor, setLogoColor] = useState('#55AB52');

  useEffect(() => {
    if (!currentCompanyId || !navigator.onLine) return undefined;

    let cancelled = false;
    // A empresa carregada aqui vem do JWT validado no backend. O frontend não decide o companyId.
    apiRequest('/api/postgres/companies/current')
      .then((response) => {
        const color = response?.data?.logoColor;
        if (!cancelled && /^#[0-9a-fA-F]{6}$/.test(String(color || ''))) {
          setLogoColor(color);
        }
      })
      .catch((error) => {
        console.warn('[ConfigContext] não foi possível carregar configuração PostgreSQL da empresa:', error?.message || error);
      });

    return () => {
      cancelled = true;
    };
  }, [currentCompanyId]);

  return (
    <ConfigContext.Provider value={{ logoColor, setLogoColor }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useCompanyConfig() {
  return useContext(ConfigContext);
}
