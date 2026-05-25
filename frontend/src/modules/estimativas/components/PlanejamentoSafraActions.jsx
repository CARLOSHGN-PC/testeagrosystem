import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { previewPlanejamentoServer, savePlanejamentoServer, removePlanejamento } from '../../../services/planejamentoSafraService';
import { DEFAULT_COLHEITA_PREMISSAS, getColheitaPremissas } from '../../../services/colheitaPremissasService';
import db from '../../../services/localDb';
import { showError, showSuccess, showConfirm } from '../../../utils/alert';
import { Loader2, Layers, X, CalendarDays, Tractor, Gauge, Clock3, BarChart3, Settings2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatBrazilianNumber, parseBrazilianFloat } from '../../../utils/formatters';
import { getUniqueTalhaoId, getFazendaName } from '../../../utils/geoHelpers';

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const MATURACAO_COLORS = {
  Baixa: 'border-cyan-500/30 text-cyan-300 bg-cyan-500/10',
  Média: 'border-violet-500/30 text-violet-300 bg-violet-500/10',
  Alta: 'border-amber-500/30 text-amber-300 bg-amber-500/10'
};

const inputClass = 'bg-[#0A1220] border border-white/12 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-400 outline-none transition-colors';
const readonlyClass = `${inputClass} opacity-90`;

const toInputNumber = (value, fallback = '') => {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).replace('.', ',');
};

const parseInputNumber = (value) => parseBrazilianFloat(value);

const formatFrenteValue = (value) => {
  const digits = String(value ?? '').replace(/\D+/g, '');
  if (!digits) return '';
  return `F - ${parseInt(digits, 10)}`;
};

const getVelocidadeInputValue = (manualValue, computedValue) => {
  if (manualValue !== undefined && manualValue !== null && String(manualValue).trim() !== '') {
    const parsed = parseBrazilianFloat(manualValue);
    return Number.isFinite(parsed) ? formatBrazilianNumber(parsed, 2, 2) : String(manualValue);
  }
  return formatBrazilianNumber(computedValue || 0, 2, 2);
};


const getPlanejamentoGroupKey = (item = {}) => {
  if (item.sequenciaGrupoId) return String(item.sequenciaGrupoId);
  return [
    item.companyId || '',
    item.safra || '',
    formatFrenteValue(item.frenteColheita),
    item.blocoColheita || item.bloco || '',
    formatDateInput(item.dataColheita || item.dataEntradaPlanejada || item.dataBase),
    item.sequencia || 1
  ].join('__');
};

const getNextPlanejamentoDefaults = async ({ companyId, safra, frenteColheita }) => {
  const frente = formatFrenteValue(frenteColheita);
  if (!companyId || !safra || !frente) return { sequencia: '', dataColheita: '', mesColheita: '' };

  const rows = await db.planejamentoSafra.where('[companyId+safra]').equals([companyId, safra]).toArray();
  const groups = new Map();

  rows
    .filter((item) => item?.statusPlanejamento !== 'inativo')
    .filter((item) => formatFrenteValue(item?.frenteColheita) === frente)
    .forEach((item) => {
      const key = getPlanejamentoGroupKey(item);
      const current = groups.get(key);
      const sequencia = Math.max(1, parseInt(item?.sequencia, 10) || 1);
      const dataSaida = item?.dataSaidaPlanejada || '';
      const dataEntrada = item?.dataEntradaPlanejada || item?.dataColheita || item?.dataBase || '';
      if (!current || sequencia > current.sequencia) {
        groups.set(key, { sequencia, dataSaida, dataEntrada });
      }
    });

  const ordered = Array.from(groups.values()).sort((a, b) => a.sequencia - b.sequencia);
  const last = ordered[ordered.length - 1];
  const nextSeq = last ? last.sequencia + 1 : 1;
  const nextDate = formatDateInput(last?.dataSaida || last?.dataEntrada || '');

  return {
    sequencia: String(nextSeq),
    dataColheita: nextDate,
    mesColheita: nextDate ? MONTHS[new Date(nextDate).getMonth()] || '' : ''
  };
};

const getLatestTchEstimate = async (companyId, safra, talhaoId) => {
  if (!companyId || !safra || !talhaoId) return 0;
  const estimates = await db.estimativas.where('[companyId+safra]').equals([companyId, safra]).toArray();
  const filtered = estimates
    .filter((item) => item.talhaoId === talhaoId)
    .sort((a, b) => new Date(b.updatedAt || b.dataEstimativa || 0) - new Date(a.updatedAt || a.dataEstimativa || 0));
  const latest = filtered[0];
  if (!latest) return 0;

  const toneladas = parseBrazilianFloat(latest.toneladas);
  const area = parseBrazilianFloat(latest.area);
  const tch = parseBrazilianFloat(latest.tch);
  if (Number.isFinite(tch) && tch > 0) return tch;
  if (Number.isFinite(toneladas) && Number.isFinite(area) && area > 0) return toneladas / area;
  return 0;
};

const parseMinutes = (value) => {
  if (!value) return 0;
  const str = String(value).trim();
  if (str.includes(':')) {
    const [mm = '0', ss = '0'] = str.split(':');
    const minutes = parseInt(mm, 10) || 0;
    const seconds = parseInt(ss, 10) || 0;
    return isNaN(minutes) || isNaN(seconds) ? 0 : minutes + (seconds / 60);
  }
  const floatVal = parseBrazilianFloat(str);
  return isNaN(floatVal) ? 0 : floatVal;
};

const formatDateInput = (value) => {
  if (!value) return '';
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) return str.slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [dd, mm, yyyy] = str.split('/');
    return `${yyyy}-${mm}-${dd}`;
  }
  const dt = new Date(str);
  if (Number.isFinite(dt.getTime())) return dt.toISOString().slice(0, 10);
  return '';
};

const formatDateBr = (value) => {
  if (!value) return '-';
  const formatted = formatDateInput(value);
  if (!formatted) return String(value);
  const [yyyy, mm, dd] = formatted.split('-');
  return `${dd}/${mm}/${yyyy}`;
};

