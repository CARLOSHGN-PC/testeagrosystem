import React, { useState, useEffect } from 'react';
import { palette } from '../../../../constants/theme.js';
import { Activity, Shield } from 'lucide-react';
import db from '../../../../services/localDb.js';

/**
 * @file AuditoriaList.jsx
 * @description Listagem e Histórico de Logs de Auditoria do Módulo.
 * @module AuditoriaList
 */

export default function AuditoriaList() {
  const companyId = JSON.parse(localStorage.getItem('@AgroSystem:auth'))?.companyId || "AgroSystem_Demo";
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    // Traz todos os logs e ordena pelo mais recente
    const allLogs = await db.auditoriaLogs.where('companyId').equals(companyId).toArray();
    const sorted = allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    setLogs(sorted);
    setLoading(false);
  };

  const formatAcao = (acao) => {
      switch(acao) {
          case 'CREATE': return <span className="text-green-400">Criação</span>;
          case 'UPDATE': return <span className="text-blue-400">Atualização</span>;
          case 'INACTIVATE': return <span className="text-red-400">Inativação</span>;
          case 'VIEW': return <span className="text-gray-400">Visualização</span>;
          case 'ACCESS': return <span className="text-purple-400">Acesso Geral</span>;
          default: return <span className="text-white">{acao}</span>;
      }
  };

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
            <Shield className="w-5 h-5" style={{ color: palette.gold }} />
            Trilha de Auditoria e Logs
        </h2>
        <button onClick={loadData} className="text-xs text-white/50 hover:text-white underline">
            Atualizar
        </button>
      </div>

      <div className="flex-1 overflow-auto rounded-xl border border-white/5 bg-white/5">
        <table className="w-full text-left text-sm">
            <thead className="bg-black/40 text-white/50 border-b border-white/5 sticky top-0">
                <tr>
                    <th className="px-6 py-4 font-semibold">Data e Hora</th>
                    <th className="px-6 py-4 font-semibold">Usuário (UID)</th>
                    <th className="px-6 py-4 font-semibold">Ação</th>
                    <th className="px-6 py-4 font-semibold">Entidade Alvo</th>
                    <th className="px-6 py-4 font-semibold">Detalhes</th>
                </tr>
            </thead>
            <tbody>
                {logs.length === 0 && !loading && (
                    <tr><td colSpan="5" className="text-center py-8 text-white/40">Nenhum log registrado ainda.</td></tr>
                )}
                {logs.map(log => (
                    <tr key={log.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 text-white/80 whitespace-nowrap">
                            {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-white/60 text-xs font-mono">{log.usuarioId}</td>
                        <td className="px-6 py-4 font-semibold">{formatAcao(log.acao)}</td>
                        <td className="px-6 py-4">
                            <span className="px-2 py-1 rounded bg-black/50 text-white/80 border border-white/10 uppercase text-xs">
                                {log.entidade}
                            </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-white/50 max-w-xs truncate" title={log.detalhes}>
                            {log.detalhes}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>
    </div>
  );
}
