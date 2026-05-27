CREATE TABLE IF NOT EXISTS lancamentos_broca (
  id TEXT PRIMARY KEY,
  uuid_local TEXT,
  company_id TEXT NOT NULL,
  data_inspecao TIMESTAMPTZ,
  fazenda_codigo TEXT,
  fazenda_nome TEXT,
  talhao TEXT,
  talhao_id TEXT,
  variedade TEXT,
  entrenos_contados NUMERIC(14,2),
  brocado_base NUMERIC(14,2),
  brocado_meio NUMERIC(14,2),
  brocado_topo NUMERIC(14,2),
  total_brocado NUMERIC(14,2),
  percentual_brocamento NUMERIC(10,4),
  cochonilha NUMERIC(14,2),
  total_cochonilha NUMERIC(14,2),
  percentual_cochonilha NUMERIC(10,4),
  sincronizado BOOLEAN DEFAULT TRUE,
  status_sincronizacao TEXT,
  erro_sincronizacao TEXT,
  created_by TEXT,
  created_by_email TEXT,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  raw_data JSONB
);

CREATE INDEX IF NOT EXISTS idx_lancamentos_broca_company ON lancamentos_broca(company_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_broca_data ON lancamentos_broca(data_inspecao);
CREATE INDEX IF NOT EXISTS idx_lancamentos_broca_fazenda ON lancamentos_broca(fazenda_codigo);
CREATE INDEX IF NOT EXISTS idx_lancamentos_broca_talhao ON lancamentos_broca(talhao);
CREATE INDEX IF NOT EXISTS idx_lancamentos_broca_company_data ON lancamentos_broca(company_id, data_inspecao);

ALTER TABLE lancamentos_broca ADD COLUMN IF NOT EXISTS cochonilha NUMERIC(14,2);
ALTER TABLE lancamentos_broca ADD COLUMN IF NOT EXISTS total_cochonilha NUMERIC(14,2);
ALTER TABLE lancamentos_broca ADD COLUMN IF NOT EXISTS percentual_cochonilha NUMERIC(10,4);

CREATE TABLE IF NOT EXISTS lancamentos_perda (
  id TEXT PRIMARY KEY,
  uuid_local TEXT,
  company_id TEXT NOT NULL,
  data TIMESTAMPTZ,
  fazenda_codigo TEXT,
  fazenda_nome TEXT,
  talhao TEXT,
  talhao_id TEXT,
  variedade TEXT,
  frente_servico TEXT,
  turno TEXT,
  frota_equipamento TEXT,
  matricula_operador TEXT,
  nome_operador TEXT,
  cana_inteira NUMERIC(14,2),
  tolete NUMERIC(14,2),
  toco NUMERIC(14,2),
  ponta NUMERIC(14,2),
  estilhaco NUMERIC(14,2),
  pedaco NUMERIC(14,2),
  pisoteio_metros NUMERIC(14,2),
  percentual_pisoteio NUMERIC(10,4),
  paralelismo_esquerdo NUMERIC(14,2),
  paralelismo_direito NUMERIC(14,2),
  percentual_paralelismo NUMERIC(10,4),
  total_perda NUMERIC(14,2),
  sincronizado BOOLEAN DEFAULT TRUE,
  status_sincronizacao TEXT,
  erro_sincronizacao TEXT,
  created_by TEXT,
  created_by_email TEXT,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  raw_data JSONB
);

CREATE INDEX IF NOT EXISTS idx_lancamentos_perda_company ON lancamentos_perda(company_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_perda_data ON lancamentos_perda(data);
CREATE INDEX IF NOT EXISTS idx_lancamentos_perda_fazenda ON lancamentos_perda(fazenda_codigo);
CREATE INDEX IF NOT EXISTS idx_lancamentos_perda_talhao ON lancamentos_perda(talhao);
CREATE INDEX IF NOT EXISTS idx_lancamentos_perda_company_data ON lancamentos_perda(company_id, data);

ALTER TABLE lancamentos_perda ADD COLUMN IF NOT EXISTS pisoteio_metros NUMERIC(14,2);
ALTER TABLE lancamentos_perda ADD COLUMN IF NOT EXISTS percentual_pisoteio NUMERIC(10,4);
ALTER TABLE lancamentos_perda ADD COLUMN IF NOT EXISTS paralelismo_esquerdo NUMERIC(14,2);
ALTER TABLE lancamentos_perda ADD COLUMN IF NOT EXISTS paralelismo_direito NUMERIC(14,2);
ALTER TABLE lancamentos_perda ADD COLUMN IF NOT EXISTS percentual_paralelismo NUMERIC(10,4);