const addDaysIso = (value, days) => {
  const formatted = formatDateInput(value);
  if (!formatted) return '';
  const dt = new Date(`${formatted}T00:00:00.000Z`);
  dt.setUTCDate(dt.getUTCDate() + (Number(days) || 0));
  return dt.toISOString().slice(0, 10);
};

const monthDiff = (start, end) => {
  const startDate = formatDateInput(start);
  const endDate = formatDateInput(end);
  if (!startDate || !endDate) return 0;

  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);

  let months = (ey - sy) * 12 + (em - sm);
  if (ed < sd) months -= 1;
  return Math.max(0, months + ((ed - sd) / 30));
};

const getAutoDateField = (properties, keys = []) => {
  for (const key of keys) {
    if (properties?.[key]) {
      const formatted = formatDateInput(properties[key]);
      if (formatted) return formatted;
    }
  }
  return '';
};

const getAutoNumberField = (properties, keys = []) => {
  for (const key of keys) {
    if (properties?.[key] !== undefined && properties?.[key] !== null && properties?.[key] !== '') {
      return parseBrazilianFloat(properties[key]);
    }
  }
  return 0;
};

const normalizeText = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase();

const buildLookupKey = (fazenda, talhao) => `${normalizeText(fazenda)}|${normalizeText(talhao)}`;

const buildFeatureLookupKeys = (properties = {}) => {
  const talhao = properties?.TALHAO || properties?.talhao || '';
  const keys = new Set();
  const fazendaCandidates = [
    getFazendaName(properties),
    properties?.FAZENDA,
    properties?.DES_FAZENDA,
    properties?.COD_FAZ,
    properties?.FAZENDA_ID,
    properties?.FUNDO_AGR
  ].filter(Boolean);

  fazendaCandidates.forEach((faz) => {
    const key = buildLookupKey(faz, talhao);
    if (key !== '|') keys.add(key);
  });

  return Array.from(keys);
};

const buildCadastroTalhoesIndex = (talhoes = [], fazendas = []) => {
  const index = new Map();
  const fazendaMap = new Map();

  fazendas.forEach((fazenda) => {
    const keys = [fazenda?.id, fazenda?.codFaz, fazenda?.desFazenda, fazenda?.nome]
      .filter(Boolean)
      .map(normalizeText);
    keys.forEach((key) => fazendaMap.set(key, fazenda));
  });

  talhoes.forEach((talhao) => {
    const relatedFazenda = fazendaMap.get(normalizeText(talhao?.fazendaId)) || null;
    const fazendaCandidates = [
      relatedFazenda?.desFazenda,
      relatedFazenda?.nome,
      relatedFazenda?.codFaz,
      talhao?.fazendaId,
      talhao?.FAZENDA,
      talhao?.DES_FAZENDA,
      talhao?.COD_FAZ,
      talhao?.FUNDO_AGR
    ].filter(Boolean);

    fazendaCandidates.forEach((faz) => {
      const key = buildLookupKey(faz, talhao?.talhao || talhao?.TALHAO || talhao?.id);
      if (key !== '|') index.set(key, talhao);
    });
  });

  return index;
};

const MONTH_IN_MS = 1000 * 60 * 60 * 24 * 30;

const getBaseDateForIdade = (properties = {}, cadastroTalhao = null) => {
  const fromUltCorteCadastro = getAutoDateField(cadastroTalhao || {}, ['DT_ULTCORTE', 'DATA_ULTCORTE', 'ULT_CORTE', 'DATA_ULT_CORTE', 'dtUltCorte']);
  if (fromUltCorteCadastro) return fromUltCorteCadastro;

  const fromUltCorteFeature = getAutoDateField(properties || {}, ['DT_ULTCORTE', 'DATA_ULTCORTE', 'ULT_CORTE', 'DATA_ULT_CORTE', 'dtUltCorte']);
  if (fromUltCorteFeature) return fromUltCorteFeature;

  const fromPlantioCadastro = getAutoDateField(cadastroTalhao || {}, ['DT_PLANTIO', 'DATA_PLANTIO', 'PLANTIO', 'dataPlantio']);
  if (fromPlantioCadastro) return fromPlantioCadastro;

  return getAutoDateField(properties || {}, ['DT_PLANTIO', 'DATA_PLANTIO', 'PLANTIO', 'dataPlantio']);
};

const diffMonthsFromDate = (baseDate, targetDate) => {
  const start = formatDateInput(baseDate);
  const end = formatDateInput(targetDate);
  if (!start || !end) return 0;
  const startMs = new Date(`${start}T00:00:00`).getTime();
  const endMs = new Date(`${end}T00:00:00`).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return 0;
  return Math.max(0, (endMs - startMs) / MONTH_IN_MS);
};

const getAverageIdades = (features = [], dataColheita = '', cadastroTalhoesIndex = new Map()) => {
  if (!features.length) return { idadeAtual: 0, idadeCorte: 0 };

  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const colheitaTarget = formatDateInput(dataColheita);

  let totalAtual = 0;
  let totalCorte = 0;
  let countAtual = 0;
  let countCorte = 0;

  features.forEach((feature) => {
    const featureKeys = buildFeatureLookupKeys(feature?.properties || {});
    const cadastroTalhao = featureKeys.map((key) => cadastroTalhoesIndex.get(key)).find(Boolean) || null;
    const baseDate = getBaseDateForIdade(feature?.properties || {}, cadastroTalhao);
    if (!baseDate) return;

    const idadeAtual = diffMonthsFromDate(baseDate, todayIso);
    totalAtual += idadeAtual;
    countAtual += 1;

    if (colheitaTarget) {
      const idadeCorte = diffMonthsFromDate(baseDate, colheitaTarget);
      totalCorte += idadeCorte;
      countCorte += 1;
    }
  });

  return {
    idadeAtual: countAtual > 0 ? totalAtual / countAtual : 0,
    idadeCorte: countCorte > 0 ? totalCorte / countCorte : 0
  };
};

const inferMaturacao = (idadeAtual, idadeCorte) => {
  if (!idadeCorte || idadeAtual <= 0) return 'Média';
  const ratio = idadeAtual / idadeCorte;
  if (ratio < 0.75) return 'Baixa';
  if (ratio <= 1.05) return 'Média';
  return 'Alta';
};

