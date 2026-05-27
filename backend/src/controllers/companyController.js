import * as companyService from '../services/companyService.js';

export async function listCompanies(req, res) {
  try {
    const data = await companyService.listCompanies();
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

export async function createCompany(req, res) {
  try {
    const data = await companyService.createCompany(req.body, req.authUser.uid);
    res.status(201).json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

export async function updateCompany(req, res) {
  try {
    const data = await companyService.updateCompany(req.params.companyId, req.body);
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

export async function updateCompanyStatus(req, res) {
  try {
    const data = await companyService.updateCompanyStatus(req.params.companyId, req.body.status);
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

export async function updateCompanyConfig(req, res) {
  try {
    const data = await companyService.updateCompanyConfig(req.params.companyId, req.body || {});
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

export async function runFixOrdemCorteFazendaBatch(req, res) {
  try {
    const data = await companyService.runFixOrdemCorteFazendaBatch(req.params.companyId, req.body || {});
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}
