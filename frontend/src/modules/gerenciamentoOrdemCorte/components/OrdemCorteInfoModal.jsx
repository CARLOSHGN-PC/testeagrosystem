import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { editarOrdemCorte } from '../../../services/ordemCorte/ordemCorteService';
import { ORDEM_CORTE_STATUS } from '../../../services/ordemCorte/ordemCorteConstants';

export default function OrdemCorteInfoModal({ isOpen, onClose, ordem, isEditMode = false }) {
  const [numeroEmpresa, setNumeroEmpresa] = useState('');
  const [frente, setFrente] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (ordem) {
      setNumeroEmpresa(ordem.numeroEmpresa || '');
      setFrente(ordem.frenteServico || '');
      setResponsavel(ordem.nomeColaborador || '');
    }
  }, [ordem]);

  if (!isOpen || !ordem) return null;

  const handleSave = async () => {
    setIsSaving(true);

    const novosDados = {
      numeroEmpresa: numeroEmpresa.trim()
    };

    if (isEditMode) {
       novosDados.frenteServico = frente.trim();
       novosDados.nomeColaborador = responsavel.trim();
    }

    await editarOrdemCorte(ordem.id, novosDados);

    setIsSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center items-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="rounded-2xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200 border" style={{ background: '#111a2d', borderColor: 'rgba(255,255,255,0.12)' }}>

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.02)' }}>
          <div>
            <h2 className="text-lg font-bold text-white">
              {isEditMode ? 'Editar Ordem de Corte' : 'Informar Nº Ordem Empresa'}
            </h2>
            <p className="text-sm font-mono mt-0.5" style={{ color: '#aebccb' }}>{ordem.id}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:bg-white/10"
            style={{ color: '#aebccb' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-5">
          {/* Read-only ID field */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: '#aebccb' }}>ID Sistema Ordem de Corte</label>
            <input
              type="text"
              readOnly
              value={ordem.id}
              className="w-full rounded-xl px-4 py-2.5 text-sm font-mono cursor-not-allowed outline-none border"
              style={{ background: 'rgba(0,0,0,0.2)', borderColor: 'rgba(255,255,255,0.08)', color: '#6b7280' }}
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: '#aebccb' }}>
              Nº Ordem Empresa
            </label>
            <input
              type="text"
              placeholder="Ex: 5012934"
              value={numeroEmpresa}
              onChange={e => setNumeroEmpresa(e.target.value)}
              className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-yellow-500 transition-colors border shadow-sm text-white placeholder-gray-500"
              style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.12)' }}
              autoFocus={!isEditMode}
            />
            {!isEditMode && (
              <p className="text-xs mt-2" style={{ color: '#8b9bb4' }}>
                Ao informar um número, a ordem poderá ser liberada na lista de ações.
              </p>
            )}
          </div>

          {isEditMode && (
            <>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: '#aebccb' }}>Frente</label>
                <input
                  type="text"
                  value={frente}
                  onChange={e => setFrente(e.target.value)}
                  className="w-full rounded-xl px-4 py-2.5 text-sm outline-none focus:border-yellow-500 transition-colors border shadow-sm text-white"
                  style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.12)' }}
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: '#aebccb' }}>Responsável</label>
                <input
                  type="text"
                  value={responsavel}
                  onChange={e => setResponsavel(e.target.value)}
                  className="w-full rounded-xl px-4 py-2.5 text-sm outline-none focus:border-yellow-500 transition-colors border shadow-sm text-white"
                  style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.12)' }}
                />
              </div>
            </>
          )}

        </div>

        {/* Footer */}
        <div className="p-5 border-t flex justify-end gap-3" style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.02)' }}>
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-semibold rounded-xl transition-colors hover:bg-white/10"
            style={{ color: '#aebccb' }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all shadow-md shadow-blue-500/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>

      </div>
    </div>
  );
}
