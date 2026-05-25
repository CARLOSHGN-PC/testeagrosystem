import express from "express";
import { prisma } from "../lib/prisma.js";

const router = express.Router();

router.get("/companies", async (req, res) => {
  try {
    const companies = await prisma.company.findMany({
      orderBy: { name: "asc" },
    });

    res.json({
      success: true,
      total: companies.length,
      data: companies,
    });
  } catch (error) {
    console.error("Erro ao buscar empresas:", error);

    res.status(500).json({
      success: false,
      message: "Erro ao buscar empresas",
    });
  }
});

router.get("/summary", async (req, res) => {
  try {
    const [
      companies,
      users,
      farms,
      fields,
      estimates,
      cutOrders,
      serviceOrders,
      inputs,
      inputApplications,
    ] = await Promise.all([
      prisma.company.count(),
      prisma.user.count(),
      prisma.farm.count(),
      prisma.field.count(),
      prisma.estimate.count(),
      prisma.cutOrder.count(),
      prisma.serviceOrder.count(),
      prisma.input.count(),
      prisma.inputApplication.count(),
    ]);

    res.json({
      success: true,
      data: {
        companies,
        users,
        farms,
        fields,
        estimates,
        cutOrders,
        serviceOrders,
        inputs,
        inputApplications,
      },
    });
  } catch (error) {
    console.error("Erro ao gerar resumo:", error);

    res.status(500).json({
      success: false,
      message: "Erro ao gerar resumo do PostgreSQL",
    });
  }
});

export default router;