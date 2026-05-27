import { z } from 'zod';
import {
  TIPO_PROPRIEDADE,
  SITUACAO_ESTIMATIVA,
  AGRUPAR_POR,
  MODO_EXIBICAO,
  COMPARAR_POR,
  TIPO_RELATORIO,
  FORMATO_SAIDA
} from '../constants/relatorioEstimativaConstants.js';

export const filtroRelatorioEstimativaSchema = z.object({
  safra: z.string().optional(),
  unidadeId: z.number().optional().or(z.string().optional()),
  empresaId: z.number().optional().or(z.string().optional()),
  tipoPropriedade: z.array(z.nativeEnum(TIPO_PROPRIEDADE)).optional(),
  propriedadeIds: z.array(z.number().or(z.string())).optional(),
  fazendaIds: z.array(z.number().or(z.string())).optional(),
  talhaoIds: z.array(z.number().or(z.string())).optional(),
  cortes: z.array(z.number().or(z.string())).optional(),
  variedadeIds: z.array(z.number().or(z.string())).optional(),
  dataEstimativaInicio: z.string().optional(), // Expected YYYY-MM-DD
  dataEstimativaFim: z.string().optional(),
  dataReestimativaInicio: z.string().optional(),
  dataReestimativaFim: z.string().optional(),
  agruparPor: z.nativeEnum(AGRUPAR_POR).optional(),
  modoExibicao: z.nativeEnum(MODO_EXIBICAO).optional(),
  somenteDivergencias: z.boolean().optional().default(false),
  somenteComReestimativa: z.boolean().optional().default(false),
  ocultarZerados: z.boolean().optional().default(true),
  situacao: z.nativeEnum(SITUACAO_ESTIMATIVA).optional(),
  compararPor: z.nativeEnum(COMPARAR_POR).optional(),
  tipoRelatorio: z.nativeEnum(TIPO_RELATORIO).default(TIPO_RELATORIO.POR_CORTE),
  formatoSaida: z.nativeEnum(FORMATO_SAIDA).default(FORMATO_SAIDA.JSON)
});