const StatCard = ({ label, value, suffix = '', icon: Icon, accent = 'amber' }) => {
  const accentClass = {
    amber: 'border-amber-500/20 text-amber-300',
    teal: 'border-emerald-500/20 text-emerald-300',
    orange: 'border-orange-500/20 text-orange-300',
    blue: 'border-sky-500/20 text-sky-300',
    purple: 'border-violet-500/20 text-violet-300'
  }[accent] || 'border-white/10 text-white';

  return (
    <div className={`rounded-2xl border px-3 py-3 bg-white/5 ${accentClass}`}>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] opacity-80 mb-1.5">
        {Icon ? <Icon className="w-3.5 h-3.5" /> : null}
        <span>{label}</span>
      </div>
      <div className="text-[16px] font-bold leading-none">
        {value}
        {suffix ? <span className="text-[10px] font-medium ml-1 opacity-80">{suffix}</span> : null}
      </div>
    </div>
  );
};

const Field = ({ label, children, className = '' }) => (
  <div className={`flex flex-col gap-1 ${className}`}>
    <label className="text-[10px] font-semibold text-[#8E9BB5] uppercase tracking-[0.08em]">{label}</label>
    {children}
  </div>
);

const SectionBox = ({ title, children, className = '' }) => (
  <div className={`rounded-2xl border border-white/12 p-2 bg-[#091525] ${className}`}>
    <div className="text-[11px] font-bold text-amber-300 uppercase tracking-[0.08em] mb-2">{title}</div>
    {children}
  </div>
);

