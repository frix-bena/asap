const { prisma } = require("../lib/prisma");
const { Prisma } = require("@prisma/client");

// ─────────────────────────────────────────────────────────────────────────────
// DEPOSIT  (plain wallet top-up, no tier selection)
// ─────────────────────────────────────────────────────────────────────────────
async function deposit(userId, amount) {
  if (amount <= 0) throw new Error("Amount must be positive.");

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;

    const wallet = await tx.wallet.update({
      where: { userId },
      data: {
        balance:        { increment: new Prisma.Decimal(amount) },
        totalDeposited: { increment: new Prisma.Decimal(amount) },
      },
    });

    const txRecord = await tx.transaction.create({
      data: { userId, type: "DEPOSIT", amount: new Prisma.Decimal(amount), status: "COMPLETED" },
    });

    return { wallet, transaction: txRecord };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// WITHDRAWAL — row-locked, balance-checked
// ─────────────────────────────────────────────────────────────────────────────
async function withdraw(userId, amount) {
  if (amount <= 0) throw new Error("Amount must be positive.");

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      SELECT * FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE
    `;
    const wallet = rows[0];
    if (!wallet) throw new Error("Wallet not found.");

    const balance  = new Prisma.Decimal(wallet.balance);
    const amt      = new Prisma.Decimal(amount);
    if (balance.lessThan(amt))
      throw new Error(`Insufficient balance. Available: KES ${balance.toFixed(2)}`);

    const updated = await tx.wallet.update({
      where: { userId },
      data: { balance: { decrement: amt }, totalWithdrawn: { increment: amt } },
    });

    const txRecord = await tx.transaction.create({
      data: { userId, type: "WITHDRAWAL", amount: amt, status: "COMPLETED" },
    });

    return { wallet: updated, transaction: txRecord };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 10000 });
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVATE TIER
//   1. Deducts plan.price from buyer's wallet
//   2. Creates Investment record (daily ROI handled by roiWorker)
//   3. If buyer was referred, credits referrer with plan.referralBonus
// ─────────────────────────────────────────────────────────────────────────────
async function activateTier(userId, planId) {
  return prisma.$transaction(async (tx) => {

    // ── 1. Load plan ───────────────────────────────────────────────────────
    const plan = await tx.investmentPlan.findFirst({
      where: {
        OR: [
          { id: planId },
          { name: { equals: planId, mode: "insensitive" } },
        ],
      },
    });
    if (!plan) throw new Error("Investment plan not found.");
    if (!plan.isActive) throw new Error("This plan is currently unavailable.");
    const price = new Prisma.Decimal(plan.price);

    // ── 2. Lock & check buyer's wallet ────────────────────────────────────
    const rows = await tx.$queryRaw`
      SELECT * FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE
    `;
    const buyerWallet = rows[0];
    if (!buyerWallet) throw new Error("Wallet not found.");

    const balance = new Prisma.Decimal(buyerWallet.balance);
    if (balance.lessThan(price))
      throw new Error(`Insufficient balance. You need KES ${price.toFixed(2)} to activate this tier.`);

    // ── 3. Deduct price from buyer ─────────────────────────────────────────
    await tx.wallet.update({
      where: { userId },
      data: { balance: { decrement: price }, totalDeposited: { increment: price } },
    });

    await tx.transaction.create({
      data: { userId, type: "DEPOSIT", amount: price, status: "COMPLETED",
              metadata: { action: "tier_activation", planId, planName: plan.name } },
    });

    // ── 4. Create investment record ────────────────────────────────────────
    const maturityDate = new Date();
    maturityDate.setDate(maturityDate.getDate() + plan.durationDays);

    const investment = await tx.investment.create({
      data: { userId, planId, principal: price, maturityDate, status: "ACTIVE" },
      include: { plan: true },
    });

    // ── 5. Referral bonus ─────────────────────────────────────────────────
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { referredById: true },
    });

    if (user?.referredById) {
      const bonus     = new Prisma.Decimal(plan.referralBonus);
      const referrerId = user.referredById;

      // Check referrer has a wallet
      const refWallet = await tx.wallet.findUnique({ where: { userId: referrerId } });
      if (refWallet) {
        await tx.wallet.update({
          where: { userId: referrerId },
          data: { balance: { increment: bonus }, totalEarned: { increment: bonus } },
        });

        await tx.transaction.create({
          data: {
            userId:   referrerId,
            type:     "REFERRAL_BONUS",
            amount:   bonus,
            status:   "COMPLETED",
            metadata: { refereeId: userId, planId, planName: plan.name, bonusKES: plan.referralBonus },
          },
        });
      }
    }

    return investment;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 });
}

module.exports = { deposit, withdraw, activateTier, commitToInvestmentPlan: activateTier };
