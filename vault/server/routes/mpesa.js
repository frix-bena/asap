/**
 * M-Pesa Routes
 *  POST /api/mpesa/stk-push          – initiate STK Push for a tier deposit
 *  POST /api/mpesa/stk-callback      – Safaricom callback (no auth — IP-whitelist in prod)
 *  POST /api/mpesa/b2c-result        – Safaricom B2C result callback
 *  POST /api/mpesa/b2c-timeout       – Safaricom B2C timeout callback
 */

const router     = require("express").Router();
const { authenticate } = require("../middleware/auth");
const { stkPush, b2cPayment } = require("../lib/daraja");
const { prisma }  = require("../lib/prisma");
const { Prisma }  = require("@prisma/client");
const { CLAIM_WINDOW_HOURS } = require("../config/tiers");

// ── POST /api/mpesa/stk-push ──────────────────────────────────────────
router.post("/stk-push", authenticate, async (req, res) => {
  const { tierId } = req.body;
  if (!tierId) return res.status(400).json({ error: "tierId is required." });

  const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
  const tier = await prisma.investmentTier.findUnique({ where: { id: tierId } });
  if (!tier) return res.status(404).json({ error: "Invalid tier." });

  // Create PENDING investment
  const investment = await prisma.investment.create({
    data: { userId: user.id, tierId: tier.id, status: "PENDING" },
  });

  // Fire STK Push
  let stkResponse;
  try {
    stkResponse = await stkPush({
      phone:       user.phone,
      amount:      parseFloat(tier.depositAmt),
      accountRef:  "Vault",
      description: `Vault ${tier.name} — KES ${tier.depositAmt}`,
    });
  } catch (err) {
    await prisma.investment.update({ where: { id: investment.id }, data: { status: "CANCELLED" } });
    console.error("STK Push error:", err.response?.data || err.message);
    return res.status(502).json({ error: "M-Pesa prompt failed. Please try again." });
  }

  // Store CheckoutRequestID for callback matching
  await prisma.investment.update({
    where: { id: investment.id },
    data:  { mpesaRef: stkResponse.CheckoutRequestID },
  });

  res.json({
    message:            "Check your phone for the M-Pesa prompt.",
    checkoutRequestId:  stkResponse.CheckoutRequestID,
    investmentId:       investment.id,
  });
});

