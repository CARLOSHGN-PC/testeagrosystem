-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'USER');

-- CreateEnum
CREATE TYPE "StatusAtivo" AS ENUM ('ATIVO', 'INATIVO');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "cnpj" TEXT,
    "status" "StatusAtivo" NOT NULL DEFAULT 'ATIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'basic',
    "maxUsers" INTEGER NOT NULL DEFAULT 10,
    "logoColor" TEXT NOT NULL DEFAULT '#55AB52',
    "enabledModules" JSONB,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "status" "StatusAtivo" NOT NULL DEFAULT 'ATIVO',
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Farm" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "area" DECIMAL(12,2),
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Farm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Field" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "farmId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "area" DECIMAL(12,2),
    "varietyId" TEXT,
    "stage" TEXT,
    "spacing" DECIMAL(8,2),
    "plantingDate" TIMESTAMP(3),
    "lastCutDate" TIMESTAMP(3),
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Variety" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "status" "StatusAtivo" NOT NULL DEFAULT 'ATIVO',
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Variety_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estimate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "farmId" TEXT,
    "fieldId" TEXT,
    "varietyId" TEXT,
    "harvestYear" TEXT,
    "round" TEXT,
    "estimatedTch" DECIMAL(12,2),
    "estimatedTon" DECIMAL(14,2),
    "estimatedAtr" DECIMAL(12,2),
    "area" DECIMAL(12,2),
    "source" TEXT,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateHistory" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "action" TEXT,
    "oldData" JSONB,
    "newData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstimateHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HarvestPlan" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "harvestYear" TEXT,
    "front" TEXT,
    "sequence" INTEGER,
    "entryDate" TIMESTAMP(3),
    "exitDate" TIMESTAMP(3),
    "estimatedTon" DECIMAL(14,2),
    "receivedBalance" DECIMAL(14,2),
    "availableTotal" DECIMAL(14,2),
    "dailyQuota" DECIMAL(14,2),
    "remainingBalance" DECIMAL(14,2),
    "decimalDays" DECIMAL(12,4),
    "integerDays" INTEGER,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HarvestPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CutOrder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "farmId" TEXT,
    "number" TEXT,
    "status" TEXT,
    "openingDate" TIMESTAMP(3),
    "closingDate" TIMESTAMP(3),
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CutOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CutOrderField" (
    "id" TEXT NOT NULL,
    "cutOrderId" TEXT NOT NULL,
    "fieldId" TEXT,
    "area" DECIMAL(12,2),
    "estimatedTon" DECIMAL(14,2),
    "realTon" DECIMAL(14,2),
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CutOrderField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceOrder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" TEXT,
    "status" TEXT,
    "operation" TEXT,
    "openingDate" TIMESTAMP(3),
    "closingDate" TIMESTAMP(3),
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceOrderField" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "fieldId" TEXT,
    "area" DECIMAL(12,2),
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceOrderField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgriculturalProduction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "farmCode" TEXT,
    "fieldCode" TEXT,
    "varietyName" TEXT,
    "cutArea" DECIMAL(12,2),
    "realTon" DECIMAL(14,2),
    "realTch" DECIMAL(12,2),
    "atr" DECIMAL(12,2),
    "harvestDate" TIMESTAMP(3),
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgriculturalProduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Input" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "status" "StatusAtivo" NOT NULL DEFAULT 'ATIVO',
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Input_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InputApplication" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "inputName" TEXT,
    "farmCode" TEXT,
    "fieldCode" TEXT,
    "operation" TEXT,
    "dose" DECIMAL(12,4),
    "area" DECIMAL(12,2),
    "applicationDate" TIMESTAMP(3),
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InputApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Protocol" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "StatusAtivo" NOT NULL DEFAULT 'ATIVO',
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Protocol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HarvestAssumption" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "harvestYear" TEXT,
    "name" TEXT,
    "status" "StatusAtivo" NOT NULL DEFAULT 'ATIVO',
    "dailyGoal" DECIMAL(14,2),
    "weeklyGoal" DECIMAL(14,2),
    "monthlyGoal" DECIMAL(14,2),
    "hourlyGoal" DECIMAL(14,2),
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HarvestAssumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClosureDashboardRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "harvestYear" TEXT,
    "farmCode" TEXT,
    "fieldCode" TEXT,
    "part" TEXT,
    "varietyName" TEXT,
    "stage" TEXT,
    "openingDate" TIMESTAMP(3),
    "closingDate" TIMESTAMP(3),
    "plantingDate" TIMESTAMP(3),
    "releasedArea" DECIMAL(12,2),
    "cutArea" DECIMAL(12,2),
    "prevTon" DECIMAL(14,2),
    "realTon" DECIMAL(14,2),
    "prevTch" DECIMAL(12,2),
    "realTch" DECIMAL(12,2),
    "atr" DECIMAL(12,2),
    "atrHaReal" DECIMAL(14,2),
    "age" DECIMAL(8,2),
    "cuts" DECIMAL(8,2),
    "spacing" DECIMAL(8,2),
    "dm" INTEGER,
    "timeDays" DECIMAL(8,2),
    "variationPercent" DECIMAL(8,2),
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClosureDashboardRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Operation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "type" TEXT,
    "costCenterCode" TEXT,
    "costCenterName" TEXT,
    "status" "StatusAtivo" NOT NULL DEFAULT 'ATIVO',
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Operation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Professional" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cpf" TEXT,
    "phone" TEXT,
    "registration" TEXT,
    "role" TEXT,
    "team" TEXT,
    "unit" TEXT,
    "notes" TEXT,
    "status" TEXT,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Professional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanningTreatment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "harvestYear" TEXT,
    "sequential" INTEGER,
    "status" TEXT,
    "operation" JSONB,
    "protocolOriginalId" TEXT,
    "protocolName" TEXT,
    "subProtocol" TEXT,
    "editedProtocol" JSONB,
    "originalCost" DECIMAL(14,2),
    "plannedCost" DECIMAL(14,2),
    "justification" TEXT,
    "totalFields" INTEGER,
    "totalFarms" INTEGER,
    "farms" JSONB,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanningTreatment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanningTreatmentField" (
    "id" TEXT NOT NULL,
    "planningTreatmentId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "harvestYear" TEXT,
    "fieldCode" TEXT,
    "fieldName" TEXT,
    "farmCode" TEXT,
    "farmName" TEXT,
    "cut" TEXT,
    "area" DECIMAL(12,2),
    "status" TEXT,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanningTreatmentField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_colheita_registros" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "codigo_empresa" TEXT,
    "safra" TEXT,
    "data" TIMESTAMP(3),
    "hora" TEXT,
    "data_hora" TIMESTAMP(3),
    "frente" TEXT,
    "descricao" TEXT,
    "entrega" DECIMAL(14,4),
    "densidade_media" DECIMAL(14,4),
    "meta_periodo" DECIMAL(14,4),
    "entregue_percentual" DECIMAL(14,4),
    "media_entrega" DECIMAL(14,4),
    "media_meta" DECIMAL(14,4),
    "diferenca" DECIMAL(14,4),
    "importado_por" TEXT,
    "importado_em" TIMESTAMP(3),
    "dados_originais" JSONB,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_colheita_registros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_colheita_operacional" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "codigo_empresa" TEXT,
    "tipo" TEXT,
    "rotacao_moenda" DECIMAL(14,4),
    "estoque_carretas" DECIMAL(14,4),
    "dados_originais" JSONB,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_colheita_operacional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_colheita_atr_fazenda" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "codigo_empresa" TEXT,
    "safra" TEXT,
    "data" TIMESTAMP(3),
    "codigo_fazenda" TEXT,
    "nome_fazenda" TEXT,
    "fazenda" TEXT,
    "fornecedor" TEXT,
    "propriedade" TEXT,
    "nome" TEXT,
    "atr" DECIMAL(14,4),
    "importado_por" TEXT,
    "importado_em" TIMESTAMP(3),
    "dados_originais" JSONB,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_colheita_atr_fazenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_colheita_atr_mensal" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "codigo_empresa" TEXT,
    "safra" TEXT,
    "data" TIMESTAMP(3),
    "atr" DECIMAL(14,4),
    "acumulado" DECIMAL(14,4),
    "importado_por" TEXT,
    "importado_em" TIMESTAMP(3),
    "dados_originais" JSONB,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_colheita_atr_mensal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_colheita_impurezas" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "codigo_empresa" TEXT,
    "safra" TEXT,
    "data" TIMESTAMP(3),
    "hora" TEXT,
    "data_hora" TIMESTAMP(3),
    "impureza_mineral" DECIMAL(14,4),
    "impureza_vegetal" DECIMAL(14,4),
    "importado_por" TEXT,
    "importado_em" TIMESTAMP(3),
    "dados_originais" JSONB,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_colheita_impurezas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_colheita_impureza_mineral_turno" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "codigo_empresa" TEXT,
    "safra" TEXT,
    "data" TIMESTAMP(3),
    "frente" TEXT,
    "frente_label" TEXT,
    "turno_a" DECIMAL(14,4),
    "turno_b" DECIMAL(14,4),
    "turno_c" DECIMAL(14,4),
    "dados_originais" JSONB,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_colheita_impureza_mineral_turno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_colheita_impureza_vegetal_turno" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "codigo_empresa" TEXT,
    "safra" TEXT,
    "data" TIMESTAMP(3),
    "frente" TEXT,
    "frente_label" TEXT,
    "turno_a" DECIMAL(14,4),
    "turno_b" DECIMAL(14,4),
    "turno_c" DECIMAL(14,4),
    "dados_originais" JSONB,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_colheita_impureza_vegetal_turno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_colheita_paradas" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "codigo_empresa" TEXT,
    "data" TIMESTAMP(3),
    "tipo" TEXT,
    "hora_inicio" TEXT,
    "hora_fim" TEXT,
    "observacao" TEXT,
    "dados_originais" JSONB,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_colheita_paradas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_colheita_premissas" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "codigo_empresa" TEXT,
    "moagem_prevista" DECIMAL(16,4),
    "meta_reprojetada" DECIMAL(16,4),
    "meta_dia" DECIMAL(16,4),
    "meta_semana" DECIMAL(16,4),
    "meta_mes" DECIMAL(16,4),
    "meta_hora" DECIMAL(16,4),
    "atr" DECIMAL(14,4),
    "tah" DECIMAL(14,4),
    "tch" DECIMAL(14,4),
    "broca" DECIMAL(14,4),
    "impureza_vegetal" DECIMAL(14,4),
    "impureza_mineral" DECIMAL(14,4),
    "metas_mensais" JSONB,
    "dados_originais" JSONB,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_colheita_premissas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_code_key" ON "Company"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- CreateIndex
