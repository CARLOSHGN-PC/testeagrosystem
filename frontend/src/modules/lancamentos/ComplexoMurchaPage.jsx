import React from 'react';
import { ArrowLeft, Leaf, Save, X } from 'lucide-react';
import { showConfirm, showError, showSuccess } from '../../utils/alert';
import ResponsiveSelect from './components/ResponsiveSelect';
import {
  calculateComplexoMurcha,
  isOnline,
  listLocalComplexoMurcha,
  loadFazendas,
  loadTalhoesByFazenda,
  saveComplexoMurcha,
  syncPendingComplexoMurcha,
} from '../../services/lancamentos/complexoMurchaService';

const initialForm = () => ({
  dataAvaliacao: new Date().toISOString().slice(0, 10),
  fazendaCodigo: '',
  fazendaNome: '',
  talhao: '',
  talhaoId: '',
  variedade: '',
  cigarrinha: '',
  colletotrichum: '',
  plectocyta: '',
  estria: '',
  numeroColmos3m: '',
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

function PendenciasButton({ pendingCount, onOpenPending }) {
  if (pendingCount <= 0) return null;
  return (
    <button type="button" onClick={onOpenPending} className="inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-200 transition hover:bg-white/10">
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
              <div className="font-semibold">{item.dataAvaliacao || '-'} • Fazenda {item.fazendaCodigo || '-'} • Talhão {item.talhao || '-'}</div>
              <div className="mt-1 text-xs text-slate-400">Total: {Math.round(Number(item.totalComplexo || 0))} • Murcha: {Math.round(Number(item.percentualMurcha || 0))}% {item.lastError ? `• Erro: ${item.lastError}` : ''}</div>
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

export default function ComplexoMurchaPage({ companyId, session, onBack }) {
  const [form, setForm] = React.useState(initialForm);
  const [fazendas, setFazendas] = React.useState([]);
  const [talhoes, setTalhoes] = React.useState([]);
  const [recentes, setRecentes] = React.useState([]);
  const [saving, setSaving] = React.useState(false);
  const [online, setOnline] = React.useState(isOnline());
  const [syncing, setSyncing] = React.useState(false);
  const [pendingOpen, setPendingOpen] = React.useState(false);

  const totals = React.useMemo(() => calculateComplexoMurcha(form), [form]);
  const pendentes = React.useMemo(() => recentes.filter((r) => r.syncStatus === 'pending' || r.status === 'pendente' || r.status === 'erro'), [recentes]);

  const refreshRecentes = React.useCallback(async () => {
    const rows = await listLocalComplexoMurcha(companyId, 50);
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
        const result = await syncPendingComplexoMurcha();
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
        await syncPendingComplexoMurcha();
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
    const confirm = await showConfirm('Deseja salvar esta avaliação?', 'Confira os dados antes de guardar o lançamento de complexo de murcha.', 'Salvar', 'Cancelar');
    if (!confirm.isConfirmed) return;
    setSaving(true);
    try {
      const result = await saveComplexoMurcha(form, { companyId, session });
      await refreshRecentes();
      setForm(initialForm());
      setTalhoes([]);
      if (result.mode === 'online') showSuccess('Avaliação sincronizada', 'O lançamento foi salvo no banco de dados.');
      else if (result.mode === 'offline') showSuccess('Avaliação salva localmente', 'Sem internet. O lançamento ficou pendente e será sincronizado quando a conexão voltar.');
      else showSuccess('Avaliação salva como pendente', 'Não foi possível enviar agora. O sistema guardou localmente para sincronizar depois.');
    } catch (error) {
      showError('Falha ao salvar', error?.message || 'Não foi possível salvar a avaliação.');
    } finally {
      setSaving(false);
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
            <Leaf className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-green-300">Complexo de Murcha</h1>
            <p className="mt-1 text-sm text-slate-400">Avaliação de cigarrinha, Colletotrichum, Plectocyta e estria.</p>
          </div>
        </div>
        <PendenciasButton pendingCount={pendentes.length} onOpenPending={() => setPendingOpen(true)} />
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-xl shadow-black/20 sm:p-6">
        <div className="mb-5 border-b border-white/10 pb-4">
          <h2 className="text-lg font-semibold text-green-300">Dados da avaliação</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Fazenda">
            <ResponsiveSelect value={form.fazendaCodigo} onChange={handleFazendaChange} options={fazendas.map((f) => ({ value: f.codigo, label: `${f.codigo} - ${f.nome || 'Sem nome'}` }))} placeholder="Selecione..." className={inputClass} />
          </Field>
          <Field label="Data da avaliação"><input type="date" value={form.dataAvaliacao} onChange={(e) => update('dataAvaliacao', e.target.value)} className={inputClass} /></Field>
          <Field label="Talhão">
            {talhoes.length > 0 ? (
              <ResponsiveSelect value={form.talhaoId || form.talhao} onChange={handleTalhaoChange} options={talhoes.map((t) => ({ value: t.id, label: String(t.talhao || '') }))} placeholder="Selecione..." disabled={!form.fazendaCodigo} className={inputClass} />
            ) : (
              <input value={form.talhao} onChange={(e) => handleManualTalhao(e.target.value)} className={inputClass} placeholder="Digite o talhão" disabled={!form.fazendaCodigo} />
            )}
          </Field>
          <Field label="Variedade" hint={form.variedade ? 'Preenchida pelo cadastro.' : ''}><input value={form.variedade} onChange={(e) => update('variedade', e.target.value)} className={inputClass} placeholder="Variedade" /></Field>
          <Field label="Cigarrinha"><input inputMode="decimal" value={form.cigarrinha} onChange={(e) => update('cigarrinha', e.target.value)} className={inputClass} placeholder="0" /></Field>
          <Field label="Colletotrichum"><input inputMode="decimal" value={form.colletotrichum} onChange={(e) => update('colletotrichum', e.target.value)} className={inputClass} placeholder="0" /></Field>
          <Field label="Plectocyta"><input inputMode="decimal" value={form.plectocyta} onChange={(e) => update('plectocyta', e.target.value)} className={inputClass} placeholder="0" /></Field>
          <Field label="Estria"><input inputMode="decimal" value={form.estria} onChange={(e) => update('estria', e.target.value)} className={inputClass} placeholder="0" /></Field>
          <Field label="Nº de Colmos 3m"><input inputMode="decimal" value={form.numeroColmos3m} onChange={(e) => update('numeroColmos3m', e.target.value)} className={inputClass} placeholder="Ex: 100" /></Field>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-green-400/20 bg-green-500/10 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-green-300">Total complexo</div>
            <div className="mt-1 text-2xl font-bold text-white">{Math.round(totals.totalComplexo)}</div>
          </div>
          <div className="rounded-xl border border-green-400/20 bg-green-500/10 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-green-300">% Murcha</div>
            <div className="mt-1 text-2xl font-bold text-white">{Math.round(totals.percentualMurcha)}%</div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => { setForm(initialForm()); setTalhoes([]); }} className="rounded-2xl border border-white/10 bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-200 shadow-sm hover:bg-slate-800">Limpar</button>
          <button type="button" onClick={handleSave} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-green-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-green-950/30 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"><Save className="h-4 w-4" />{saving ? 'Salvando...' : 'Guardar Complexo de Murcha'}</button>
        </div>
      </div>
    </div>
  );
}
