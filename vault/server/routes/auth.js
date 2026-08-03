const router   = require("express").Router();
const bcrypt   = require("bcryptjs");
const jwt      = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const { prisma } = require("../lib/prisma");
const { SIGNUP_BONUS_KES } = require("../config/tiers");

const sign = (userId) => jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: "14d" });

// ── POST /api/auth/register ────────────────────────────────────────────
router.post(
  "/register",
  [
    body("phone").isMobilePhone("en-KE").withMessage("Enter a valid Kenyan phone number"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
    body("fullName").trim().notEmpty().withMessage("Full name is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { phone, password, fullName, referralCode } = req.body;

    // Normalize phone
    const normalizedPhone = phone.replace(/^0/, "254").replace(/\D/g, "");

    const existing = await prisma.user.findUnique({ where: { phone: normalizedPhone } });
    if (existing) return res.status(409).json({ error: "Phone number already registered." });

    const passwordHash = await bcrypt.hash(password, 12);

    // Create user + wallet + sign-up bonus in one transaction
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          phone: normalizedPhone,
          passwordHash,
          fullName,
          wallet: { create: { withdrawable: SIGNUP_BONUS_KES, totalEarned: SIGNUP_BONUS_KES } },
        },
      });

      // Log bonus transaction
      await tx.transaction.create({
        data: {
          userId:      u.id,
          type:        "SIGNUP_BONUS",
          amount:      SIGNUP_BONUS_KES,
          netAmount:   SIGNUP_BONUS_KES,
          status:      "COMPLETED",
          description: "Welcome bonus",
        },
      });

      // Handle referral linking (mark, do NOT pay yet — pay on first deposit)
      if (referralCode) {
        const referrer = await tx.user.findUnique({ where: { referralCode } });
        if (referrer && referrer.id !== u.id) {
          await tx.referral.create({
            data: { referrerId: referrer.id, refereeId: u.id, paid: false },
          });
        }
      }

      return u;
    });

    res.status(201).json({
      token: sign(user.id),
      user:  { id: user.id, fullName: user.fullName, phone: user.phone, referralCode: user.referralCode },
    });
  }
);

// ── POST /api/auth/login ───────────────────────────────────────────────
router.post(
  "/login",
  [body("phone").notEmpty(), body("password").notEmpty()],
  async (req, res) => {
    const normalizedPhone = req.body.phone.replace(/^0/, "254").replace(/\D/g, "");
    const user = await prisma.user.findUnique({ where: { phone: normalizedPhone } });
    if (!user || !(await bcrypt.compare(req.body.password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid phone or password." });
    }
    res.json({
      token: sign(user.id),
      user:  { id: user.id, fullName: user.fullName, phone: user.phone, referralCode: user.referralCode },
    });
  }
);

// ── GET /api/auth/me ──────────────────────────────────────────────────
router.get("/me", require("../middleware/auth").authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where:  { id: req.user.sub },
    select: { id: true, fullName: true, phone: true, referralCode: true, createdAt: true,
              wallet: true },
  });
  res.json(user);
});

module.exports = router;
