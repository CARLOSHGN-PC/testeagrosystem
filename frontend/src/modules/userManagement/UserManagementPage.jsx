import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, Save, Search, ShieldCheck, UserCog, Users } from 'lucide-react';
import { ACCESS_MODULES, MODULE_LABELS, MAP_LAYER_MODULE_KEYS, ROLES, createDisabledModules, normalizeEnabledModules } from '../../constants/accessModules';
import { userManagementService } from '../../services/userManagementService';
import { companyManagementService } from '../../services/companyManagementService';
import { getRolePermissions, isSuperAdmin } from '../../utils/accessControl';
import { showConfirm, showError, showSuccess } from '../../utils/alert';

const defaultForm = {
  nome: '',
  email: '',
  companyId: '',
  role: ROLES.OPERADOR,
  status: 'ativo',
  permissions: createDisabledModules(),
  password: ''
};

const roleLabels = {
  [ROLES.SUPER_ADMIN]: 'Super Admin',
  [ROLES.ADMIN_EMPRESA]: 'Admin Empresa',
  [ROLES.GESTOR]: 'Gestor',
  [ROLES.OPERADOR]: 'Operador',
  [ROLES.VISUALIZADOR]: 'Visualizador'
};

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

function ModuleToggle({ checked, onChange, label, disabled = false }) {
  return (
    <label className={`flex min-w-0 items-center justify-between rounded-2xl border px-3 py-2 transition ${disabled ? 'cursor-not-allowed border-white/5 bg-white/[0.03] opacity-55' : 'cursor-pointer border-white/10 bg-white/5 hover:bg-white/10'}`}>
      <span className="min-w-0 pr-3 text-xs text-white/80 sm:text-sm">{label}</span>
      <button type="button" disabled={disabled} onClick={onChange} className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-slate-600'}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${checked ? 'left-6' : 'left-1'}`} />
      </button>
    </label>
  );
}

