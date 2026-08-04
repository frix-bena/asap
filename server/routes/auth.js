const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const { prisma } = require("../lib/prisma");

const signToken = (userId) =>
  jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });

// POST /api/auth/register
router.post(
  "/register",
  [
    body("phone").notEmpty().withMessage("Phone is required"),
    body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
    body("fullName").trim().notEmpty().withMessage("Full name is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { phone, password, fullName } = req.body;

    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) return res.status(409).json({ error: "Phone number already registered." });

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        phone, fullName, passwordHash,
        wallet: { create: {} },
      },
      select: { id: true, phone: true, fullName: true, createdAt: true },
    });

    res.status(201).json({ token: signToken(user.id), user });
  }
);

// POST /api/auth/login
router.post(
  "/login",
  [body("phone").notEmpty(), body("password").notEmpty()],
  async (req, res) => {
    const { phone, password } = req.body;

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid phone number or password." });
    }

    res.json({
      token: signToken(user.id),
      user: { id: user.id, phone: user.phone, fullName: user.fullName },
    });
  }
);

// GET /api/auth/me
router.get("/me", require("../middleware/auth").authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.sub },
    select: { id: true, phone: true, fullName: true, createdAt: true },
  });
  res.json(user);
});

module.exports = router;
