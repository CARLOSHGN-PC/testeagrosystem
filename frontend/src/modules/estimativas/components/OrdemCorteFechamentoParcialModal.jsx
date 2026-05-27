import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, MapPinned, AlertTriangle } from 'lucide-react';
import * as turf from '@turf/turf';

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatHa = (value) => toNumber(value).toLocaleString('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const getTalhaoAreaHa = (talhao) => {
  const props = talhao?.properties || talhao || {};
  const direct = toNumber(props.areaHa ?? props.area_ha ?? props.area ?? props.AREA_HA ?? props.AREA ?? props.area_total);
  if (direct > 0) return direct;
  try {
    if (talhao?.geometry) {
      return turf.area(talhao) / 10000;
    }
  } catch (_) {
    return 0;
  }
  return 0;
};

const buildRows = ({ talhoesIds = [], talhoesNomes = [], selectedTalhoesData = [], vinculoAtivo }) => {
  const byId = new Map();
  (selectedTalhoesData || []).forEach((talhao) => {
    const props = talhao?.properties || talhao || {};
    const id = String(talhao?.id ?? props.id ?? props.talhaoId ?? props.TALHAO ?? props.talhao ?? '').trim();
    if (id) byId.set(id, talhao);
  });

  return (talhoesIds || []).map((id, index) => {
    const key = String(id ?? '').trim();
    const talhaoData = byId.get(key) || {};
    const props = talhaoData?.properties || talhaoData || {};
    const areaTotal = getTalhaoAreaHa(talhaoData) || toNumber(vinculoAtivo?.area || vinculoAtivo?.areaHa || props.areaHa);
    const areaFechada = toNumber(props.areaFechadaOrdem || props.haFechado || vinculoAtivo?.areaFechada || 0);
    const saldoDisponivel = Math.max(areaTotal - areaFechada, 0) || areaTotal;
    return {
      talhaoId: key,
      talhaoNome: talhoesNomes?.[index] || props.TALHAO || props.talhao || key,
      fazenda: props.FUNDO_AGR || props.fundoAgricola || props.fazendaNome || vinculoAtivo?.fazendaNome || '',
      areaTotal,
      areaFechada,
      saldoDisponivel,
      haColhido: saldoDisponivel ? String(saldoDisponivel.toFixed(2)) : '',
      parcial: false,
      direcaoColheitaGraus: props.direcaoColheitaGraus || props.azimuteColheita || props._ordem_parcial_direcao_graus || '',
      sentidoColheita: props.sentidoColheita || props.sentido_colheita || props._ordem_parcial_sentido || '',
    };
  });
};