export const PlanejamentoSafraActions = ({ talhoesIds, enhancedGeoJson, companyId, safra, readOnlyMode = false }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [preview, setPreview] = useState(null);
  const [premissasDefaults, setPremissasDefaults] = useState(DEFAULT_COLHEITA_PREMISSAS);
  const [cadastroTalhoesIndex, setCadastroTalhoesIndex] = useState(new Map());

  const selectedFeatures = useMemo(() => {
    if (!enhancedGeoJson?.features?.length) return [];
    return talhoesIds.map(id => enhancedGeoJson.features.find(f => f.id === id)).filter(Boolean);
  }, [enhancedGeoJson, talhoesIds]);

  const primaryFeature = selectedFeatures[0] || null;
  const existingPlan = primaryFeature?.properties?._planejamento || null;

  const [form, setForm] = useState({
    scopeType: 'selecionados',
    safra: safra || '',
    frenteColheita: '',
    blocoColheita: '',
    dataColheita: '',
    mesColheita: '',
    sequencia: '',
    tchEst: '',
    horasProdutivas: '14',
    tiroMedio: '600',
    numeroLinhas: '1',
    capacidadeTransbordo: '16,50',
    manobra: '01:00',
    aguardando: '00:30',
    velocidadeIda: '28',
    velocidadeVolta: '26',
    densidadeCarga: '75',
    numeroColhedoras: '4',
    numeroTratores: '7',
    idadeCorte: '',
    velocidadeColheitaManual: '',
    raioMedioManual: '',
    observacao: ''
  });

  useEffect(() => {
    if (!isModalOpen) return;
    let cancelled = false;
    (async () => {
      const defaults = await getColheitaPremissas(companyId);
      if (cancelled) return;
      setPremissasDefaults(defaults);

      const feature = selectedFeatures[0] || null;
      const p = feature?.properties || {};
      const plan = p._planejamento || {};

      const initialSafra = plan.safra || safra || '';
      const initialFrente = formatFrenteValue(plan.frenteColheita || p.FRENTE || '');
      const nextDefaults = !plan?.id
        ? await getNextPlanejamentoDefaults({ companyId, safra: initialSafra, frenteColheita: initialFrente })
        : { sequencia: '', dataColheita: '', mesColheita: '' };
      const autoDate = plan.dataColheita || plan.dataEntradaPlanejada || nextDefaults.dataColheita || getAutoDateField(p, ['DATA_COLHEITA', 'DATA_CORTE', 'DT_CORTE', 'dataColheita']);
      const autoIdadeCorte = parseBrazilianFloat(plan.idadeCorte || getAutoNumberField(p, ['IDADE_CORTE', 'IDCORT', 'IDADECORT', 'MATURACAO_IDEAL']));
      const latestTch = await getLatestTchEstimate(companyId, safra, getUniqueTalhaoId(feature));
      const autoTch = parseBrazilianFloat(
        plan.tchEst ||
        latestTch ||
        getAutoNumberField(p, ['TCH_EST', 'TCH', 'TCH_PREV', 'TCH_ESTIMADO']) ||
        (plan.toneladasEstimadas && plan.areaTotal ? (parseBrazilianFloat(plan.toneladasEstimadas) / Math.max(parseBrazilianFloat(plan.areaTotal), 0.0001)) : 0)
      );

      setForm({
        scopeType: plan.scopeType || 'selecionados',
        safra: initialSafra,
        frenteColheita: initialFrente,
        blocoColheita: plan.blocoColheita || plan.bloco || p.BLOCO || '',
        dataColheita: formatDateInput(autoDate),
        mesColheita: plan.mesColheita || nextDefaults.mesColheita || (autoDate ? MONTHS[Math.max(0, new Date(formatDateInput(autoDate)).getMonth())] : ''),
        sequencia: plan.sequencia ?? nextDefaults.sequencia ?? '',
        tchEst: toInputNumber(autoTch || ''),
        horasProdutivas: toInputNumber(plan.horasProdutivas ?? defaults.horasProdutivas, toInputNumber(defaults.horasProdutivas)),
        tiroMedio: toInputNumber(plan.tiroMedio ?? defaults.tiroMedio, toInputNumber(defaults.tiroMedio)),
        numeroLinhas: toInputNumber(plan.numeroLinhas ?? defaults.numeroLinhas, toInputNumber(defaults.numeroLinhas)),
        capacidadeTransbordo: toInputNumber(plan.capacidadeTransbordo ?? defaults.capacidadeTransbordo, toInputNumber(defaults.capacidadeTransbordo)),
        manobra: plan.manobra || defaults.manobra || '01:00',
        aguardando: plan.aguardando || defaults.aguardando || '00:30',
        velocidadeIda: toInputNumber(plan.velocidadeIda ?? defaults.velocidadeIda, toInputNumber(defaults.velocidadeIda)),
        velocidadeVolta: toInputNumber(plan.velocidadeVolta ?? defaults.velocidadeVolta, toInputNumber(defaults.velocidadeVolta)),
        densidadeCarga: toInputNumber(plan.densidadeCarga ?? defaults.densidadeCarga, toInputNumber(defaults.densidadeCarga)),
        numeroColhedoras: toInputNumber(plan.numeroColhedoras ?? defaults.numeroColhedoras, toInputNumber(defaults.numeroColhedoras)),
        numeroTratores: toInputNumber(plan.numeroTratores ?? defaults.numeroTratores, toInputNumber(defaults.numeroTratores)),
        idadeCorte: toInputNumber(plan.idadeCorte ?? autoIdadeCorte, autoIdadeCorte ? toInputNumber(autoIdadeCorte) : ''),
        velocidadeColheitaManual: toInputNumber(plan.velocidadeColheitaManual ?? ''),
        raioMedioManual: toInputNumber(plan.raioMedioManual ?? defaults.raioMedio ?? ''),
        observacao: plan.observacao || ''
      });
    })();

    return () => {
      cancelled = true;
    };


  }, [isModalOpen, selectedFeatures, safra, companyId]);

  useEffect(() => {
    if (!isModalOpen || existingPlan?.id || !companyId || !form.safra || !form.frenteColheita) return;
    let cancelled = false;

    (async () => {
      try {
        const nextDefaults = await getNextPlanejamentoDefaults({
          companyId,
          safra: form.safra,
          frenteColheita: form.frenteColheita
        });
        if (cancelled) return;
        setForm(prev => {
          const shouldApplySeq = !prev.sequencia || prev.sequencia === '1';
          const shouldApplyDate = !prev.dataColheita;
          if (!shouldApplySeq && !shouldApplyDate) return prev;
          return {
            ...prev,
            sequencia: shouldApplySeq ? (nextDefaults.sequencia || prev.sequencia) : prev.sequencia,
            dataColheita: shouldApplyDate ? (nextDefaults.dataColheita || prev.dataColheita) : prev.dataColheita,
            mesColheita: shouldApplyDate ? (nextDefaults.mesColheita || prev.mesColheita) : prev.mesColheita
          };
        });
      } catch (error) {
        console.error('Erro ao calcular próxima sequência do planejamento:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isModalOpen, existingPlan?.id, companyId, form.safra, form.frenteColheita]);

  const scopeFeatures = useMemo(() => {
    const allVisible = enhancedGeoJson?.features || [];
    if (!allVisible.length) return [];

    if (form.scopeType === 'filtrados') return allVisible;
    if (form.scopeType === 'fazenda') {
      const targetFeature = selectedFeatures[0] || allVisible[0];
      const fazendaName = targetFeature ? getFazendaName(targetFeature.properties) : '';
      if (!fazendaName) return allVisible;
      return allVisible.filter(f => getFazendaName(f.properties) === fazendaName);
    }
    return selectedFeatures;
  }, [enhancedGeoJson, form.scopeType, selectedFeatures]);

  useEffect(() => {
    if (!isModalOpen || !companyId) return;
    let cancelled = false;

    (async () => {
      try {
        const [talhoes, fazendas] = await Promise.all([
          db.talhoes.where('companyId').equals(companyId).toArray(),
          db.fazendas.where('companyId').equals(companyId).toArray()
        ]);

        if (cancelled) return;
        setCadastroTalhoesIndex(buildCadastroTalhoesIndex(talhoes, fazendas));
      } catch (error) {
        console.error('Erro ao carregar dados de Cadastro Geral para idade média:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isModalOpen, companyId]);

  const derived = useMemo(() => {
    // Calculo automático de área base do escopo
    const scopeArea = scopeFeatures.reduce((sum, feature) => {
      const area = parseBrazilianFloat(feature?.properties?.AREA);
      return sum + (isNaN(area) ? 0 : area);
    }, 0);

    // Agora não há mais campo manual, usará estritamente a área do escopo
    const areaTotal = scopeArea;
    const tchEst = Math.max(parseInputNumber(form.tchEst) || 0, 0);

    // Toneladas baseadas em areaTotal x TCH Est
    const toneladasEstimadas = areaTotal * tchEst;

    // Valores parseados com segurança (SEERRO... ; 0)
    const horasProdutivas = Math.max(parseInputNumber(form.horasProdutivas) || 0, 0);
    const tiroMedio = Math.max(parseInputNumber(form.tiroMedio) || 0, 0.0001); // Proteção divisão por 0
    const numeroLinhas = Math.max(parseInputNumber(form.numeroLinhas) || 0, 0);
    const capacidadeTransbordo = Math.max(parseInputNumber(form.capacidadeTransbordo) || 0, 0.0001);
    const densidadeCarga = Math.max(parseInputNumber(form.densidadeCarga) || 0, 0.0001);
    const numeroColhedoras = Math.max(parseInputNumber(form.numeroColhedoras) || 0, 0);
    const manobraMin = Math.max(parseMinutes(form.manobra) || 0, 0);
    const aguardMin = Math.max(parseMinutes(form.aguardando) || 0, 0);

    // VEL_COLHEITA =SEERRO(SE(60/([@[TCH_PLAN]]/6666)/1000>6,5;6,5;(60/([@[TCH_PLAN]]/6666)/1000));0)
    const velColheitaAutoBase = tchEst > 0 ? (60 / (tchEst / 6666) / 1000) : 0;
    const velColheitaAuto = velColheitaAutoBase > 6.5 ? 6.5 : velColheitaAutoBase;

    const velColheitaManual = parseInputNumber(form.velocidadeColheitaManual);
    const velocidadeColheita = velColheitaManual > 0 ? velColheitaManual : (velColheitaAuto || 0);

    // HRS_MANOB_(H) =SEERRO((([@[VEL_COLHEITA]]*1000)/[@[TIRO_MEDIO_(M)]])*([@[MANOBRA_(MM:SS)]]*24)*[@[HRS_PRODUTIVAS_(H)]];0)
    // O Excel trata datas, então *24 transforma em horas decimais. manobraMin/60 atinge o mesmo objetivo em JS
    const horasManobraRaw = (((velocidadeColheita * 1000) / tiroMedio) * (manobraMin / 60) * horasProdutivas);
    const horasManobra = isNaN(horasManobraRaw) || !isFinite(horasManobraRaw) ? 0 : horasManobraRaw;

    // HRS_CORTE_(H) =SEERRO([@[HRS_PRODUTIVAS_(H)]]-[@[HRS_MANOB_(H)]];0)
    const horasCorteRaw = horasProdutivas - horasManobra;
    const horasCorte = (isNaN(horasCorteRaw) || horasCorteRaw < 0) ? 0 : horasCorteRaw;

    // PMC de acordo com a fórmula enviada
    const velocidadeEmMetrosPorMinuto = Math.max((velocidadeColheita * 1000) / 60, 0.0001);
    const tempoTiroMin = tiroMedio / velocidadeEmMetrosPorMinuto;
    const cicloColheitaMin = tempoTiroMin + manobraMin;
    const fatorManobra = cicloColheitaMin > 0 ? (1 - (manobraMin / cicloColheitaMin)) : 1;

    const hrsCorteTemp = horasProdutivas * fatorManobra;

    // Produção Hora Base: (((VEL_COLHEITA*1000) * ((TCH_PLAN*1000)/(10000/1.5))) * NUMERO_LINHAS) / 1000
    // Onde TCH_PLAN é tchEst, espacamento assumido padrão 1.5 se não vier na fórmula original
    const prodHoraBase = (((velocidadeColheita * 1000) * ((tchEst * 1000) / (10000 / 1.5))) * numeroLinhas) / 1000;
    const prodMinutoBase = Math.max(prodHoraBase / 60, 0.0001);

    // Tempo encher = CAP_TRANSBORDO / prodMinutoBase
    const tempoEncherTransbordoMin = capacidadeTransbordo / prodMinutoBase;
    const cicloAguardMin = tempoEncherTransbordoMin + aguardMin;
    const fatorAguard = cicloAguardMin > 0 ? (1 - (aguardMin / cicloAguardMin)) : 1;

    const pmcRaw = hrsCorteTemp * fatorAguard * prodHoraBase;
    const pmc = isNaN(pmcRaw) || !isFinite(pmcRaw) || pmcRaw < 0 ? 0 : pmcRaw;

    // COTA =[@PMC]*[@[Nº_COLHEDORAS]]
    const cotaRaw = pmc * numeroColhedoras;
    const cota = isNaN(cotaRaw) || !isFinite(cotaRaw) || cotaRaw < 0 ? 0 : cotaRaw;

    const raioMedioManual = parseInputNumber(form.raioMedioManual);
    const raioMedio = raioMedioManual > 0 ? raioMedioManual : Math.max(parseInputNumber(premissasDefaults.raioMedio) || 0, 0);

    const dataColheita = form.dataColheita || getAutoDateField(scopeFeatures[0]?.properties, ['DATA_COLHEITA', 'DATA_CORTE', 'DT_CORTE', 'dataColheita']);
    const idadesMedias = getAverageIdades(scopeFeatures, dataColheita, cadastroTalhoesIndex);
    const idadeAtual = idadesMedias.idadeAtual;
    const idadeCorteCalculada = idadesMedias.idadeCorte;
    const idadeCorteManual = Math.max(parseInputNumber(form.idadeCorte) || 0, 0);
    const idadeCorte = idadeCorteCalculada > 0 ? idadeCorteCalculada : idadeCorteManual;
    const maturacao = inferMaturacao(idadeAtual, idadeCorte);

    return {
      areaTotal,
      toneladasEstimadas,
      pmc,
      cota,
      idadeAtual,
      idadeCorte,
      maturacao,
      velocidadeColheita,
      horasManobra,
      horasCorte,
      raioMedio,
      scopeCount: scopeFeatures.length,
      fazendaNome: scopeFeatures[0] ? getFazendaName(scopeFeatures[0].properties) : ''
    };
  }, [form, scopeFeatures, premissasDefaults, cadastroTalhoesIndex]);



  useEffect(() => {
    if (!isModalOpen || !companyId || !form.safra || !form.frenteColheita || !form.sequencia || !derived.cota || !derived.toneladasEstimadas) {
      setPreview(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setLoadingPreview(true);
        const data = await previewPlanejamentoServer({
          companyId,
          safra: form.safra,
          frenteColheita: form.frenteColheita,
          sequencia: form.sequencia,
          dataColheita: form.dataColheita,
          toneladasEstimadas: derived.toneladasEstimadas,
          cota: derived.cota,
          sequenciaGrupoId: existingPlan?.sequenciaGrupoId || ''
        });
        if (cancelled) return;
        setPreview(data || null);

        if (data?.existeSequenciaAnterior && data?.dataEntradaPlanejada) {
          setForm(prev => {
            if (prev.dataColheita === data.dataEntradaPlanejada) return prev;
            return {
              ...prev,
              dataColheita: data.dataEntradaPlanejada,
              mesColheita: MONTHS[new Date(data.dataEntradaPlanejada).getMonth()] || prev.mesColheita
            };
          });
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Erro ao gerar prévia do planejamento:', error);
          setPreview(null);
        }
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isModalOpen, companyId, form.safra, form.frenteColheita, form.sequencia, form.dataColheita, derived.cota, derived.toneladasEstimadas, existingPlan?.sequenciaGrupoId]);

  const handleSave = async () => {
    if (readOnlyMode) {
      return;
    }
    if (!companyId) {
      showError('Erro', 'CompanyId não encontrado na sessão. Faça login novamente.');
      return;
    }

    if (!form.safra) {
      showError('Atenção', 'Safra é obrigatória.');
      return;
    }

    if (!form.frenteColheita || !form.dataColheita) {
      showError('Atenção', 'Frente e Data de Colheita são obrigatórios.');
      return;
    }

    if (!scopeFeatures.length) {
      showError('Atenção', 'Nenhum talhão disponível no escopo escolhido.');
      return;
    }

    setLoading(true);
    try {
      const commonPayload = {
        companyId,
        safra: form.safra,
        frenteColheita: formatFrenteValue(form.frenteColheita),
        dataColheita: form.dataColheita,
        mesColheita: form.mesColheita || MONTHS[new Date(form.dataColheita).getMonth()],
        observacao: form.observacao,
        scopeType: form.scopeType,
        bloco: form.blocoColheita || scopeFeatures[0]?.properties?.BLOCO || 'GERAL',
        blocoColheita: form.blocoColheita || scopeFeatures[0]?.properties?.BLOCO || 'GERAL',
        tchEst: parseInputNumber(form.tchEst),
        horasProdutivas: parseInputNumber(form.horasProdutivas),
        tiroMedio: parseInputNumber(form.tiroMedio),
        numeroLinhas: parseInputNumber(form.numeroLinhas),
        capacidadeTransbordo: parseInputNumber(form.capacidadeTransbordo),
        manobra: form.manobra,
        aguardando: form.aguardando,
        velocidadeIda: parseInputNumber(form.velocidadeIda),
        velocidadeVolta: parseInputNumber(form.velocidadeVolta),
        densidadeCarga: parseInputNumber(form.densidadeCarga),
        numeroColhedoras: parseInputNumber(form.numeroColhedoras),
        numeroTratores: parseInputNumber(form.numeroTratores),
        idadeCorte: derived.idadeCorte,
        areaTotal: derived.areaTotal,
        toneladasEstimadas: derived.toneladasEstimadas,
        velocidadeColheita: derived.velocidadeColheita,
        velocidadeColheitaManual: parseInputNumber(form.velocidadeColheitaManual),
        horasManobra: derived.horasManobra,
        horasCorte: derived.horasCorte,
        raioMedio: derived.raioMedio,
        raioMedioManual: parseInputNumber(form.raioMedioManual),
        pmc: derived.pmc,
        cota: derived.cota,
        idadeAtual: derived.idadeAtual,
        maturacao: derived.maturacao,
        statusPlanejamento: 'Planejado',
        sequencia: form.sequencia !== '' ? parseInt(form.sequencia, 10) : 1
      };

      const talhoes = scopeFeatures.map((feature) => {
        const p = feature.properties || {};
        return {
          talhaoId: getUniqueTalhaoId(feature),
          fazendaId: p.FAZENDA || derived.fazendaNome || 'N/A',
          fazendaNome: getFazendaName(p),
          talhaoNome: p.TALHAO || '',
          fundoAgricola: p.FUNDO_AGR || '',
          featureArea: parseBrazilianFloat(p.AREA),
          id: p._planejamento?.id || undefined
        };
      });

      const result = await savePlanejamentoServer({
        companyId,
        safra: form.safra,
        frenteColheita: commonPayload.frenteColheita,
        sequencia: commonPayload.sequencia,
        sequenciaGrupoId: existingPlan?.sequenciaGrupoId || '',
        commonPayload,
        talhoes
      });

      if (result?.preview) {
        setPreview(result.preview);
        if (result.preview?.dataEntradaPlanejada) {
          setForm(prev => ({
            ...prev,
            dataColheita: result.preview.dataEntradaPlanejada,
            mesColheita: MONTHS[new Date(result.preview.dataEntradaPlanejada).getMonth()] || prev.mesColheita
          }));
        }
      }

      showSuccess('Sucesso', `Planejamento salvo para ${scopeFeatures.length} talhão(ões).`);
      setIsModalOpen(false);
    } catch (error) {
      showError('Erro', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    if (readOnlyMode) {
      return;
    }
    const confirm = await showConfirm('Remover Planejamento', 'Deseja remover o planejamento dos talhões deste escopo?');
    if (!confirm.isConfirmed) return;

    setLoading(true);
    try {
      let removedCount = 0;
      for (const feature of scopeFeatures) {
        if (feature?.properties?._planejamento?.id) {
          await removePlanejamento(feature.properties._planejamento.id);
          removedCount++;
        }
      }
      if (removedCount > 0) {
        showSuccess('Removido', `Planejamento removido de ${removedCount} talhão(ões).`);
        setIsModalOpen(false);
      } else {
        showError('Aviso', 'Nenhum dos talhões do escopo possui planejamento ativo.');
      }
    } catch (error) {
      showError('Erro', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = () => {
    if (readOnlyMode) return;
    if (!talhoesIds?.length) {
      showError('Planejamento Safra', 'Selecione pelo menos um talhão antes de abrir o planejamento.');
      return;
    }
    if (!selectedFeatures.length) {
      showError('Planejamento Safra', 'Não foi possível localizar os talhões selecionados no mapa. Tente limpar a seleção e selecionar novamente.');
      return;
    }
    setIsModalOpen(true);
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={handleOpenModal}
        disabled={readOnlyMode || !talhoesIds?.length}
        className="w-full rounded-2xl py-3 flex items-center justify-center gap-2 font-semibold text-[15px] transition-transform hover:scale-[1.02] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: '#3b82f6', color: '#ffffff' }}
      >
        <Layers className="w-4 h-4" />
        Planejamento Safra
      </button>

      {isModalOpen && createPortal(
        <AnimatePresence>
          <div className="fixed inset-x-0 top-[72px] bottom-0 z-[9000] flex items-center justify-center px-3 pt-2 pb-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.985 }}
              className="w-full max-w-[1380px] h-[calc(100vh-96px)] max-h-[calc(100vh-96px)] bg-[#08111F] border border-white/12 rounded-[26px] overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 gap-4 shrink-0">
                <div>
                  <h2 className="text-[18px] font-bold text-white">Aplicar Frente + Colheitabilidade</h2>
                  <p className="text-xs text-[#8E9BB5]">Alocar frente e calcular viabilidade de colheita</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/80">
                    {loadingPreview ? 'Calculando...' : `${derived.scopeCount} talhão(ões)`}
                  </div>
                  <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                    <X className="w-5 h-5 text-white/70" />
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 p-2 overflow-y-auto flex flex-col gap-2">
                <div className="w-full shrink-0">
                  <SectionBox title="Alocação">
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-[1fr_0.8fr_1.5fr_0.8fr_1fr_0.6fr] gap-3">
                      <Field label="Escopo">
                        <select value={form.scopeType} onChange={(e) => setForm(prev => ({ ...prev, scopeType: e.target.value }))} className={inputClass}>
                          <option value="selecionados" className="bg-[#08111F]">Selecionados</option>
                          <option value="filtrados" className="bg-[#08111F]">Filtrados</option>
                          <option value="fazenda" className="bg-[#08111F]">Toda a fazenda</option>
                        </select>
                      </Field>
                      <Field label="Frente">
                        <input
                          value={form.frenteColheita}
                          onChange={(e) => setForm(prev => ({ ...prev, frenteColheita: formatFrenteValue(e.target.value) }))}
                          className={inputClass}
                          inputMode="numeric"
                          placeholder="F - 2"
                        />
                      </Field>
                      <Field label="Bloco Colheita">
                        <input value={form.blocoColheita} onChange={(e) => setForm(prev => ({ ...prev, blocoColheita: e.target.value }))} className={inputClass} placeholder="Ex. Bloco A" />
                      </Field>
                      <Field label="Safra">
                        <input value={form.safra} onChange={(e) => setForm(prev => ({ ...prev, safra: e.target.value }))} className={inputClass} placeholder="2026/2027" />
                      </Field>
                      <Field label="Data Colheita">
                        <input type="date" value={form.dataColheita} onChange={(e) => setForm(prev => ({ ...prev, dataColheita: e.target.value, mesColheita: MONTHS[new Date(e.target.value).getMonth()] || prev.mesColheita }))} className={inputClass} />
                      </Field>
                      <Field label="Seq">
                        <input value={form.sequencia} onChange={(e) => setForm(prev => ({ ...prev, sequencia: e.target.value }))} className={inputClass} placeholder="1" />
                      </Field>
                    </div>
                  </SectionBox>
                </div>

                <div className="w-full flex flex-col lg:flex-row gap-3 shrink-0">
                  <div className="w-full lg:w-[45%] flex flex-col">
                    <SectionBox title="Parâmetros" className="h-full">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <Field label="TCH Est"><input value={form.tchEst} onChange={(e) => setForm(prev => ({ ...prev, tchEst: e.target.value }))} className={inputClass} /></Field>
                        <Field label="Hrs Produt. (h)"><input value={form.horasProdutivas} onChange={(e) => setForm(prev => ({ ...prev, horasProdutivas: e.target.value }))} className={inputClass} /></Field>
                        <Field label="Tiro Médio (m)"><input value={form.tiroMedio} onChange={(e) => setForm(prev => ({ ...prev, tiroMedio: e.target.value }))} className={inputClass} /></Field>
                        <Field label="Nº Linhas"><input value={form.numeroLinhas} onChange={(e) => setForm(prev => ({ ...prev, numeroLinhas: e.target.value }))} className={inputClass} /></Field>
                        <Field label="Cap. Transb. (t)"><input value={form.capacidadeTransbordo} onChange={(e) => setForm(prev => ({ ...prev, capacidadeTransbordo: e.target.value }))} className={inputClass} /></Field>
                        <Field label="Manobra (mm:ss)"><input value={form.manobra} onChange={(e) => setForm(prev => ({ ...prev, manobra: e.target.value }))} className={inputClass} /></Field>
                        <Field label="Aguard. (mm:ss)"><input value={form.aguardando} onChange={(e) => setForm(prev => ({ ...prev, aguardando: e.target.value }))} className={inputClass} /></Field>
                        <Field label="Vel. Ida (km)"><input value={form.velocidadeIda} onChange={(e) => setForm(prev => ({ ...prev, velocidadeIda: e.target.value }))} className={inputClass} /></Field>
                        <Field label="Vel. Volta (km)"><input value={form.velocidadeVolta} onChange={(e) => setForm(prev => ({ ...prev, velocidadeVolta: e.target.value }))} className={inputClass} /></Field>
                        <Field label="Densid. (t/cam)"><input value={form.densidadeCarga} onChange={(e) => setForm(prev => ({ ...prev, densidadeCarga: e.target.value }))} className={inputClass} /></Field>
                      </div>
                    </SectionBox>
                  </div>

                  <div className="w-full lg:w-[30%] flex flex-col gap-3">
                    <SectionBox title="Máquinas">
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Nº Colhedoras"><input value={form.numeroColhedoras} onChange={(e) => setForm(prev => ({ ...prev, numeroColhedoras: e.target.value }))} className={inputClass} /></Field>
                        <Field label="Nº Tratores"><input value={form.numeroTratores} onChange={(e) => setForm(prev => ({ ...prev, numeroTratores: e.target.value }))} className={inputClass} /></Field>
                      </div>
                    </SectionBox>

                    <SectionBox title="Resultados" className="flex-1">
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Vel. Colheita"><input value={getVelocidadeInputValue(form.velocidadeColheitaManual, derived.velocidadeColheita)} onChange={(e) => setForm(prev => ({ ...prev, velocidadeColheitaManual: e.target.value }))} onBlur={() => setForm(prev => ({ ...prev, velocidadeColheitaManual: prev.velocidadeColheitaManual ? formatBrazilianNumber(parseInputNumber(prev.velocidadeColheitaManual) || 0, 2, 2) : '' }))} className={inputClass} /></Field>
                        <Field label="Hrs Manobra"><input value={formatBrazilianNumber(derived.horasManobra, 2, 2)} readOnly className={readonlyClass} /></Field>
                        <Field label="Hrs Corte"><input value={formatBrazilianNumber(derived.horasCorte, 2, 2)} readOnly className={readonlyClass} /></Field>
                        <Field label="Raio Médio (km)"><input value={toInputNumber(derived.raioMedio)} onChange={(e) => setForm(prev => ({ ...prev, raioMedioManual: e.target.value }))} className={inputClass} /></Field>
                      </div>
                    </SectionBox>
                  </div>

                  <div className="w-full lg:w-[25%] flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-3">
                      <StatCard label="PMC (ton/dia)" value={formatBrazilianNumber(derived.pmc, 2, 2)} icon={BarChart3} accent="amber" />
                      <StatCard label="Cota (ton/dia)" value={formatBrazilianNumber(derived.cota, 2, 2)} icon={Gauge} accent="amber" />
                      <StatCard label="Idade Atual" value={formatBrazilianNumber(derived.idadeAtual, 1, 1)} suffix="meses" icon={Clock3} accent="orange" />
                      <StatCard label="Idade Corte" value={formatBrazilianNumber(derived.idadeCorte, 1, 1)} suffix="meses" icon={CalendarDays} accent="teal" />
                      <StatCard label="Área Escopo" value={formatBrazilianNumber(derived.areaTotal, 2, 2)} suffix="ha" icon={Layers} accent="blue" />
                      <StatCard label="Ton. Estimada" value={formatBrazilianNumber(derived.toneladasEstimadas, 2, 2)} suffix="t" icon={Tractor} accent="purple" />
                    </div>

                    <div className={`rounded-2xl border px-4 py-3 shrink-0 flex flex-col justify-center items-center min-h-[70px] ${MATURACAO_COLORS[derived.maturacao] || MATURACAO_COLORS.Média}`}>
                      <div className="text-[10px] uppercase tracking-[0.08em] opacity-80 mb-1">Maturação</div>
                      <div className="text-xl font-bold leading-none">{derived.maturacao}</div>
                    </div>
                  </div>
                </div>

                <div className="w-full shrink-0">
                  <SectionBox title="Resumo e observação">
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1.3fr] gap-3 items-start">
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="text-[10px] uppercase tracking-[0.08em] text-[#8E9BB5] mb-1">Escopo atual</div>
                        <div className="text-white font-semibold">{form.scopeType === 'selecionados' ? 'Talhões selecionados' : form.scopeType === 'filtrados' ? 'Talhões filtrados' : 'Toda a fazenda'}</div>
                        <div className="text-sm text-white/60 mt-1">{derived.scopeCount} talhão(ões) • {derived.fazendaNome || 'Sem fazenda definida'}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        {(() => {
                          const resumo = preview?.resumoPlanejamento || {};
                          const saldoRecebido = resumo.saldoRecebidoSequencia ?? resumo.saldoHerdadoDaSequenciaAnterior ?? preview?.saldoHerdado ?? preview?.capacidadeRestanteDiaEntrada ?? 0;
                          const proximaSeq = resumo.proximaSequencia || (preview?.sequenciaCalculada ? preview.sequenciaCalculada + 1 : '');

                          // Fonte única: o cronograma exibido aqui vem do backend.
                          // Não usar cálculo local antigo, porque ele subtraía o saldo recebido e gerava saída/sobra erradas.
                          const entradaResumo = resumo.dataEntradaSequencia || preview?.dataEntradaPlanejada || form.dataColheita;

                          const saidaResumo = resumo.dataSaidaSequencia || preview?.dataSaidaPlanejada || entradaResumo;
                          const proximaEntradaResumo = resumo.proximaEntradaSequencia || preview?.proximaEntradaSequencia || preview?.dataSaidaPlanejada || entradaResumo;
                          const diasCheios = resumo.diasCheios ?? preview?.diasCheios ?? preview?.diasDaFrente ?? 0;
                          const ultimoDiaTon = resumo.saldoDisponivelProximaSequencia ?? preview?.saldoUltimoDia ?? preview?.sobraSequencia ?? 0;

                          return (
                            <>
                              <div className="text-[10px] uppercase tracking-[0.08em] text-[#8E9BB5] mb-1">Cronograma</div>
                              <div className="text-white font-semibold">Entrada: {formatDateBr(entradaResumo)}</div>
                              <div className="text-sm text-white/70 mt-1">Saída: {formatDateBr(saidaResumo)}</div>
                              <div className="text-sm text-amber-200/90 mt-1">Próx. seq. {proximaSeq || '-'}: {formatDateBr(proximaEntradaResumo)}</div>
                              <div className="text-sm text-white/70 mt-1">Dias da frente: {diasCheios || 0} • Sobra: {formatBrazilianNumber(ultimoDiaTon || 0, 2, 2)} t</div>
                              {(preview?.existeSequenciaAnterior || saldoRecebido > 0) ? (
                                <div className="text-xs text-sky-200/80 mt-1">Saldo recebido: {formatBrazilianNumber(saldoRecebido || 0, 2, 2)} t</div>
                              ) : null}
                            </>
                          );
                        })()}
                      </div>
                      <Field label="Observação">
                        <textarea value={form.observacao} onChange={(e) => setForm(prev => ({ ...prev, observacao: e.target.value }))} className={`${inputClass} min-h-[78px]`} placeholder="Opcional..." />
                      </Field>
                    </div>
                  </SectionBox>
                </div>
              </div>

              <div className="px-5 py-2 border-t border-white/10 flex flex-col sm:flex-row gap-3 justify-end shrink-0">
                <button onClick={() => setIsModalOpen(false)} className="px-5 py-3 rounded-xl border border-white/10 text-white font-bold hover:bg-white/5 transition-colors">
                  Cancelar
                </button>
                {(existingPlan || scopeFeatures.some(feature => feature?.properties?._planejamento?.id)) && (
                  <button onClick={handleRemove} disabled={readOnlyMode || loading} className="px-5 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold transition-colors flex items-center justify-center gap-2">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Remover'}
                  </button>
                )}
                <button onClick={handleSave} disabled={readOnlyMode || loading} className="px-5 py-3 rounded-xl bg-[#D9B04C] hover:bg-[#e2bd63] text-[#101827] font-bold transition-colors flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(217,176,76,0.25)]">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Aplicar Frente'}
                </button>
              </div>
            </motion.div>
          </div>
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};
