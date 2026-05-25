ALTER TABLE IF EXISTS lancamentos_broca ADD COLUMN IF NOT EXISTS status_registro TEXT DEFAULT 'ativo';
ALTER TABLE IF EXISTS lancamentos_broca ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT;
ALTER TABLE IF EXISTS lancamentos_broca ADD COLUMN IF NOT EXISTS cancelado_por TEXT;
ALTER TABLE IF EXISTS lancamentos_broca ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMPTZ;

ALTER TABLE IF EXISTS lancamentos_perda ADD COLUMN IF NOT EXISTS status_registro TEXT DEFAULT 'ativo';
ALTER TABLE IF EXISTS lancamentos_perda ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT;
ALTER TABLE IF EXISTS lancamentos_perda ADD COLUMN IF NOT EXISTS cancelado_por TEXT;
ALTER TABLE IF EXISTS lancamentos_perda ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_lancamentos_broca_status_registro ON lancamentos_broca(status_registro);
CREATE INDEX IF NOT EXISTS idx_lancamentos_perda_status_registro ON lancamentos_perda(status_registro);
