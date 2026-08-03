const { prisma } = require("../lib/prisma");
const { Prisma } = require("@prisma/client");

/**
 * DEPOSIT — atomic, row-locked
 */
async function deposit(userId, amount) {
  if (amount <= 0) throw new Error("Amount must be positive.");

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM wallets WHERE user_id = ${userId}::text FOR UPDATE`;

    const updated = await tx.wallet.update({
      where: { userId },
      data: {
        balance:        { increment: new Prisma.Decimal(amount) },
        totalDeposited: { increment: new Prisma.Decimal(amount) },
      },
    });

    const txRecord = await tx.transaction.create({
      data: {
        userId,
        type:   "DEPOSIT",
        amount: new Prisma.Decimal(amount),
        status: "COMPLETED",
      },
    });

    return { wallet: updated, transaction: txRecord };
  });
}

/**
 * WITHDRAWAL — atomic, balance-checked, row-locked
 */
async function withdraw(userId, amount) {
  if (amount <= 0) throw new Error("Amount must be positive.");

  return prisma.$transaction(async (tx) => {
    const [wallet] = await tx.$queryRaw`
      SELECT * FROM wallets WHERE user_id = ${userId}::text FOR UPDATE
    `;
    if (!wallet) throw new Error("Wallet not found.");

    const current  = new Prisma.Decimal(wallet.balance);
    const withdraw = new Prisma.Decimal(amount);
    if (current.lessThan(withdraw)) {
      throw new Error(`Insufficient balance. Available: $${current.toFixed(2)}`);
    }

    const updated = await tx.wallet.update({
      where: { userId },
      data: {
        balance:        { decrement: withdraw },
        totalWithdrawn: { increment: withdraw },
      },
    });

    const txRecord = await tx.transaction.create({
      data: { userId, type: "WITHDRAWAL", amount: withdraw, status: "COMPLETED" },
    });

    return { wallet: updated, transaction: txRecord };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 10000 });
}

/**
 * COMMIT TO PLAN — debits wallet, creates investment
 */
async function commitToInvestmentPlan(userId, planId, amount) {
  return prisma.$transaction(async (tx) => {
    const [wallet] = await tx.$queryRaw`
      SELECT * FROM wallets WHERE user_id = ${userId}::text FOR UPDATE
    `;
    if (!wallet) throw new Error("Wallet not found.");

    const plan = await tx.investmentPlan.findUniqueOrThrow({ where: { id: planId } });
    const investAmount = new Prisma.Decimal(amount);
    const balance      = new Prisma.Decimal(wallet.balance);

    if (balance.lessThan(investAmount)) throw new Error("Insufficient balance to commit.");
    if (investAmount.lessThan(plan.minAmount)) throw new Error(`Minimum investment is $${plan.minAmount}`);
    if (investAmount.greaterThan(plan.maxAmount)) throw new Error(`Maximum investment is $${plan.maxAmount}`);

    await tx.wallet.update({
      where: { userId },
      data: { balance: { decrement: investAmount } },
    });

    const maturityDate = new Date();
    maturityDate.setDate(maturityDate.getDate() + plan.durationDays);

    return tx.investment.create({
      data: { userId, planId, principal: investAmount, maturityDate, status: "ACTIVE" },
      include: { plan: true },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

module.exports = { deposit, withdraw, commitToInvestmentPlan };