// ── POST /api/mpesa/stk-callback ─────────────────────────────────────
// Safaricom posts here after the user pays or cancels.
router.post("/stk-callback", async (req, res) => {
  // Always respond 200 immediately — Safaricom retries if we don't
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });

  const body  = req.body?.Body?.stkCallback;
  if (!body)  return;

  const checkoutId = body.CheckoutRequestID;
  const resultCode = body.ResultCode;

  // Log raw callback
  await prisma.mpesaCallback.create({
    data: { callbackType: "stkpush", payload: req.body },
  }).catch(console.error);

  if (resultCode !== 0) {
    // Payment cancelled/failed — mark investment cancelled
    await prisma.investment.updateMany({
      where: { mpesaRef: checkoutId, status: "PENDING" },
      data:  { status: "CANCELLED" },
    }).catch(console.error);
    return;
  }

  // Extract metadata from callback items
  const items    = body.CallbackMetadata?.Item || [];
  const getValue = (name) => items.find(i => i.Name === name)?.Value;
  const mpesaReceiptNumber = getValue("MpesaReceiptNumber");
  const amount             = getValue("Amount");

  // Activate the investment + credit referrer (if unpaid) — atomically
  const investment = await prisma.investment.findFirst({
    where:   { mpesaRef: checkoutId, status: "PENDING" },
    include: { tier: true },
  });
  if (!investment) return;

  const now          = new Date();
  const nextClaimAt  = new Date(now.getTime() + CLAIM_WINDOW_HOURS * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    // 1. Activate investment
    await tx.investment.update({
      where: { id: investment.id },
      data: {
        status:      "ACTIVE",
        activatedAt: now,
        nextClaimAt,
      },
    });

    // 2. Log deposit transaction
    await tx.transaction.create({
      data: {
        userId:      investment.userId,
        type:        "DEPOSIT",
        amount:      new Prisma.Decimal(amount),
        netAmount:   new Prisma.Decimal(amount),
        status:      "COMPLETED",
        mpesaRef:    mpesaReceiptNumber,
        description: `${investment.tier.name} deposit`,
      },
    });

    // 3. Pay referral bonus — based on referrer's OWN active tier
    const referral = await tx.referral.findUnique({ where: { refereeId: investment.userId } });
    if (referral && !referral.paid) {
      // Get referrer's highest active investment to determine their tier
      const referrerInvestment = await tx.investment.findFirst({
        where:   { userId: referral.referrerId, status: "ACTIVE" },
        include: { tier: true },
        orderBy: { tier: { depositAmt: "desc" } },
      });

      if (referrerInvestment) {
        const bonus = parseFloat(referrerInvestment.tier.referralBonus);

        // Credit referrer's wallet
        await tx.wallet.update({
          where: { userId: referral.referrerId },
          data:  {
            withdrawable: { increment: bonus },
            totalEarned:  { increment: bonus },
          },
        });

        // Log bonus transaction
        await tx.transaction.create({
          data: {
            userId:      referral.referrerId,
            type:        "REFERRAL_BONUS",
            amount:      bonus,
            netAmount:   bonus,
            status:      "COMPLETED",
            description: `Referral bonus for ${investment.tier.name} deposit`,
          },
        });

        // Mark referral paid
        await tx.referral.update({
          where: { id: referral.id },
          data:  { paid: true, bonusAmount: bonus, paidAt: now },
        });
      }
    }
  });
});

// ── POST /api/mpesa/b2c-result ────────────────────────────────────────
router.post("/b2c-result", async (req, res) => {
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });

  await prisma.mpesaCallback.create({
    data: { callbackType: "b2c_result", payload: req.body },
  }).catch(console.error);

  const result = req.body?.Result;
  if (!result) return;

  const originatorConversationId = result.OriginatorConversationID;
  const resultCode               = result.ResultCode;
  const mpesaReceiptNumber       = result.ResultParameters?.ResultParameter
    ?.find(p => p.Key === "TransactionReceipt")?.Value;

  // Find the pending withdrawal transaction by reference stored in Occasion
  const txRef = result.ResultParameters?.ResultParameter
    ?.find(p => p.Key === "B2CRecipientIsRegisteredCustomer")?.Value
    ? originatorConversationId : null;

  const txRecord = await prisma.transaction.findFirst({
    where: { type: "WITHDRAWAL", status: "PENDING", metadata: { path: ["b2cConversationId"], equals: originatorConversationId } },
  }).catch(() => null);

  if (!txRecord) return;

  if (resultCode === 0) {
    await prisma.transaction.update({
      where: { id: txRecord.id },
      data:  { status: "COMPLETED", mpesaRef: mpesaReceiptNumber },
    });
  } else {
    // Refund the gross amount back to wallet on failure
    await prisma.$transaction([
      prisma.transaction.update({ where: { id: txRecord.id }, data: { status: "FAILED" } }),
      prisma.wallet.update({
        where: { userId: txRecord.userId },
        data:  {
          withdrawable: { increment: txRecord.amount },
          totalWithdrawn: { decrement: txRecord.amount },
        },
      }),
    ]);
  }
});

// ── POST /api/mpesa/b2c-timeout ───────────────────────────────────────
router.post("/b2c-timeout", async (req, res) => {
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  await prisma.mpesaCallback.create({
    data: { callbackType: "b2c_timeout", payload: req.body },
  }).catch(console.error);
  // Operator will manually review timeout transactions
});

module.exports = router;
