import React, { useState } from 'react';
import { FileText, FolderOpen, ChevronDown, ChevronRight, Settings, MapPinned, Layers, Database, Users, Building2, LayoutDashboard, ClipboardPenLine } from 'lucide-react';
import { palette } from '../../constants/theme';
import { useCompanyConfig } from '../../contexts/ConfigContext';
import { hasModuleAccess } from '../../utils/accessControl';
import { navigateToModule } from '../../utils/moduleRoutes';

export default function SidebarMenu({ activeModule, setActiveModule, setMenuOpen, session }) {
  const [solicitacoesOpen, setSolicitacoesOpen] = useState(
    activeModule === 'gerenciamentoOrdemCorte' || activeModule === 'gerenciamentoOrdemServico'
  );
  const { logoColor } = useCompanyConfig();

  const can = (moduleKey) => hasModuleAccess(session, moduleKey);

  const Item = ({ module, icon: Icon, label }) => (
    <button
      onClick={() => { setActiveModule(module); navigateToModule(module); setMenuOpen(false); }}
      className="w-full flex items-center gap-4 rounded-2xl px-4 py-3 text-left transition-all hover:bg-white/5"
      style={{
        background: activeModule === module ? 'rgba(212,175,55,0.12)' : 'transparent',
        border: activeModule === module ? '1px solid rgba(230,199,107,0.18)' : '1px solid transparent',
        color: activeModule === module ? palette.white : palette.text2,
      }}
    >
      <Icon className="w-5 h-5 shrink-0 transition-colors" style={{ color: activeModule === module ? palette.gold : palette.text2 }} />
      <span className="text-[15px] font-medium">{label}</span>
    </button>
  );

  return (
    <div className="h-full flex flex-col" style={{ background: 'linear-gradient(180deg, rgba(10,10,10,0.98), rgba(13,27,42,0.98))' }}>
      <div className="h-16 px-5 flex items-center border-b shrink-0" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-3 text-white font-semibold text-[18px]">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: `rgba(${parseInt(logoColor.slice(1, 3), 16)},${parseInt(logoColor.slice(3, 5), 16)},${parseInt(logoColor.slice(5, 7), 16)},0.14)`, color: logoColor }}>
            <MapPinned className="w-5 h-5" />
          </div>
          <span>AgroSystem</span>
        </div>
      </div>

      <div className="p-4 space-y-2 overflow-y-auto flex-1">
        {can('mapas') && <Item module="estimativa" icon={MapPinned} label="Mapas" />}
        {can('premissas') && <Item module="premissas" icon={Layers} label="Premissas" />}
        {can('cadastros_mestres') && <Item module="cadastros_mestres" icon={Database} label="Cadastro Geral" />}

        {(can('gerenciamento_ordem_corte') || can('gerenciamento_ordem_servico')) && (
          <div>
            <button
              onClick={() => setSolicitacoesOpen(!solicitacoesOpen)}
              className="w-full flex items-center justify-between rounded-2xl px-4 py-3 text-left transition-all hover:bg-white/5"
              style={{ color: palette.text2 }}
            >
              <div className="flex items-center gap-4">
                <FolderOpen className="w-5 h-5" />
                <span className="text-[15px] font-medium">Solicitações</span>
              </div>
              {solicitacoesOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>

            {solicitacoesOpen && (
              <div className="pl-12 pr-4 pt-1 space-y-1">
                {can('gerenciamento_ordem_corte') && <Item module="gerenciamentoOrdemCorte" icon={FileText} label="Ordens de Corte" />}
                {can('gerenciamento_ordem_servico') && <Item module="gerenciamentoOrdemServico" icon={FileText} label="Ordens de Serviço" />}
              </div>
            )}
          </div>
        )}

        {can('aprovacao_solicitacoes_servico') && <Item module="aprovacaoSolicitacoesServico" icon={FileText} label="Aprovação de Solicitações" />}

        {can('cadastro_profissional') && <Item module="cadastroProfissional" icon={Users} label="Cadastro Profissional" />}
        {can('relatorio_estimativa') && <Item module="relatorioEstimativa" icon={FileText} label="Relatórios" />}
        {can('dashboards') && <Item module="dashboards" icon={LayoutDashboard} label="Dashboards" />}
        {can('dados_dashboard') && <Item module="dadosDashboard" icon={LayoutDashboard} label="Dados Dashboard" />}
        {can('lancamentos') && <Item module="lancamentos" icon={ClipboardPenLine} label="Apontamentos" />}
        {can('configuracao_empresa') && <Item module="configuracao" icon={Settings} label="Configuração da Empresa" />}
        {can('gerenciamento_usuarios') && <Item module="userManagement" icon={Users} label="Gerenciamento de Usuários" />}
        {can('gerenciamento_empresas') && <Item module="companyManagement" icon={Building2} label="Gerenciamento de Empresas" />}
      </div>
    </div>
  );
}