CREATE INDEX "Farm_companyId_idx" ON "Farm"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Farm_companyId_code_key" ON "Farm"("companyId", "code");

-- CreateIndex
CREATE INDEX "Field_companyId_idx" ON "Field"("companyId");

-- CreateIndex
CREATE INDEX "Field_farmId_idx" ON "Field"("farmId");

-- CreateIndex
CREATE UNIQUE INDEX "Field_companyId_code_key" ON "Field"("companyId", "code");

-- CreateIndex
CREATE INDEX "Variety_companyId_idx" ON "Variety"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Variety_companyId_name_key" ON "Variety"("companyId", "name");

-- CreateIndex
CREATE INDEX "Estimate_companyId_idx" ON "Estimate"("companyId");

-- CreateIndex
CREATE INDEX "Estimate_farmId_idx" ON "Estimate"("farmId");

-- CreateIndex
CREATE INDEX "Estimate_fieldId_idx" ON "Estimate"("fieldId");

-- CreateIndex
CREATE INDEX "EstimateHistory_estimateId_idx" ON "EstimateHistory"("estimateId");

-- CreateIndex
CREATE INDEX "HarvestPlan_companyId_idx" ON "HarvestPlan"("companyId");

-- CreateIndex
CREATE INDEX "HarvestPlan_front_idx" ON "HarvestPlan"("front");

