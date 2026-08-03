const router = require("express").Router();
const { authenticate } = require("../middleware/auth");
const { commitToInvestmentPlan } = require("../services/walletService");
const { prisma } = require("../lib/prisma");

router.use(authenticate);

// GET /api/invest/plans
router.get("/plans", async (req, res) => {
  const plans = await prisma.investmentPlan.findMany({ orderBy: { minAmount: "asc" } });
  res.json(plans);
});

// GET /api/invest/active
router.get("/active", async (req, res) => {
  const investments = await prisma.investment.findMany({
    where: { userId: req.user.sub, status: "ACTIVE" },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(investments);
});

// POST /api/invest/commit
router.post("/commit", async (req, res) => {
  const { planId, amount } = req.body;
  if (!planId || !amount) return res.status(400).json({ error: "planId and amount are required." });

  try {
    const investment = await commitToInvestmentPlan(req.user.sub, planId, parseFloat(amount));
    res.status(201).json(investment);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
