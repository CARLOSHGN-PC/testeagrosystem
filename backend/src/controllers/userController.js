import * as userService from '../services/userService.js';

export async function listUsers(req, res) {
  try {
    const companyId = req.authUser.role === 'super_admin' ? req.query.companyId : req.authUser.companyId;
    const data = await userService.listUsers(companyId || null);
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

export async function createUser(req, res) {
  try {
    const data = await userService.createUser(req.body, req.authUser);
    res.status(201).json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

export async function updateUser(req, res) {
  try {
    await userService.updateUser(req.params.uid, req.body, req.authUser);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

export async function updateUserStatus(req, res) {
  try {
    await userService.updateUserStatus(req.params.uid, req.body.status, req.authUser);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

export async function resetPassword(req, res) {
  try {
    const data = await userService.resetUserPassword(req.params.uid, req.authUser);
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

export async function changeOwnPassword(req, res) {
  try {
    const data = await userService.changeOwnPassword(req.authUser, req.body);
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}
