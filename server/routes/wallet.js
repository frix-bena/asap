const router = require("express").Router();
const { authenticate } = require("../middleware/auth");
const {
  deposit,
  withdraw,
  initiateMpesaDeposit,
  handleMpesaCallback,
  getDepositStatus,
  mockConfirmDeposit,
} = require("../services/walletService");
const { prisma } = require("../lib/prisma");

// ── Public Webhook for Safaricom Callback ─────────────────────────────────────
// Must be unauthenticated so Safaricom Daraja can post status
router.post("/mpesa/callback", async (req, res) => {
  res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  try {
    await handleMpesaCallback(req.body);
  } catch (err) {
    console.error("[Wallet Callback Error]:", err.message);
  }
});

// ── All other wallet routes require authentication ────────────────────────────
router.use(authenticate);

// GET /api/wallet
router.get("/", async (req, res) => {
  try {
    const wallet = await prisma.wallet.findUnique({
      where: { userId: req.user.sub },
    });
    if (!wallet) return res.status(404).json({ error: "Wallet not found." });
    res.json(wallet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/wallet/deposit
// Body: { amount: number, phone?: string, direct?: boolean }
// If direct === true, executes direct wallet credit; otherwise fires M-Pesa STK Push prompt to user's phone.
router.post("/deposit", async (req, res) => {
  const amount = parseFloat(req.body.amount);
  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: "Provide a valid positive amount." });
  }

  // If user explicitly asks for direct top-up / simulation
  if (req.body.direct === true) {
    try {
      const result = await deposit(req.user.sub, amount);
      return res.json(result);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  // Default: Initiate real Daraja STK Push prompt to the user's phone
  try {
    const result = await initiateMpesaDeposit(req.user.sub, amount, req.body.phone);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/wallet/deposit-status/:checkoutRequestId
// Polled by frontend while waiting for user to enter M-Pesa PIN
router.get("/deposit-status/:checkoutRequestId", async (req, res) => {
  try {
    const status = await getDepositStatus(req.user.sub, req.params.checkoutRequestId);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/wallet/mock-confirm/:checkoutRequestId (Dev testing)
router.post("/mock-confirm/:checkoutRequestId", async (req, res) => {
  try {
    const result = await mockConfirmDeposit(req.params.checkoutRequestId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/wallet/withdraw
router.post("/withdraw", async (req, res) => {
  const amount = parseFloat(req.body.amount);
  if (isNaN(amount) || amount <= 0)
    return res.status(400).json({ error: "Provide a valid positive amount." });

  try {
    const result = await withdraw(req.user.sub, amount);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
