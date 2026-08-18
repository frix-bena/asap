const { prisma } = require("../lib/prisma");
const { Prisma } = require("@prisma/client");
const { stkPush, normalizePhone, DARAJA } = require("../lib/daraja");

// ─────────────────────────────────────────────────────────────────────────────
// M-PESA STK PUSH DEPOSIT (Lipa Na M-Pesa Online)
// Prompts the user directly on their registered phone for their M-Pesa PIN.
// Shows the Prompt Name ("vault agencies") on the prompt without exposing internal account details.
// ─────────────────────────────────────────────────────────────────────────────
async function initiateMpesaDeposit(userId, amount, customPhone) {
  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new Error("Please provide a valid positive deposit amount.");
  }

  // 1. Fetch user to get registered phone number
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { wallet: true },
  });

  if (!user) throw new Error("User not found.");

  // Use provided custom phone or user's registered phone
  const rawPhone = customPhone || user.phone;
  const targetPhone = normalizePhone(rawPhone);

  if (!targetPhone || targetPhone.length < 12) {
    throw new Error(
      "Invalid phone number. Ensure a valid Kenyan M-Pesa number is registered."
    );
  }

  const appDisplayName = DARAJA.APP_NAME || "vault agencies";
  const tempRef = `MP_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

  // 2. Initiate STK Push via Daraja API
  let stkResponse;
  try {
    stkResponse = await stkPush({
      phone: targetPhone,
      amount: numericAmount,
      accountRef: appDisplayName, // Shows prompt name "vault agencies"
      description: `${appDisplayName} Deposit`,
    });
  } catch (err) {
    console.error("[Deposit] STK Push trigger error:", err.message);
    if (DARAJA.ENV === "sandbox" || process.env.NODE_ENV !== "production" || DARAJA.IS_MOCK) {
      console.warn("[Deposit] Falling back to simulated prompt on error:", err.message);
      stkResponse = {
        MerchantRequestID: `MOCK_REQ_${Date.now()}`,
        CheckoutRequestID: `ws_CO_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
        ResponseCode: "0",
        ResponseDescription: "Success. Request accepted for processing",
        CustomerMessage: `Success. Request accepted for processing. Please check your phone ${targetPhone} to enter M-Pesa PIN.`,
        isMock: true,
        phone: targetPhone,
        amount: numericAmount,
        accountRef: appDisplayName,
      };
    } else {
      throw new Error(err.message || "Failed to trigger M-Pesa STK push prompt.");
    }
  }

  const checkoutRequestId =
    stkResponse.CheckoutRequestID || tempRef;
  const merchantRequestId =
    stkResponse.MerchantRequestID || `MR_${Date.now()}`;

  // 3. Create PENDING Transaction in DB
  const pendingTx = await prisma.transaction.create({
    data: {
      userId,
      type: "DEPOSIT",
      amount: new Prisma.Decimal(numericAmount),
      status: "PENDING",
      reference: checkoutRequestId,
      metadata: {
        checkoutRequestId,
        merchantRequestId,
        phone: targetPhone,
        registeredPhone: user.phone,
        appName: appDisplayName,
        receiverAccount: DARAJA.RECEIVER_ACCOUNT || "vault",
        receiverNumber: DARAJA.RECEIVER_NUMBER || "vault",
        initiatedAt: new Date().toISOString(),
        customerMessage: stkResponse.CustomerMessage,
      },
    },
  });

  // If in Mock / Dev mode without real Safaricom webhook access, simulate automatic callback after 3 seconds
  if (stkResponse.isMock || DARAJA.IS_MOCK || DARAJA.ENV === "sandbox" || process.env.NODE_ENV !== "production") {
    setTimeout(async () => {
      try {
        console.log(`[Daraja MOCK] Simulating user PIN entry and callback for ${checkoutRequestId}...`);
        await handleMpesaCallback({
          Body: {
            stkCallback: {
              MerchantRequestID: merchantRequestId,
              CheckoutRequestID: checkoutRequestId,
              ResultCode: 0,
              ResultDesc: "The service request is processed successfully.",
              CallbackMetadata: {
                Item: [
                  { Name: "Amount", Value: numericAmount },
                  { Name: "MpesaReceiptNumber", Value: "QHX" + Math.random().toString(36).substring(2, 9).toUpperCase() },
                  { Name: "TransactionDate", Value: Number(new Date().toISOString().replace(/\D/g, "").slice(0, 14)) },
                  { Name: "PhoneNumber", Value: Number(targetPhone) },
                ],
              },
            },
          },
        });
        console.log(`[Daraja MOCK] Deposit confirmed for ${checkoutRequestId}`);
      } catch (mockErr) {
        console.error("[Daraja MOCK] Error processing mock callback:", mockErr.message);
      }
    }, 3000);
  }

  return {
    success: true,
    message: `M-Pesa STK push sent to ${targetPhone}. Please check your phone and enter your PIN to confirm payment to ${appDisplayName}.`,
    checkoutRequestId,
    merchantRequestId,
    phone: targetPhone,
    amount: numericAmount,
    appName: appDisplayName,
    customerMessage: stkResponse.CustomerMessage,
    transactionId: pendingTx.id,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCESS DARAJA M-PESA CALLBACK (Webhook)
// Called by Safaricom when the user enters their PIN or cancels the prompt.
// ─────────────────────────────────────────────────────────────────────────────
async function handleMpesaCallback(body) {
  const stkCallback = body?.Body?.stkCallback;
  if (!stkCallback) {
    console.warn("[Daraja Callback] Received empty or invalid callback body:", body);
    return { success: false, error: "Invalid payload" };
  }

  const checkoutRequestId = stkCallback.CheckoutRequestID;
  const merchantRequestId = stkCallback.MerchantRequestID;
  const resultCode = Number(stkCallback.ResultCode);
  const resultDesc = stkCallback.ResultDesc || "";

  console.log(`[Daraja Callback] CheckoutRequestID: ${checkoutRequestId}, ResultCode: ${resultCode} (${resultDesc})`);

  // Find matching pending transaction
  const existingTx = await prisma.transaction.findFirst({
    where: {
      OR: [
        { reference: checkoutRequestId },
        { metadata: { path: ["checkoutRequestId"], equals: checkoutRequestId } },
      ],
    },
    include: { user: { include: { wallet: true } } },
  });

  if (!existingTx) {
    console.warn(`[Daraja Callback] No matching transaction found for CheckoutRequestID: ${checkoutRequestId}`);
    return { success: false, error: "Transaction not found" };
  }

  if (existingTx.status === "COMPLETED") {
    console.log(`[Daraja Callback] Transaction ${existingTx.id} already completed.`);
    return { success: true, alreadyCompleted: true };
  }

  // Handle Failure / Cancellation / Wrong PIN / Timeout
  if (resultCode !== 0) {
    const updatedMetadata = {
      ...(existingTx.metadata || {}),
      resultCode,
      resultDesc,
      failedAt: new Date().toISOString(),
    };

    await prisma.transaction.update({
      where: { id: existingTx.id },
      data: {
        status: "FAILED",
        metadata: updatedMetadata,
      },
    });

    console.log(`[Daraja Callback] Transaction ${existingTx.id} marked as FAILED (${resultDesc})`);
    return { success: false, status: "FAILED", resultDesc };
  }

  // Handle Success: ResultCode === 0
  const items = stkCallback.CallbackMetadata?.Item || [];
  const getValue = (name) => items.find((i) => i.Name === name)?.Value;

  const mpesaReceiptNumber = String(getValue("MpesaReceiptNumber") || `MPX_${Date.now()}`);
  const amountPaid = parseFloat(getValue("Amount") || existingTx.amount.toString());
  const phoneNumber = String(getValue("PhoneNumber") || "");
  const transactionDate = String(getValue("TransactionDate") || "");

  // Atomically update user's wallet and transaction
  return prisma.$transaction(
    async (tx) => {
      // Row-lock user wallet
      await tx.$executeRaw`SELECT id FROM "Wallet" WHERE "userId" = ${existingTx.userId} FOR UPDATE`;

      const decimalAmount = new Prisma.Decimal(amountPaid);

      // Increment wallet balance and total deposited
      const updatedWallet = await tx.wallet.update({
        where: { userId: existingTx.userId },
        data: {
          balance: { increment: decimalAmount },
          totalDeposited: { increment: decimalAmount },
        },
      });

      const updatedMetadata = {
        ...(existingTx.metadata || {}),
        mpesaReceipt: mpesaReceiptNumber,
        amountPaid,
        phoneNumber,
        transactionDate,
        resultCode,
        resultDesc,
        completedAt: new Date().toISOString(),
      };

      const updatedTx = await tx.transaction.update({
        where: { id: existingTx.id },
        data: {
          status: "COMPLETED",
          amount: decimalAmount,
          reference: mpesaReceiptNumber,
          metadata: updatedMetadata,
        },
      });

      console.log(
        `✅ [Daraja Callback] Deposit SUCCESS | User: ${existingTx.userId} | +KES ${amountPaid.toFixed(2)} | Receipt: ${mpesaReceiptNumber} | New Balance: KES ${updatedWallet.balance}`
      );

      return {
        success: true,
        status: "COMPLETED",
        wallet: updatedWallet,
        transaction: updatedTx,
        receipt: mpesaReceiptNumber,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GET DEPOSIT STATUS (For Real-Time Frontend Polling)
// ─────────────────────────────────────────────────────────────────────────────
async function getDepositStatus(userId, checkoutRequestId) {
  const tx = await prisma.transaction.findFirst({
    where: {
      userId,
      OR: [
        { reference: checkoutRequestId },
        { metadata: { path: ["checkoutRequestId"], equals: checkoutRequestId } },
      ],
    },
  });

  if (!tx) {
    return { found: false, status: "NOT_FOUND" };
  }

  const wallet = await prisma.wallet.findUnique({
    where: { userId },
  });

  return {
    found: true,
    status: tx.status, // "PENDING" | "COMPLETED" | "FAILED"
    amount: tx.amount,
    reference: tx.reference,
    receipt: tx.metadata?.mpesaReceipt || (tx.status === "COMPLETED" ? tx.reference : null),
    resultDesc: tx.metadata?.resultDesc || null,
    walletBalance: wallet?.balance || 0,
    updatedAt: tx.updatedAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MOCK CONFIRM DEPOSIT (Dev Helper)
// ─────────────────────────────────────────────────────────────────────────────
async function mockConfirmDeposit(checkoutRequestId) {
  return handleMpesaCallback({
    Body: {
      stkCallback: {
        MerchantRequestID: `MOCK_MERCH_${Date.now()}`,
        CheckoutRequestID: checkoutRequestId,
        ResultCode: 0,
        ResultDesc: "The service request is processed successfully.",
        CallbackMetadata: {
          Item: [
            { Name: "Amount", Value: 500 },
            { Name: "MpesaReceiptNumber", Value: "QHX" + Math.random().toString(36).substring(2, 9).toUpperCase() },
            { Name: "TransactionDate", Value: Number(new Date().toISOString().replace(/\D/g, "").slice(0, 14)) },
            { Name: "PhoneNumber", Value: 254741308125 },
          ],
        },
      },
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DIRECT DEPOSIT (Internal Top-up)
// ─────────────────────────────────────────────────────────────────────────────
async function deposit(userId, amount) {
  if (amount <= 0) throw new Error("Amount must be positive.");

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;

    const wallet = await tx.wallet.update({
      where: { userId },
      data: {
        balance: { increment: new Prisma.Decimal(amount) },
        totalDeposited: { increment: new Prisma.Decimal(amount) },
      },
    });

    const txRecord = await tx.transaction.create({
      data: {
        userId,
        type: "DEPOSIT",
        amount: new Prisma.Decimal(amount),
        status: "COMPLETED",
        metadata: { method: "direct_deposit" },
      },
    });

    return { wallet, transaction: txRecord };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// WITHDRAWAL — row-locked, balance-checked
// ─────────────────────────────────────────────────────────────────────────────
async function withdraw(userId, amount) {
  if (amount <= 0) throw new Error("Amount must be positive.");

  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw`
        SELECT * FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE
      `;
      const wallet = rows[0];
      if (!wallet) throw new Error("Wallet not found.");

      const balance = new Prisma.Decimal(wallet.balance);
      const amt = new Prisma.Decimal(amount);
      if (balance.lessThan(amt))
        throw new Error(
          `Insufficient balance. Available: KES ${balance.toFixed(2)}`
        );

      const updated = await tx.wallet.update({
        where: { userId },
        data: {
          balance: { decrement: amt },
          totalWithdrawn: { increment: amt },
        },
      });

      const txRecord = await tx.transaction.create({
        data: {
          userId,
          type: "WITHDRAWAL",
          amount: amt,
          status: "COMPLETED",
        },
      });

      return { wallet: updated, transaction: txRecord };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: 10000,
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVATE TIER
//   1. Deducts plan.price from buyer's wallet
//   2. Creates Investment record (daily ROI handled by roiWorker)
//   3. If buyer was referred, credits referrer with plan.referralBonus
// ─────────────────────────────────────────────────────────────────────────────
async function activateTier(userId, planId) {
  return prisma.$transaction(
    async (tx) => {
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
      if (!plan.isActive)
        throw new Error("This plan is currently unavailable.");
      const price = new Prisma.Decimal(plan.price);

      // ── 2. Lock & check buyer's wallet ────────────────────────────────────
      const rows = await tx.$queryRaw`
        SELECT * FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE
      `;
      const buyerWallet = rows[0];
      if (!buyerWallet) throw new Error("Wallet not found.");

      const balance = new Prisma.Decimal(buyerWallet.balance);
      if (balance.lessThan(price))
        throw new Error(
          `Insufficient balance. You need KES ${price.toFixed(
            2
          )} to activate this tier.`
        );

      // ── 3. Deduct price from buyer ─────────────────────────────────────────
      await tx.wallet.update({
        where: { userId },
        data: {
          balance: { decrement: price },
          totalDeposited: { increment: price },
        },
      });

      await tx.transaction.create({
        data: {
          userId,
          type: "DEPOSIT",
          amount: price,
          status: "COMPLETED",
          metadata: {
            action: "tier_activation",
            planId,
            planName: plan.name,
          },
        },
      });

      // ── 4. Create investment record ────────────────────────────────────────
      const maturityDate = new Date();
      maturityDate.setDate(maturityDate.getDate() + plan.durationDays);

      const investment = await tx.investment.create({
        data: {
          userId,
          planId,
          principal: price,
          maturityDate,
          status: "ACTIVE",
        },
        include: { plan: true },
      });

      // ── 5. Referral bonus ─────────────────────────────────────────────────
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { referredById: true },
      });

      if (user?.referredById) {
        const bonus = new Prisma.Decimal(plan.referralBonus);
        const referrerId = user.referredById;

        const refWallet = await tx.wallet.findUnique({
          where: { userId: referrerId },
        });
        if (refWallet) {
          await tx.wallet.update({
            where: { userId: referrerId },
            data: {
              balance: { increment: bonus },
              totalEarned: { increment: bonus },
            },
          });

          await tx.transaction.create({
            data: {
              userId: referrerId,
              type: "REFERRAL_BONUS",
              amount: bonus,
              status: "COMPLETED",
              metadata: {
                refereeId: userId,
                planId,
                planName: plan.name,
                bonusKES: plan.referralBonus,
              },
            },
          });
        }
      }

      return investment;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: 15000,
    }
  );
}

module.exports = {
  initiateMpesaDeposit,
  handleMpesaCallback,
  getDepositStatus,
  mockConfirmDeposit,
  deposit,
  withdraw,
  activateTier,
  commitToInvestmentPlan: activateTier,
};