-- CreateIndex
CREATE INDEX "HarvestPlan_sequence_idx" ON "HarvestPlan"("sequence");

-- CreateIndex
CREATE INDEX "CutOrder_companyId_idx" ON "CutOrder"("companyId");

-- CreateIndex
CREATE INDEX "CutOrder_farmId_idx" ON "CutOrder"("farmId");

-- CreateIndex
CREATE INDEX "CutOrderField_cutOrderId_idx" ON "CutOrderField"("cutOrderId");

-- CreateIndex
CREATE INDEX "CutOrderField_fieldId_idx" ON "CutOrderField"("fieldId");

-- CreateIndex
CREATE INDEX "ServiceOrder_companyId_idx" ON "ServiceOrder"("companyId");

-- CreateIndex
CREATE INDEX "ServiceOrderField_serviceOrderId_idx" ON "ServiceOrderField"("serviceOrderId");

-- CreateIndex
CREATE INDEX "ServiceOrderField_fieldId_idx" ON "ServiceOrderField"("fieldId");

-- CreateIndex
CREATE INDEX "AgriculturalProduction_companyId_idx" ON "AgriculturalProduction"("companyId");

-- CreateIndex
CREATE INDEX "AgriculturalProduction_farmCode_idx" ON "AgriculturalProduction"("farmCode");

