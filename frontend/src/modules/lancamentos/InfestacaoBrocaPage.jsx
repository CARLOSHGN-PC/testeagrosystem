import React from 'react';
import { ArrowLeft, Bug, Save, X } from 'lucide-react';
import { showConfirm, showError, showSuccess } from '../../utils/alert';
import ResponsiveSelect from './components/ResponsiveSelect';
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
  cochonilha: '',
});

const inputClass = 'w-full rounded-xl border border-white/10 bg-slate-950/55 px-4 py-3 text-slate-100 shadow-sm outline-none transition placeholder:text-slate-500 focus:border-green-400 focus:ring-2 focus:ring-green-500/20 disabled:cursor-not-allowed disabled:bg-slate-900/70 disabled:text-slate-500';

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-slate-200">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs font-medium text-green-300">{hint}</span> : null}
    </label>
  );
}

function ConexaoButton({ pendingCount, onOpenPending }) {
  if (pendingCount <= 0) return null;
  return (
    <button
      type="button"
      onClick={onOpenPending}
      className="inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-200 transition hover:bg-white/10"
      title="Clique para ver pendências"
    >
      Pendentes
      <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-slate-950">{pendingCount}</span>
    </button>
  );
}

function PendenciasModal({ open, onClose, items }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <div>
            <h3 className="text-lg font-bold text-white">Lançamentos pendentes</h3>
            <p className="text-sm text-slate-400">Registros salvos no aparelho aguardando envio ao banco.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 p-2 text-slate-300 hover:bg-white/10"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[60vh] space-y-3 overflow-auto p-4">
          {items.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">Nenhum lançamento pendente.</div>
          ) : items.map((item) => (
            <div key={item.id || item.uuidLocal} className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-slate-200">
              <div className="font-semibold">{item.dataInspecao || '-'} • Fazenda {item.fazendaCodigo || '-'} • Talhão {item.talhao || '-'}</div>
              <div className="mt-1 text-xs text-slate-400">Brocado: {item.totalBrocado ?? 0} • Brocamento: {Number(item.percentualBrocamento || 0).toFixed(2)}% • Cochonilha: {Number(item.percentualCochonilha || 0).toFixed(2)}% {item.lastError ? `• Erro: ${item.lastError}` : ''}</div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-3 border-t border-white/10 p-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10">Fechar</button>
        </div>
      </div>
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
  const [pendingOpen, setPendingOpen] = React.useState(false);

  const totals = React.useMemo(() => calculateBroca(form), [form]);
  const pendentes = React.useMemo(() => recentes.filter((r) => r.syncStatus === 'pending' || r.status === 'pendente' || r.status === 'erro'), [recentes]);

  const refreshRecentes = React.useCallback(async () => {
    const rows = await listLocalLancamentosBroca(companyId, 50);
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

  React.useEffect(() => {
    if (!online || pendentes.length === 0 || syncing) return undefined;
    const executarSync = async () => {
      if (!isOnline()) return;
      setSyncing(true);
      try {
        await syncPendingLancamentosBroca();
        await refreshRecentes();
      } finally {
        setSyncing(false);
      }
    };
    const primeiroEnvio = window.setTimeout(executarSync, 1500);
    const timer = window.setInterval(executarSync, 30000);
    return () => {
      window.clearTimeout(primeiroEnvio);
      window.clearInterval(timer);
    };
  }, [online, pendentes.length, syncing, refreshRecentes]);

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleFazendaChange = (value) => {
    const selected = fazendas.find((f) => f.codigo === value);
    setForm((prev) => ({ ...prev, fazendaCodigo: selected?.codigo || '', fazendaNome: selected?.nome || '', talhao: '', talhaoId: '', variedade: '' }));
  };

  const handleTalhaoChange = (value) => {
    const selected = talhoes.find((t) => t.id === value || t.talhao === value);
    setForm((prev) => ({ ...prev, talhao: selected?.talhao || '', talhaoId: selected?.id || '', variedade: selected?.variedade || '' }));
  };

  const handleManualTalhao = (value) => setForm((prev) => ({ ...prev, talhao: value, talhaoId: `${prev.fazendaCodigo}_${value}` }));

  const handleSave = async () => {
    const confirm = await showConfirm('Deseja salvar esta inspeção?', 'Confira os dados antes de guardar o lançamento de broca.', 'Salvar', 'Cancelar');
    if (!confirm.isConfirmed) return;
    setSaving(true);
    try {
      const result = await saveLancamentoBroca(form, { companyId, session });
      await refreshRecentes();
      setForm(initialForm());
      setTalhoes([]);
      if (result.mode === 'online') showSuccess('Inspeção sincronizada', 'O lançamento foi salvo no banco de dados.');
      else if (result.mode === 'offline') showSuccess('Inspeção salva localmente', 'Sem internet. O lançamento ficou pendente e será sincronizado quando a conexão voltar.');
      else showSuccess('Inspeção salva como pendente', 'Não foi possível enviar agora. O sistema guardou localmente para sincronizar depois.');
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
    <div className="min-h-full bg-slate-950 px-3 py-4 text-slate-100 sm:px-5 lg:px-6 xl:px-8">
      <PendenciasModal open={pendingOpen} onClose={() => setPendingOpen(false)} items={pendentes} />
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <button type="button" onClick={onBack} className="mt-1 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-slate-200 shadow-sm hover:bg-slate-800">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-green-400/20 bg-green-500/10 text-green-300 shadow-lg shadow-black/20">
            <Bug className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-green-300">Apontamento Broca</h1>
            <p className="mt-1 text-sm text-slate-400">Inspeção com cálculo automático de brocamento.</p>
          </div>
        </div>
        <ConexaoButton pendingCount={pendentes.length} onOpenPending={() => setPendingOpen(true)} />
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-xl shadow-black/20 sm:p-6">
        <div className="mb-5 border-b border-white/10 pb-4">
          <h2 className="text-lg font-semibold text-green-300">Dados da inspeção</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Fazenda">
            <ResponsiveSelect
              value={form.fazendaCodigo}
              onChange={handleFazendaChange}
              options={fazendas.map((f) => ({ value: f.codigo, label: `${f.codigo} - ${f.nome || 'Sem nome'}` }))}
              placeholder="Selecione..."
              className={inputClass}
            />
          </Field>
          <Field label="Data da inspeção"><input type="date" value={form.dataInspecao} onChange={(e) => update('dataInspecao', e.target.value)} className={inputClass} /></Field>
          <Field label="Talhão">
            {talhoes.length > 0 ? (
              <ResponsiveSelect
                value={form.talhaoId || form.talhao}
                onChange={handleTalhaoChange}
                options={talhoes.map((t) => ({ value: t.id, label: String(t.talhao || '') }))}
                placeholder="Selecione..."
                disabled={!form.fazendaCodigo}
                className={inputClass}
              />
            ) : (
              <input value={form.talhao} onChange={(e) => handleManualTalhao(e.target.value)} className={inputClass} placeholder="Digite o talhão" disabled={!form.fazendaCodigo} />
            )}
          </Field>
          <Field label="Variedade" hint={form.variedade ? 'Preenchida pelo cadastro.' : ''}><input value={form.variedade} onChange={(e) => update('variedade', e.target.value)} className={inputClass} placeholder="Variedade" /></Field>
          <Field label="Entrenós contados"><input inputMode="decimal" value={form.entrenosContados} onChange={(e) => update('entrenosContados', e.target.value)} className={inputClass} placeholder="Ex: 450" /></Field>
          <Field label="Cochonilha"><input inputMode="decimal" value={form.cochonilha} onChange={(e) => update('cochonilha', e.target.value)} className={inputClass} placeholder="0" /></Field>
          <Field label="Brocado base"><input inputMode="decimal" value={form.brocadoBase} onChange={(e) => update('brocadoBase', e.target.value)} className={inputClass} placeholder="0" /></Field>
          <Field label="Brocado meio"><input inputMode="decimal" value={form.brocadoMeio} onChange={(e) => update('brocadoMeio', e.target.value)} className={inputClass} placeholder="0" /></Field>
          <Field label="Brocado topo"><input inputMode="decimal" value={form.brocadoTopo} onChange={(e) => update('brocadoTopo', e.target.value)} className={inputClass} placeholder="0" /></Field>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-green-400/20 bg-green-500/10 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-green-300">Total brocado</div>
            <div className="mt-1 text-2xl font-bold text-white">{totals.totalBrocado}</div>
          </div>
          <div className="rounded-xl border border-green-400/20 bg-green-500/10 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-green-300">Brocamento</div>
            <div className="mt-1 text-2xl font-bold text-white">{totals.percentualBrocamento.toFixed(2)}%</div>
          </div>
          <div className="rounded-xl border border-green-400/20 bg-green-500/10 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-green-300">Cochonilha</div>
            <div className="mt-1 text-2xl font-bold text-white">{totals.percentualCochonilha.toFixed(2)}%</div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => { setForm(initialForm()); setTalhoes([]); }} className="rounded-2xl border border-white/10 bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-200 shadow-sm hover:bg-slate-800">Limpar</button>
          <button type="button" onClick={handleSave} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-green-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-green-950/30 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"><Save className="h-4 w-4" />{saving ? 'Salvando...' : 'Guardar Inspeção'}</button>
        </div>
      </div>
    </div>
  );
}
