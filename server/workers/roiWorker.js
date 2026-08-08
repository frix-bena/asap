const cron = require("node-cron");
const { prisma } = require("../lib/prisma");
const { Prisma } = require("@prisma/client");

async function processRoiForInvestment(investment) {
  const { id, userId, principal, plan, maturityDate } = investment;

  // Mark as matured if past end date
  if (new Date() > new Date(maturityDate)) {
    await prisma.investment.update({ where: { id }, data: { status: "MATURED" } });
    console.log(`📋 Investment ${id} marked MATURED.`);
    return;
  }

  const roiAmount = new Prisma.Decimal(plan.dailyReturn);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;

      await tx.wallet.update({
        where: { userId },
        data: {
          balance:     { increment: roiAmount },
          totalEarned: { increment: roiAmount },
        },
      });

      await tx.investment.update({
        where: { id },
        data: { earnedToDate: { increment: roiAmount }, lastRoiDate: new Date() },
      });

      await tx.transaction.create({
        data: {
          userId,
          type: "ROI_PAYOUT",
          amount: roiAmount,
          status: "COMPLETED",
          investmentId: id,
          metadata: { dailyReturn: plan.dailyReturn.toString(), principal: principal.toString() },
        },
      });
    });

    console.log(`✅ ROI | User: ${userId} | +$${roiAmount.toFixed(4)}`);
  } catch (err) {
    console.error(`❌ ROI failed for investment ${id}:`, err.message);
  }
}

async function runDailyRoi() {
  console.log(`\n🕐 [ROI Engine] Started at ${new Date().toISOString()}`);

  const yesterday = new Date(Date.now() - 23 * 60 * 60 * 1000);
  const activeInvestments = await prisma.investment.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ lastRoiDate: null }, { lastRoiDate: { lt: yesterday } }],
    },
    include: { plan: true },
  });

  console.log(`📊 Processing ${activeInvestments.length} active investments...`);

  const BATCH_SIZE = 10;
  for (let i = 0; i < activeInvestments.length; i += BATCH_SIZE) {
    const batch = activeInvestments.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(batch.map(processRoiForInvestment));
  }

  console.log("✅ [ROI Engine] Daily run complete.\n");
}

// Every day at 00:05 UTC
cron.schedule("5 0 * * *", runDailyRoi, { timezone: "UTC" });

// Expose for manual trigger (e.g., GET /admin/trigger-roi)
module.exports = { runDailyRoi };
