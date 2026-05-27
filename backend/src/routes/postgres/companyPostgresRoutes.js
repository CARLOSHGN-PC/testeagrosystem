import express from "express";
import { authenticateRequest } from "../../middlewares/authMiddleware.js";
import { enforceCompanyScope, requireModuleAccess, requireWriteAccess } from "../../middlewares/permissionMiddleware.js";
import { requireRoles } from "../../middlewares/roleMiddleware.js";
import { getCompanies, getCompanyById, updateCompanyConfig } from "../../controllers/postgres/companyPostgresController.js";

const router = express.Router();

router.use(authenticateRequest);

// Configuração pública da própria empresa logada.
// Não depende do frontend escolher companyId: o escopo vem do JWT no backend.
router.get("/current", enforceCompanyScope, getCompanyById);

// Usuário comum pode consultar somente a própria empresa.
// Se enviar outra empresa, enforceCompanyScope bloqueia com 403.
router.get("/:id", (req, _res, next) => {
  req.params.companyId = req.params.id;
  next();
}, enforceCompanyScope, getCompanyById);

// Listagem e alterações continuam restritas aos administradores.
router.get("/", requireRoles("super_admin", "admin_empresa"), requireModuleAccess("configuracao_empresa"), getCompanies);
router.patch("/:id/config", requireRoles("super_admin", "admin_empresa"), requireModuleAccess("configuracao_empresa"), requireWriteAccess("configuracao_empresa"), updateCompanyConfig);

export default router;
