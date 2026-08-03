/**
 * Investment Routes
 *  GET  /api/invest/tiers         – all available tiers
 *  GET  /api/invest/my            – current user's active investment
 *  POST /api/invest/claim         – claim daily returns (24h check)
 */

const router = require("express").Router();
const { authenticate } = require("../middleware/auth");
const { prisma }  = require("../lib/prisma");
const { Prisma }  = require("@prisma/client");
const { CLAIM_WINDOW_HOURS } = require("../config/tiers");

router.use(authenticate);

// ── GET /api/invest/tiers ─────────────────────────────────────────────
router.get("/tiers", async (req, res) => {
  const tiers = await prisma.investmentTier.findMany({ orderBy: { sortOrder: "asc" } });
  res.json(tiers);
});

// ── GET /api/invest/my ────────────────────────────────────────────────
// Returns the user's active investment with countdown info
router.get("/my", async (req, res) => {
  const investment = await prisma.investment.findFirst({
    where:   { userId: req.user.sub, status: "ACTIVE" },
    include: { tier: true },
    orderBy: { activatedAt: "desc" },
  });

  if (!investment) return res.json(null);

  const now        = new Date();
  const nextClaim  = new Date(investment.nextClaimAt);
  const canClaim   = now >= nextClaim;
  const msLeft     = canClaim ? 0 : nextClaim - now;

  res.json({
    ...investment,
    canClaim,
    msUntilClaim: msLeft,
    countdownSeconds: Math.ceil(msLeft / 1000),
  });
});

// ── POST /api/invest/claim ────────────────────────────────────────────
router.post("/claim", async (req, res) => {
  const now = new Date();

  // Use a DB transaction with row-level lock to prevent double-claims
  const result = await prisma.$transaction(async (tx) => {
    const inv = await tx.$queryRaw`
      SELECT * FROM investments
      WHERE user_id = ${req.user.sub}::text
        AND status = 'ACTIVE'
      ORDER BY activated_at DESC
      LIMIT 1
      FOR UPDATE
    `;

    const investment = Array.isArray(inv) ? inv[0] : null;
    if (!investment) throw new Error("No active investment found.");

    const nextClaim = new Date(investment.next_claim_at);
    if (now < nextClaim) {
      const secondsLeft = Math.ceil((nextClaim - now) / 1000);
      throw Object.assign(new Error(`Claim not ready. Try again in ${secondsLeft}s.`), { code: "NOT_READY", secondsLeft });
    }

    const tier = await tx.investmentTier.findUnique({ where: { id: investment.tier_id } });
    const claimAmount = parseFloat(tier.daily_claim);

    // Reset 24-hour timer
    const newNextClaim = new Date(now.getTime() + CLAIM_WINDOW_HOURS * 60 * 60 * 1000);

    await tx.$executeRaw`
      UPDATE investments
      SET last_claimed_at = ${now},
          next_claim_at   = ${newNextClaim},
          total_claimed   = total_claimed + ${claimAmount}
      WHERE id = ${investment.id}::text
    `;

    // Credit wallet
    await tx.wallet.update({
      where: { userId: investment.user_id },
      data:  {
        withdrawable: { increment: claimAmount },
        totalEarned:  { increment: claimAmount },
      },
    });

    // Log claim
    await tx.transaction.create({
      data: {
        userId:      investment.user_id,
        type:        "CLAIM",
        amount:      claimAmount,
        netAmount:   claimAmount,
        status:      "COMPLETED",
        description: `${tier.name} daily claim`,
      },
    });

    return { claimed: claimAmount, nextClaimAt: newNextClaim };
  });

  res.json({ message: `Claimed KES ${result.claimed}!`, ...result });
});

module.exports = router;
