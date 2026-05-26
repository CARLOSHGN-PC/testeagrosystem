-- TODO: confirmar com equipe índices adicionais e FKs para motorista/caminhao.
CREATE TABLE "rotas_caminhoes" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "frente" TEXT NOT NULL,
  "fazenda" TEXT NOT NULL,
  "talhao" TEXT,
  "ponto_carregamento" TEXT,
  "tipo_rota" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "observacao" TEXT,
  "status" TEXT NOT NULL DEFAULT 'rascunho',
  "distancia_metros" DOUBLE PRECISION,
  "criado_por" TEXT NOT NULL,
  "criado_em" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "rotas_caminhoes_company_id_idx" ON "rotas_caminhoes"("company_id");
CREATE INDEX "rotas_caminhoes_company_id_status_idx" ON "rotas_caminhoes"("company_id","status");

CREATE TABLE "pontos_rota_caminhoes" (
  "id" TEXT PRIMARY KEY,
  "rota_id" TEXT NOT NULL REFERENCES "rotas_caminhoes"("id") ON DELETE CASCADE,
  "ordem" INTEGER NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "velocidade" DOUBLE PRECISION,
  "precisao" DOUBLE PRECISION,
  "criado_em" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "pontos_rota_caminhoes_rota_id_ordem_idx" ON "pontos_rota_caminhoes"("rota_id","ordem");

CREATE TABLE "avisos_rota_caminhoes" (
  "id" TEXT PRIMARY KEY,
  "rota_id" TEXT NOT NULL REFERENCES "rotas_caminhoes"("id") ON DELETE CASCADE,
  "tipo_aviso" TEXT NOT NULL,
  "descricao" TEXT,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "distancia_alerta_metros" INTEGER NOT NULL DEFAULT 100
);
CREATE INDEX "avisos_rota_caminhoes_rota_id_idx" ON "avisos_rota_caminhoes"("rota_id");
