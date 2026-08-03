const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding investment plans...");
  await prisma.investmentPlan.upsert({ where: { name: "Starter" }, update: {}, create: { name: "Starter", dailyRatePct: 0.015, minAmount: 50, maxAmount: 999, durationDays: 30, description: "Perfect for beginners. 1.5% daily for 30 days." } });
  await prisma.investmentPlan.upsert({ where: { name: "Growth" },  update: {}, create: { name: "Growth",  dailyRatePct: 0.02,  minAmount: 1000, maxAmount: 9999, durationDays: 60, description: "Steady growth. 2% daily for 60 days." } });
  await prisma.investmentPlan.upsert({ where: { name: "Elite" },   update: {}, create: { name: "Elite",   dailyRatePct: 0.025, minAmount: 10000, maxAmount: 100000, durationDays: 90, description: "Maximum returns. 2.5% daily for 90 days." } });
  console.log("✅ Plans seeded.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