-- CreateIndex
CREATE INDEX "AgriculturalProduction_fieldCode_idx" ON "AgriculturalProduction"("fieldCode");

-- CreateIndex
CREATE INDEX "Input_companyId_idx" ON "Input"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Input_companyId_name_key" ON "Input"("companyId", "name");

-- CreateIndex
CREATE INDEX "InputApplication_companyId_idx" ON "InputApplication"("companyId");

-- CreateIndex
CREATE INDEX "Protocol_companyId_idx" ON "Protocol"("companyId");

-- CreateIndex
CREATE INDEX "HarvestAssumption_companyId_idx" ON "HarvestAssumption"("companyId");

-- CreateIndex
CREATE INDEX "ClosureDashboardRecord_companyId_idx" ON "ClosureDashboardRecord"("companyId");

-- CreateIndex
CREATE INDEX "ClosureDashboardRecord_farmCode_idx" ON "ClosureDashboardRecord"("farmCode");

-- CreateIndex
CREATE INDEX "ClosureDashboardRecord_fieldCode_idx" ON "ClosureDashboardRecord"("fieldCode");

-- CreateIndex
CREATE INDEX "ClosureDashboardRecord_closingDate_idx" ON "ClosureDashboardRecord"("closingDate");

-- CreateIndex
CREATE INDEX "Operation_companyId_idx" ON "Operation"("companyId");

-- CreateIndex
CREATE INDEX "Operation_code_idx" ON "Operation"("code");

-- CreateIndex
CREATE INDEX "Professional_companyId_idx" ON "Professional"("companyId");

-- CreateIndex
CREATE INDEX "Professional_cpf_idx" ON "Professional"("cpf");

-- CreateIndex
CREATE INDEX "Professional_registration_idx" ON "Professional"("registration");

-- CreateIndex
CREATE INDEX "PlanningTreatment_companyId_idx" ON "PlanningTreatment"("companyId");

-- CreateIndex
CREATE INDEX "PlanningTreatment_harvestYear_idx" ON "PlanningTreatment"("harvestYear");

-- CreateIndex
CREATE INDEX "PlanningTreatment_status_idx" ON "PlanningTreatment"("status");

-- CreateIndex
CREATE INDEX "PlanningTreatment_companyId_harvestYear_idx" ON "PlanningTreatment"("companyId", "harvestYear");

-- CreateIndex
CREATE INDEX "PlanningTreatmentField_planningTreatmentId_idx" ON "PlanningTreatmentField"("planningTreatmentId");

-- CreateIndex
CREATE INDEX "PlanningTreatmentField_companyId_idx" ON "PlanningTreatmentField"("companyId");

-- CreateIndex
CREATE INDEX "PlanningTreatmentField_harvestYear_idx" ON "PlanningTreatmentField"("harvestYear");

-- CreateIndex
CREATE INDEX "PlanningTreatmentField_fieldCode_idx" ON "PlanningTreatmentField"("fieldCode");

-- CreateIndex
CREATE INDEX "PlanningTreatmentField_companyId_harvestYear_idx" ON "PlanningTreatmentField"("companyId", "harvestYear");

-- CreateIndex
CREATE INDEX "PlanningTreatmentField_companyId_harvestYear_fieldCode_idx" ON "PlanningTreatmentField"("companyId", "harvestYear", "fieldCode");

-- CreateIndex
CREATE INDEX "dashboard_colheita_registros_company_id_idx" ON "dashboard_colheita_registros"("company_id");

-- CreateIndex
CREATE INDEX "dashboard_colheita_registros_codigo_empresa_idx" ON "dashboard_colheita_registros"("codigo_empresa");

-- CreateIndex
CREATE INDEX "dashboard_colheita_registros_safra_idx" ON "dashboard_colheita_registros"("safra");

-- CreateIndex
CREATE INDEX "dashboard_colheita_registros_data_idx" ON "dashboard_colheita_registros"("data");

-- CreateIndex
CREATE INDEX "dashboard_colheita_registros_frente_idx" ON "dashboard_colheita_registros"("frente");

