import { prisma } from "../../lib/prisma.js";
import { normalizeText } from "./postgresControllerUtils.js";
import { normalizeEnabledModules, createDisabledModules } from "../../constants/accessModules.js";

function normalizeCompanyStatus(status) {
  const value = String(status || '').toUpperCase();
  return value === 'INATIVO' || value === 'INACTIVE' ? 'inactive' : 'active';
}

function normalizeHexColor(value) {
  const color = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#55AB52';
}

function publicCompany(company) {
  if (!company) return null;
  const companyId = company.code || company.id;
  return {
    ...company,
    companyId,
    code: company.code || companyId,
    name: company.name || companyId,
    status: normalizeCompanyStatus(company.status),
    plan: company.plan || 'basic',
    maxUsers: company.maxUsers || 10,
    logoColor: company.logoColor || '#55AB52',
    enabledModules: normalizeEnabledModules(company.enabledModules || createDisabledModules()),
    source: 'postgres'
  };
}

async function findCompany(rawId) {
  const raw = String(rawId || '').trim();
  const normalized = normalizeText(raw);
  const companies = await prisma.company.findMany();
  return companies.find(
    (item) =>
      item.id === raw ||
      item.code === raw ||
      normalizeText(item.id) === normalized ||
      normalizeText(item.code) === normalized ||
      normalizeText(item.name) === normalized ||
      normalizeText(item.name).includes(normalized)
  );
}

export async function getCompanies(req, res) {
  try {
    const companies = await prisma.company.findMany({
      orderBy: { name: "asc" },
    });

    const data = companies.map(publicCompany);
    res.json({ success: true, total: data.length, data });
  } catch (error) {
    console.error("Erro ao buscar empresas no PostgreSQL:", error);
    res.status(500).json({ success: false, message: "Erro ao buscar empresas no PostgreSQL" });
  }
}

export async function getCompanyById(req, res) {
  try {
    const company = await findCompany(req.params.id || req.companyId);

    if (!company) {
      return res.status(404).json({ success: false, message: "Empresa não encontrada" });
    }

    res.json({ success: true, data: publicCompany(company) });
  } catch (error) {
    console.error("Erro ao buscar empresa no PostgreSQL:", error);
    res.status(500).json({ success: false, message: "Erro ao buscar empresa no PostgreSQL" });
  }
}

export async function updateCompanyConfig(req, res) {
  try {
    const company = await findCompany(req.params.id);
    if (!company) {
      return res.status(404).json({ success: false, message: "Empresa não encontrada" });
    }

    const data = {};
    if (req.body?.logoColor !== undefined) data.logoColor = normalizeHexColor(req.body.logoColor);
    if (req.body?.enabledModules !== undefined) data.enabledModules = normalizeEnabledModules(req.body.enabledModules || {});
    if (req.body?.maxUsers !== undefined) data.maxUsers = Math.max(1, Number(req.body.maxUsers || 1));
    if (req.body?.plan !== undefined) data.plan = String(req.body.plan || 'basic').trim() || 'basic';

    const updated = await prisma.company.update({
      where: { id: company.id },
      data,
    });

    res.json({ success: true, data: publicCompany(updated) });
  } catch (error) {
    console.error("Erro ao atualizar configuração da empresa no PostgreSQL:", error);
    res.status(500).json({ success: false, message: "Erro ao atualizar configuração da empresa no PostgreSQL" });
  }
}
