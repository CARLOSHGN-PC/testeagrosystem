import { prisma } from "../../lib/prisma.js";

export function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

export async function resolveCompanyIds(companyRef) {
  if (!companyRef) return null;

  const raw = String(companyRef).trim();
  const normalized = normalizeText(raw);

  const companies = await prisma.company.findMany({
    select: { id: true, code: true, name: true },
  });

  const aliases = new Map([
    // Legado do frontend/produção: empresa selecionada como 002, mas no PostgreSQL está como usinacacu.
    ["002", "usinacacu"],
    ["2", "usinacacu"],
    ["cacu", "usinacacu"],
    ["usina", "usinacacu"],
    ["usinacacu", "usinacacu"],
    ["usinacacu002", "usinacacu"],

    // Ambientes demo/teste antigos.
    ["001", "agrosystem"],
    ["1", "agrosystem"],
    ["agrosystemdemo", "agrosystem"],
    ["agrosystem_demo", "agrosystem"],
    ["agrosystem", "agrosystem"],
    ["agrosystemtestes", "agrosystem"],
  ]);

  const normalizedAlias = aliases.get(normalized) || normalized;

  const matches = companies.filter((company) => {
    const code = normalizeText(company.code);
    const name = normalizeText(company.name);
    const id = normalizeText(company.id);

    return (
      company.id === raw ||
      company.code === raw ||
      id === normalized ||
      code === normalized ||
      name === normalized ||
      id === normalizedAlias ||
      code === normalizedAlias ||
      name === normalizedAlias ||
      name.includes(normalizedAlias) ||
      normalizedAlias.includes(name)
    );
  });

  if (matches.length > 0) return matches.map((company) => company.id);

  if (normalizedAlias === "usinacacu") {
    return companies
      .filter((company) => normalizeText(company.name).includes("usinacacu") || normalizeText(company.code).includes("usinacacu"))
      .map((company) => company.id);
  }

  if (normalizedAlias === "agrosystem") {
    return companies
      .filter((company) => normalizeText(company.name).includes("agrosystem") || normalizeText(company.code).includes("agrosystem"))
      .map((company) => company.id);
  }

  return [];
}

export async function buildCompanyWhere(companyRef) {
  const ids = await resolveCompanyIds(companyRef);

  if (!ids) return {};
  if (ids.length === 0) return { companyId: "__NO_COMPANY_MATCH__" };

  return { companyId: { in: ids } };
}

export function mapStatusAtivoToLegacy(status) {
  return String(status || "ATIVO").toUpperCase() === "INATIVO" ? "inactive" : "active";
}
