import React, { useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, Layers3, Loader2, Plus, Save, Search, ShieldCheck } from 'lucide-react';
import { ACCESS_MODULES, MODULE_LABELS, MAP_LAYER_MODULE_KEYS, createDisabledModules, normalizeEnabledModules } from '../../constants/accessModules';
import { companyManagementService } from '../../services/companyManagementService';
import { showConfirm, showError, showSuccess } from '../../utils/alert';

const defaultForm = {
  companyId: '',
  name: '',
  code: '',
  status: 'active',
  plan: 'basic',
  maxUsers: 10,
  enabledModules: createDisabledModules()
};

const plans = [
  { value: 'basic', label: 'Basic' },
  { value: 'professional', label: 'Professional' },
  { value: 'enterprise', label: 'Enterprise' }
];

function StatCard({ icon: Icon, title, value, helper }) {
  return (
    <div className="min-w-0 rounded-[24px] border border-white/10 bg-black/30 p-3 shadow-xl backdrop-blur-xl sm:p-4 xl:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-white/60 sm:text-sm">{title}</p>
          <p className="mt-1 break-words text-2xl font-semibold leading-tight text-white sm:mt-2 sm:text-[2rem]">{value}</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-amber-300 sm:h-11 sm:w-11 xl:h-12 xl:w-12">
          <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-white/50 sm:mt-3 sm:text-xs">{helper}</p>
    </div>
  );
}

