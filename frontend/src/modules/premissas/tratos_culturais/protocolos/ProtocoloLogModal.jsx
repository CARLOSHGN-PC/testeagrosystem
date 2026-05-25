import React, { useState, useEffect } from 'react';
import { X, Clock, User, FileText } from 'lucide-react';
import db from '../../../../services/localDb.js';
import { palette } from '../../../../constants/theme.js';

export default function ProtocoloLogModal({ protocoloId, onClose }) {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLogs = async () => {
            setLoading(true);
            try {
                // Busca os logs do banco local
                const allLogs = await db.auditoriaLogs
                    .where('targetId').equals(protocoloId)
                    .reverse()
                    .sortBy('createdAt');
                setLogs(allLogs);
            } catch (err) {
                console.error("Erro ao buscar logs:", err);
            }
            setLoading(false);
        };
        fetchLogs();
    }, [protocoloId]);

    const formatAction = (action) => {
        switch (action) {
            case 'CREATE': return <span className="text-green-400">Criação</span>;
            case 'UPDATE': return <span className="text-blue-400">Atualização</span>;
            case 'INACTIVATE': return <span className="text-red-400">Inativação</span>;
            case 'DELETE': return <span className="text-red-500">Exclusão</span>;
            default: return <span>{action}</span>;
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-[#1e1e1e] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/10">
                    <div>
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <Clock className="w-5 h-5" style={{ color: palette.gold }} />
                            Histórico de Alterações
                        </h3>
                        <p className="text-sm text-white/50 mt-1">Veja quem criou ou alterou este protocolo.</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-white/60 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    {loading ? (
                        <div className="text-center text-white/50 py-10">Carregando histórico...</div>
                    ) : logs.length === 0 ? (
                        <div className="text-center text-white/50 py-10 border border-dashed border-white/10 rounded-xl">
                            Nenhum registro de auditoria encontrado.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {logs.map(log => (
                                <div key={log.id} className="bg-black/40 border border-white/5 rounded-xl p-4 flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-white/5 rounded-lg text-white/70">
                                                <User className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-white">{log.userId}</p>
                                                <p className="text-xs text-white/40">{new Date(log.createdAt).toLocaleString('pt-BR')}</p>
                                            </div>
                                        </div>
                                        <div className="text-sm font-semibold">
                                            {formatAction(log.action)}
                                        </div>
                                    </div>
                                    {log.details && log.details.diff && (
                                        <div className="mt-2 text-xs text-white/50 bg-black/50 p-3 rounded-lg flex items-start gap-2 overflow-x-auto custom-scrollbar">
                                            <FileText className="w-4 h-4 shrink-0 mt-0.5" />
                                            <pre className="font-mono">{JSON.stringify(log.details.diff, null, 2)}</pre>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
