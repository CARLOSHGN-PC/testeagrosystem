import React, { useState } from 'react';
import { X, FileDown, CheckCircle, Loader2 } from 'lucide-react';

// O backend não tem uma api exportada, então usaremos fetch
const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '';
const isLocal = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
const BASE_URL = (configuredBaseUrl || (!isLocal ? 'https://agro-system-hrbb.onrender.com' : '')).replace(/\/$/, '');

export default function OrdemCortePdfModal({ isOpen, onClose, ordem, companyId }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !ordem) return null;

  const handleDownload = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      // Faz a chamada ao backend para gerar o PDF da Ordem de Corte via API REST
      const response = await fetch(`${BASE_URL}/api/estimativas/${companyId}/relatorios/ordem-corte/pdf?ordemId=${encodeURIComponent(ordem.id)}&t=${Date.now()}`, { cache: 'no-store' });

      if (!response.ok) {
        throw new Error('Falha na resposta do servidor');
      }

      const blob = await response.blob();
      // Cria URL do blob e engatilha o download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `OrdemCorte_${ordem.numeroEmpresa || ordem.codigo}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);

      onClose();
    } catch (err) {
      console.error('Erro ao gerar PDF da Ordem de Corte:', err);
      setError('Ocorreu um erro ao gerar o PDF. Verifique sua conexão e tente novamente.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center items-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="rounded-2xl w-full max-w-sm shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200 border" style={{ background: '#111a2d', borderColor: 'rgba(255,255,255,0.12)' }}>

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.02)' }}>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FileDown className="w-5 h-5 text-purple-400" />
            Gerar PDF
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:bg-white/10"
            style={{ color: '#aebccb' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 text-center flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-2" style={{ background: 'rgba(168, 85, 247, 0.1)' }}>
            <FileDown className="w-8 h-8 text-purple-400" />
          </div>

          <div>
            <h3 className="text-base font-bold text-white">Ordem {ordem.numeroEmpresa || ordem.codigo}</h3>
            <p className="text-sm mt-1" style={{ color: '#8b9bb4' }}>Deseja gerar o documento em PDF desta ordem de corte?</p>
          </div>

          <div className="rounded-xl p-4 w-full text-left text-sm mt-2 border" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.08)' }}>
            <p className="flex justify-between mb-1"><span style={{ color: '#8b9bb4' }}>ID:</span> <span className="font-mono font-medium text-white">{ordem.id}</span></p>
            <p className="flex justify-between mb-1"><span style={{ color: '#8b9bb4' }}>Frente:</span> <span className="font-medium text-white">{ordem.frenteServico || '-'}</span></p>
            <p className="flex justify-between mb-1"><span style={{ color: '#8b9bb4' }}>Resp:</span> <span className="font-medium text-white">{ordem.nomeColaborador || '-'}</span></p>
            <p className="flex justify-between"><span style={{ color: '#8b9bb4' }}>Talhões:</span> <span className="font-medium text-white">{(ordem.talhaoIds || []).length}</span></p>
          </div>

        </div>

        {error && (
          <div className="px-6 pb-2">
             <div className="text-xs p-3 rounded-xl border w-full text-left" style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.2)', color: '#f87171' }}>
               {error}
             </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-5 border-t flex flex-col gap-3" style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.02)' }}>
          <button
            onClick={handleDownload}
            disabled={isGenerating}
            className="w-full px-5 py-3 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-xl transition-all shadow-md shadow-purple-500/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Gerando Documento...</>
            ) : (
              <><FileDown className="w-4 h-4" /> Baixar PDF</>
            )}
          </button>
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="w-full px-5 py-3 text-sm font-semibold rounded-xl transition-colors hover:bg-white/10 disabled:opacity-50"
            style={{ color: '#aebccb' }}
          >
            Cancelar
          </button>
        </div>

      </div>
    </div>
  );
}