function ModuleToggle({ checked, onChange, label }) {
  return (
    <label className="flex min-w-0 cursor-pointer items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2 transition hover:bg-white/10">
      <span className="min-w-0 pr-3 text-xs text-white/80 sm:text-sm">{label}</span>
      <button
        type="button"
        onClick={onChange}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-slate-600'}`}
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${checked ? 'left-6' : 'left-1'}`} />
      </button>
    </label>
  );
}

export default function CompanyManagementPage() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm);

  const loadCompanies = async () => {
    setLoading(true);
    try {
      const result = await companyManagementService.list();
      setCompanies(result.data || []);
    } catch (error) {
      showError('Erro', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompanies();
  }, []);

  const filtered = useMemo(() => companies.filter((company) => {
    const term = query.toLowerCase().trim();
    const matchesTerm = !term || [company.name, company.code, company.companyId, company.plan]
      .some((value) => String(value || '').toLowerCase().includes(term));
    const matchesStatus = statusFilter === 'all' || company.status === statusFilter;
    return matchesTerm && matchesStatus;
  }), [companies, query, statusFilter]);

  const activeCount = companies.filter((company) => company.status === 'active').length;
  const totalModulesEnabled = companies.reduce((acc, company) => acc + Object.values(company.enabledModules || {}).filter(Boolean).length, 0);

  const resetForm = () => {
    setForm(defaultForm);
    setEditing(null);
  };

  const handleModuleToggle = (moduleKey) => {
    setForm((prev) => {
      const nextValue = !prev.enabledModules[moduleKey];
      const nextModules = { ...prev.enabledModules, [moduleKey]: nextValue };

      if (moduleKey === 'mapas' && nextValue === false) {
        MAP_LAYER_MODULE_KEYS.forEach((childKey) => {
          nextModules[childKey] = false;
        });
      }

      return {
        ...prev,
        enabledModules: normalizeEnabledModules(nextModules)
      };
    });
  };

  const saveCompany = async () => {
    try {
      if (!form.companyId || !form.name || !form.code) {
        throw new Error('Preencha companyId, nome e código.');
      }

      setSaving(true);
      if (editing) {
        await companyManagementService.update(editing.companyId, { ...form, enabledModules: normalizeEnabledModules(form.enabledModules) });
      } else {
        await companyManagementService.create({ ...form, enabledModules: normalizeEnabledModules(form.enabledModules) });
      }

      showSuccess('Sucesso', 'Empresa salva com sucesso.');
      resetForm();
      await loadCompanies();
    } catch (error) {
      showError('Falha ao salvar', error.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (company) => {
    const nextStatus = company.status === 'active' ? 'inactive' : 'active';
    const result = await showConfirm(
      `${nextStatus === 'active' ? 'Ativar' : 'Inativar'} empresa`,
      `Deseja ${nextStatus === 'active' ? 'ativar' : 'inativar'} ${company.name}?`,
      nextStatus === 'active' ? 'Ativar' : 'Inativar'
    );

    if (!result.isConfirmed) return;

    try {
      await companyManagementService.toggleStatus(company.companyId, nextStatus);
      showSuccess('Atualizado', `Empresa ${nextStatus === 'active' ? 'ativada' : 'inativada'} com sucesso.`);
      await loadCompanies();
    } catch (error) {
      showError('Falha', error.message);
    }
  };

  const startEdit = (company) => {
    setEditing(company);
    setForm({
      ...defaultForm,
      ...company,
      enabledModules: normalizeEnabledModules(company.enabledModules || {})
    });
  };

  return (
    <div className="h-full w-full overflow-hidden p-2 text-white sm:p-3 xl:p-4 2xl:p-6">
      <div className="grid h-full min-h-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.12fr)_minmax(340px,0.88fr)] 2xl:gap-4">
        <section className="flex min-h-0 min-w-0 flex-col rounded-[28px] border border-white/10 bg-black/30 p-3 shadow-2xl backdrop-blur-xl sm:p-4 xl:p-5 2xl:p-6">
          <div className="flex min-h-0 min-w-0 flex-col gap-3 sm:gap-4">
            <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-amber-300/80 sm:text-xs xl:text-sm">SaaS / Administração global</p>
                <h1 className="mt-1 text-2xl font-semibold leading-tight sm:mt-2 sm:text-[2rem] xl:text-[2.35rem]">Gerenciamento de Empresas</h1>
                <p className="mt-2 max-w-3xl text-xs leading-5 text-white/65 sm:text-sm">Cadastre empresas, defina plano, limite de usuários e módulos habilitados. Tudo que estiver ativo aqui controla o que cada empresa poderá usar.</p>
              </div>
              <button onClick={resetForm} className="inline-flex items-center justify-center gap-2 self-start rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-medium text-white transition hover:bg-white/10 sm:px-4 sm:py-3 sm:text-sm xl:self-auto">
                <Plus className="h-4 w-4" /> Nova empresa
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <StatCard icon={Building2} title="Empresas cadastradas" value={companies.length} helper="Base total de tenants cadastrados no AgroSystem." />
              <StatCard icon={CheckCircle2} title="Empresas ativas" value={activeCount} helper="Empresas liberadas para login e operação." />
              <StatCard icon={Layers3} title="Módulos habilitados" value={totalModulesEnabled} helper="Soma dos módulos ativos em todas as empresas." />
            </div>

            <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-lg font-semibold sm:text-xl">Empresas</h2>
                <p className="text-xs text-white/60 sm:text-sm">Busque, edite e altere o status operacional das empresas.</p>
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div className="relative min-w-0">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                  <input className="w-full min-w-0 rounded-2xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-xs outline-none transition focus:border-amber-300/50 sm:text-sm xl:py-3" placeholder="Buscar empresa..." value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                <select className="min-w-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs outline-none sm:px-4 sm:text-sm xl:py-3" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">Todos os status</option>
                  <option value="active">Ativas</option>
                  <option value="inactive">Inativas</option>
                </select>
              </div>
            </div>
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-auto pr-1">
            <div className="space-y-3">
              {loading ? (
                <div className="flex items-center justify-center rounded-3xl border border-white/10 bg-white/5 py-12 text-white/70">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando empresas...
                </div>
              ) : filtered.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 py-12 text-center text-white/60">
                  Nenhuma empresa encontrada com os filtros atuais.
                </div>
              ) : (
                filtered.map((company) => {
                  const enabledCount = Object.values(company.enabledModules || {}).filter(Boolean).length;
                  return (
                    <div key={company.companyId} className="rounded-3xl border border-white/10 bg-white/5 p-3 transition hover:border-amber-300/30 hover:bg-white/[0.07] sm:p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="break-words text-base font-semibold sm:text-lg">{company.name}</h3>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${company.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                              {company.status === 'active' ? 'Ativa' : 'Inativa'}
                            </span>
                            <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/70">Plano {company.plan || 'basic'}</span>
                          </div>
                          <p className="mt-2 break-all text-xs text-white/65 sm:text-sm">ID: {company.companyId} • Código: {company.code} • Limite: {company.maxUsers || 0} usuários</p>
                          <p className="mt-1 text-[11px] text-white/50 sm:text-sm">{enabledCount} módulo(s) habilitado(s).</p>
                        </div>
                        <div className="flex flex-wrap gap-2 lg:max-w-[240px] lg:justify-end">
                          <button className="rounded-2xl bg-blue-500/80 px-3 py-2 text-xs font-medium text-white transition hover:bg-blue-500 sm:px-4 sm:text-sm" onClick={() => startEdit(company)}>Editar</button>
                          <button className={`rounded-2xl px-3 py-2 text-xs font-medium text-white transition sm:px-4 sm:text-sm ${company.status === 'active' ? 'bg-amber-500/80 hover:bg-amber-500' : 'bg-emerald-600/80 hover:bg-emerald-600'}`} onClick={() => toggleStatus(company)}>
                            {company.status === 'active' ? 'Inativar' : 'Ativar'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        <section className="flex min-h-0 min-w-0 flex-col rounded-[28px] border border-white/10 bg-black/30 p-3 shadow-2xl backdrop-blur-xl sm:p-4 xl:p-5 2xl:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold sm:text-xl">{editing ? 'Editar empresa' : 'Nova empresa'}</h2>
              <p className="text-xs text-white/60 sm:text-sm">Defina o tenant, plano, limite e os módulos contratados.</p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-300 sm:h-11 sm:w-11">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-auto pr-1">
            <div className="space-y-3 sm:space-y-4">
              <div className="grid gap-3 xl:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs text-white/65 sm:text-sm">Company ID</label>
                  <input className="w-full min-w-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 sm:text-sm xl:py-3" placeholder="ex: cacu" value={form.companyId} disabled={!!editing} onChange={(e) => setForm((prev) => ({ ...prev, companyId: e.target.value.trim().toLowerCase() }))} />
                </div>
                <div>
                  <label className="mb-2 block text-xs text-white/65 sm:text-sm">Código</label>
                  <input className="w-full min-w-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs outline-none sm:px-4 sm:text-sm xl:py-3" placeholder="ex: CACU" value={form.code} onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value.trim().toUpperCase() }))} />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs text-white/65 sm:text-sm">Nome da empresa</label>
                <input className="w-full min-w-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs outline-none sm:px-4 sm:text-sm xl:py-3" placeholder="Usina Caçu" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-xs text-white/65 sm:text-sm">Plano</label>
                  <select className="w-full min-w-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs outline-none sm:px-4 sm:text-sm xl:py-3" value={form.plan} onChange={(e) => setForm((prev) => ({ ...prev, plan: e.target.value }))}>
                    {plans.map((plan) => <option key={plan.value} value={plan.value}>{plan.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs text-white/65 sm:text-sm">Status</label>
                  <select className="w-full min-w-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs outline-none sm:px-4 sm:text-sm xl:py-3" value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}>
                    <option value="active">Ativa</option>
                    <option value="inactive">Inativa</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs text-white/65 sm:text-sm">Limite de usuários</label>
                  <input className="w-full min-w-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs outline-none sm:px-4 sm:text-sm xl:py-3" type="number" min={1} value={form.maxUsers} onChange={(e) => setForm((prev) => ({ ...prev, maxUsers: Number(e.target.value) }))} />
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-medium">Módulos habilitados</h3>
                    <p className="text-sm text-white/55">Esses módulos ficam disponíveis para os usuários dessa empresa.</p>
                  </div>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/70">{Object.values(form.enabledModules).filter(Boolean).length} ativo(s)</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {ACCESS_MODULES.map((moduleKey) => (
                    <ModuleToggle key={moduleKey} checked={!!form.enabledModules[moduleKey]} onChange={() => handleModuleToggle(moduleKey)} label={MODULE_LABELS[moduleKey]} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4 sm:gap-3">
            <button disabled={saving} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 sm:px-5 sm:py-3 sm:text-sm" onClick={saveCompany}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {editing ? 'Salvar alterações' : 'Criar empresa'}
            </button>
            <button className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10 sm:px-5 sm:py-3 sm:text-sm" onClick={resetForm}>Limpar formulário</button>
          </div>
        </section>
      </div>
    </div>
  );
}
