import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Minus, RotateCcw, Save, Flame } from 'lucide-react';
import { showError, showSuccess } from '../../../../utils/alert.js';
import {
  DEFAULT_DIRETRIZ_VINHACA,
  buildDiretrizRows,
  getDiretrizVinhaca,
  saveDiretrizVinhaca,
  sanitizeDiretrizVinhaca
} from '../../../../services/premissas/tratos_culturais/diretrizVinhacaService.js';

const inputClass = 'w-full bg-[#060C16] border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder:text-white/25 focus:border-[#6EC1FF] focus:ring-2 focus:ring-[#6EC1FF]/10 outline-none transition-all';
const buttonBaseClass = 'px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] font-semibold inline-flex items-center gap-2 transition-colors';

const formatNumber = (value) => {
  const num = Number(value || 0);
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const stringifyForm = (data) => ({
  fatorN: String(data.fatorN ?? ''),
  fatorK2O: String(data.fatorK2O ?? ''),
  mapHa: String(data.mapHa ?? ''),
  cortes: (data.cortes || []).map((item, index) => ({
    corte: index + 1,
    tchObjetivo: String(item?.tchObjetivo ?? '')
  }))
});

function FactorField({ label, value, onChange, helper }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] font-semibold text-white/60 uppercase tracking-[0.08em] mb-2">{label}</div>
      <input value={value} onChange={onChange} className={`${inputClass} max-w-[160px]`} />
      {helper ? (
        <div className="mt-2 inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/65">
          {helper}
        </div>
      ) : null}
    </div>
  );
}

