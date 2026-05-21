import React, { useMemo, useState } from 'react';
import { X, FileText, Download, Loader2 } from 'lucide-react';
import { ORDEM_SERVICO_STATUS } from '../../../services/ordemServico/ordemServicoConstants';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../../services/localDb';

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '';
const isLocal = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
const BASE_URL = (configuredBaseUrl || (!isLocal ? 'https://agro-system-hrbb.onrender.com' : '')).replace(/\/$/, '');

const formatarIdSistemaOS = (valor) => {
  const text = String(valor ?? '').trim();
  if (!text) return '-';
  if (/^O\.?S\b/i.test(text) || /^O\.?S\s*/i.test(text)) return text.replace(/^OS\s*/i, 'O.S ');
  return `O.S ${text}`;
};

const UUID_LIKE_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuidLike = (value) => UUID_LIKE_REGEX.test(String(value ?? '').trim());

const getSubprotocoloDisplay = (ordem, subProtocoloDoBanco) => {
  const candidatos = [
    ordem?.subProtocolo,
    ordem?.subprotocolo,
    ordem?.subProtocoloNome,
    ordem?.subprotocoloNome,
    subProtocoloDoBanco,
    ...(Array.isArray(ordem?.protocoloEditado) ? ordem.protocoloEditado.flatMap((item) => [
      item?.subProtocolo,
      item?.subprotocolo,
      item?.subProtocoloNome,
    ]) : []),
    ordem?.protocoloNome,
    ordem?.protocoloOriginalNome,
  ];

  for (const candidato of candidatos) {
    const text = String(candidato ?? '').trim();
    if (!text || isUuidLike(text)) continue;
    return text;
  }

  return 'Protocolo I';
};

const getTalhaoDisplay = (talhao) => {
  return talhao?.talhaoNome || talhao?.nomeTalhao || talhao?.talhao || talhao?.nome || talhao?.talhaoId || '-';
};

const extractLeadingNumber = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return Number.POSITIVE_INFINITY;
  const match = text.match(/\d+/);
  return match ? Number(match[0]) : Number.POSITIVE_INFINITY;
};

const sortTalhoesNaturally = (items) => {
  return [...(items || [])].sort((a, b) => {
    const aLabel = getTalhaoDisplay(a);
    const bLabel = getTalhaoDisplay(b);
    const aNum = extractLeadingNumber(aLabel);
    const bNum = extractLeadingNumber(bLabel);
    if (aNum !== bNum) return aNum - bNum;
    return String(aLabel).localeCompare(String(bLabel), 'pt-BR', { numeric: true, sensitivity: 'base' });
  });
};

