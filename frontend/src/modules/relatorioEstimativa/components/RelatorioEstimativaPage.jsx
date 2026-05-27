import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Download, FileSpreadsheet } from 'lucide-react';
import { palette } from '../../../constants/theme';
import { exportarRelatorioEstimativa } from '../services/relatorioEstimativaService';
import { showSuccess, showError } from '../../../utils/alert';

/**
 * RelatorioEstimativaPage.jsx
 *
 * O que este bloco faz:
 * Renderiza a interface principal do Módulo de Relatórios de Estimativa.
 * Coleta filtros refinados do usuário (Safra, Fazendas, Datas, Situação, Modelo)
 * e aciona a exportação em PDF ou Excel.
 */
export default function RelatorioEstimativaPage() {
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [isLoadingExcel, setIsLoadingExcel] = useState(false);

  // Estado dos Filtros (Inputs da Tela)
  const [filtros, setFiltros] = useState({
    safra: '2025/2026',
    tipoPropriedade: 'TODAS', // 'PROPRIA', 'PARCERIA', 'ARRENDADA', 'TODAS'
    fazenda: '',
    talhao: '',
    dataEstimativaInicio: '',
    dataEstimativaFim: '',
    dataReestimativaInicio: '',
    dataReestimativaFim: '',
    situacao: 'AMBOS', // 'SOMENTE_ESTIMATIVA', 'SOMENTE_REESTIMATIVA', 'AMBOS'
    agruparPor: 'CORTE',
    tipoRelatorio: 'POR_CORTE', // 'POR_CORTE', 'POR_FAZENDA_TALHAO'
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFiltros(prev => ({ ...prev, [name]: value }));
  };

  const handleExportar = async (formato) => {
    // Evita cliques duplos
    if (isLoadingPdf || isLoadingExcel) return;

    if (formato === 'PDF') setIsLoadingPdf(true);
    if (formato === 'EXCEL') setIsLoadingExcel(true);

    try {
      // Montagem inteligente do payload
      const payload = {
        safra: filtros.safra,
        tipoRelatorio: filtros.tipoRelatorio,
        formatoSaida: formato,
        tipoPropriedade: filtros.tipoPropriedade === 'TODAS'
                         ? ['PROPRIA', 'PARCERIA', 'ARRENDADA']
                         : [filtros.tipoPropriedade],
        agruparPor: filtros.agruparPor,
      };

      // Adicionar condicionais se foram preenchidos
      if (filtros.fazenda.trim() !== '') {
        // Supondo que o usuário digite IDs separados por vírgula ou apenas o nome,
        // mas a API espera ids numéricos ou string no array.
        // Aqui enviamos apenas a string pro array pra facilitar.
        payload.fazendaIds = [filtros.fazenda.trim()];
      }

      if (filtros.talhao.trim() !== '') {
        payload.talhaoIds = [filtros.talhao.trim()];
      }

      if (filtros.dataEstimativaInicio) payload.dataEstimativaInicio = filtros.dataEstimativaInicio;
      if (filtros.dataEstimativaFim) payload.dataEstimativaFim = filtros.dataEstimativaFim;

      if (filtros.dataReestimativaInicio) payload.dataReestimativaInicio = filtros.dataReestimativaInicio;
      if (filtros.dataReestimativaFim) payload.dataReestimativaFim = filtros.dataReestimativaFim;

      if (filtros.situacao === 'SOMENTE_ESTIMATIVA') {
        payload.somenteComReestimativa = false;
        // Caso precisasse, enviaríamos a flag pro back.
      } else if (filtros.situacao === 'SOMENTE_REESTIMATIVA') {
        payload.somenteComReestimativa = true;
      }

      await exportarRelatorioEstimativa(payload);

      showSuccess('Download Concluído', `Seu relatório em ${formato} foi gerado com sucesso.`);

    } catch (error) {
      console.error('Erro ao exportar:', error);
      showError('Erro de Geração', error.message || 'Ocorreu um erro ao gerar o relatório no servidor.');
    } finally {
      setIsLoadingPdf(false);
      setIsLoadingExcel(false);
    }
  };

  const InputStyle = {
    background: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.1)',
    color: palette.white
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-4 sm:p-8" style={{ color: palette.white }}>
      <div className="max-w-5xl mx-auto space-y-8 pb-20">

        {/* Header do Módulo */}
        <div className="flex items-center gap-4 border-b pb-4" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.14)', color: palette.gold }}>
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Relatório de Estimativa x Reestimativa</h1>
            <p className="text-sm opacity-60">Filtre e exporte os dados consolidados da safra atual em PDF ou Excel.</p>
          </div>
        </div>

        {/* Card de Configuração */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl p-6 sm:p-8 border shadow-2xl relative overflow-hidden space-y-8"
          style={{
            background: 'linear-gradient(180deg, rgba(20,30,48,0.7), rgba(36,59,85,0.7))',
            borderColor: 'rgba(212,175,55,0.2)',
            backdropFilter: 'blur(20px)'
          }}
        >
          {/* SEÇÃO: FILTROS GERAIS */}
          <div>
            <h3 className="text-lg font-semibold mb-4" style={{ color: palette.gold }}>Filtros de Propriedade</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase opacity-60 ml-1">Safra</label>
                <select
                  name="safra"
                  value={filtros.safra}
                  onChange={handleChange}
                  className="w-full h-11 rounded-xl px-3 text-sm font-medium border focus:ring-2 outline-none transition-all appearance-none"
                  style={InputStyle}
                >
                  <option value="2024/2025" style={{ background: palette.bgDark }}>2024/2025</option>
                  <option value="2025/2026" style={{ background: palette.bgDark }}>2025/2026</option>
                  <option value="2026/2027" style={{ background: palette.bgDark }}>2026/2027</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase opacity-60 ml-1">Tipo de Prop. </label>
                <select
                  name="tipoPropriedade"
                  value={filtros.tipoPropriedade}
                  onChange={handleChange}
                  className="w-full h-11 rounded-xl px-3 text-sm font-medium border focus:ring-2 outline-none transition-all appearance-none"
                  style={InputStyle}
                >
                  <option value="TODAS" style={{ background: palette.bgDark }}>Todas</option>
                  <option value="PROPRIA" style={{ background: palette.bgDark }}>Própria</option>
                  <option value="PARCERIA" style={{ background: palette.bgDark }}>Parceria</option>
                  <option value="ARRENDADA" style={{ background: palette.bgDark }}>Arrendada</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase opacity-60 ml-1">Fazenda</label>
                <input
                  type="text"
                  name="fazenda"
                  placeholder="Nome ou ID"
                  value={filtros.fazenda}
                  onChange={handleChange}
                  className="w-full h-11 rounded-xl px-3 text-sm font-medium border focus:ring-2 outline-none transition-all"
                  style={InputStyle}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase opacity-60 ml-1">Talhão</label>
                <input
                  type="text"
                  name="talhao"
                  placeholder="Ex: 001"
                  value={filtros.talhao}
                  onChange={handleChange}
                  className="w-full h-11 rounded-xl px-3 text-sm font-medium border focus:ring-2 outline-none transition-all"
                  style={InputStyle}
                />
              </div>

            </div>
          </div>

          <div className="h-px w-full" style={{ background: 'rgba(255,255,255,0.05)' }} />

          {/* SEÇÃO: FILTROS DE PERÍODO */}
          <div>
            <h3 className="text-lg font-semibold mb-4" style={{ color: palette.gold }}>Período & Situação</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase opacity-60 ml-1">Est. Inicial</label>
                <input
                  type="date"
                  name="dataEstimativaInicio"
                  value={filtros.dataEstimativaInicio}
                  onChange={handleChange}
                  className="w-full h-11 rounded-xl px-3 text-sm font-medium border focus:ring-2 outline-none transition-all cursor-pointer"
                  style={{...InputStyle, colorScheme: 'dark'}}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase opacity-60 ml-1">Est. Final</label>
                <input
                  type="date"
                  name="dataEstimativaFim"
                  value={filtros.dataEstimativaFim}
                  onChange={handleChange}
                  className="w-full h-11 rounded-xl px-3 text-sm font-medium border focus:ring-2 outline-none transition-all cursor-pointer"
                  style={{...InputStyle, colorScheme: 'dark'}}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase opacity-60 ml-1">Reest. Inicial</label>
                <input
                  type="date"
                  name="dataReestimativaInicio"
                  value={filtros.dataReestimativaInicio}
                  onChange={handleChange}
                  className="w-full h-11 rounded-xl px-3 text-sm font-medium border focus:ring-2 outline-none transition-all cursor-pointer"
                  style={{...InputStyle, colorScheme: 'dark'}}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase opacity-60 ml-1">Reest. Final</label>
                <input
                  type="date"
                  name="dataReestimativaFim"
                  value={filtros.dataReestimativaFim}
                  onChange={handleChange}
                  className="w-full h-11 rounded-xl px-3 text-sm font-medium border focus:ring-2 outline-none transition-all cursor-pointer"
                  style={{...InputStyle, colorScheme: 'dark'}}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase opacity-60 ml-1">Situação</label>
                <select
                  name="situacao"
                  value={filtros.situacao}
                  onChange={handleChange}
                  className="w-full h-11 rounded-xl px-3 text-sm font-medium border focus:ring-2 outline-none transition-all appearance-none"
                  style={InputStyle}
                >
                  <option value="AMBOS" style={{ background: palette.bgDark }}>Ambos</option>
                  <option value="SOMENTE_ESTIMATIVA" style={{ background: palette.bgDark }}>Somente Est.</option>
                  <option value="SOMENTE_REESTIMATIVA" style={{ background: palette.bgDark }}>Somente Reest.</option>
                </select>
              </div>

            </div>
          </div>

          <div className="h-px w-full" style={{ background: 'rgba(255,255,255,0.05)' }} />

          {/* SEÇÃO: MODELO DE RELATÓRIO */}
          <div>
            <h3 className="text-lg font-semibold mb-4" style={{ color: palette.gold }}>Modelo de Relatório</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              <label
                className="flex items-center gap-3 p-4 rounded-2xl border cursor-pointer transition-all hover:bg-white/5"
                style={{
                  borderColor: filtros.tipoRelatorio === 'POR_CORTE' ? palette.gold : 'rgba(255,255,255,0.1)',
                  background: filtros.tipoRelatorio === 'POR_CORTE' ? 'rgba(212,175,55,0.08)' : 'transparent'
                }}
              >
                <input
                  type="radio"
                  name="tipoRelatorio"
                  value="POR_CORTE"
                  checked={filtros.tipoRelatorio === 'POR_CORTE'}
                  onChange={handleChange}
                  className="w-5 h-5 accent-yellow-600"
                />
                <div className="flex flex-col">
                  <span className="font-semibold text-sm">Modelo A - Agrupado por Corte</span>
                  <span className="text-xs opacity-60">Consolidado por Tipo de Propriedade e Corte.</span>
                </div>
              </label>

              <label
                className="flex items-center gap-3 p-4 rounded-2xl border cursor-pointer transition-all hover:bg-white/5"
                style={{
                  borderColor: filtros.tipoRelatorio === 'POR_FAZENDA_TALHAO' ? palette.gold : 'rgba(255,255,255,0.1)',
                  background: filtros.tipoRelatorio === 'POR_FAZENDA_TALHAO' ? 'rgba(212,175,55,0.08)' : 'transparent'
                }}
              >
                <input
                  type="radio"
                  name="tipoRelatorio"
                  value="POR_FAZENDA_TALHAO"
                  checked={filtros.tipoRelatorio === 'POR_FAZENDA_TALHAO'}
                  onChange={handleChange}
                  className="w-5 h-5 accent-yellow-600"
                />
                <div className="flex flex-col">
                  <span className="font-semibold text-sm">Modelo B - Fazenda e Talhão</span>
                  <span className="text-xs opacity-60">Analítico, exibindo a variação talhão a talhão.</span>
                </div>
              </label>
            </div>
          </div>

          {/* BOTÕES */}
          <div className="mt-8 pt-6 border-t flex flex-col sm:flex-row items-center justify-end gap-4 relative z-10" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
            <button
              onClick={() => handleExportar('PDF')}
              disabled={isLoadingPdf || isLoadingExcel}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
              style={{ background: '#e53e3e', color: '#fff' }}
            >
              {isLoadingPdf ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <FileText className="w-5 h-5" />
              )}
              Gerar Relatório PDF
            </button>

            <button
              onClick={() => handleExportar('EXCEL')}
              disabled={isLoadingPdf || isLoadingExcel}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
              style={{ background: '#38a169', color: '#fff' }}
            >
              {isLoadingExcel ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <FileSpreadsheet className="w-5 h-5" />
              )}
              Gerar Relatório Excel
            </button>
          </div>

        </motion.div>
      </div>
    </div>
  );
}