export const OrdemCorteFechamentoParcialModal = ({
  isOpen,
  onClose,
  onConfirm,
  vinculoAtivo,
  talhoesIds,
  talhoesNomes,
  selectedTalhoesData,
  isProcessing = false,
}) => {
  const initialRows = useMemo(() => buildRows({ talhoesIds, talhoesNomes, selectedTalhoesData, vinculoAtivo }), [talhoesIds, talhoesNomes, selectedTalhoesData, vinculoAtivo]);
  const [rows, setRows] = useState(initialRows);

  if (!isOpen) return null;

  const updateRow = (index, patch) => {
    setRows((old) => old.map((row, i) => i === index ? { ...row, ...patch } : row));
  };

  const confirmar = () => {
    const talhoes = rows.map((row) => {
      const haColhido = toNumber(row.haColhido);
      const saldo = toNumber(row.saldoDisponivel);
      const parcial = Boolean(row.parcial || (saldo > 0 && haColhido < saldo));
      return {
        ordemCorteId: vinculoAtivo?.ordemCorteId || vinculoAtivo?.id || '',
        ordemCodigo: vinculoAtivo?.ordemCodigo || vinculoAtivo?.codigo || '',
        talhaoId: row.talhaoId,
        talhaoNome: row.talhaoNome,
        fazenda: row.fazenda,
        areaTotal: row.areaTotal,
        areaFechadaAnterior: row.areaFechada,
        saldoDisponivel: row.saldoDisponivel,
        haColhido,
        areaPendente: Math.max(saldo - haColhido, 0),
        parcial,
      };
    });

    const parciais = talhoes.filter((talhao) => talhao.parcial);
    if (parciais.length) {
      const event = new CustomEvent('ordemCorte:selecionarDirecaoFechamentoParcial', {
        detail: {
          talhoes,
          parciais,
          onConfirm,
        },
      });
      window.dispatchEvent(event);
      onClose();
      return;
    }

    onConfirm(talhoes);
  };

  const hasParcial = rows.some((row) => row.parcial || (toNumber(row.haColhido) > 0 && toNumber(row.haColhido) < toNumber(row.saldoDisponivel)));

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 p-4" onClick={(e) => { if (e.target === e.currentTarget && !isProcessing) onClose(); }}>
      <div className="w-full max-w-5xl rounded-2xl border border-white/10 bg-[#101418] text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold">Fechar Ordem de Corte</h2>
            <p className="text-sm text-white/60">Informe o ha colhido. Se for parcial, o saldo fica disponível para nova OC.</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-white/10" disabled={isProcessing}><X className="h-5 w-5" /></button>
        </div>

        {hasParcial && (
          <div className="mx-5 mt-4 flex items-start gap-2 rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-3 text-sm text-yellow-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Fechamento parcial vai gerar alerta para a geotecnologia. Depois de confirmar os hectares, o sistema vai levar você para o mapa para clicar uma vez na borda onde a colhedora iniciou. O avanço parcial será reto e proporcional ao talhão.</span>
          </div>
        )}

        <div className="max-h-[60vh] overflow-auto p-5">
          <div className="min-w-[820px] overflow-hidden rounded-xl border border-white/10">
            <div className="grid grid-cols-[1.1fr_1fr_0.8fr_0.8fr_0.8fr_1fr_0.75fr] gap-0 bg-white/10 px-3 py-2 text-xs font-bold uppercase text-white/70">
              <span>Fazenda</span><span>Talhão</span><span>Área total</span><span>Já fechado</span><span>Saldo</span><span>Ha colhido</span><span>Parcial</span>
            </div>
            {rows.map((row, index) => (
              <div key={`${row.talhaoId}-${index}`} className="grid grid-cols-[1.1fr_1fr_0.8fr_0.8fr_0.8fr_1fr_0.75fr] items-center border-t border-white/10 px-3 py-2 text-sm">
                <span className="truncate pr-2">{row.fazenda || '-'}</span>
                <span className="font-semibold">{row.talhaoNome}</span>
                <span>{formatHa(row.areaTotal)} ha</span>
                <span>{formatHa(row.areaFechada)} ha</span>
                <span className="font-semibold text-emerald-300">{formatHa(row.saldoDisponivel)} ha</span>
                <input
                  value={row.haColhido}
                  onChange={(e) => updateRow(index, { haColhido: e.target.value })}
                  className="mr-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:border-yellow-400"
                  inputMode="decimal"
                />
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={row.parcial}
                    onChange={(e) => updateRow(index, { parcial: e.target.checked })}
                  />
                  <span>Sim</span>
                </label>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-white/60"><MapPinned className="h-4 w-4" /> Se tiver parcial, confirme os hectares e depois clique na borda/lado onde iniciou a colheita.</div>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={isProcessing} className="rounded-xl bg-white/10 px-4 py-2 font-semibold hover:bg-white/15">Cancelar</button>
            <button onClick={confirmar} disabled={isProcessing} className="rounded-xl bg-red-500 px-4 py-2 font-semibold text-white hover:bg-red-600 disabled:opacity-50">{hasParcial ? 'Confirmar ha e escolher lado no mapa' : 'Confirmar fechamento'}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
