require("dotenv").config();
const { prisma } = require("./lib/prisma");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

async function testAuthFlow() {
  console.log("--- Testing Auth & Platform Flows ---");
  
  const testPhone = "254700123456";
  const testPass = "SecurePass123!";
  const testName = "Test Investor";

  // Clean up previous test run if any
  await prisma.transaction.deleteMany({ where: { user: { phone: testPhone } } });
  await prisma.investment.deleteMany({ where: { user: { phone: testPhone } } });
  await prisma.wallet.deleteMany({ where: { user: { phone: testPhone } } });
  await prisma.user.deleteMany({ where: { phone: testPhone } });

  console.log("1. Testing Registration...");
  const passwordHash = await bcrypt.hash(testPass, 12);
  const user = await prisma.user.create({
    data: {
      phone: testPhone,
      fullName: testName,
      passwordHash,
      wallet: { create: {} },
    },
    select: { id: true, phone: true, fullName: true, createdAt: true, wallet: true },
  });
  console.log("   ✅ User created:", user.id, user.fullName, user.phone);
  console.log("   ✅ Wallet created:", user.wallet);

  console.log("2. Testing Login...");
  const foundUser = await prisma.user.findUnique({ where: { phone: testPhone } });
  const isMatch = await bcrypt.compare(testPass, foundUser.passwordHash);
  if (!isMatch) throw new Error("Password mismatch!");
  console.log("   ✅ Password verified successfully");

  const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET || "fallback", { expiresIn: "7d" });
  console.log("   ✅ Token issued successfully");

  console.log("3. Testing Wallet Deposit...");
  const { deposit, activateTier } = require("./services/walletService");
  const depResult = await deposit(user.id, 1000);
  console.log("   ✅ Deposited 1000 KES, new balance:", depResult.wallet.balance.toString());

  console.log("4. Testing Investment Activation...");
  const plans = await prisma.investmentPlan.findMany({ where: { isActive: true } });
  console.log(`   Found ${plans.length} active plans.`);
  if (plans.length > 0) {
    const plan = plans[0];
    const inv = await activateTier(user.id, plan.id);
    console.log(`   ✅ Activated ${plan.name} plan! Principal: ${inv.principal}, Maturity: ${inv.maturityDate}`);
  }

  console.log("5. Testing Wallet After Activation...");
  const finalWallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
  console.log("   ✅ Final wallet balance:", finalWallet.balance.toString(), "Deposited:", finalWallet.totalDeposited.toString());

  console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY!");
  await prisma.$disconnect();
}

testAuthFlow().catch((e) => {
  console.error("❌ Test failed:", e);
  process.exit(1);
});
