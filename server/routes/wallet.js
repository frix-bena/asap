const router = require("express").Router();
const { authenticate } = require("../middleware/auth");
const { deposit, withdraw } = require("../services/walletService");
const { prisma } = require("../lib/prisma");

router.use(authenticate);

// GET /api/wallet
router.get("/", async (req, res) => {
  const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.sub } });
  if (!wallet) return res.status(404).json({ error: "Wallet not found." });
  res.json(wallet);
});

// POST /api/wallet/deposit
router.post("/deposit", async (req, res) => {
  const amount = parseFloat(req.body.amount);
  if (isNaN(amount) || amount <= 0)
    return res.status(400).json({ error: "Provide a valid positive amount." });

  try {
    const result = await deposit(req.user.sub, amount);
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
