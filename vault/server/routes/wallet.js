/**
 * Wallet & Withdrawal Routes
 *  GET  /api/wallet              – get wallet + recent transactions
 *  POST /api/wallet/withdraw     – initiate B2C withdrawal
 *  GET  /api/wallet/transactions – paginated transaction history
 *  GET  /api/wallet/referrals    – referral stats
 */

const router = require("express").Router();
const { authenticate } = require("../middleware/auth");
const { prisma }  = require("../lib/prisma");
const { b2cPayment } = require("../lib/daraja");
const { calculateWithdrawalFee, WITHDRAWAL_MIN } = require("../lib/fees");

router.use(authenticate);

// ── GET /api/wallet ───────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.sub } });
  res.json(wallet);
});

// ── POST /api/wallet/withdraw ─────────────────────────────────────────
router.post("/withdraw", async (req, res) => {
  const amount = parseFloat(req.body.amount);
  if (isNaN(amount) || amount < WITHDRAWAL_MIN) {
    return res.status(400).json({ error: `Minimum withdrawal is KES ${WITHDRAWAL_MIN}.` });
  }

  let feeCalc;
  try { feeCalc = calculateWithdrawalFee(amount); }
  catch (e) { return res.status(400).json({ error: e.message }); }

  const { fee, net } = feeCalc;
  if (net < 1) return res.status(400).json({ error: "Net payout too small after fees." });

  // Lock wallet, check balance, debit
  const txRecord = await prisma.$transaction(async (tx) => {
    const [wallet] = await tx.$queryRaw`
      SELECT * FROM wallets WHERE user_id = ${req.user.sub}::text FOR UPDATE
    `;
    if (!wallet) throw new Error("Wallet not found.");

    const available = parseFloat(wallet.withdrawable);
    if (available < amount) throw new Error(`Insufficient balance. Available: KES ${available.toFixed(2)}`);

    await tx.wallet.update({
      where: { userId: req.user.sub },
      data:  {
        withdrawable:   { decrement: amount },
        totalWithdrawn: { increment: amount },
      },
    });

    return tx.transaction.create({
      data: {
        userId:      req.user.sub,
        type:        "WITHDRAWAL",
        amount,
        fee,
        netAmount:   net,
        status:      "PENDING",
        description: `Withdrawal to M-Pesa`,
        metadata:    { b2cConversationId: null }, // filled after B2C call
      },
    });
  });

  // Fetch user phone
  const user = await prisma.user.findUnique({ where: { id: req.user.sub }, select: { phone: true } });

  // Fire B2C
  let b2cRes;
  try {
    b2cRes = await b2cPayment({
      phone:    user.phone,
      amount:   net,
      occasion: txRecord.id,
      remarks:  "Vault withdrawal",
    });
  } catch (err) {
    // Refund on B2C failure
    await prisma.$transaction([
      prisma.transaction.update({ where: { id: txRecord.id }, data: { status: "FAILED" } }),
      prisma.wallet.update({
        where: { userId: req.user.sub },
        data:  {
          withdrawable:   { increment: amount },
          totalWithdrawn: { decrement: amount },
        },
      }),
    ]);
    console.error("B2C error:", err.response?.data || err.message);
    return res.status(502).json({ error: "M-Pesa payout failed. Your balance has been restored." });
  }

  // Store B2C conversation ID for callback matching
  await prisma.transaction.update({
    where: { id: txRecord.id },
    data:  { metadata: { b2cConversationId: b2cRes.ConversationID } },
  });

  res.json({
    message:    `Sending KES ${net} to your M-Pesa. Fee: KES ${fee}.`,
    gross:      amount,
    fee,
    net,
    reference:  txRecord.reference,
  });
});

// ── GET /api/wallet/transactions ──────────────────────────────────────
router.get("/transactions", async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 15);
  const type  = req.query.type;
  const where = { userId: req.user.sub, ...(type ? { type } : {}) };

  const [data, total] = await prisma.$transaction([
    prisma.transaction.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page-1)*limit, take: limit }),
    prisma.transaction.count({ where }),
  ]);

  res.json({ data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// ── GET /api/wallet/referrals ─────────────────────────────────────────
router.get("/referrals", async (req, res) => {
  const referrals = await prisma.referral.findMany({
    where:   { referrerId: req.user.sub },
    include: { referee: { select: { fullName: true, phone: true, createdAt: true } } },
    orderBy: { createdAt: "desc" },
  });
  const totalEarned = referrals.reduce((s, r) => s + parseFloat(r.bonusAmount || 0), 0);
  res.json({ referrals, totalEarned, count: referrals.length });
});

module.exports = router;