-- CreateIndex
CREATE INDEX "dashboard_colheita_registros_company_id_safra_idx" ON "dashboard_colheita_registros"("company_id", "safra");

-- CreateIndex
CREATE INDEX "dashboard_colheita_registros_codigo_empresa_safra_idx" ON "dashboard_colheita_registros"("codigo_empresa", "safra");

-- CreateIndex
CREATE INDEX "dashboard_colheita_operacional_company_id_idx" ON "dashboard_colheita_operacional"("company_id");

-- CreateIndex
CREATE INDEX "dashboard_colheita_operacional_codigo_empresa_idx" ON "dashboard_colheita_operacional"("codigo_empresa");

-- CreateIndex
CREATE INDEX "dashboard_colheita_atr_fazenda_company_id_idx" ON "dashboard_colheita_atr_fazenda"("company_id");

-- CreateIndex
CREATE INDEX "dashboard_colheita_atr_fazenda_codigo_empresa_idx" ON "dashboard_colheita_atr_fazenda"("codigo_empresa");

-- CreateIndex
CREATE INDEX "dashboard_colheita_atr_fazenda_safra_idx" ON "dashboard_colheita_atr_fazenda"("safra");

-- CreateIndex
CREATE INDEX "dashboard_colheita_atr_fazenda_data_idx" ON "dashboard_colheita_atr_fazenda"("data");

-- CreateIndex
CREATE INDEX "dashboard_colheita_atr_fazenda_codigo_fazenda_idx" ON "dashboard_colheita_atr_fazenda"("codigo_fazenda");

-- CreateIndex
CREATE INDEX "dashboard_colheita_atr_fazenda_company_id_safra_idx" ON "dashboard_colheita_atr_fazenda"("company_id", "safra");

-- CreateIndex
CREATE INDEX "dashboard_colheita_atr_fazenda_codigo_empresa_safra_idx" ON "dashboard_colheita_atr_fazenda"("codigo_empresa", "safra");

-- CreateIndex
CREATE INDEX "dashboard_colheita_atr_mensal_company_id_idx" ON "dashboard_colheita_atr_mensal"("company_id");

-- CreateIndex
CREATE INDEX "dashboard_colheita_atr_mensal_codigo_empresa_idx" ON "dashboard_colheita_atr_mensal"("codigo_empresa");

-- CreateIndex
CREATE INDEX "dashboard_colheita_atr_mensal_safra_idx" ON "dashboard_colheita_atr_mensal"("safra");

-- CreateIndex
CREATE INDEX "dashboard_colheita_atr_mensal_data_idx" ON "dashboard_colheita_atr_mensal"("data");

-- CreateIndex
CREATE INDEX "dashboard_colheita_atr_mensal_company_id_safra_idx" ON "dashboard_colheita_atr_mensal"("company_id", "safra");

-- CreateIndex
CREATE INDEX "dashboard_colheita_atr_mensal_codigo_empresa_safra_idx" ON "dashboard_colheita_atr_mensal"("codigo_empresa", "safra");

-- CreateIndex
CREATE INDEX "dashboard_colheita_impurezas_company_id_idx" ON "dashboard_colheita_impurezas"("company_id");

-- CreateIndex
CREATE INDEX "dashboard_colheita_impurezas_codigo_empresa_idx" ON "dashboard_colheita_impurezas"("codigo_empresa");

-- CreateIndex
CREATE INDEX "dashboard_colheita_impurezas_safra_idx" ON "dashboard_colheita_impurezas"("safra");

-- CreateIndex
CREATE INDEX "dashboard_colheita_impurezas_data_idx" ON "dashboard_colheita_impurezas"("data");

-- CreateIndex
CREATE INDEX "dashboard_colheita_impurezas_company_id_safra_idx" ON "dashboard_colheita_impurezas"("company_id", "safra");

-- CreateIndex
CREATE INDEX "dashboard_colheita_impurezas_codigo_empresa_safra_idx" ON "dashboard_colheita_impurezas"("codigo_empresa", "safra");

-- CreateIndex
CREATE INDEX "dashboard_colheita_impureza_mineral_turno_company_id_idx" ON "dashboard_colheita_impureza_mineral_turno"("company_id");

-- CreateIndex
CREATE INDEX "dashboard_colheita_impureza_mineral_turno_codigo_empresa_idx" ON "dashboard_colheita_impureza_mineral_turno"("codigo_empresa");

