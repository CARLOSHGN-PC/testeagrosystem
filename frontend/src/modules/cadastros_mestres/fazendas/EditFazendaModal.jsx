import { getActiveCompanyId } from '../../../services/companyContext.js';
import React, { useState, useEffect } from 'react';
import { X, Save, Building } from 'lucide-react';
import db from '../../../services/localDb.js';
import { enqueueTask } from '../../../services/syncService.js';
import { useAuth } from '../../../hooks/useAuth.js';
import { logAuditoria } from '../../../services/logService.js';

export default function EditFazendaModal({ fazendaId, onClose, onSave }) {
    const { user } = useAuth();
    const companyId = getActiveCompanyId();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [formData, setFormData] = useState({
        codFaz: '',
        desFazenda: ''
    });

    useEffect(() => {
        const loadFazenda = async () => {
            const f = await db.fazendas.get(fazendaId);
            if (f) {
                setFormData({
                    codFaz: f.codFaz || '',
                    desFazenda: f.desFazenda || ''
                });
            }
            setLoading(false);
        };
        if (fazendaId) loadFazenda();
    }, [fazendaId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const currentFazenda = await db.fazendas.get(fazendaId);

            // Verifica se o código da fazenda foi alterado e se o novo já existe
            if (currentFazenda.codFaz !== formData.codFaz) {
                const existing = await db.fazendas.where('[companyId+codFaz]').equals([companyId, formData.codFaz]).first();
                if (existing && existing.id !== fazendaId) {
                    alert('Já existe uma fazenda com este código.');
                    setSaving(false);
                    return;
                }
            }

            const updatedData = {
                ...currentFazenda,
                codFaz: formData.codFaz,
                desFazenda: formData.desFazenda,
                syncStatus: 'pending',
                updatedAt: new Date().toISOString(),
                updatedBy: user?.uid || 'system'
            };

            await db.fazendas.put(updatedData);
            await enqueueTask('createOrUpdate', 'fazendas', fazendaId, updatedData);

            await logAuditoria(
                'fazendas',
                fazendaId,
                'UPDATE',
                { diff: updatedData, context: 'Edição Manual Fazenda' },
                user?.uid || 'system',
                companyId
            );

            onSave();
            onClose();
        } catch (error) {
            console.error('Erro ao salvar fazenda:', error);
            alert('Erro ao salvar as alterações da fazenda.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 animate-fade-in">
            <div className="bg-[#121212] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden animate-scale-in">

                <div className="flex items-center justify-between p-6 border-b border-white/10 bg-black/40 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-transparent pointer-events-none"></div>
                    <div className="z-10">
                        <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                            <Building className="w-5 h-5 text-blue-400" />
                            Editar Fazenda
                        </h3>
                        <p className="text-sm text-white/50">Altere os dados básicos da propriedade</p>
                    </div>
                    <button onClick={onClose} className="p-2 z-10 bg-white/5 hover:bg-white/10 rounded-xl text-white/60 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-white/70 mb-1">Código da Fazenda</label>
                        <input
                            type="text"
                            required
                            value={formData.codFaz}
                            onChange={(e) => setFormData({ ...formData, codFaz: e.target.value })}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-white/70 mb-1">Descrição / Nome</label>
                        <input
                            type="text"
                            required
                            value={formData.desFazenda}
                            onChange={(e) => setFormData({ ...formData, desFazenda: e.target.value })}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
                        />
                    </div>

                    <div className="pt-4 flex justify-end gap-3 border-t border-white/10">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl text-sm font-semibold text-white/70 hover:bg-white/5 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <Save className="w-4 h-4" />
                            {saving ? 'Salvando...' : 'Salvar Alterações'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
