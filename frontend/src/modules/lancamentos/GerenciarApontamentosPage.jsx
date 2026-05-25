import React from 'react';
import { ArrowLeft, Edit3, Filter, RefreshCw, RotateCcw, Save, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import { showConfirm, showError, showSuccess } from '../../utils/alert';
import { isOnline, loadFazendas, loadTalhoesByFazenda } from '../../services/lancamentos/infestacaoBrocaService';
import { loadOperadorByMatricula } from '../../services/lancamentos/perdaCanaService';
import {
  cancelarApontamento,
  listarApontamentosGerenciamento,
  recalcularApontamento,
  salvarEdicaoApontamento,
} from '../../services/lancamentos/gerenciarApontamentosService';
import ResponsiveSelect from './components/ResponsiveSelect';

const inputClass = 'w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-green-400 focus:ring-2 focus:ring-green-500/20 disabled:cursor-not-allowed disabled:bg-slate-900/60 disabled:text-slate-500';
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-[0.05em] text-slate-400';

function Field({ label, children }) {
  return <label className="block"><span className={labelClass}>{label}</span>{children}</label>;
}

function Stat({ label, value }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"><p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">{label}</p><p className="mt-1 text-lg font-bold text-white">{value}</p></div>;
}

function formatDate(value) {
  if (!value) return '-';
  return String(value).slice(0, 10).split('-').reverse().join('/');
}

function EditModal({ open, item, companyId, session, onClose, onSaved }) {
  const [form, setForm] = React.useState(item || {});
  const [fazendas, setFazendas] = React.useState([]);
  const [talhoes, setTalhoes] = React.useState([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => setForm(item || {}), [item]);
  React.useEffect(() => { if (open) loadFazendas(companyId).then(setFazendas).catch(() => setFazendas([])); }, [open, companyId]);
  React.useEffect(() => {
    if (!open || !form.fazendaCodigo) { setTalhoes([]); return; }
    loadTalhoesByFazenda(companyId, form.fazendaCodigo).then(setTalhoes).catch(() => setTalhoes([]));
  }, [open, companyId, form.fazendaCodigo]);

  React.useEffect(() => {
    if (!open || form.tipo !== 'perda') return undefined;
    const mat = String(form.matriculaOperador || '').trim();
    if (!mat) return undefined;
    const timer = window.setTimeout(async () => {
      const profissional = await loadOperadorByMatricula(companyId, mat).catch(() => null);
      const nome = profissional?.nomeCompleto || profissional?.nome || profissional?.name || '';
      if (nome) setForm((prev) => String(prev.matriculaOperador || '').trim() === mat ? { ...prev, nomeOperador: nome } : prev);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [open, companyId, form.tipo, form.matriculaOperador]);

  if (!open || !item) return null;
  const tipo = item.tipo;
  const totals = recalcularApontamento(tipo, form);
  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));
  const handleFazenda = (value) => {
    const selected = fazendas.find((f) => f.codigo === value);
    setForm((prev) => ({ ...prev, fazendaCodigo: selected?.codigo || '', fazendaNome: selected?.nome || '', talhao: '', talhaoId: '', variedade: '' }));
  };
  const handleTalhao = (value) => {
    const selected = talhoes.find((t) => t.id === value || t.talhao === value);
    setForm((prev) => ({ ...prev, talhao: selected?.talhao || '', talhaoId: selected?.id || '', variedade: selected?.variedade || '' }));
  };
  const handleSave = async () => {
    setSaving(true);
    try {
      await salvarEdicaoApontamento(tipo, { ...form, ...totals }, { companyId, session });
      showSuccess('Apontamento atualizado', 'A correção foi salva com sucesso.');
      onSaved();
      onClose();
    } catch (error) {
      showError('Erro ao salvar edição', error?.message || 'Não foi possível atualizar o apontamento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <div>
            <h3 className="text-lg font-bold text-white">Editar {tipo === 'broca' ? 'Apontamento Broca' : tipo === 'murcha' ? 'Complexo de Murcha' : 'Apontamento Perda'}</h3>
            <p className="text-sm text-slate-400">Os cálculos são refeitos automaticamente antes de salvar.</p>
          </div>
          <button onClick={onClose} className="rounded-xl border border-white/10 p-2 text-slate-300 hover:bg-white/10"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[calc(92vh-145px)] overflow-auto p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Data">
              <input type="date" value={tipo === 'broca' ? (form.dataInspecao || '') : tipo === 'murcha' ? (form.dataAvaliacao || '') : (form.data || '')} onChange={(e) => update(tipo === 'broca' ? 'dataInspecao' : tipo === 'murcha' ? 'dataAvaliacao' : 'data', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Fazenda">
              <ResponsiveSelect value={form.fazendaCodigo || ''} onChange={handleFazenda} options={fazendas.map((f) => ({ value: f.codigo, label: `${f.codigo} - ${f.nome || f.codigo}` }))} placeholder="Selecione" />
            </Field>
            <Field label="Talhão">
              <ResponsiveSelect value={form.talhaoId || form.talhao || ''} onChange={handleTalhao} options={talhoes.map((t) => ({ value: t.id || t.talhao, label: `${t.talhao}${t.variedade ? ` • ${t.variedade}` : ''}` }))} placeholder="Selecione" />
            </Field>
            <Field label="Variedade"><input value={form.variedade || ''} disabled className={inputClass} /></Field>
          </div>

          {tipo === 'broca' ? (
            <>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                {[
                  ['entrenosContados', 'Entrenós contados'],
                  ['cochonilha', 'Cochonilha'],
                  ['brocadoBase', 'Brocado base'],
                  ['brocadoMeio', 'Brocado meio'],
                  ['brocadoTopo', 'Brocado topo'],
                ].map(([key, label]) => <Field key={key} label={label}><input inputMode="decimal" value={form[key] ?? ''} onChange={(e) => update(key, e.target.value)} className={inputClass} /></Field>)}
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <Stat label="Total Brocado" value={totals.totalBrocado || 0} />
                <Stat label="% Brocamento" value={`${Number(totals.percentualBrocamento || 0).toFixed(2)}%`} />
                <Stat label="% Cochonilha" value={`${Number(totals.percentualCochonilha || 0).toFixed(2)}%`} />
              </div>
            </>
          ) : tipo === 'murcha' ? (
            <>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                {[
                  ['cigarrinha', 'Cigarrinha'],
                  ['colletotrichum', 'Colletotrichum'],
                  ['plectocyta', 'Plectocyta'],
                  ['estria', 'Estria'],
                  ['numeroColmos3m', 'Nº Colmos 3m'],
                ].map(([key, label]) => <Field key={key} label={label}><input inputMode="decimal" value={form[key] ?? ''} onChange={(e) => update(key, e.target.value)} className={inputClass} /></Field>)}
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Stat label="Total Complexo" value={Math.round(Number(totals.totalComplexo || 0))} />
                <Stat label="% Murcha" value={`${Math.round(Number(totals.percentualMurcha || 0))}%`} />
              </div>
            </>
          ) : (
            <>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Frente"><input value={form.frenteServico || ''} onChange={(e) => update('frenteServico', e.target.value)} className={inputClass} /></Field>
                <Field label="Turno"><ResponsiveSelect value={form.turno || ''} onChange={(v) => update('turno', v)} options={['A','B','C'].map((v) => ({ value: v, label: v }))} placeholder="Turno" /></Field>
                <Field label="Frota"><input value={form.frotaEquipamento || ''} onChange={(e) => update('frotaEquipamento', e.target.value)} className={inputClass} /></Field>
                <Field label="Matrícula operador"><input value={form.matriculaOperador || ''} onChange={(e) => update('matriculaOperador', e.target.value)} className={inputClass} /></Field>
              </div>
              {form.nomeOperador ? <p className="mt-2 text-sm font-semibold text-green-300">Operador: {form.nomeOperador}</p> : null}
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                {[
                  ['canaInteira', 'Cana inteira'], ['tolete', 'Tolete'], ['toco', 'Toco'], ['ponta', 'Ponta'], ['estilhaco', 'Estilhaço'], ['pedaco', 'Pedaço'],
                ].map(([key, label]) => <Field key={key} label={label}><input inputMode="decimal" value={form[key] ?? ''} onChange={(e) => update(key, e.target.value)} className={inputClass} /></Field>)}
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <Field label="Pisoteio metros"><input inputMode="decimal" value={form.pisoteioMetros ?? ''} onChange={(e) => update('pisoteioMetros', e.target.value)} className={inputClass} /></Field>
                <Field label="Paralelismo esquerdo (m)"><input inputMode="decimal" value={form.paralelismoEsquerdo ?? ''} onChange={(e) => update('paralelismoEsquerdo', e.target.value)} className={inputClass} /></Field>
                <Field label="Paralelismo direito (m)"><input inputMode="decimal" value={form.paralelismoDireito ?? ''} onChange={(e) => update('paralelismoDireito', e.target.value)} className={inputClass} /></Field>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <Stat label="Total Perda" value={`${Number(totals.totalPerda || 0).toFixed(2)} kg`} />
                <Stat label="% Pisoteio" value={`${Number(totals.percentualPisoteio || 0).toFixed(2)}%`} />
                <Stat label="Média Paralelismo (m)" value={`${Number(totals.percentualParalelismo || 0).toFixed(2)} m`} />
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-3 border-t border-white/10 p-4">
          <button onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-500 disabled:opacity-60"><Save className="h-4 w-4" />{saving ? 'Salvando...' : 'Salvar edição'}</button>
        </div>
      </div>
    </div>
  );
}

export default function GerenciarApontamentosPage({ companyId, session, onBack }) {
  const [filtros, setFiltros] = React.useState({ tipo: 'todos', dataInicial: '', dataFinal: '', fazenda: '', talhao: '', statusRegistro: 'ativo' });
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [fazendas, setFazendas] = React.useState([]);
  const [talhoes, setTalhoes] = React.useState([]);

  React.useEffect(() => { loadFazendas(companyId).then(setFazendas).catch(() => setFazendas([])); }, [companyId]);
  React.useEffect(() => {
    if (!filtros.fazenda) { setTalhoes([]); return; }
    loadTalhoesByFazenda(companyId, filtros.fazenda).then(setTalhoes).catch(() => setTalhoes([]));
  }, [companyId, filtros.fazenda]);

  const buscar = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await listarApontamentosGerenciamento(companyId, filtros);
      setRows(data);
    } catch (error) {
      showError('Erro ao buscar apontamentos', error?.message || 'Não foi possível carregar os registros.');
    } finally {
      setLoading(false);
    }
  }, [companyId, filtros]);

  React.useEffect(() => { buscar(); }, []); // primeira carga

  const updateFiltro = (field, value) => setFiltros((prev) => ({ ...prev, [field]: value, ...(field === 'fazenda' ? { talhao: '' } : {}) }));

  const cancelar = async (item) => {
    const confirm = await showConfirm('Cancelar apontamento?', 'O registro ficará como cancelado, sem apagar o histórico.', 'Cancelar registro', 'Voltar');
    if (!confirm.isConfirmed) return;
    try {
      await cancelarApontamento(item.tipo, item, { companyId, motivo: 'Cancelado pelo gerenciamento de apontamentos' });
      showSuccess('Registro cancelado', 'O apontamento foi marcado como cancelado.');
      buscar();
    } catch (error) {
      showError('Erro ao cancelar', error?.message || 'Não foi possível cancelar o apontamento.');
    }
  };

  return (
    <div className="min-h-full bg-slate-950 px-3 py-4 text-slate-100 sm:px-5 lg:px-6 xl:px-8">
      <EditModal open={!!editing} item={editing} companyId={companyId} session={session} onClose={() => setEditing(null)} onSaved={buscar} />
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <button type="button" onClick={onBack} className="mt-1 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-slate-200 hover:bg-slate-800"><ArrowLeft className="h-5 w-5" /></button>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-green-400/20 bg-green-500/10 text-green-300"><ShieldCheck className="h-6 w-6" /></div>
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-white">Gerenciar Apontamentos</h1>
            <p className="mt-1 text-sm text-slate-400">Consulte e corrija Broca, Perda e Complexo de Murcha sem mexer direto no banco.</p>
          </div>
        </div>
        <button onClick={buscar} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Atualizar</button>
      </div>

      <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-4 shadow-xl shadow-black/20">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white"><Filter className="h-4 w-4 text-green-300" />Filtros</div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <Field label="Tipo"><ResponsiveSelect value={filtros.tipo} onChange={(v) => updateFiltro('tipo', v)} options={[{value:'todos',label:'Todos'}, {value:'broca',label:'Broca'}, {value:'perda',label:'Perda'}, {value:'murcha',label:'Complexo de Murcha'}]} /></Field>
          <Field label="Data inicial"><input type="date" value={filtros.dataInicial} onChange={(e) => updateFiltro('dataInicial', e.target.value)} className={inputClass} /></Field>
          <Field label="Data final"><input type="date" value={filtros.dataFinal} onChange={(e) => updateFiltro('dataFinal', e.target.value)} className={inputClass} /></Field>
          <Field label="Fazenda"><ResponsiveSelect value={filtros.fazenda} onChange={(v) => updateFiltro('fazenda', v)} options={[{value:'',label:'Todas'}, ...fazendas.map((f) => ({ value: f.codigo, label: `${f.codigo} - ${f.nome || f.codigo}` }))]} placeholder="Todas" /></Field>
          <Field label="Talhão"><ResponsiveSelect value={filtros.talhao} onChange={(v) => updateFiltro('talhao', v)} options={[{value:'',label:'Todos'}, ...talhoes.map((t) => ({ value: t.talhao, label: t.talhao }))]} placeholder="Todos" /></Field>
          <Field label="Status"><ResponsiveSelect value={filtros.statusRegistro} onChange={(v) => updateFiltro('statusRegistro', v)} options={[{value:'ativo',label:'Ativo'}, {value:'cancelado',label:'Cancelado'}, {value:'todos',label:'Todos'}]} /></Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={buscar} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-500 disabled:opacity-60"><Search className="h-4 w-4" />Buscar</button>
          <button onClick={() => setFiltros({ tipo: 'todos', dataInicial: '', dataFinal: '', fazenda: '', talhao: '', statusRegistro: 'ativo' })} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10"><RotateCcw className="h-4 w-4" />Limpar</button>
        </div>
      </div>

      {!isOnline() ? <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">Sem internet: a tela mostra pendências locais. Edição de registros já sincronizados fica bloqueada até voltar conexão.</div> : null}

      <div className="mt-4 overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 shadow-xl shadow-black/20">
        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-[0.08em] text-slate-400"><tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Fazenda</th><th className="px-4 py-3">Talhão</th><th className="px-4 py-3">Variedade</th><th className="px-4 py-3">Resumo</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Ações</th></tr></thead>
            <tbody className="divide-y divide-white/10">
              {rows.map((item) => <tr key={`${item.tipo}_${item.id || item.uuidLocal}`} className="hover:bg-white/[0.03]"><td className="px-4 py-3 text-slate-200">{formatDate(item.dataInspecao || item.data || item.dataAvaliacao)}</td><td className="px-4 py-3"><span className="rounded-full bg-green-500/10 px-2 py-1 text-xs font-bold text-green-300">{item.tipo === 'broca' ? 'Broca' : item.tipo === 'murcha' ? 'Complexo de Murcha' : 'Perda'}</span></td><td className="px-4 py-3 text-slate-300">{item.fazendaCodigo} - {item.fazendaNome}</td><td className="px-4 py-3 text-slate-300">{item.talhao}</td><td className="px-4 py-3 text-slate-300">{item.variedade || '-'}</td><td className="px-4 py-3 text-slate-300">{item.tipo === 'broca' ? `% Broca ${Number(item.percentualBrocamento || 0).toFixed(2)} • % Coch ${Number(item.percentualCochonilha || 0).toFixed(2)}` : item.tipo === 'murcha' ? `Murcha ${Math.round(Number(item.percentualMurcha || 0))}% • Total ${Math.round(Number(item.totalComplexo || 0))}` : `Perda ${Number(item.totalPerda || 0).toFixed(2)} kg • Piso ${Number(item.percentualPisoteio || 0).toFixed(2)}%`}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${item.statusRegistro === 'cancelado' ? 'bg-red-500/10 text-red-300' : item.syncStatus === 'pending' ? 'bg-amber-500/10 text-amber-300' : 'bg-slate-700 text-slate-200'}`}>{item.statusRegistro === 'cancelado' ? 'Cancelado' : item.syncStatus === 'pending' ? 'Pendente' : 'Ativo'}</span></td><td className="px-4 py-3"><div className="flex justify-end gap-2"><button onClick={() => setEditing(item)} className="rounded-xl border border-white/10 p-2 text-slate-200 hover:bg-white/10" title="Editar"><Edit3 className="h-4 w-4" /></button><button onClick={() => cancelar(item)} disabled={item.statusRegistro === 'cancelado' || item.syncStatus === 'pending'} className="rounded-xl border border-red-400/20 p-2 text-red-300 hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-40" title="Cancelar"><Trash2 className="h-4 w-4" /></button></div></td></tr>)}
              {rows.length === 0 ? <tr><td colSpan="8" className="px-4 py-8 text-center text-slate-400">Nenhum apontamento encontrado.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="space-y-3 p-3 lg:hidden">
          {rows.map((item) => <div key={`${item.tipo}_${item.id || item.uuidLocal}`} className="rounded-2xl border border-white/10 bg-slate-950/50 p-3"><div className="flex items-center justify-between gap-2"><span className="rounded-full bg-green-500/10 px-2 py-1 text-xs font-bold text-green-300">{item.tipo === 'broca' ? 'Broca' : item.tipo === 'murcha' ? 'Complexo de Murcha' : 'Perda'}</span><span className="text-xs text-slate-400">{formatDate(item.dataInspecao || item.data || item.dataAvaliacao)}</span></div><div className="mt-2 font-semibold text-white">Fazenda {item.fazendaCodigo} • Talhão {item.talhao}</div><div className="mt-1 text-sm text-slate-400">{item.variedade || '-'}</div><div className="mt-2 text-sm text-slate-300">{item.tipo === 'broca' ? `% Broca ${Number(item.percentualBrocamento || 0).toFixed(2)} • % Coch ${Number(item.percentualCochonilha || 0).toFixed(2)}` : item.tipo === 'murcha' ? `Murcha ${Math.round(Number(item.percentualMurcha || 0))}% • Total ${Math.round(Number(item.totalComplexo || 0))}` : `Perda ${Number(item.totalPerda || 0).toFixed(2)} kg • Piso ${Number(item.percentualPisoteio || 0).toFixed(2)}%`}</div><div className="mt-3 flex gap-2"><button onClick={() => setEditing(item)} className="flex-1 rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10">Editar</button><button onClick={() => cancelar(item)} disabled={item.statusRegistro === 'cancelado' || item.syncStatus === 'pending'} className="flex-1 rounded-xl border border-red-400/20 px-3 py-2 text-sm font-semibold text-red-300 hover:bg-red-400/10 disabled:opacity-40">Cancelar</button></div></div>)}
          {rows.length === 0 ? <div className="rounded-2xl border border-white/10 p-6 text-center text-sm text-slate-400">Nenhum apontamento encontrado.</div> : null}
        </div>
      </div>
    </div>
  );
}
