const router = require("express").Router();
const { authenticate } = require("../middleware/auth");
const { activateTier } = require("../services/walletService");
const { prisma } = require("../lib/prisma");

router.use(authenticate);

// ── GET /api/invest/tiers ─────────────────────────────────────────────────────
// Returns all active tiers ordered by price (cheapest first).
// Response shape: { id, name, price, dailyReturn, referralBonus, durationDays, description }
router.get("/tiers", async (req, res) => {
  try {
    const tiers = await prisma.investmentPlan.findMany({
      where:   { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true, name: true, price: true, dailyReturn: true,
        referralBonus: true, durationDays: true, description: true,
      },
    });
    res.json(tiers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/invest/plans  (legacy alias kept for compatibility) ───────────────
router.get("/plans", async (req, res) => {
  try {
    const plans = await prisma.investmentPlan.findMany({
      where:   { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/invest/active ─────────────────────────────────────────────────────
router.get("/active", async (req, res) => {
  try {
    const investments = await prisma.investment.findMany({
      where:   { userId: req.user.sub, status: "ACTIVE" },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(investments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/invest/activate ─────────────────────────────────────────────────
// Body: { planId: string }
// Deducts plan.price from wallet, creates investment, credits referral bonus.
router.post("/activate", async (req, res) => {
  const { planId } = req.body;
  if (!planId) return res.status(400).json({ error: "planId is required." });

  try {
    const investment = await activateTier(req.user.sub, planId);
    res.status(201).json({
      message:    `${investment.plan.name} activated! You will earn KES ${investment.plan.dailyReturn} daily.`,
      investment,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── POST /api/invest/commit  (legacy alias) ────────────────────────────────────
router.post("/commit", async (req, res) => {
  const planId = req.body.planId;
  if (!planId) return res.status(400).json({ error: "planId is required." });

  try {
    const investment = await activateTier(req.user.sub, planId);
    res.status(201).json(investment);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