export default function OrdemServicoViewModal({ isOpen, onClose, ordem, onOpenPdf }) {
  const [isDownloading, setIsDownloading] = useState(false);

  const talhoesVinculados = useLiveQuery(
    async () => {
      if (!ordem?.id) return [];
      return db.ordensServicoTalhoes.where('ordemServicoId').equals(ordem.id).toArray();
    },
    [ordem?.id],
    []
  );

  const subProtocoloDoBanco = useLiveQuery(
    async () => {
      const protocoloId = ordem?.protocoloOriginalId || ordem?.protocoloId;
      if (!protocoloId) return '';
      const itens = await db.protocoloItens.where('protocoloId').equals(protocoloId).toArray();
      const subprotocolos = Array.from(new Set((itens || [])
        .map((item) => String(item?.subProtocolo || item?.subprotocolo || '').trim())
        .filter((item) => item && !isUuidLike(item))));
      return subprotocolos.length === 1 ? subprotocolos[0] : '';
    },
    [ordem?.protocoloOriginalId, ordem?.protocoloId],
    ''
  );

  const talhoesOrdenados = useMemo(() => {
    const origem = Array.isArray(talhoesVinculados) && talhoesVinculados.length ? talhoesVinculados : (ordem?.talhoes || []);
    return sortTalhoesNaturally(origem);
  }, [talhoesVinculados, ordem]);

  const subProtocoloDisplay = useMemo(() => getSubprotocoloDisplay(ordem, subProtocoloDoBanco), [ordem, subProtocoloDoBanco]);

  if (!isOpen || !ordem) return null;

  const handleDownload = async () => {
    if (onOpenPdf) {
      onClose();
      onOpenPdf();
      return;
    }

    try {
      setIsDownloading(true);
      const response = await fetch(`${BASE_URL}/api/estimativas/${ordem.companyId}/relatorios/ordem-servico/pdf?ordemId=${encodeURIComponent(ordem.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordem }),
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(errorText || 'Falha ao gerar PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Comparativo_OS_${ordem.numeroEmpresa || ordem.sequencial}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erro ao gerar PDF da Ordem de Serviço:', error);
      alert('Não foi possível gerar o PDF desta solicitação.');
    } finally {
      setIsDownloading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case ORDEM_SERVICO_STATUS.PENDENTE_APROVACAO: return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
      case ORDEM_SERVICO_STATUS.APROVADA: return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
      case ORDEM_SERVICO_STATUS.REPROVADA: return 'text-red-400 bg-red-400/10 border-red-400/20';
      case ORDEM_SERVICO_STATUS.ABERTA: return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
      case ORDEM_SERVICO_STATUS.EXECUTADA: return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
      case ORDEM_SERVICO_STATUS.CANCELADA: return 'text-red-400 bg-red-400/10 border-red-400/20';
      default: return 'text-gray-400 bg-white/5 border-white/10';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4 backdrop-blur-sm">
      <div className="flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border shadow-2xl animate-in fade-in zoom-in duration-200" style={{ background: '#111a2d', borderColor: 'rgba(255,255,255,0.12)' }}>
        <div className="flex items-start justify-between gap-4 border-b p-4 sm:p-5" style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.02)' }}>
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-white sm:text-lg">
              <FileText className="h-5 w-5 text-blue-400" /> Detalhes da {formatarIdSistemaOS(ordem.sequencial)}
            </h2>
            <p className="mt-1 text-xs sm:text-sm" style={{ color: '#aebccb' }}>
              Comparativo do protocolo original com a solicitação enviada para aprovação.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10"
            style={{ color: '#aebccb' }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <InfoBox label="ID do Sistema" value={formatarIdSistemaOS(ordem.sequencial)} mono />
            <InfoBox label="Nº Ordem Empresa" value={ordem.numeroEmpresa || 'Não informado'} emphasis />
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide" style={{ color: '#aebccb' }}>Status</p>
              <span className={`inline-flex rounded-lg border px-3 py-1 text-xs font-bold uppercase ${getStatusColor(ordem.status)}`}>
                {ordem.status}
              </span>
            </div>
            <InfoBox label="Solicitante" value={ordem.solicitanteNome || ordem.nomeColaborador || ordem.createdBy || '-'} />
            <InfoBox label="Operação" value={ordem.operacao?.nome || ordem.operacao?.deOperacao || ordem.operacao?.de0peracao || '-'} />
            <InfoBox label="Subprotocolo" value={subProtocoloDisplay} />
            <InfoBox label="Data de criação" value={ordem.createdAt ? new Date(ordem.createdAt).toLocaleString('pt-BR') : '-'} />
            <InfoBox label="Data decisão" value={ordem.dataDecisao ? new Date(ordem.dataDecisao).toLocaleString('pt-BR') : 'Pendente'} />
            <InfoBox label="Gerência" value={ordem.aprovadoPor || ordem.reprovadoPor || '-'} />
          </div>

          <div className="mt-6">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: '#aebccb' }}>Comparação do protocolo</p>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <CardComparativo titulo="Original">
                <LinhaComparativo rotulo="Operação" valor={ordem.operacao?.nome || ordem.operacao?.deOperacao || ordem.operacao?.de0peracao || '-'} />
                <LinhaComparativo rotulo="Subprotocolo" valor={subProtocoloDisplay} />
                <LinhaComparativo rotulo="Custo" valor={formatCurrency(ordem.custoTotalOriginal)} />
              </CardComparativo>
              <CardComparativo titulo="Solicitado">
                <LinhaComparativo rotulo="Operação" valor={ordem.operacao?.nome || ordem.operacao?.deOperacao || ordem.operacao?.de0peracao || '-'} />
                <LinhaComparativo rotulo="Subprotocolo" valor={subProtocoloDisplay} />
                <LinhaComparativo rotulo="Custo" valor={formatCurrency(ordem.custoTotalOS)} />
              </CardComparativo>
              <CardComparativo titulo="Resumo da diferença">
                <LinhaComparativo rotulo="Diferença" valor={formatCurrency((Number(ordem.custoTotalOS || 0) - Number(ordem.custoTotalOriginal || 0)))} />
                <LinhaComparativo rotulo="Situação" valor={ordem.houveAlteracao ? 'Com divergência' : 'Sem divergência'} />
              </CardComparativo>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <BlocoTexto
              titulo="Divergência"
              conteudo={ordem.houveAlteracao ? 'Há divergência entre o protocolo original e o solicitado.' : 'Sem divergência entre protocolo original e solicitado.'}
            />
            <BlocoTexto
              titulo="Justificativa"
              conteudo={ordem.justificativaAprovacao || 'Sem justificativa informada.'}
            />
          </div>

          {ordem.observacaoGerencia && (
            <div className="mt-4">
              <BlocoTexto titulo="Observação da gerência" conteudo={ordem.observacaoGerencia} />
            </div>
          )}

          <div className="mt-6">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: '#aebccb' }}>Talhões vinculados</p>
            <div className="flex flex-wrap gap-2">
              {talhoesOrdenados.length > 0 ? talhoesOrdenados.map((t, index) => (
                <div key={index} className="rounded-lg border px-3 py-1.5 text-xs font-mono text-blue-300" style={{ background: 'rgba(59, 130, 246, 0.1)', borderColor: 'rgba(59, 130, 246, 0.2)' }}>
                  {getTalhaoDisplay(t)}
                </div>
              )) : (
                <div className="rounded-xl border px-3 py-2 text-sm text-white" style={{ background: 'rgba(0,0,0,0.2)', borderColor: 'rgba(255,255,255,0.08)' }}>
                  Nenhum talhão vinculado encontrado.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t p-4 sm:flex-row sm:justify-between sm:p-5" style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.02)' }}>
          <button
            onClick={onClose}
            className="rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-white/10"
            style={{ color: '#aebccb' }}
          >
            Fechar
          </button>
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="flex items-center justify-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-semibold text-purple-300 transition-all hover:bg-purple-500/20 disabled:opacity-60"
            style={{ borderColor: 'rgba(168, 85, 247, 0.3)', background: 'rgba(168, 85, 247, 0.1)' }}
          >
            {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Gerar PDF
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoBox({ label, value, mono = false, emphasis = false }) {
  return (
    <div>
      <p className="mb-1 text-xs font-bold uppercase tracking-wide" style={{ color: '#aebccb' }}>{label}</p>
      <p
        className={`rounded-lg border px-3 py-2 text-sm text-white break-words ${mono ? 'font-mono' : 'font-medium'} ${emphasis ? 'font-bold' : ''}`}
        style={{ background: emphasis ? 'rgba(59, 130, 246, 0.1)' : 'rgba(0,0,0,0.2)', borderColor: emphasis ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.08)' }}
      >
        {value}
      </p>
    </div>
  );
}

function CardComparativo({ titulo, children }) {
  return (
    <div className="rounded-xl border p-3" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
      <p className="mb-2 text-[11px] font-bold uppercase" style={{ color: '#aebccb' }}>{titulo}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function LinhaComparativo({ rotulo, valor }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span style={{ color: '#aebccb' }}>{rotulo}</span>
      <span className="text-right text-white">{valor}</span>
    </div>
  );
}

function BlocoTexto({ titulo, conteudo }) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: '#aebccb' }}>{titulo}</p>
      <div className="rounded-xl border px-3 py-3 text-sm text-white whitespace-pre-wrap break-words" style={{ background: 'rgba(0,0,0,0.2)', borderColor: 'rgba(255,255,255,0.08)' }}>
        {conteudo}
      </div>
    </div>
  );
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
