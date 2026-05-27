import express from "express";
import { authenticateRequest } from "../../middlewares/authMiddleware.js";
import { requireModuleAccess } from "../../middlewares/permissionMiddleware.js";
import { requireRoles } from "../../middlewares/roleMiddleware.js";
import { getUsers } from "../../controllers/postgres/userPostgresController.js";

const router = express.Router();

router.use(authenticateRequest, requireRoles("super_admin", "admin_empresa"), requireModuleAccess("gerenciamento_usuarios"));

router.get("/", getUsers);

export default router;
