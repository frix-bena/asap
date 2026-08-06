require("dotenv").config();
const { Pool }      = require("pg");
const { PrismaPg }  = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

const pool    = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma  = new PrismaClient({ adapter });

// ── KES Investment Tiers ──────────────────────────────────────────────────────
// price       → exact KES a user pays to activate this tier
// dailyReturn → exact KES credited to wallet every 24 h by the ROI worker
// referralBonus → exact KES credited to the referrer when THIS tier is activated
const TIERS = [
  { name: "Starter", price: 250,  dailyReturn: 70,  referralBonus: 50,  durationDays: 30, sortOrder: 1, description: "Perfect entry point — earn KES 70 every day for 30 days." },
  { name: "Basic",   price: 500,  dailyReturn: 140, referralBonus: 100, durationDays: 30, sortOrder: 2, description: "Double your daily returns — KES 140 credited every 24 hours." },
  { name: "Growth",  price: 750,  dailyReturn: 210, referralBonus: 150, durationDays: 30, sortOrder: 3, description: "Accelerate your earnings — KES 210 every day." },
  { name: "Premium", price: 2500, dailyReturn: 700, referralBonus: 500, durationDays: 30, sortOrder: 4, description: "High-performance plan — KES 700 daily returns." },
];

async function main() {
  console.log("🌱  Seeding investment tiers…");

  for (const tier of TIERS) {
    await prisma.investmentPlan.upsert({
      where:  { name: tier.name },
      update: tier,
      create: tier,
    });
    console.log(`  ✅  ${tier.name}  KES ${tier.price} → KES ${tier.dailyReturn}/day  (referral: KES ${tier.referralBonus})`);
  }

  console.log("\n✨  Seed complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
