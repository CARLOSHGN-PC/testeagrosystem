import * as userService from "../../services/userService.js";

export async function getUsers(req, res) {
  try {
    const companyId = req.authUser?.role === "super_admin" ? req.query.companyId : req.authUser?.companyId;
    const q = String(req.query.q || '').trim().toLowerCase();
    let users = await userService.listUsers(companyId || null);

    if (q) {
      users = users.filter((user) => [user.nome, user.name, user.email, user.companyId, user.role]
        .some((value) => String(value || '').toLowerCase().includes(q)));
    }

    res.json({ success: true, total: users.length, data: users });
  } catch (error) {
    console.error("Erro ao buscar usuários no PostgreSQL:", error);
    res.status(500).json({ success: false, message: "Erro ao buscar usuários no PostgreSQL" });
  }
}
