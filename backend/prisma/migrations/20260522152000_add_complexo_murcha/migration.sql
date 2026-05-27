CREATE TABLE IF NOT EXISTS lancamentos_complexo_murcha (
  id TEXT PRIMARY KEY,
  uuid_local TEXT,
  company_id TEXT NOT NULL,
  data_avaliacao TIMESTAMPTZ,
  fazenda_codigo TEXT,
  fazenda_nome TEXT,
  talhao TEXT,
  talhao_id TEXT,
  variedade TEXT,
  cigarrinha NUMERIC(14,2),
  colletotrichum NUMERIC(14,2),
  plectocyta NUMERIC(14,2),
  estria NUMERIC(14,2),
  numero_colmos_3m NUMERIC(14,2),
  total_complexo NUMERIC(14,2),
  percentual_murcha NUMERIC(10,4),
  sincronizado BOOLEAN DEFAULT TRUE,
  status_sincronizacao TEXT,
  erro_sincronizacao TEXT,
  status_registro TEXT DEFAULT 'ativo',
  motivo_cancelamento TEXT,
  cancelado_por TEXT,
  cancelado_em TIMESTAMPTZ,
  created_by TEXT,
  created_by_email TEXT,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  raw_data JSONB
);

CREATE INDEX IF NOT EXISTS idx_lancamentos_complexo_murcha_company ON lancamentos_complexo_murcha(company_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_complexo_murcha_data ON lancamentos_complexo_murcha(data_avaliacao);
CREATE INDEX IF NOT EXISTS idx_lancamentos_complexo_murcha_fazenda ON lancamentos_complexo_murcha(fazenda_codigo);
CREATE INDEX IF NOT EXISTS idx_lancamentos_complexo_murcha_talhao ON lancamentos_complexo_murcha(talhao);
CREATE INDEX IF NOT EXISTS idx_lancamentos_complexo_murcha_company_data ON lancamentos_complexo_murcha(company_id, data_avaliacao);
CREATE INDEX IF NOT EXISTS idx_lancamentos_complexo_murcha_company_status ON lancamentos_complexo_murcha(company_id, status_registro);