-- CreateIndex
CREATE INDEX "dashboard_colheita_impureza_mineral_turno_safra_idx" ON "dashboard_colheita_impureza_mineral_turno"("safra");

-- CreateIndex
CREATE INDEX "dashboard_colheita_impureza_mineral_turno_data_idx" ON "dashboard_colheita_impureza_mineral_turno"("data");

-- CreateIndex
CREATE INDEX "dashboard_colheita_impureza_mineral_turno_frente_idx" ON "dashboard_colheita_impureza_mineral_turno"("frente");

-- CreateIndex
CREATE INDEX "dashboard_colheita_impureza_mineral_turno_company_id_safra_idx" ON "dashboard_colheita_impureza_mineral_turno"("company_id", "safra");

-- CreateIndex
CREATE INDEX "dashboard_colheita_impureza_mineral_turno_codigo_empresa_sa_idx" ON "dashboard_colheita_impureza_mineral_turno"("codigo_empresa", "safra");

-- CreateIndex
CREATE INDEX "dashboard_colheita_impureza_vegetal_turno_company_id_idx" ON "dashboard_colheita_impureza_vegetal_turno"("company_id");

-- CreateIndex
CREATE INDEX "dashboard_colheita_impureza_vegetal_turno_codigo_empresa_idx" ON "dashboard_colheita_impureza_vegetal_turno"("codigo_empresa");

-- CreateIndex
CREATE INDEX "dashboard_colheita_impureza_vegetal_turno_safra_idx" ON "dashboard_colheita_impureza_vegetal_turno"("safra");

-- CreateIndex
CREATE INDEX "dashboard_colheita_impureza_vegetal_turno_data_idx" ON "dashboard_colheita_impureza_vegetal_turno"("data");

-- CreateIndex
CREATE INDEX "dashboard_colheita_impureza_vegetal_turno_frente_idx" ON "dashboard_colheita_impureza_vegetal_turno"("frente");

-- CreateIndex
CREATE INDEX "dashboard_colheita_impureza_vegetal_turno_company_id_safra_idx" ON "dashboard_colheita_impureza_vegetal_turno"("company_id", "safra");

-- CreateIndex
CREATE INDEX "dashboard_colheita_impureza_vegetal_turno_codigo_empresa_sa_idx" ON "dashboard_colheita_impureza_vegetal_turno"("codigo_empresa", "safra");

-- CreateIndex
CREATE INDEX "dashboard_colheita_paradas_company_id_idx" ON "dashboard_colheita_paradas"("company_id");

-- CreateIndex
CREATE INDEX "dashboard_colheita_paradas_codigo_empresa_idx" ON "dashboard_colheita_paradas"("codigo_empresa");

-- CreateIndex
CREATE INDEX "dashboard_colheita_paradas_data_idx" ON "dashboard_colheita_paradas"("data");

-- CreateIndex
CREATE INDEX "dashboard_colheita_paradas_tipo_idx" ON "dashboard_colheita_paradas"("tipo");

-- CreateIndex
CREATE INDEX "dashboard_colheita_premissas_company_id_idx" ON "dashboard_colheita_premissas"("company_id");

-- CreateIndex
CREATE INDEX "dashboard_colheita_premissas_codigo_empresa_idx" ON "dashboard_colheita_premissas"("codigo_empresa");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Farm" ADD CONSTRAINT "Farm_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Field" ADD CONSTRAINT "Field_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Field" ADD CONSTRAINT "Field_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Field" ADD CONSTRAINT "Field_varietyId_fkey" FOREIGN KEY ("varietyId") REFERENCES "Variety"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variety" ADD CONSTRAINT "Variety_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_varietyId_fkey" FOREIGN KEY ("varietyId") REFERENCES "Variety"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateHistory" ADD CONSTRAINT "EstimateHistory_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarvestPlan" ADD CONSTRAINT "HarvestPlan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutOrder" ADD CONSTRAINT "CutOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutOrder" ADD CONSTRAINT "CutOrder_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutOrderField" ADD CONSTRAINT "CutOrderField_cutOrderId_fkey" FOREIGN KEY ("cutOrderId") REFERENCES "CutOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutOrderField" ADD CONSTRAINT "CutOrderField_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrderField" ADD CONSTRAINT "ServiceOrderField_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrderField" ADD CONSTRAINT "ServiceOrderField_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
