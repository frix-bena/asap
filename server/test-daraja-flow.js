require("dotenv").config();
const { prisma } = require("./lib/prisma");
const {
  initiateMpesaDeposit,
  handleMpesaCallback,
  getDepositStatus,
} = require("./services/walletService");

async function runTests() {
  console.log("🚀 [Test Suite] Starting Daraja M-Pesa Integration Tests...\n");

  // 1. Find or create test user
  let user = await prisma.user.findUnique({
    where: { phone: "254741308125" },
    include: { wallet: true },
  });

  if (!user) {
    console.log("Creating user for test...");
    user = await prisma.user.create({
      data: {
        phone: "254741308125",
        fullName: "Bernard Wachira",
        passwordHash: "test_hash",
        wallet: { create: { balance: 0 } },
      },
      include: { wallet: true },
    });
  }

  console.log(`👤 User: ${user.fullName} (${user.phone}) | Initial Balance: KES ${user.wallet?.balance || 0}`);
  const initialBalance = Number(user.wallet?.balance || 0);

  // 2. Initiate STK Push deposit
  const depositAmount = 300;
  console.log(`\n📲 Step 1: Initiating STK Push deposit of KES ${depositAmount}...`);
  const stkRes = await initiateMpesaDeposit(user.id, depositAmount, user.phone);
  console.log("  ✅ STK Push Result:", stkRes);

  if (!stkRes.checkoutRequestId) {
    throw new Error("STK Push failed: Missing checkoutRequestId");
  }

  // 3. Verify transaction created as PENDING in DB
  const pendingTx = await prisma.transaction.findFirst({
    where: { reference: stkRes.checkoutRequestId },
  });
  console.log(`\n🔍 Step 2: Checking DB for Pending Transaction...`);
  console.log(`  ✅ Found Tx ID: ${pendingTx?.id}, Status: ${pendingTx?.status}, Amount: KES ${pendingTx?.amount}`);

  if (pendingTx?.status !== "PENDING") {
    throw new Error(`Expected PENDING status, got ${pendingTx?.status}`);
  }

  // 4. Check status endpoint before callback
  const statusBefore = await getDepositStatus(user.id, stkRes.checkoutRequestId);
  console.log(`\n⏳ Step 3: Status Query Before Confirmation:`, statusBefore);

  // 5. Simulate Safaricom Callback (Lipa Na M-Pesa Online Confirmation)
  console.log(`\n🌐 Step 4: Simulating Safaricom Callback (Webhook)...`);
  const mockReceipt = "QHX" + Math.random().toString(36).substring(2, 9).toUpperCase();
  const callbackPayload = {
    Body: {
      stkCallback: {
        MerchantRequestID: stkRes.merchantRequestId || `MR_${Date.now()}`,
        CheckoutRequestID: stkRes.checkoutRequestId,
        ResultCode: 0,
        ResultDesc: "The service request is processed successfully.",
        CallbackMetadata: {
          Item: [
            { Name: "Amount", Value: depositAmount },
            { Name: "MpesaReceiptNumber", Value: mockReceipt },
            { Name: "TransactionDate", Value: 20260808145500 },
            { Name: "PhoneNumber", Value: 254741308125 },
          ],
        },
      },
    },
  };

  const callbackRes = await handleMpesaCallback(callbackPayload);
  console.log("  ✅ Callback Process Result:", callbackRes);

  // 6. Verify User Wallet Balance Updated in DB
  const updatedWallet = await prisma.wallet.findUnique({
    where: { userId: user.id },
  });
  console.log(`\n💰 Step 5: Checking Updated Wallet Balance in DB...`);
  console.log(`  Old Balance: KES ${initialBalance} | New Balance: KES ${updatedWallet.balance}`);

  const expectedBalance = initialBalance + depositAmount;
  if (Number(updatedWallet.balance) !== expectedBalance) {
    throw new Error(`Balance mismatch! Expected KES ${expectedBalance}, got KES ${updatedWallet.balance}`);
  }

  // 7. Check status endpoint after callback
  const statusAfter = await getDepositStatus(user.id, stkRes.checkoutRequestId);
  console.log(`\n✨ Step 6: Status Query After Confirmation:`, statusAfter);

  if (statusAfter.status !== "COMPLETED" || statusAfter.receipt !== mockReceipt) {
    throw new Error(`Status query failed: Expected COMPLETED with receipt ${mockReceipt}`);
  }

  console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY! M-Pesa Daraja STK Push & Balance Reflection working 100%!");
  await prisma.$disconnect();
}

runTests().catch(err => {
  console.error("❌ Test Failed:", err);
  process.exit(1);
});
