import express from "express";
import { authenticateRequest } from "../../middlewares/authMiddleware.js";
import { enforceCompanyScope, requireModuleAccess } from "../../middlewares/permissionMiddleware.js";
import {
  getFarms,
  getFields,
  getVarieties,
  getEstimates,
  getCutOrders,
  getServiceOrders,
  getClosureDashboardRecords,
  getHarvestPlans,
  getPlanningTreatments,
  createPlanningTreatment,
} from "../../controllers/postgres/agroPostgresController.js";

const router = express.Router();

router.use(authenticateRequest, requireModuleAccess("mapas"), enforceCompanyScope);

router.get("/farms", getFarms);
router.get("/fields", getFields);
router.get("/varieties", getVarieties);
router.get("/estimates", getEstimates);
router.get("/cut-orders", getCutOrders);
router.get("/service-orders", getServiceOrders);
router.get("/closure-dashboard-records", getClosureDashboardRecords);
router.get("/harvest-plans", getHarvestPlans);
router.get("/planning-treatments", getPlanningTreatments);
router.post("/planning-treatments", createPlanningTreatment);

export default router;