export default function DiretrizVinhacaTab() {
  const [form, setForm] = useState(() => stringifyForm(DEFAULT_DIRETRIZ_VINHACA));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const current = await getDiretrizVinhaca();
        if (!cancelled) setForm(stringifyForm(current));
      } catch {
        if (!cancelled) {
          showError('Erro ao carregar', 'Não foi possível carregar a diretriz de vinhaça localizada.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const preview = useMemo(() => buildDiretrizRows(sanitizeDiretrizVinhaca(form)), [form]);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateCorte = (index, value) => {
    setForm((prev) => ({
      ...prev,
      cortes: prev.cortes.map((item, itemIndex) => (
        itemIndex === index ? { ...item, tchObjetivo: value } : item
      ))
    }));
  };

  const handleAddCorte = () => {
    setForm((prev) => ({
      ...prev,
      cortes: [
        ...prev.cortes,
        {
          corte: prev.cortes.length + 1,
          tchObjetivo: prev.cortes[prev.cortes.length - 1]?.tchObjetivo || '0'
        }
      ]
    }));
  };

  const handleRemoveCorte = () => {
    setForm((prev) => {
      if (prev.cortes.length <= 1) return prev;
      return {
        ...prev,
        cortes: prev.cortes.slice(0, -1).map((item, index) => ({ ...item, corte: index + 1 }))
      };
    });
  };

  const handleReset = async () => {
    const reset = stringifyForm(DEFAULT_DIRETRIZ_VINHACA);
    setForm(reset);
    await saveDiretrizVinhaca(reset);
    showSuccess('Diretriz restaurada', 'Os valores padrão da vinhaça localizada foram restaurados.');
  };

  const handleSave = async () => {
    await saveDiretrizVinhaca(form);
    showSuccess('Diretriz salva', 'As definições da vinhaça localizada foram atualizadas com sucesso.');
  };

  return (
    <div className="flex flex-col gap-4 text-white pb-6">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl border border-[#D9B04C]/20 bg-[#D9B04C]/10 text-[#F4D78C] flex items-center justify-center shrink-0">
          <Flame className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-[28px] font-bold leading-none">Diretriz Vinhaça</h2>
          <p className="mt-1 text-sm text-white/60">Tabela de N, K₂O e MAP por corte — base para cálculo de doses</p>
        </div>
      </div>

      <div className="rounded-2xl border border-[#17314D] bg-[#06111E] px-4 md:px-5 py-4 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-white/90 mb-4">Fatores de Cálculo</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FactorField
                label="Fator N (×TCH)"
                value={form.fatorN}
                onChange={(e) => updateField('fatorN', e.target.value)}
                helper={`N = TCH × ${form.fatorN || 0}`}
              />
              <FactorField
                label="Fator K₂O (×TCH)"
                value={form.fatorK2O}
                onChange={(e) => updateField('fatorK2O', e.target.value)}
                helper={`K₂O = TCH × ${form.fatorK2O || 0}`}
              />
              <FactorField
                label="MAP (ha)"
                value={form.mapHa}
                onChange={(e) => updateField('mapHa', e.target.value)}
              />
            </div>
          </div>

          <div className="xl:max-w-[430px] rounded-2xl border border-[#D9B04C]/20 bg-[#D9B04C]/10 px-4 py-3 text-sm text-[#F4D78C] leading-6">
            N e K₂O são calculados automaticamente pelo TCH objetivo de cada corte. O MAP permanece fixo conforme o valor informado acima. As doses de MAP, Uréia e KCL são exibidas abaixo apenas como apoio para a vinhaça localizada.
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <button onClick={handleAddCorte} className={buttonBaseClass}>
              <Plus className="w-4 h-4" /> Add corte
            </button>
            <button onClick={handleRemoveCorte} className={buttonBaseClass}>
              <Minus className="w-4 h-4" /> Remover corte
            </button>
          </div>

          <div className="flex flex-wrap gap-2 sm:justify-end">
            <button onClick={handleReset} className={buttonBaseClass}>
              <RotateCcw className="w-4 h-4" /> Restaurar
            </button>
            <button onClick={handleSave} className="px-5 py-2.5 rounded-xl bg-[#D9B04C] hover:bg-[#E1BE68] text-[#101827] font-bold inline-flex items-center gap-2 transition-colors shadow-[0_8px_24px_rgba(217,176,76,0.28)]">
              <Save className="w-4 h-4" /> Salvar
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#17314D] bg-[#06111E] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-[#091625] text-white/70 uppercase text-[11px] tracking-[0.1em]">
              <tr>
                <th className="px-5 py-4 text-center font-semibold">Corte</th>
                <th className="px-5 py-4 text-center font-semibold">TCH_Objetivo</th>
                <th className="px-5 py-4 text-center font-semibold">N</th>
                <th className="px-5 py-4 text-center font-semibold">K₂O</th>
                <th className="px-5 py-4 text-center font-semibold">MAP (ha)</th>
                <th className="px-5 py-4 text-center font-semibold">Dose MAP</th>
                <th className="px-5 py-4 text-center font-semibold">Dose Uréia</th>
                <th className="px-5 py-4 text-center font-semibold">Dose KCL</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((row, index) => (
                <tr key={row.corte} className="border-t border-white/8 bg-[#071321] hover:bg-white/[0.015] transition-colors">
                  <td className="px-5 py-3.5 text-center font-semibold text-white/95">{row.corte}</td>
                  <td className="px-5 py-2.5 text-center">
                    <div className="flex justify-center">
                      <input
                        value={form.cortes[index]?.tchObjetivo ?? ''}
                        onChange={(e) => updateCorte(index, e.target.value)}
                        className={`${inputClass} max-w-[96px] text-center font-semibold py-2`}
                      />
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-center font-semibold text-[#8ED0FF]">{formatNumber(row.n)}</td>
                  <td className="px-5 py-3.5 text-center font-semibold text-[#8ED0FF]">{formatNumber(row.k2o)}</td>
                  <td className="px-5 py-3.5 text-center font-semibold text-white/95">{formatNumber(row.mapHa)}</td>
                  <td className="px-5 py-3.5 text-center font-semibold text-[#F4D78C]">{formatNumber((row.mapHa / 520) * 1000)}</td>
                  <td className="px-5 py-3.5 text-center font-semibold text-[#F4D78C]">{formatNumber(Math.max((((row.n || 0) - (((row.mapHa / 520) * 1000) * 0.11)) / 460) * 1000, 0))}</td>
                  <td className="px-5 py-3.5 text-center font-semibold text-[#F4D78C]">{formatNumber(Math.max((((row.k2o || 0) - (30 * 3.5)) / 600) * 1000, 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {loading ? <div className="text-sm text-white/50">Carregando diretriz...</div> : null}
    </div>
  );
}