export default function UserManagementPage({ session }) {
  const superAdmin = isSuperAdmin(session);
  const currentCompanyId = session?.user?.companyId || '';
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [editingUid, setEditingUid] = useState(null);
  const [companyFilter, setCompanyFilter] = useState(superAdmin ? '' : currentCompanyId);
  const [form, setForm] = useState({
    ...defaultForm,
    companyId: currentCompanyId,
    permissions: getRolePermissions(defaultForm.role)
  });

  const availableRoles = useMemo(() => {
    const roles = Object.values(ROLES);
    return superAdmin ? roles : roles.filter((role) => role !== ROLES.SUPER_ADMIN);
  }, [superAdmin]);

  const selectedCompany = useMemo(() => {
    const companyFromList = companies.find((company) => company.companyId === form.companyId) || null;
    if (companyFromList) {
      return {
        ...companyFromList,
        enabledModules: normalizeEnabledModules(companyFromList.enabledModules || {})
      };
    }

    if (session?.company?.companyId && session.company.companyId === form.companyId) {
      return {
        ...session.company,
        enabledModules: normalizeEnabledModules(session.company.enabledModules || {})
      };
    }

    return null;
  }, [companies, form.companyId, session]);

  const visiblePermissionModules = useMemo(() => {
    const companyModules = normalizeEnabledModules(selectedCompany?.enabledModules || {});
    return ACCESS_MODULES.filter((moduleKey) => companyModules[moduleKey] === true);
  }, [selectedCompany]);

  const activeUsers = users.filter((user) => user.status === 'ativo').length;
  const contextUserCount = users.filter((user) => user.companyId === (companyFilter || currentCompanyId)).length;

  const loadCompanies = async () => {
    if (!superAdmin) {
      if (session?.company?.companyId) {
        setCompanies([{
          ...session.company,
          enabledModules: normalizeEnabledModules(session.company.enabledModules || {})
        }]);
      }
      return;
    }

    try {
      const result = await companyManagementService.list();
      const loadedCompanies = (result.data || []).map((company) => ({
        ...company,
        enabledModules: normalizeEnabledModules(company.enabledModules || {})
      }));
      setCompanies(loadedCompanies);
      if (superAdmin && !form.companyId && loadedCompanies.length === 1) {
        setForm((prev) => ({ ...prev, companyId: loadedCompanies[0].companyId }));
      }
    } catch (error) {
      showError('Erro ao carregar empresas', error.message);
    }
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const params = superAdmin ? (companyFilter ? { companyId: companyFilter } : {}) : { companyId: currentCompanyId };
      const result = await userManagementService.list(params);
      setUsers(result.data || []);
    } catch (error) {
      showError('Erro', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompanies();
  }, [superAdmin]);

  useEffect(() => {
    setCompanyFilter(superAdmin ? companyFilter : currentCompanyId);
    setForm((prev) => ({
      ...prev,
      companyId: superAdmin ? prev.companyId : currentCompanyId
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [superAdmin, currentCompanyId]);

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [superAdmin, currentCompanyId, companyFilter]);

  useEffect(() => {
    if (!selectedCompany?.enabledModules) return;
    setForm((prev) => ({
      ...prev,
      permissions: ACCESS_MODULES.reduce((acc, moduleKey) => {
        acc[moduleKey] = selectedCompany.enabledModules[moduleKey] === true ? prev.permissions[moduleKey] === true : false;
        return acc;
      }, {})
    }));
  }, [selectedCompany]);

  const filtered = useMemo(() => users.filter((user) => {
    const term = query.toLowerCase().trim();
    const matchesTerm = !term || [user.nome, user.email, user.companyId, user.role].some((value) => String(value || '').toLowerCase().includes(term));
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesTerm && matchesStatus && matchesRole;
  }), [users, query, statusFilter, roleFilter]);

  const resetForm = () => {
    setEditingUid(null);
    setForm({
      ...defaultForm,
      companyId: superAdmin ? '' : currentCompanyId,
      permissions: getRolePermissions(ROLES.OPERADOR)
    });
  };

  const applyRolePermissions = (role) => {
    const rolePermissions = getRolePermissions(role);
    const companyModules = normalizeEnabledModules(selectedCompany?.enabledModules || {});

    setForm((prev) => ({
      ...prev,
      role,
      readOnly: role === ROLES.VISUALIZADOR,
      permissions: ACCESS_MODULES.reduce((acc, moduleKey) => {
        acc[moduleKey] = companyModules[moduleKey] === true ? rolePermissions[moduleKey] === true : false;
        return acc;
      }, {})
    }));
  };

  const handlePermissionToggle = (moduleKey) => {
    const companyModules = normalizeEnabledModules(selectedCompany?.enabledModules || {});

    if (companyModules[moduleKey] !== true) return;

    setForm((prev) => {
      const nextPermissions = {
        ...prev.permissions,
        [moduleKey]: !prev.permissions[moduleKey]
      };

      if (moduleKey === 'mapas' && nextPermissions.mapas !== true) {
        MAP_LAYER_MODULE_KEYS.forEach((childKey) => {
          nextPermissions[childKey] = false;
        });
      }

      return {
        ...prev,
        permissions: nextPermissions
      };
    });
  };

  const save = async () => {
    try {
      if (!form.nome || !form.email || !form.companyId || !form.role) {
        throw new Error('Preencha nome, e-mail, empresa e perfil.');
      }

      if (!superAdmin && form.role === ROLES.SUPER_ADMIN) {
        throw new Error('Apenas super_admin pode criar ou editar outro super_admin.');
      }

      setSaving(true);
      const payload = { ...form, readOnly: form.role === ROLES.VISUALIZADOR };

      if (editingUid) {
        await userManagementService.update(editingUid, payload);
      } else {
        if (!form.password || form.password.length < 6) {
          throw new Error('Senha inicial deve ter ao menos 6 caracteres.');
        }
        await userManagementService.create(payload, session?.user || null);
      }

      showSuccess('Sucesso', 'Usuário salvo com sucesso.');
      resetForm();
      await loadUsers();
    } catch (error) {
      showError('Erro ao salvar usuário', error.message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (user) => {
    setEditingUid(user.uid);
    setForm({
      ...defaultForm,
      ...user,
      password: '',
      permissions: { ...createDisabledModules(), ...(user.permissions || {}) }
    });
  };

  const toggleStatus = async (user) => {
    const nextStatus = user.status === 'ativo' ? 'inativo' : 'ativo';
    const result = await showConfirm(
      `${nextStatus === 'ativo' ? 'Ativar' : 'Inativar'} usuário`,
      `Deseja ${nextStatus === 'ativo' ? 'ativar' : 'inativar'} ${user.nome}?`,
      nextStatus === 'ativo' ? 'Ativar' : 'Inativar'
    );

    if (!result.isConfirmed) return;

    try {
      await userManagementService.toggleStatus(user.uid, nextStatus);
      showSuccess('Status atualizado', `Usuário ${nextStatus === 'ativo' ? 'ativado' : 'inativado'} com sucesso.`);
      await loadUsers();
    } catch (error) {
      showError('Falha', error.message);
    }
  };

  const resetPassword = async (user) => {
    const result = await showConfirm('Resetar senha', `Deseja resetar a senha de ${user.email}?`, 'Resetar senha');
    if (!result.isConfirmed) return;

    try {
      const response = await userManagementService.resetPassword(user.uid);
      showSuccess('Senha resetada', `Senha temporária para ${response.data?.email || user.email}: ${response.data?.temporaryPassword || '123456789'}`);
    } catch (error) {
      showError('Falha ao redefinir senha', error.message);
    }
  };

  return (
    <div className="h-full w-full overflow-hidden p-2 text-white sm:p-3 xl:p-4 2xl:p-6">
      <div className="grid h-full min-h-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.12fr)_minmax(340px,0.88fr)] 2xl:gap-4">
        <section className="flex min-h-0 min-w-0 flex-col rounded-[28px] border border-white/10 bg-black/30 p-3 shadow-2xl backdrop-blur-xl sm:p-4 xl:p-5 2xl:p-6">
          <div className="flex min-h-0 min-w-0 flex-col gap-3 sm:gap-4">
            <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-amber-300/80 sm:text-xs xl:text-sm">SaaS / Controle de acesso</p>
                <h1 className="mt-1 text-2xl font-semibold leading-tight sm:mt-2 sm:text-[2rem] xl:text-[2.35rem]">Gerenciamento de Usuários</h1>
                <p className="mt-2 max-w-3xl text-xs leading-5 text-white/65 sm:text-sm">Crie usuários sem entrar no PostgreSQL, escolha o perfil e defina quais módulos cada pessoa poderá acessar dentro da empresa.</p>
              </div>
              <button onClick={resetForm} className="inline-flex items-center justify-center gap-2 self-start rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-medium text-white transition hover:bg-white/10 sm:px-4 sm:py-3 sm:text-sm xl:self-auto">
                <RefreshCw className="h-4 w-4" /> Novo usuário
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <StatCard icon={Users} title="Usuários listados" value={users.length} helper="Resultado atual carregado do backend administrativo." />
              <StatCard icon={CheckCircle2} title="Usuários ativos" value={activeUsers} helper="Usuários habilitados para login e operação." />
              <StatCard icon={UserCog} title="Contexto atual" value={companyFilter || currentCompanyId || '—'} helper={`${contextUserCount} usuário(s) dentro do contexto atual.`} />
            </div>

            <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-lg font-semibold sm:text-xl">Usuários</h2>
                <p className="text-xs text-white/60 sm:text-sm">Filtre, edite, inative e redefina o acesso dos usuários cadastrados.</p>
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-4">
                <div className="relative min-w-0 lg:col-span-2 2xl:col-span-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                  <input className="w-full min-w-0 rounded-2xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-xs outline-none transition focus:border-amber-300/50 sm:text-sm xl:py-3" placeholder="Buscar usuário..." value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                {superAdmin && (
                  <select className="min-w-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs outline-none sm:px-4 sm:text-sm xl:py-3" value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
                    <option value="">Todas as empresas</option>
                    {companies.map((company) => <option key={company.companyId} value={company.companyId}>{company.name}</option>)}
                  </select>
                )}
                <select className="min-w-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs outline-none sm:px-4 sm:text-sm xl:py-3" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">Todos os status</option>
                  <option value="ativo">Ativos</option>
                  <option value="inativo">Inativos</option>
                </select>
                <select className="min-w-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs outline-none sm:px-4 sm:text-sm xl:py-3" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                  <option value="all">Todos os perfis</option>
                  {availableRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-auto pr-1">
            <div className="space-y-3">
              {loading ? (
                <div className="flex items-center justify-center rounded-3xl border border-white/10 bg-white/5 py-12 text-white/70">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando usuários...
                </div>
              ) : filtered.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 px-4 py-12 text-center text-white/60">
                  Nenhum usuário encontrado com os filtros atuais.
                </div>
              ) : (
                filtered.map((user) => (
                  <div key={user.uid} className="rounded-3xl border border-white/10 bg-white/5 p-3 transition hover:border-amber-300/30 hover:bg-white/[0.07] sm:p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="break-words text-base font-semibold sm:text-lg">{user.nome}</h3>
                          <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/70">{roleLabels[user.role] || user.role}</span>
                          {(user.readOnly === true || user.role === ROLES.VISUALIZADOR) ? <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-300">Somente leitura</span> : null}
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${user.status === 'ativo' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                            {user.status}
                          </span>
                        </div>
                        <p className="mt-2 break-all text-xs text-white/65 sm:text-sm">{user.email}</p>
                        <p className="mt-1 break-all text-[11px] text-white/50 sm:text-sm">Empresa: {user.companyId || 'sem empresa'} • UID: {user.uid}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 lg:max-w-[360px] lg:justify-end">
                        <button className="rounded-2xl bg-blue-500/80 px-3 py-2 text-xs font-medium text-white transition hover:bg-blue-500 sm:px-4 sm:text-sm" onClick={() => startEdit(user)}>Editar</button>
                        <button className={`rounded-2xl px-3 py-2 text-xs font-medium text-white transition sm:px-4 sm:text-sm ${user.status === 'ativo' ? 'bg-amber-500/80 hover:bg-amber-500' : 'bg-emerald-600/80 hover:bg-emerald-600'}`} onClick={() => toggleStatus(user)}>
                          {user.status === 'ativo' ? 'Inativar' : 'Ativar'}
                        </button>
                        <button className="rounded-2xl bg-violet-500/80 px-3 py-2 text-xs font-medium text-white transition hover:bg-violet-500 sm:px-4 sm:text-sm" onClick={() => resetPassword(user)}>
                          Resetar senha
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="flex min-h-0 min-w-0 flex-col rounded-[28px] border border-white/10 bg-black/30 p-3 shadow-2xl backdrop-blur-xl sm:p-4 xl:p-5 2xl:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold sm:text-xl">{editingUid ? 'Editar usuário' : 'Novo usuário'}</h2>
              <p className="text-xs text-white/60 sm:text-sm">O cadastro já cria o usuário no Auth PostgreSQL/JWT e grava o perfil no PostgreSQL.</p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-300 sm:h-11 sm:w-11">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-auto pr-1">
            <div className="space-y-3 sm:space-y-4">
              <div className="grid gap-3 xl:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs text-white/65 sm:text-sm">Nome</label>
                  <input className="w-full min-w-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs outline-none sm:px-4 sm:text-sm xl:py-3" placeholder="Nome do usuário" value={form.nome} onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))} />
                </div>
                <div>
                  <label className="mb-2 block text-xs text-white/65 sm:text-sm">E-mail</label>
                  <input className="w-full min-w-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs outline-none sm:px-4 sm:text-sm xl:py-3" placeholder="usuario@empresa.com" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value.trim() }))} />
                </div>
              </div>

              {!editingUid && (
                <div>
                  <label className="mb-2 block text-xs text-white/65 sm:text-sm">Senha inicial</label>
                  <input className="w-full min-w-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs outline-none sm:px-4 sm:text-sm xl:py-3" type="password" placeholder="mínimo 6 caracteres" value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} />
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-xs text-white/65 sm:text-sm">Empresa</label>
                  {superAdmin ? (
                    <select className="w-full min-w-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs outline-none sm:px-4 sm:text-sm xl:py-3" value={form.companyId} onChange={(e) => setForm((prev) => ({ ...prev, companyId: e.target.value }))}>
                      <option value="">Selecione</option>
                      {companies.map((company) => <option key={company.companyId} value={company.companyId}>{company.name} ({company.companyId})</option>)}
                    </select>
                  ) : (
                    <input className="w-full min-w-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs outline-none opacity-70 sm:px-4 sm:text-sm xl:py-3" disabled value={form.companyId} />
                  )}
                </div>
                <div>
                  <label className="mb-2 block text-xs text-white/65 sm:text-sm">Perfil</label>
                  <select className="w-full min-w-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs outline-none sm:px-4 sm:text-sm xl:py-3" value={form.role} onChange={(e) => applyRolePermissions(e.target.value)}>
                    {availableRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs text-white/65 sm:text-sm">Status</label>
                  <select className="w-full min-w-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs outline-none sm:px-4 sm:text-sm xl:py-3" value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}>
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                  </select>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium sm:text-base">Permissões individuais</h3>
                    <p className="text-xs text-white/55 sm:text-sm">Selecione exatamente o que esse usuário pode acessar. Se a empresa não tiver o módulo habilitado, o acesso continua bloqueado.</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-white/60">
                    <span className="rounded-full bg-white/10 px-3 py-1">{Object.values(form.permissions).filter(Boolean).length} ativo(s)</span>
                    <span className="rounded-full bg-white/10 px-3 py-1">{selectedCompany ? `${visiblePermissionModules.length} na empresa` : `${contextUserCount} usuário(s) no contexto`}</span>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 xl:grid-cols-2">
                  {visiblePermissionModules.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-white/55 xl:col-span-2">
                      Nenhum módulo foi liberado para esta empresa no Super Admin.
                    </div>
                  ) : visiblePermissionModules.map((moduleKey) => {
                    const disabledByRole = !superAdmin && form.role === ROLES.SUPER_ADMIN;
                    return (
                      <ModuleToggle
                        key={moduleKey}
                        checked={!!form.permissions[moduleKey]}
                        onChange={() => handlePermissionToggle(moduleKey)}
                        label={MODULE_LABELS[moduleKey]}
                        disabled={disabledByRole}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4 sm:gap-3">
            <button disabled={saving} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 sm:px-5 sm:py-3 sm:text-sm" onClick={save}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {editingUid ? 'Salvar alterações' : 'Criar usuário'}
            </button>
            <button className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10 sm:px-5 sm:py-3 sm:text-sm" onClick={resetForm}>Limpar formulário</button>
          </div>
        </section>
      </div>
    </div>
  );
}
