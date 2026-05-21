import React from 'react';
import { ArrowLeft, Bug, CheckCircle2, CloudOff, RefreshCw, Save, Wifi, WifiOff } from 'lucide-react';
import { showConfirm, showError, showSuccess } from '../../utils/alert';
import {
  calculateBroca,
  isOnline,
  listLocalLancamentosBroca,
  loadFazendas,
  loadTalhoesByFazenda,
  saveLancamentoBroca,
  syncPendingLancamentosBroca,
} from '../../services/lancamentos/infestacaoBrocaService';

const initialForm = () => ({
  fazendaCodigo: '',
  fazendaNome: '',
  dataInspecao: new Date().toISOString().slice(0, 10),
  talhao: '',
  talhaoId: '',
  variedade: '',
  entrenosContados: '',
  brocadoBase: '',
  brocadoMeio: '',
  brocadoTopo: '',
});

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-300">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

const inputClass = 'w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none transition focus:border-amber-300/50 focus:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-70';

function StatusBadge({ online }) {
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${online ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' : 'border-amber-400/25 bg-amber-400/10 text-amber-200'}`}>
      {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
      {online ? 'Online' : 'Offline'}
    </div>
  );
}

function LancamentoRow({ item }) {
  const statusStyle = item.syncStatus === 'synced'
    ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
    : item.status === 'erro'
      ? 'border-red-400/25 bg-red-400/10 text-red-200'
      : 'border-amber-400/25 bg-amber-400/10 text-amber-200';

  return (
    <div className="grid gap-3 rounded-2xl border border-white/8 bg-white/[0.035] p-4 text-sm text-slate-300 md:grid-cols-[1fr_auto] md:items-center">
      <div>
        <div className="font-semibold text-white">{item.dataInspecao || '-'} • Fazenda {item.fazendaCodigo || '-'} • Talhão {item.talhao || '-'}</div>
        <div className="mt-1 text-xs text-slate-400">
          Variedade: {item.variedade || '-'} • Brocado: {item.totalBrocado ?? 0} • Brocamento: {Number(item.percentualBrocamento || 0).toFixed(2)}%
        </div>
      </div>
      <span className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusStyle}`}>
        {item.syncStatus === 'synced' ? 'Sincronizado' : item.status === 'erro' ? 'Erro/Pendente' : 'Pendente'}
      </span>
    </div>
  );
}

export default function InfestacaoBrocaPage({ companyId, session, onBack }) {
  const [form, setForm] = React.useState(initialForm);
  const [fazendas, setFazendas] = React.useState([]);
  const [talhoes, setTalhoes] = React.useState([]);
  const [recentes, setRecentes] = React.useState([]);
  const [saving, setSaving] = React.useState(false);
  const [online, setOnline] = React.useState(isOnline());
  const [syncing, setSyncing] = React.useState(false);

  const totals = React.useMemo(() => calculateBroca(form), [form]);

  const refreshRecentes = React.useCallback(async () => {
    const rows = await listLocalLancamentosBroca(companyId, 20);
    setRecentes(rows);
  }, [companyId]);

  React.useEffect(() => {
    let mounted = true;
    loadFazendas(companyId).then((rows) => mounted && setFazendas(rows));
    refreshRecentes();
    return () => { mounted = false; };
  }, [companyId, refreshRecentes]);

  React.useEffect(() => {
    let mounted = true;
    if (!form.fazendaCodigo) {
      setTalhoes([]);
      return () => { mounted = false; };
    }
    loadTalhoesByFazenda(companyId, form.fazendaCodigo).then((rows) => mounted && setTalhoes(rows));
    return () => { mounted = false; };
  }, [companyId, form.fazendaCodigo]);

  React.useEffect(() => {
    const onOnline = async () => {
      setOnline(true);
      setSyncing(true);
      try {
        const result = await syncPendingLancamentosBroca();
        await refreshRecentes();
        if (result.synced > 0) showSuccess('Sincronização concluída', `${result.synced} lançamento(s) pendente(s) enviados ao banco.`);
      } finally {
        setSyncing(false);
      }
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refreshRecentes]);

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleFazendaChange = (value) => {
    const selected = fazendas.find((f) => f.codigo === value);
    setForm((prev) => ({
      ...prev,
      fazendaCodigo: selected?.codigo || '',
      fazendaNome: selected?.nome || '',
      talhao: '',
      talhaoId: '',
      variedade: '',
    }));
  };

  const handleTalhaoChange = (value) => {
    const selected = talhoes.find((t) => t.id === value || t.talhao === value);
    setForm((prev) => ({
      ...prev,
      talhao: selected?.talhao || '',
      talhaoId: selected?.id || '',
      variedade: selected?.variedade || '',
    }));
  };

  const handleManualTalhao = (value) => {
    setForm((prev) => ({ ...prev, talhao: value, talhaoId: `${prev.fazendaCodigo}_${value}` }));
  };

  const handleSave = async () => {
    const confirm = await showConfirm('Deseja salvar esta inspeção?', 'Confira os dados antes de guardar o lançamento de infestação broca.', 'Salvar', 'Cancelar');
    if (!confirm.isConfirmed) return;

    setSaving(true);
    try {
      const result = await saveLancamentoBroca(form, { companyId, session });
      await refreshRecentes();
      setForm(initialForm());

      if (result.mode === 'online') {
        showSuccess('Inspeção sincronizada', 'O lançamento foi salvo no banco de dados.');
      } else if (result.mode === 'offline') {
        showSuccess('Inspeção salva localmente', 'Sem internet. O lançamento ficou pendente e será sincronizado quando a conexão voltar.');
      } else {
        showSuccess('Inspeção salva como pendente', 'Não foi possível enviar agora. O sistema guardou localmente para sincronizar depois.');
      }
    } catch (error) {
      showError('Falha ao salvar', error?.message || 'Não foi possível salvar a inspeção.');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const result = await syncPendingLancamentosBroca();
      await refreshRecentes();
      if (result.synced > 0) showSuccess('Sincronização concluída', `${result.synced} lançamento(s) enviado(s).`);
      else showSuccess('Tudo certo', 'Não há lançamentos pendentes para sincronizar.');
    } catch (error) {
      showError('Erro ao sincronizar', error?.message || 'Não foi possível sincronizar agora.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-full bg-[#040814] px-4 py-5 text-white sm:px-6 xl:px-8 2xl:px-10">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <button type="button" onClick={onBack} className="mt-1 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-300/10 text-amber-200 shadow-lg shadow-black/20">
            <Bug className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-white">Infestação Broca</h1>
            <p className="mt-1 text-sm text-[#96a0b8]">Lançamento de inspeções com cálculo automático de brocamento.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge online={online} />
          <button type="button" onClick={handleSyncNow} disabled={syncing || !online} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            Sincronizar pendentes
          </button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="rounded-[28px] border border-white/8 bg-[#0b1220]/85 p-4 shadow-[0_18px_70px_rgba(0,0,0,0.35)] sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3 border-b border-white/8 pb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Dados da inspeção</h2>
              <p className="text-sm text-slate-400">Preencha os campos e confirme antes de salvar.</p>
            </div>
            {online ? <CheckCircle2 className="h-6 w-6 text-emerald-300" /> : <CloudOff className="h-6 w-6 text-amber-300" />}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Fazenda">
              <select value={form.fazendaCodigo} onChange={(e) => handleFazendaChange(e.target.value)} className={inputClass}>
                <option value="">Selecione...</option>
                {fazendas.map((f) => <option key={f.codigo} value={f.codigo}>{f.codigo} - {f.nome || 'Sem nome'}</option>)}
              </select>
            </Field>

            <Field label="Data da inspeção">
              <input type="date" value={form.dataInspecao} onChange={(e) => update('dataInspecao', e.target.value)} className={inputClass} />
            </Field>

            <Field label="Talhão">
              {talhoes.length > 0 ? (
                <select value={form.talhaoId || form.talhao} onChange={(e) => handleTalhaoChange(e.target.value)} className={inputClass} disabled={!form.fazendaCodigo}>
                  <option value="">Selecione...</option>
                  {talhoes.map((t) => <option key={t.id} value={t.id}>{t.talhao}</option>)}
                </select>
              ) : (
                <input value={form.talhao} onChange={(e) => handleManualTalhao(e.target.value)} className={inputClass} placeholder="Digite o talhão" disabled={!form.fazendaCodigo} />
              )}
            </Field>

            <Field label="Variedade" hint="Preenche automático quando o talhão tiver variedade cadastrada.">
              <input value={form.variedade} onChange={(e) => update('variedade', e.target.value)} className={inputClass} placeholder="Variedade" />
            </Field>

            <Field label="Entrenós contados">
              <input type="number" min="0" inputMode="decimal" value={form.entrenosContados} onChange={(e) => update('entrenosContados', e.target.value)} className={inputClass} placeholder="Ex: 100" />
            </Field>

            <Field label="Brocado base">
              <input type="number" min="0" inputMode="decimal" value={form.brocadoBase} onChange={(e) => update('brocadoBase', e.target.value)} className={inputClass} placeholder="0" />
            </Field>

            <Field label="Brocado meio">
              <input type="number" min="0" inputMode="decimal" value={form.brocadoMeio} onChange={(e) => update('brocadoMeio', e.target.value)} className={inputClass} placeholder="0" />
            </Field>

            <Field label="Brocado topo">
              <input type="number" min="0" inputMode="decimal" value={form.brocadoTopo} onChange={(e) => update('brocadoTopo', e.target.value)} className={inputClass} placeholder="0" />
            </Field>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-amber-300/20 bg-amber-300/10 p-5">
              <div className="text-sm text-amber-100/80">Total de brocado</div>
              <div className="mt-2 text-3xl font-bold text-white">{totals.totalBrocado}</div>
            </div>
            <div className="rounded-3xl border border-emerald-300/20 bg-emerald-300/10 p-5">
              <div className="text-sm text-emerald-100/80">% Brocamento</div>
              <div className="mt-2 text-3xl font-bold text-white">{totals.percentualBrocamento.toFixed(2)}%</div>
              <div className="mt-1 text-xs text-slate-300">Soma dos brocados ÷ entrenós × 100</div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setForm(initialForm())} className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-200 hover:bg-white/[0.08]">Limpar</button>
            <button type="button" onClick={handleSave} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-orange-900/20 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70">
              <Save className="h-4 w-4" />
              {saving ? 'Salvando...' : 'Guardar Inspeção'}
            </button>
          </div>
        </div>

        <aside className="rounded-[28px] border border-white/8 bg-[#0b1220]/85 p-4 shadow-[0_18px_70px_rgba(0,0,0,0.35)] sm:p-5">
          <h2 className="text-lg font-semibold text-white">Últimos lançamentos</h2>
          <p className="mt-1 text-sm text-slate-400">Mostra registros salvos localmente neste aparelho.</p>
          <div className="mt-4 space-y-3">
            {recentes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-slate-400">Nenhum lançamento salvo neste aparelho ainda.</div>
            ) : recentes.map((item) => <LancamentoRow key={item.id} item={item} />)}
          </div>
        </aside>
      </div>
    </div>
  );
}
