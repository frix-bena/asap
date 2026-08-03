const { PrismaClient } = require("@prisma/client");
const { INVESTMENT_TIERS } = require("../config/tiers");

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding investment tiers...");
  for (const tier of INVESTMENT_TIERS) {
    await prisma.investmentTier.upsert({
      where:  { name: tier.name },
      update: tier,
      create: tier,
    });
    console.log(`  ✅ ${tier.name}: Deposit KES ${tier.depositAmt} → Earn KES ${tier.dailyClaim}/day`);
  }
  console.log("✅ Seeding complete.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
