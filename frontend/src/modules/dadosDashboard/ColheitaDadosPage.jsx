
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, FileSpreadsheet, RefreshCcw, UploadCloud } from 'lucide-react';
import {
  downloadAtrFazendaTemplate,
  downloadAtrMensalTemplate,
  downloadBrocaTemplate,
  downloadColheitaTemplate,
  downloadImpurezasTemplate,
  downloadImpurezaTurnoTemplate,
  downloadFechamentoOcTemplate,
  parseAtrFazendaFile,
  parseAtrMensalFile,
  parseBrocaFile,
  parseColheitaFile,
  parseImpurezasFile,
  parseImpurezaTurnoFile,
  parseFechamentoOcFile,
  importAtrFazendaRows,
  importAtrMensalRows,
  importBrocaRows,
  importColheitaRows,
  importImpurezasRows,
  importImpurezaTurnoRows,
  importFechamentoOcRows,
  fetchDadosDashboardFilterOptions,
  fetchDashboardColheitaOperacional,
  saveDashboardColheitaOperacional,
  fetchDashboardColheitaParadas,
  saveDashboardColheitaParada
} from '../../services/dadosDashboardService';
import { showError, showSuccess } from '../../utils/alert';
import { canWriteModule, hasModuleAccess } from '../../utils/accessControl';

const headers = [
  'Data','Hora','Safra','Frente','Descrição','Media Meta','Meta Periodo','Media Entrega','Entrega','Diferença','Entregue %'
];
const impurezaHeaders = ['Safra', 'Data', 'Hora', 'Imp. Mineral', 'Imp. Vegetal'];
const atrFazendaHeaders = ['Safra', 'Data', 'Fazenda/Fundo Agrícola', 'ATR'];
const atrMensalHeaders = ['Safra', 'Data', 'ATR', 'Acumulado'];
const impurezaTurnoHeaders = ['Data', 'Safra', 'Frente', 'Turno A', 'Turno B', 'Turno C'];
const brocaHeaders = ['Safra', 'Propriedade', 'vazio', 'Fazenda', 'Talhão', 'Vazio 1', 'Área Pla', 'Variedade', 'Data', 'Seq.', 'Corte', 'Tip Corte', 'Cana Ex', 'Cana Br', '%', 'Entre Exa', 'Entre Br', '%2', 'An Crt'];
const fechamentoOcHeaders = ['Fazenda','Vazio','Quadra','Vazio 1','Parte','Estágio','Variedade','Espac.','Plantio','DM','Liberada','Cortada','T/Ha Prev.','Prod. Prev.','T/Ha Real.','Prod. Real','Var. %','Atr','Atr/Ha Real.','Abertura','Encerramento','Idade','Tempo','Cortes'];

function parseBrazilNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value).trim();
  if (!text) return 0;
  const commaIndex = text.lastIndexOf(',');
  const dotIndex = text.lastIndexOf('.');
  let normalized = text.replace(/\s/g, '');
  if (commaIndex > -1 && dotIndex > -1) {
    normalized = commaIndex > dotIndex ? normalized.replace(/\./g, '').replace(',', '.') : normalized.replace(/,/g, '');
  } else if (commaIndex > -1) {
    normalized = normalized.replace(',', '.');
  }
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function formatBrazilNumber(value, fractionDigits = 2) {
  const number = parseBrazilNumber(value);
  if (!number) return '';
  return number.toLocaleString('pt-BR', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
}

function cleanDecimalInput(value) {
  return String(value || '').replace(/[^0-9.,]/g, '');
}

function InfoCard({ title, value, subtitle }) {

  return (
    <div className="rounded-[22px] border border-white/10 bg-[#09101d] p-5 shadow-[0_14px_40px_rgba(0,0,0,0.25)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8fa0bf]">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      {subtitle ? <div className="mt-1 text-sm text-[#90a0bb]">{subtitle}</div> : null}
    </div>
  );
}

export default function ColheitaDadosPage({ companyId, onBack, session }) {
  const canWrite = canWriteModule(session, 'dados_dashboard');
  const canDadosColheita = hasModuleAccess(session, 'dados_dashboard_colheita');
  const canDadosTalhoesFechados = hasModuleAccess(session, 'dados_dashboard_talhoes_fechados');
  const [activeTab, setActiveTab] = useState(canDadosColheita ? 'geral' : 'fechamentoOc');

  const [file, setFile] = useState(null);
  const [parsedRows, setParsedRows] = useState([]);
  const [isReading, setIsReading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState({ processed: 0, total: 0, percent: 0 });
  const [rotacaoMoendaManual, setRotacaoMoendaManual] = useState('');
  const [estoqueManual, setEstoqueManual] = useState('');
  const [isSavingOperacional, setIsSavingOperacional] = useState(false);
  const [paradaData, setParadaData] = useState(() => new Date().toISOString().slice(0, 10));
  const [paradaTipo, setParadaTipo] = useState('industria');
  const [paradaHoraInicio, setParadaHoraInicio] = useState('');
  const [paradaHoraFim, setParadaHoraFim] = useState('');
  const [paradaObservacao, setParadaObservacao] = useState('');
  const [paradasDia, setParadasDia] = useState([]);
  const [isSavingParada, setIsSavingParada] = useState(false);
  const [filterOptions, setFilterOptions] = useState({ safras: [], frentes: [], descricoes: [] });
  const [fileImpureza, setFileImpureza] = useState(null);
  const [parsedImpurezaRows, setParsedImpurezaRows] = useState([]);
  const [isReadingImpureza, setIsReadingImpureza] = useState(false);
  const [isImportingImpureza, setIsImportingImpureza] = useState(false);
  const [progressImpureza, setProgressImpureza] = useState({ processed: 0, total: 0, percent: 0 });
  const [fileImpurezaMineralTurno, setFileImpurezaMineralTurno] = useState(null);
  const [parsedImpurezaMineralTurnoRows, setParsedImpurezaMineralTurnoRows] = useState([]);
  const [isReadingImpurezaMineralTurno, setIsReadingImpurezaMineralTurno] = useState(false);
  const [isImportingImpurezaMineralTurno, setIsImportingImpurezaMineralTurno] = useState(false);
  const [progressImpurezaMineralTurno, setProgressImpurezaMineralTurno] = useState({ processed: 0, total: 0, percent: 0 });
  const [fileImpurezaVegetalTurno, setFileImpurezaVegetalTurno] = useState(null);
  const [parsedImpurezaVegetalTurnoRows, setParsedImpurezaVegetalTurnoRows] = useState([]);
  const [isReadingImpurezaVegetalTurno, setIsReadingImpurezaVegetalTurno] = useState(false);
  const [isImportingImpurezaVegetalTurno, setIsImportingImpurezaVegetalTurno] = useState(false);
  const [progressImpurezaVegetalTurno, setProgressImpurezaVegetalTurno] = useState({ processed: 0, total: 0, percent: 0 });
  const [fileAtrFazenda, setFileAtrFazenda] = useState(null);
  const [parsedAtrFazendaRows, setParsedAtrFazendaRows] = useState([]);
  const [isReadingAtrFazenda, setIsReadingAtrFazenda] = useState(false);
  const [isImportingAtrFazenda, setIsImportingAtrFazenda] = useState(false);
  const [progressAtrFazenda, setProgressAtrFazenda] = useState({ processed: 0, total: 0, percent: 0 });
  const [fileAtrMensal, setFileAtrMensal] = useState(null);
  const [parsedAtrMensalRows, setParsedAtrMensalRows] = useState([]);
  const [isReadingAtrMensal, setIsReadingAtrMensal] = useState(false);
  const [isImportingAtrMensal, setIsImportingAtrMensal] = useState(false);
  const [progressAtrMensal, setProgressAtrMensal] = useState({ processed: 0, total: 0, percent: 0 });
  const [fileBroca, setFileBroca] = useState(null);
  const [parsedBrocaRows, setParsedBrocaRows] = useState([]);
  const [isReadingBroca, setIsReadingBroca] = useState(false);
  const [isImportingBroca, setIsImportingBroca] = useState(false);
  const [progressBroca, setProgressBroca] = useState({ processed: 0, total: 0, percent: 0 });
  const [fileFechamentoOc, setFileFechamentoOc] = useState(null);
  const [parsedFechamentoOcRows, setParsedFechamentoOcRows] = useState([]);
  const [isReadingFechamentoOc, setIsReadingFechamentoOc] = useState(false);
  const [isImportingFechamentoOc, setIsImportingFechamentoOc] = useState(false);
  const [progressFechamentoOc, setProgressFechamentoOc] = useState({ processed: 0, total: 0, percent: 0 });

  useEffect(() => {
    if (activeTab === 'geral' && !canDadosColheita && canDadosTalhoesFechados) setActiveTab('fechamentoOc');
    if (activeTab === 'fechamentoOc' && !canDadosTalhoesFechados && canDadosColheita) setActiveTab('geral');
  }, [activeTab, canDadosColheita, canDadosTalhoesFechados]);

  const samplePreview = useMemo(() => parsedRows.slice(0, 8), [parsedRows]);
  const sampleImpurezaPreview = useMemo(() => parsedImpurezaRows.slice(0, 8), [parsedImpurezaRows]);
  const sampleImpurezaMineralTurnoPreview = useMemo(() => parsedImpurezaMineralTurnoRows.slice(0, 8), [parsedImpurezaMineralTurnoRows]);
  const sampleImpurezaVegetalTurnoPreview = useMemo(() => parsedImpurezaVegetalTurnoRows.slice(0, 8), [parsedImpurezaVegetalTurnoRows]);
  const sampleAtrFazendaPreview = useMemo(() => parsedAtrFazendaRows.slice(0, 8), [parsedAtrFazendaRows]);
  const sampleAtrMensalPreview = useMemo(() => parsedAtrMensalRows.slice(0, 8), [parsedAtrMensalRows]);
  const sampleBrocaPreview = useMemo(() => parsedBrocaRows.slice(0, 8), [parsedBrocaRows]);
  const sampleFechamentoOcPreview = useMemo(() => parsedFechamentoOcRows.slice(0, 8), [parsedFechamentoOcRows]);

  const loadOptions = async () => {
    if (!companyId) return;
    try {
      const data = await fetchDadosDashboardFilterOptions(companyId);
      setFilterOptions(data);
    } catch {}
  };

  const loadOperacional = async () => {
    if (!companyId) return;
    try {
      const operacional = await fetchDashboardColheitaOperacional(companyId);
      setRotacaoMoendaManual(formatBrazilNumber(operacional.rotacaoMoenda, 2));
      setEstoqueManual(formatBrazilNumber(operacional.estoqueCarretas, 0));
    } catch {}
  };

  const loadParadas = async () => {
    if (!companyId) return;
    try {
      const rows = await fetchDashboardColheitaParadas(companyId, paradaData);
      setParadasDia(rows || []);
    } catch { setParadasDia([]); }
  };

  useEffect(() => {
    loadOptions();
    loadOperacional();
    loadParadas();
  }, [companyId]);

  useEffect(() => { loadParadas(); }, [companyId, paradaData]);


  const handleReadFechamentoOcFile = async (selectedFile) => {
    if (!selectedFile) return;
    setIsReadingFechamentoOc(true);
    try {
      const rows = await parseFechamentoOcFile(selectedFile);
      setFileFechamentoOc(selectedFile);
      setParsedFechamentoOcRows(rows);
      setProgressFechamentoOc({ processed: 0, total: rows.length, percent: 0 });
      showSuccess('Planilha validada', rows.length + ' linha(s) de Talhões Fechados pronta(s) para importar.');
    } catch (error) {
      setParsedFechamentoOcRows([]);
      showError('Erro ao validar Talhões Fechados', error.message || 'Verifique a planilha.');
    } finally {
      setIsReadingFechamentoOc(false);
    }
  };

  const handleImportFechamentoOc = async () => {
    if (!parsedFechamentoOcRows.length) return showError('Nenhum dado carregado', 'Selecione e valide a planilha antes de importar.');
    setIsImportingFechamentoOc(true);
    try {
      await importFechamentoOcRows(companyId, parsedFechamentoOcRows, setProgressFechamentoOc);
      showSuccess('Importação Talhões Fechados concluída', parsedFechamentoOcRows.length + ' registro(s) enviados para o banco.');
    } catch (error) {
      showError('Erro na importação', error.message || 'Não foi possível importar Talhões Fechados.');
    } finally {
      setIsImportingFechamentoOc(false);
    }
  };

  const handleReadFile = async (selectedFile) => {
    if (!canWrite) return showError('Somente leitura', 'Seu usuário pode visualizar, mas não pode importar dados.');
    if (!selectedFile) return;
    setIsReading(true);
    try {
      const rows = await parseColheitaFile(selectedFile);
      setFile(selectedFile);
      setParsedRows(rows);
      setProgress({ processed: 0, total: rows.length, percent: 0 });
      showSuccess('Planilha validada', `${rows.length} linha(s) prontas para importação.`);
    } catch (error) {
      setParsedRows([]);
      showError('Falha ao ler planilha', error.message || 'Verifique o arquivo e tente novamente.');
    } finally {
      setIsReading(false);
    }
  };

  const handleImport = async () => {
    if (!canWrite) return showError('Somente leitura', 'Seu usuário pode visualizar, mas não pode importar dados.');
    if (!companyId) return showError('Empresa não identificada', 'Não foi possível descobrir a empresa da sessão.');
    if (!parsedRows.length) return showError('Nenhum dado carregado', 'Selecione e valide a planilha antes de importar.');

    setIsImporting(true);
    try {
      await importColheitaRows(companyId, parsedRows, setProgress);
      showSuccess('Importação concluída', `${parsedRows.length} registro(s) enviados para alimentar o dashboard.`);
      await loadOptions();
    } catch (error) {
      showError('Falha na importação', error.message || 'Não foi possível enviar os lotes.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleSaveOperacional = async () => {
    if (!canWrite) return showError('Somente leitura', 'Seu usuário pode visualizar, mas não pode alterar dados.');
    if (!companyId) return showError('Empresa não identificada', 'Não foi possível descobrir a empresa da sessão.');

    setIsSavingOperacional(true);
    try {
      const saved = await saveDashboardColheitaOperacional(companyId, {
        rotacaoMoenda: parseBrazilNumber(rotacaoMoendaManual),
        estoqueCarretas: parseBrazilNumber(estoqueManual)
      });
      setRotacaoMoendaManual(formatBrazilNumber(saved?.rotacaoMoenda, 2));
      setEstoqueManual(formatBrazilNumber(saved?.estoqueCarretas, 0));
      await loadOperacional();
      showSuccess('Dados salvos', 'Rotação da moenda e estoque em carretas foram salvos na coleção dashboard_colheita_operacional.');
    } catch (error) {
      showError('Falha ao salvar', error.message || 'Não foi possível salvar rotação e estoque.');
    } finally {
      setIsSavingOperacional(false);
    }
  };


  const handleSaveParada = async () => {
    if (!canWrite) return showError('Somente leitura', 'Seu usuário pode visualizar, mas não pode alterar dados.');
    if (!companyId) return showError('Empresa não identificada', 'Não foi possível descobrir a empresa da sessão.');
    if (!paradaData || !paradaHoraInicio || !paradaHoraFim) return showError('Campos obrigatórios', 'Informe data, hora inicial e hora final da parada.');
    setIsSavingParada(true);
    try {
      await saveDashboardColheitaParada(companyId, { data: paradaData, tipo: paradaTipo, horaInicio: paradaHoraInicio, horaFim: paradaHoraFim, observacao: paradaObservacao });
      setParadaHoraInicio(''); setParadaHoraFim(''); setParadaObservacao('');
      await loadParadas();
      showSuccess('Parada salva', 'Informativo de parada salvo para alimentar os cards do dashboard.');
    } catch (error) { showError('Falha ao salvar parada', error.message || 'Não foi possível salvar o informativo.'); }
    finally { setIsSavingParada(false); }
  };

  const handleReadImpurezaFile = async (selectedFile) => {
    if (!canWrite) return showError('Somente leitura', 'Seu usuário pode visualizar, mas não pode importar dados.');
    if (!selectedFile) return;
    setIsReadingImpureza(true);
    try {
      const rows = await parseImpurezasFile(selectedFile);
      setFileImpureza(selectedFile);
      setParsedImpurezaRows(rows);
      setProgressImpureza({ processed: 0, total: rows.length, percent: 0 });
      showSuccess('Planilha de impurezas validada', `${rows.length} linha(s) prontas para importação.`);
    } catch (error) {
      setParsedImpurezaRows([]);
      showError('Falha ao ler planilha de impurezas', error.message || 'Verifique o arquivo e tente novamente.');
    } finally {
      setIsReadingImpureza(false);
    }
  };

  const handleImportImpureza = async () => {
    if (!canWrite) return showError('Somente leitura', 'Seu usuário pode visualizar, mas não pode importar dados.');
    if (!companyId) return showError('Empresa não identificada', 'Não foi possível descobrir a empresa da sessão.');
    if (!parsedImpurezaRows.length) return showError('Nenhum dado carregado', 'Selecione e valide a planilha antes de importar.');

    setIsImportingImpureza(true);
    try {
      await importImpurezasRows(companyId, parsedImpurezaRows, setProgressImpureza);
      showSuccess('Importação de impurezas concluída', `${parsedImpurezaRows.length} registro(s) enviados.`);
    } catch (error) {
      showError('Falha na importação de impurezas', error.message || 'Não foi possível enviar os lotes.');
    } finally {
      setIsImportingImpureza(false);
    }
  };



  const handleReadImpurezaTurnoFile = async (tipo, selectedFile) => {
    if (!canWrite) return showError('Somente leitura', 'Seu usuário pode visualizar, mas não pode importar dados.');
    if (!selectedFile) return;
    const isVegetal = tipo === 'vegetal';
    const setReading = isVegetal ? setIsReadingImpurezaVegetalTurno : setIsReadingImpurezaMineralTurno;
    const setFileState = isVegetal ? setFileImpurezaVegetalTurno : setFileImpurezaMineralTurno;
    const setRows = isVegetal ? setParsedImpurezaVegetalTurnoRows : setParsedImpurezaMineralTurnoRows;
    const setProgressState = isVegetal ? setProgressImpurezaVegetalTurno : setProgressImpurezaMineralTurno;
    setReading(true);
    try {
      const rows = await parseImpurezaTurnoFile(selectedFile);
      setFileState(selectedFile);
      setRows(rows);
      setProgressState({ processed: 0, total: rows.length, percent: 0 });
      showSuccess(isVegetal ? 'Planilha de Impureza Vegetal validada' : 'Planilha de Impureza Mineral validada', String(rows.length) + ' linha(s) prontas para importação.');
    } catch (error) {
      setRows([]);
      showError(isVegetal ? 'Falha ao ler Impureza Vegetal' : 'Falha ao ler Impureza Mineral', error.message || 'Verifique o arquivo e tente novamente.');
    } finally {
      setReading(false);
    }
  };

  const handleImportImpurezaTurno = async (tipo) => {
    if (!canWrite) return showError('Somente leitura', 'Seu usuário pode visualizar, mas não pode importar dados.');
    if (!companyId) return showError('Empresa não identificada', 'Não foi possível descobrir a empresa da sessão.');
    const isVegetal = tipo === 'vegetal';
    const rows = isVegetal ? parsedImpurezaVegetalTurnoRows : parsedImpurezaMineralTurnoRows;
    const setImporting = isVegetal ? setIsImportingImpurezaVegetalTurno : setIsImportingImpurezaMineralTurno;
    const setProgressState = isVegetal ? setProgressImpurezaVegetalTurno : setProgressImpurezaMineralTurno;
    if (!rows.length) return showError('Nenhum dado carregado', 'Selecione e valide a planilha antes de importar.');
    setImporting(true);
    try {
      await importImpurezaTurnoRows(companyId, tipo, rows, setProgressState);
      showSuccess(isVegetal ? 'Importação de Impureza Vegetal concluída' : 'Importação de Impureza Mineral concluída', String(rows.length) + ' registro(s) enviados. Dados antigos da mesma data foram substituídos.');
    } catch (error) {
      showError(isVegetal ? 'Falha na importação de Impureza Vegetal' : 'Falha na importação de Impureza Mineral', error.message || 'Não foi possível enviar os lotes.');
    } finally {
      setImporting(false);
    }
  };

  const handleReadAtrFazendaFile = async (selectedFile) => {
    if (!canWrite) return showError('Somente leitura', 'Seu usuário pode visualizar, mas não pode importar dados.');
    if (!selectedFile) return;
    setIsReadingAtrFazenda(true);
    try {
      const rows = await parseAtrFazendaFile(selectedFile);
      setFileAtrFazenda(selectedFile);
      setParsedAtrFazendaRows(rows);
      setProgressAtrFazenda({ processed: 0, total: rows.length, percent: 0 });
      showSuccess('Planilha de ATR por Fazenda validada', `${rows.length} linha(s) prontas para importação.`);
    } catch (error) {
      setParsedAtrFazendaRows([]);
      showError('Falha ao ler planilha de ATR por Fazenda', error.message || 'Verifique o arquivo e tente novamente.');
    } finally {
      setIsReadingAtrFazenda(false);
    }
  };

  const handleImportAtrFazenda = async () => {
    if (!canWrite) return showError('Somente leitura', 'Seu usuário pode visualizar, mas não pode importar dados.');
    if (!companyId) return showError('Empresa não identificada', 'Não foi possível descobrir a empresa da sessão.');
    if (!parsedAtrFazendaRows.length) return showError('Nenhum dado carregado', 'Selecione e valide a planilha antes de importar.');
    setIsImportingAtrFazenda(true);
    try {
      await importAtrFazendaRows(companyId, parsedAtrFazendaRows, setProgressAtrFazenda);
      showSuccess('Importação de ATR por Fazenda concluída', `${parsedAtrFazendaRows.length} registro(s) enviados. Dados antigos das mesmas datas foram substituídos.`);
    } catch (error) {
      showError('Falha na importação de ATR por Fazenda', error.message || 'Não foi possível enviar os lotes.');
    } finally {
      setIsImportingAtrFazenda(false);
    }
  };

  const handleReadAtrMensalFile = async (selectedFile) => {
    if (!canWrite) return showError('Somente leitura', 'Seu usuário pode visualizar, mas não pode importar dados.');
    if (!selectedFile) return;
    setIsReadingAtrMensal(true);
    try {
      const rows = await parseAtrMensalFile(selectedFile);
      setFileAtrMensal(selectedFile);
      setParsedAtrMensalRows(rows);
      setProgressAtrMensal({ processed: 0, total: rows.length, percent: 0 });
      showSuccess('Planilha de ATR Mensal validada', `${rows.length} linha(s) prontas para importação.`);
    } catch (error) {
      setParsedAtrMensalRows([]);
      showError('Falha ao ler planilha de ATR Mensal', error.message || 'Verifique o arquivo e tente novamente.');
    } finally {
      setIsReadingAtrMensal(false);
    }
  };

  const handleImportAtrMensal = async () => {
    if (!canWrite) return showError('Somente leitura', 'Seu usuário pode visualizar, mas não pode importar dados.');
    if (!companyId) return showError('Empresa não identificada', 'Não foi possível descobrir a empresa da sessão.');
    if (!parsedAtrMensalRows.length) return showError('Nenhum dado carregado', 'Selecione e valide a planilha antes de importar.');
    setIsImportingAtrMensal(true);
    try {
      await importAtrMensalRows(companyId, parsedAtrMensalRows, setProgressAtrMensal);
      showSuccess('Importação de ATR Mensal concluída', `${parsedAtrMensalRows.length} registro(s) enviados. Dados antigos das mesmas datas foram substituídos.`);
    } catch (error) {
      showError('Falha na importação de ATR Mensal', error.message || 'Não foi possível enviar os lotes.');
    } finally {
      setIsImportingAtrMensal(false);
    }
  };

  const handleReadBrocaFile = async (selectedFile) => {
    if (!canWrite) return showError('Somente leitura', 'Seu usuário pode visualizar, mas não pode importar dados.');
    if (!selectedFile) return;
    setIsReadingBroca(true);
    try {
      const rows = await parseBrocaFile(selectedFile);
      setFileBroca(selectedFile);
      setParsedBrocaRows(rows);
      setProgressBroca({ processed: 0, total: rows.length, percent: 0 });
      showSuccess('Planilha de broca validada', `${rows.length} linha(s) prontas para importação.`);
    } catch (error) {
      setParsedBrocaRows([]);
      showError('Falha ao ler planilha de broca', error.message || 'Verifique o arquivo e tente novamente.');
    } finally {
      setIsReadingBroca(false);
    }
  };

  const handleImportBroca = async () => {
    if (!canWrite) return showError('Somente leitura', 'Seu usuário pode visualizar, mas não pode importar dados.');
    if (!companyId) return showError('Empresa não identificada', 'Não foi possível descobrir a empresa da sessão.');
    if (!parsedBrocaRows.length) return showError('Nenhum dado carregado', 'Selecione e valide a planilha antes de importar.');

    setIsImportingBroca(true);
    try {
      await importBrocaRows(companyId, parsedBrocaRows, setProgressBroca);
      showSuccess('Importação de broca concluída', `${parsedBrocaRows.length} registro(s) enviados.`);
    } catch (error) {
      showError('Falha na importação de broca', error.message || 'Não foi possível enviar os lotes.');
    } finally {
      setIsImportingBroca(false);
    }
  };

  const renderImpurezaTurnoSection = (tipo) => {
    const isVegetal = tipo === 'vegetal';
    const title = isVegetal ? 'Importação Impureza Vegetal por Frente e Turno' : 'Importação Impureza Mineral por Frente e Turno';
    const fileState = isVegetal ? fileImpurezaVegetalTurno : fileImpurezaMineralTurno;
    const rows = isVegetal ? parsedImpurezaVegetalTurnoRows : parsedImpurezaMineralTurnoRows;
    const preview = isVegetal ? sampleImpurezaVegetalTurnoPreview : sampleImpurezaMineralTurnoPreview;
    const isReadingState = isVegetal ? isReadingImpurezaVegetalTurno : isReadingImpurezaMineralTurno;
    const isImportingState = isVegetal ? isImportingImpurezaVegetalTurno : isImportingImpurezaMineralTurno;
    const progressState = isVegetal ? progressImpurezaVegetalTurno : progressImpurezaMineralTurno;
    return (
      <div className="grid gap-4 2xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[24px] border border-[#1a2233] bg-[linear-gradient(180deg,rgba(8,16,30,0.96),rgba(6,12,22,0.98))] p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#2f405e] bg-[#101b2d] text-[#75a8ff]"><FileSpreadsheet className="h-5 w-5" /></div><div><h2 className="text-lg font-semibold text-white">{title}</h2><p className="mt-1 text-sm text-[#97a2bb]">Alimenta o gráfico diário por frente e Turno A, B e C.</p></div></div>
            <button onClick={() => downloadImpurezaTurnoTemplate(tipo)} className="inline-flex items-center gap-2 rounded-xl border border-[#2d3a50] bg-[#0d1626] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#101c30]"><Download className="h-4 w-4" /> Baixar modelo</button>
          </div>
          <div className="mt-5 rounded-2xl border border-dashed border-[#31415d] bg-[#09111f] p-5">
            <label className={'flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-8 text-center hover:bg-white/[0.03] ' + (canWrite ? 'cursor-pointer' : 'cursor-not-allowed opacity-70')}>
              <UploadCloud className="h-8 w-8 text-[#78a8ff]" />
              <div><div className="text-sm font-semibold text-white">{fileState ? fileState.name : 'Selecionar planilha .xlsx'}</div><div className="mt-1 text-xs text-[#91a1bb]">Colunas: Data, Safra, Frente, Turno A, Turno B e Turno C</div></div>
              <input type="file" disabled={!canWrite} accept=".xlsx,.xls" className="hidden" onChange={(e) => handleReadImpurezaTurnoFile(tipo, e.target.files?.[0])} />
            </label>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button onClick={() => fileState && handleReadImpurezaTurnoFile(tipo, fileState)} disabled={!canWrite || !fileState || isReadingState} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#2d3a50] bg-[#0d1626] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"><RefreshCcw className="h-4 w-4" /> {isReadingState ? 'Validando...' : 'Validar novamente'}</button>
              <button onClick={() => handleImportImpurezaTurno(tipo)} disabled={!canWrite || !rows.length || isImportingState} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#d4aa4a] px-4 py-3 text-sm font-semibold text-[#101827] disabled:opacity-50"><UploadCloud className="h-4 w-4" /> {isImportingState ? 'Importando ' + progressState.percent + '%' : 'Importar para o banco'}</button>
            </div>
          </div>
        </div>
        <div className="rounded-[24px] border border-[#1a2233] bg-[linear-gradient(180deg,rgba(8,16,30,0.96),rgba(6,12,22,0.98))] p-6">
          <h2 className="text-lg font-semibold text-white">Pré-visualização {isVegetal ? 'Impureza Vegetal' : 'Impureza Mineral'}</h2>
          <div className="mt-4 max-h-[350px] overflow-auto rounded-2xl border border-white/8"><table className="min-w-full text-left text-sm"><thead className="sticky top-0 bg-[#0c1523] text-[#c8d1e3]"><tr>{impurezaTurnoHeaders.map((header) => <th key={header} className="px-3 py-2 font-semibold">{header}</th>)}</tr></thead><tbody>{preview.length ? preview.map((row, idx) => (<tr key={idx} className="border-t border-white/5 text-[#dce4f3]"><td className="px-3 py-2">{row.data}</td><td className="px-3 py-2">{row.safra}</td><td className="px-3 py-2">{row.frente}</td><td className="px-3 py-2">{row.turnoA}</td><td className="px-3 py-2">{row.turnoB}</td><td className="px-3 py-2">{row.turnoC}</td></tr>)) : <tr><td className="px-3 py-8 text-center text-[#91a1bb]" colSpan={impurezaTurnoHeaders.length}>Nenhuma planilha carregada ainda.</td></tr>}</tbody></table></div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-full bg-[#030916] px-4 py-5 text-white sm:px-6 xl:px-8 2xl:px-10">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-[#8994ad]">
        <span>AgroSystem</span><span>›</span><span>Dados Dashboard</span><span>›</span><span className="font-semibold text-[#d4aa4a]">Colheita</span>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="inline-flex items-center gap-2 rounded-full border border-[#273248] bg-[#0b1321] px-4 py-2 text-sm text-[#e6edf8]">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
          <div>
            <h1 className="text-[24px] font-semibold tracking-tight text-white">Dados Dashboard • Colheita</h1>
            <p className="mt-1 text-sm text-[#96a0b8]">Tela administrativa para importar a planilha que vai alimentar os gráficos do módulo Dashboard.</p>
            {!canWrite ? <p className="mt-2 text-xs font-medium text-amber-300">Seu perfil está em modo somente leitura. Importações e alterações foram bloqueadas.</p> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={downloadColheitaTemplate} className="inline-flex items-center gap-2 rounded-xl border border-[#2d3a50] bg-[#0d1626] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#101c30]">
            <Download className="h-4 w-4" /> Baixar modelo
          </button>
          <button onClick={loadOptions} className="inline-flex items-center gap-2 rounded-xl border border-[#2d3a50] bg-[#0d1626] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#101c30]">
            <RefreshCcw className="h-4 w-4" /> Atualizar
          </button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-[#1a2233] bg-[#07101d] p-2">
        {canDadosColheita && <button type="button" onClick={() => setActiveTab('geral')} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === 'geral' ? 'bg-[#d4aa4a] text-[#101827]' : 'bg-transparent text-[#cbd6ea] hover:bg-white/5'}`}>Dados Colheita</button>}
        {canDadosTalhoesFechados && <button type="button" onClick={() => setActiveTab('fechamentoOc')} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === 'fechamentoOc' ? 'bg-[#d4aa4a] text-[#101827]' : 'bg-transparent text-[#cbd6ea] hover:bg-white/5'}`}>Talhões Fechados</button>}
      </div>

      {activeTab === 'fechamentoOc' && (


      <div className="mt-6 grid gap-4 2xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[24px] border border-[#1a2233] bg-[linear-gradient(180deg,rgba(8,16,30,0.96),rgba(6,12,22,0.98))] p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#2f405e] bg-[#101b2d] text-[#75a8ff]"><FileSpreadsheet className="h-5 w-5" /></div><div><h2 className="text-lg font-semibold text-white">Importação Talhões Fechados</h2><p className="mt-1 text-sm text-[#97a2bb]">Importa o relatório real de talhões fechados. O frontend só envia as linhas; o servidor salva e calcula os indicadores do dashboard.</p></div></div>
            <button onClick={downloadFechamentoOcTemplate} className="inline-flex items-center gap-2 rounded-xl border border-[#2d3a50] bg-[#0d1626] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#101c30]"><Download className="h-4 w-4" /> Baixar modelo</button>
          </div>
          <div className="mt-5 rounded-2xl border border-dashed border-[#31415d] bg-[#09111f] p-5">
            <label className={`flex ${canWrite ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'} flex-col items-center justify-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-8 text-center hover:bg-white/[0.03]`}><UploadCloud className="h-8 w-8 text-[#78a8ff]" /><div><div className="text-sm font-semibold text-white">{fileFechamentoOc ? fileFechamentoOc.name : 'Selecionar planilha .xlsx'}</div><div className="mt-1 text-xs text-[#91a1bb]">Colunas: Fazenda até Cortes, igual ao relatório enviado.</div></div><input type="file" disabled={!canWrite} accept=".xlsx,.xls" className="hidden" onChange={(e) => handleReadFechamentoOcFile(e.target.files?.[0])} /></label>
            <div className="mt-5 grid gap-3 sm:grid-cols-2"><button onClick={() => fileFechamentoOc && handleReadFechamentoOcFile(fileFechamentoOc)} disabled={!canWrite || !fileFechamentoOc || isReadingFechamentoOc} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#2d3a50] bg-[#0d1626] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"><RefreshCcw className="h-4 w-4" /> {isReadingFechamentoOc ? 'Validando...' : 'Validar novamente'}</button><button onClick={handleImportFechamentoOc} disabled={!canWrite || !parsedFechamentoOcRows.length || isImportingFechamentoOc} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#d4aa4a] px-4 py-3 text-sm font-semibold text-[#101827] disabled:opacity-50"><UploadCloud className="h-4 w-4" /> {isImportingFechamentoOc ? `Importando ${progressFechamentoOc.percent}%` : 'Importar para o banco'}</button></div>
          </div>
        </div>
        <div className="rounded-[24px] border border-[#1a2233] bg-[linear-gradient(180deg,rgba(8,16,30,0.96),rgba(6,12,22,0.98))] p-6"><h2 className="text-lg font-semibold text-white">Pré-visualização Talhões Fechados</h2><div className="mt-4 max-h-[350px] overflow-auto rounded-2xl border border-white/8"><table className="min-w-full text-left text-sm"><thead className="sticky top-0 bg-[#0c1523] text-[#c8d1e3]"><tr>{fechamentoOcHeaders.map((header) => <th key={header} className="px-3 py-2 font-semibold">{header}</th>)}</tr></thead><tbody>{sampleFechamentoOcPreview.length ? sampleFechamentoOcPreview.map((row, idx) => (<tr key={idx} className="border-t border-white/5 text-[#dce4f3]">{['fazenda','vazio','quadra','vazio1','parte','estagio','variedade','espac','plantio','dm','liberada','cortada','tHaPrev','prodPrev','tHaReal','prodReal','varPercent','atr','atrHaReal','abertura','encerramento','idade','tempo','cortes'].map((key) => <td key={key} className="px-3 py-2">{row[key]}</td>)}</tr>)) : <tr><td className="px-3 py-8 text-center text-[#91a1bb]" colSpan={fechamentoOcHeaders.length}>Nenhuma planilha carregada ainda.</td></tr>}</tbody></table></div></div>
      </div>
      )}

      {activeTab === "geral" && (
      <>
      <div className="grid gap-4 xl:grid-cols-4">
        <InfoCard title="Safras já importadas" value={filterOptions.safras.length} subtitle={filterOptions.safras.join(', ') || 'Nenhuma'} />
        <InfoCard title="Frentes encontradas" value={filterOptions.frentes.length} subtitle={filterOptions.frentes.slice(0, 5).join(', ') || 'Nenhuma'} />
        <InfoCard title="Linhas prontas" value={parsedRows.length} subtitle={file ? file.name : 'Nenhum arquivo selecionado'} />
        <InfoCard title="Modelo oficial" value="11 colunas" subtitle="Planilha somente com dados de colheita" />
      </div>

      <div className="mt-4 rounded-[24px] border border-[#1a2233] bg-[linear-gradient(180deg,rgba(8,16,30,0.96),rgba(6,12,22,0.98))] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Dados operacionais da moagem</h2>
            <p className="mt-1 text-sm text-[#97a2bb]">Campos soltos do Dados Dashboard. Salva direto no banco e aparece nos cards pequenos da Moagem Horária Efetiva.</p>
          </div>
          <button
            onClick={handleSaveOperacional}
            disabled={!canWrite || isSavingOperacional}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#d4aa4a] px-4 py-3 text-sm font-semibold text-[#101827] disabled:opacity-50"
          >
            <UploadCloud className="h-4 w-4" /> {isSavingOperacional ? 'Salvando...' : 'Salvar no banco'}
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8fa0bf]">Rotação da Moenda</span>
            <input
              type="text"
              inputMode="decimal"
              value={rotacaoMoendaManual}
              onChange={(e) => setRotacaoMoendaManual(cleanDecimalInput(e.target.value))}
              onBlur={() => setRotacaoMoendaManual(formatBrazilNumber(rotacaoMoendaManual, 2))}
              disabled={!canWrite}
              placeholder="Ex.: 4.500,00"
              className="mt-2 w-full rounded-xl border border-[#2d3a50] bg-[#0d1626] px-4 py-3 text-sm text-white outline-none disabled:opacity-50"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8fa0bf]">Estoque (carretas)</span>
            <input
              type="text"
              inputMode="decimal"
              value={estoqueManual}
              onChange={(e) => setEstoqueManual(cleanDecimalInput(e.target.value))}
              onBlur={() => setEstoqueManual(formatBrazilNumber(estoqueManual, 0))}
              disabled={!canWrite}
              placeholder="Ex.: 18"
              className="mt-2 w-full rounded-xl border border-[#2d3a50] bg-[#0d1626] px-4 py-3 text-sm text-white outline-none disabled:opacity-50"
            />
          </label>
        </div>
      </div>

      <div className="mt-4 grid gap-4 2xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[24px] border border-[#1a2233] bg-[linear-gradient(180deg,rgba(8,16,30,0.96),rgba(6,12,22,0.98))] p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#2f405e] bg-[#101b2d] text-[#75a8ff]">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Importação da planilha</h2>
              <p className="mt-1 text-sm text-[#97a2bb]">Colunas da planilha: {headers.join(' • ')}.</p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-dashed border-[#31415d] bg-[#09111f] p-5">
            <label className={`flex ${canWrite ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'} flex-col items-center justify-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-8 text-center hover:bg-white/[0.03]`}>
              <UploadCloud className="h-8 w-8 text-[#78a8ff]" />
              <div>
                <div className="text-sm font-semibold text-white">{file ? file.name : 'Selecionar planilha .xlsx'}</div>
                <div className="mt-1 text-xs text-[#91a1bb]">Clique para escolher o arquivo de Colheita</div>
              </div>
              <input
                type="file" disabled={!canWrite}
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => handleReadFile(e.target.files?.[0])}
              />
            </label>


            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => file && handleReadFile(file)}
                disabled={!canWrite || !file || isReading}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#2d3a50] bg-[#0d1626] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                <RefreshCcw className="h-4 w-4" /> {isReading ? 'Validando...' : 'Validar novamente'}
              </button>
              <button
                onClick={handleImport}
                disabled={!canWrite || !parsedRows.length || isImporting}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#d4aa4a] px-4 py-3 text-sm font-semibold text-[#101827] disabled:opacity-50"
              >
                <UploadCloud className="h-4 w-4" /> {isImporting ? `Importando ${progress.percent}%` : 'Importar para o banco'}
              </button>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-xs text-[#97a2bb]">
                <span>Progresso da importação</span>
                <span>{progress.processed}/{progress.total || parsedRows.length || 0}</span>
              </div>
              <div className="h-3 rounded-full bg-[#101a2a]">
                <div className="h-3 rounded-full bg-[#d4aa4a] transition-all" style={{ width: `${progress.percent || 0}%` }} />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-[#1a2233] bg-[linear-gradient(180deg,rgba(8,16,30,0.96),rgba(6,12,22,0.98))] p-6">
          <h2 className="text-lg font-semibold text-white">Pré-visualização</h2>
          <p className="mt-1 text-sm text-[#97a2bb]">As primeiras linhas são mostradas aqui antes do envio.</p>

          <div className="mt-4 max-h-[520px] overflow-auto rounded-2xl border border-white/8">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-[#0c1523] text-[#c8d1e3]">
                <tr>
                  {headers.map((header) => <th key={header} className="px-3 py-2 font-semibold">{header}</th>)}
                </tr>
              </thead>
              <tbody>
                {samplePreview.length ? samplePreview.map((row, idx) => (
                  <tr key={idx} className="border-t border-white/5 text-[#dce4f3]">
                    <td className="px-3 py-2">{row.data}</td>
                    <td className="px-3 py-2">{row.hora}</td>
                    <td className="px-3 py-2">{row.safra}</td>
                    <td className="px-3 py-2">{row.frente}</td>
                    <td className="px-3 py-2">{row.descricao}</td>
                    <td className="px-3 py-2">{row.mediaMeta}</td>
                    <td className="px-3 py-2">{row.metaPeriodo}</td>
                    <td className="px-3 py-2">{row.mediaEntrega}</td>
                    <td className="px-3 py-2">{row.entrega}</td>
                    <td className="px-3 py-2">{row.diferenca}</td>
                    <td className="px-3 py-2">{(row.entreguePercentual * 100).toFixed(2)}%</td>
                  </tr>
                )) : (
                  <tr><td className="px-3 py-8 text-center text-[#91a1bb]" colSpan={headers.length}>Nenhuma planilha carregada ainda.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-[24px] border border-[#1a2233] bg-[linear-gradient(180deg,rgba(8,16,30,0.96),rgba(6,12,22,0.98))] p-6">
        <h2 className="text-lg font-semibold text-white">Informativo de Paradas</h2>
        <p className="mt-1 text-sm text-[#97a2bb]">Informe paradas da Indústria ou Agrícola. Se passar da meia-noite, o sistema divide automaticamente entre os dias.</p>
        <div className="mt-5 grid gap-3 md:grid-cols-5">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8fa0bf]">Data<input type="date" value={paradaData} onChange={(e) => setParadaData(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#2a3448] bg-[#0c1523] px-3 text-sm text-white outline-none" /></label>
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8fa0bf]">Tipo<select value={paradaTipo} onChange={(e) => setParadaTipo(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#2a3448] bg-[#0c1523] px-3 text-sm text-white outline-none"><option value="industria">Indústria</option><option value="agricola">Agrícola</option></select></label>
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8fa0bf]">Hora inicial<input type="time" value={paradaHoraInicio} onChange={(e) => setParadaHoraInicio(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#2a3448] bg-[#0c1523] px-3 text-sm text-white outline-none" /></label>
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8fa0bf]">Hora final<input type="time" value={paradaHoraFim} onChange={(e) => setParadaHoraFim(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#2a3448] bg-[#0c1523] px-3 text-sm text-white outline-none" /></label>
          <button onClick={handleSaveParada} disabled={!canWrite || isSavingParada} className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-[#d4aa4a] px-4 text-sm font-semibold text-[#101827] disabled:opacity-50">{isSavingParada ? 'Salvando...' : 'Salvar parada'}</button>
        </div>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-[#8fa0bf]">Observação<input type="text" value={paradaObservacao} onChange={(e) => setParadaObservacao(e.target.value)} placeholder="Ex.: manutenção, chuva, falta de cana..." className="mt-2 h-11 w-full rounded-xl border border-[#2a3448] bg-[#0c1523] px-3 text-sm text-white outline-none" /></label>
        <div className="mt-4 rounded-2xl border border-white/8 bg-[#09111f] p-4">
          <div className="mb-2 text-sm font-semibold text-white">Paradas que impactam {paradaData}</div>
          {paradasDia.length ? <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{paradasDia.slice(0, 6).map((item) => <div key={item.id || String(item.horaInicio) + String(item.horaFim)} className="rounded-xl border border-white/8 bg-white/[0.03] p-3 text-sm text-[#dce4f3]"><div className="font-semibold text-white">{String(item.tipo || '').toLowerCase().includes('agric') ? 'Agrícola' : 'Indústria'} • {item.horaInicio} até {item.horaFim}</div>{item.observacao ? <div className="mt-1 text-xs text-[#91a1bb]">{item.observacao}</div> : null}</div>)}</div> : <div className="text-sm text-[#91a1bb]">Nenhuma parada informada para essa data.</div>}
        </div>
      </div>

      <div className="mt-6 grid gap-4 2xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[24px] border border-[#1a2233] bg-[linear-gradient(180deg,rgba(8,16,30,0.96),rgba(6,12,22,0.98))] p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#2f405e] bg-[#101b2d] text-[#75a8ff]">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Importação de Impureza Mineral / Vegetal</h2>
                <p className="mt-1 text-sm text-[#97a2bb]">Colunas obrigatórias: {impurezaHeaders.join(' • ')}</p>
              </div>
            </div>
            <button onClick={downloadImpurezasTemplate} className="inline-flex items-center gap-2 rounded-xl border border-[#2d3a50] bg-[#0d1626] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#101c30]">
              <Download className="h-4 w-4" /> Baixar modelo
            </button>
          </div>
          <div className="mt-5 rounded-2xl border border-dashed border-[#31415d] bg-[#09111f] p-5">
            <label className={`flex ${canWrite ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'} flex-col items-center justify-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-8 text-center hover:bg-white/[0.03]`}>
              <UploadCloud className="h-8 w-8 text-[#78a8ff]" />
              <div>
                <div className="text-sm font-semibold text-white">{fileImpureza ? fileImpureza.name : 'Selecionar planilha .xlsx'}</div>
                <div className="mt-1 text-xs text-[#91a1bb]">Clique para escolher o arquivo de Impurezas</div>
              </div>
              <input type="file" disabled={!canWrite} accept=".xlsx,.xls" className="hidden" onChange={(e) => handleReadImpurezaFile(e.target.files?.[0])} />
            </label>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button onClick={() => fileImpureza && handleReadImpurezaFile(fileImpureza)} disabled={!canWrite || !fileImpureza || isReadingImpureza} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#2d3a50] bg-[#0d1626] px-4 py-3 text-sm font-medium text-white disabled:opacity-50">
                <RefreshCcw className="h-4 w-4" /> {isReadingImpureza ? 'Validando...' : 'Validar novamente'}
              </button>
              <button onClick={handleImportImpureza} disabled={!canWrite || !parsedImpurezaRows.length || isImportingImpureza} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#d4aa4a] px-4 py-3 text-sm font-semibold text-[#101827] disabled:opacity-50">
                <UploadCloud className="h-4 w-4" /> {isImportingImpureza ? `Importando ${progressImpureza.percent}%` : 'Importar para o banco'}
              </button>
            </div>
          </div>
        </div>
        <div className="rounded-[24px] border border-[#1a2233] bg-[linear-gradient(180deg,rgba(8,16,30,0.96),rgba(6,12,22,0.98))] p-6">
          <h2 className="text-lg font-semibold text-white">Pré-visualização de Impurezas</h2>
          <div className="mt-4 max-h-[350px] overflow-auto rounded-2xl border border-white/8">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-[#0c1523] text-[#c8d1e3]"><tr>{impurezaHeaders.map((header) => <th key={header} className="px-3 py-2 font-semibold">{header}</th>)}</tr></thead>
              <tbody>
                {sampleImpurezaPreview.length ? sampleImpurezaPreview.map((row, idx) => (
                  <tr key={idx} className="border-t border-white/5 text-[#dce4f3]">
                    <td className="px-3 py-2">{row.safra}</td>
                    <td className="px-3 py-2">{row.data}</td>
                    <td className="px-3 py-2">{row.hora}</td>
                    <td className="px-3 py-2">{row.impurezaMineral}</td>
                    <td className="px-3 py-2">{row.impurezaVegetal}</td>
                  </tr>
                )) : <tr><td className="px-3 py-8 text-center text-[#91a1bb]" colSpan={impurezaHeaders.length}>Nenhuma planilha carregada ainda.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>


      <div className="mt-6">{renderImpurezaTurnoSection('mineral')}</div>
      <div className="mt-6">{renderImpurezaTurnoSection('vegetal')}</div>

      <div className="mt-6 grid gap-4 2xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[24px] border border-[#1a2233] bg-[linear-gradient(180deg,rgba(8,16,30,0.96),rgba(6,12,22,0.98))] p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#2f405e] bg-[#101b2d] text-[#75a8ff]"><FileSpreadsheet className="h-5 w-5" /></div>
              <div><h2 className="text-lg font-semibold text-white">Importação ATR por Fazenda</h2><p className="mt-1 text-sm text-[#97a2bb]">Usa o ATR direto do laboratório. Ao importar a mesma data/companyId/safra, substitui os dados antigos.</p></div>
            </div>
            <button onClick={downloadAtrFazendaTemplate} className="inline-flex items-center gap-2 rounded-xl border border-[#2d3a50] bg-[#0d1626] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#101c30]"><Download className="h-4 w-4" /> Baixar modelo</button>
          </div>
          <div className="mt-5 rounded-2xl border border-dashed border-[#31415d] bg-[#09111f] p-5">
            <label className={`flex ${canWrite ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'} flex-col items-center justify-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-8 text-center hover:bg-white/[0.03]`}>
              <UploadCloud className="h-8 w-8 text-[#78a8ff]" />
              <div><div className="text-sm font-semibold text-white">{fileAtrFazenda ? fileAtrFazenda.name : 'Selecionar planilha .xlsx'}</div><div className="mt-1 text-xs text-[#91a1bb]">Colunas: Safra, Data, Fundo Agrícola/Fazenda e ATR</div></div>
              <input type="file" disabled={!canWrite} accept=".xlsx,.xls" className="hidden" onChange={(e) => handleReadAtrFazendaFile(e.target.files?.[0])} />
            </label>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button onClick={() => fileAtrFazenda && handleReadAtrFazendaFile(fileAtrFazenda)} disabled={!canWrite || !fileAtrFazenda || isReadingAtrFazenda} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#2d3a50] bg-[#0d1626] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"><RefreshCcw className="h-4 w-4" /> {isReadingAtrFazenda ? 'Validando...' : 'Validar novamente'}</button>
              <button onClick={handleImportAtrFazenda} disabled={!canWrite || !parsedAtrFazendaRows.length || isImportingAtrFazenda} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#d4aa4a] px-4 py-3 text-sm font-semibold text-[#101827] disabled:opacity-50"><UploadCloud className="h-4 w-4" /> {isImportingAtrFazenda ? `Importando ${progressAtrFazenda.percent}%` : 'Importar para o banco'}</button>
            </div>
          </div>
        </div>
        <div className="rounded-[24px] border border-[#1a2233] bg-[linear-gradient(180deg,rgba(8,16,30,0.96),rgba(6,12,22,0.98))] p-6">
          <h2 className="text-lg font-semibold text-white">Pré-visualização ATR por Fazenda</h2>
          <div className="mt-4 max-h-[350px] overflow-auto rounded-2xl border border-white/8"><table className="min-w-full text-left text-sm"><thead className="sticky top-0 bg-[#0c1523] text-[#c8d1e3]"><tr>{atrFazendaHeaders.map((header) => <th key={header} className="px-3 py-2 font-semibold">{header}</th>)}</tr></thead><tbody>{sampleAtrFazendaPreview.length ? sampleAtrFazendaPreview.map((row, idx) => (<tr key={idx} className="border-t border-white/5 text-[#dce4f3]"><td className="px-3 py-2">{row.safra}</td><td className="px-3 py-2">{row.data}</td><td className="px-3 py-2">{row.fazenda}</td><td className="px-3 py-2">{row.atr}</td></tr>)) : <tr><td className="px-3 py-8 text-center text-[#91a1bb]" colSpan={atrFazendaHeaders.length}>Nenhuma planilha carregada ainda.</td></tr>}</tbody></table></div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 2xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[24px] border border-[#1a2233] bg-[linear-gradient(180deg,rgba(8,16,30,0.96),rgba(6,12,22,0.98))] p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#2f405e] bg-[#101b2d] text-[#75a8ff]"><FileSpreadsheet className="h-5 w-5" /></div><div><h2 className="text-lg font-semibold text-white">Importação ATR Mensal</h2><p className="mt-1 text-sm text-[#97a2bb]">Alimenta o gráfico ATR Mensal e o card ATR Acumulado usando o Acumulado mais recente.</p></div></div>
            <button onClick={downloadAtrMensalTemplate} className="inline-flex items-center gap-2 rounded-xl border border-[#2d3a50] bg-[#0d1626] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#101c30]"><Download className="h-4 w-4" /> Baixar modelo</button>
          </div>
          <div className="mt-5 rounded-2xl border border-dashed border-[#31415d] bg-[#09111f] p-5">
            <label className={`flex ${canWrite ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'} flex-col items-center justify-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-8 text-center hover:bg-white/[0.03]`}><UploadCloud className="h-8 w-8 text-[#78a8ff]" /><div><div className="text-sm font-semibold text-white">{fileAtrMensal ? fileAtrMensal.name : 'Selecionar planilha .xlsx'}</div><div className="mt-1 text-xs text-[#91a1bb]">Colunas: Safra, Data, ATR e Acumulado</div></div><input type="file" disabled={!canWrite} accept=".xlsx,.xls" className="hidden" onChange={(e) => handleReadAtrMensalFile(e.target.files?.[0])} /></label>
            <div className="mt-5 grid gap-3 sm:grid-cols-2"><button onClick={() => fileAtrMensal && handleReadAtrMensalFile(fileAtrMensal)} disabled={!canWrite || !fileAtrMensal || isReadingAtrMensal} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#2d3a50] bg-[#0d1626] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"><RefreshCcw className="h-4 w-4" /> {isReadingAtrMensal ? 'Validando...' : 'Validar novamente'}</button><button onClick={handleImportAtrMensal} disabled={!canWrite || !parsedAtrMensalRows.length || isImportingAtrMensal} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#d4aa4a] px-4 py-3 text-sm font-semibold text-[#101827] disabled:opacity-50"><UploadCloud className="h-4 w-4" /> {isImportingAtrMensal ? `Importando ${progressAtrMensal.percent}%` : 'Importar para o banco'}</button></div>
          </div>
        </div>
        <div className="rounded-[24px] border border-[#1a2233] bg-[linear-gradient(180deg,rgba(8,16,30,0.96),rgba(6,12,22,0.98))] p-6"><h2 className="text-lg font-semibold text-white">Pré-visualização ATR Mensal</h2><div className="mt-4 max-h-[350px] overflow-auto rounded-2xl border border-white/8"><table className="min-w-full text-left text-sm"><thead className="sticky top-0 bg-[#0c1523] text-[#c8d1e3]"><tr>{atrMensalHeaders.map((header) => <th key={header} className="px-3 py-2 font-semibold">{header}</th>)}</tr></thead><tbody>{sampleAtrMensalPreview.length ? sampleAtrMensalPreview.map((row, idx) => (<tr key={idx} className="border-t border-white/5 text-[#dce4f3]"><td className="px-3 py-2">{row.safra}</td><td className="px-3 py-2">{row.data}</td><td className="px-3 py-2">{row.atr}</td><td className="px-3 py-2">{row.acumulado}</td></tr>)) : <tr><td className="px-3 py-8 text-center text-[#91a1bb]" colSpan={atrMensalHeaders.length}>Nenhuma planilha carregada ainda.</td></tr>}</tbody></table></div></div>
      </div>

      <div className="mt-6 grid gap-4 2xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[24px] border border-[#1a2233] bg-[linear-gradient(180deg,rgba(8,16,30,0.96),rgba(6,12,22,0.98))] p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#2f405e] bg-[#101b2d] text-[#75a8ff]">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Importação de Broca</h2>
                <p className="mt-1 text-sm text-[#97a2bb]">Colunas obrigatórias alinhadas ao padrão operacional informado.</p>
              </div>
            </div>
            <button onClick={downloadBrocaTemplate} className="inline-flex items-center gap-2 rounded-xl border border-[#2d3a50] bg-[#0d1626] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#101c30]">
              <Download className="h-4 w-4" /> Baixar modelo
            </button>
          </div>
          <div className="mt-5 rounded-2xl border border-dashed border-[#31415d] bg-[#09111f] p-5">
            <label className={`flex ${canWrite ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'} flex-col items-center justify-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-8 text-center hover:bg-white/[0.03]`}>
              <UploadCloud className="h-8 w-8 text-[#78a8ff]" />
              <div>
                <div className="text-sm font-semibold text-white">{fileBroca ? fileBroca.name : 'Selecionar planilha .xlsx'}</div>
                <div className="mt-1 text-xs text-[#91a1bb]">Clique para escolher o arquivo de Broca</div>
              </div>
              <input type="file" disabled={!canWrite} accept=".xlsx,.xls" className="hidden" onChange={(e) => handleReadBrocaFile(e.target.files?.[0])} />
            </label>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button onClick={() => fileBroca && handleReadBrocaFile(fileBroca)} disabled={!canWrite || !fileBroca || isReadingBroca} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#2d3a50] bg-[#0d1626] px-4 py-3 text-sm font-medium text-white disabled:opacity-50">
                <RefreshCcw className="h-4 w-4" /> {isReadingBroca ? 'Validando...' : 'Validar novamente'}
              </button>
              <button onClick={handleImportBroca} disabled={!canWrite || !parsedBrocaRows.length || isImportingBroca} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#d4aa4a] px-4 py-3 text-sm font-semibold text-[#101827] disabled:opacity-50">
                <UploadCloud className="h-4 w-4" /> {isImportingBroca ? `Importando ${progressBroca.percent}%` : 'Importar para o banco'}
              </button>
            </div>
          </div>
        </div>
        <div className="rounded-[24px] border border-[#1a2233] bg-[linear-gradient(180deg,rgba(8,16,30,0.96),rgba(6,12,22,0.98))] p-6">
          <h2 className="text-lg font-semibold text-white">Pré-visualização de Broca</h2>
          <div className="mt-4 max-h-[350px] overflow-auto rounded-2xl border border-white/8">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-[#0c1523] text-[#c8d1e3]"><tr>{brocaHeaders.map((header) => <th key={header} className="px-3 py-2 font-semibold">{header}</th>)}</tr></thead>
              <tbody>
                {sampleBrocaPreview.length ? sampleBrocaPreview.map((row, idx) => (
                  <tr key={idx} className="border-t border-white/5 text-[#dce4f3]">
                    <td className="px-3 py-2">{row.safra}</td><td className="px-3 py-2">{row.propriedade}</td><td className="px-3 py-2">{row.vazio}</td><td className="px-3 py-2">{row.fazenda}</td><td className="px-3 py-2">{row.talhao}</td>
                    <td className="px-3 py-2">{row.vazio1}</td><td className="px-3 py-2">{row.areaPla}</td><td className="px-3 py-2">{row.variedade}</td><td className="px-3 py-2">{row.data}</td>
                    <td className="px-3 py-2">{row.seq}</td><td className="px-3 py-2">{row.corte}</td><td className="px-3 py-2">{row.tipCorte}</td><td className="px-3 py-2">{row.canaEx}</td>
                    <td className="px-3 py-2">{row.canaBr}</td><td className="px-3 py-2">{(row.percentual * 100).toFixed(2)}%</td><td className="px-3 py-2">{row.entreExa}</td><td className="px-3 py-2">{row.entreBr}</td>
                    <td className="px-3 py-2">{(row.percentual2 * 100).toFixed(2)}%</td><td className="px-3 py-2">{row.anCrt}</td>
                  </tr>
                )) : <tr><td className="px-3 py-8 text-center text-[#91a1bb]" colSpan={brocaHeaders.length}>Nenhuma planilha carregada ainda.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
