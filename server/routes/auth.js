const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const { prisma } = require("../lib/prisma");

const signToken = (userId) =>
  jwt.sign({ sub: userId }, process.env.JWT_SECRET || "fallback_secret_for_development_only", { expiresIn: "7d" });

// POST /api/auth/register
router.post(
  "/register",
  [
    body("phone").notEmpty().withMessage("Phone number is required"),
    body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
    body("fullName").trim().notEmpty().withMessage("Full name is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { phone, password, fullName } = req.body;

      const existing = await prisma.user.findUnique({ where: { phone } });
      if (existing) return res.status(409).json({ error: "Phone number already registered." });

      const passwordHash = await bcrypt.hash(password, 12);

      const user = await prisma.user.create({
        data: {
          phone,
          fullName,
          passwordHash,
          wallet: { create: {} },
        },
        select: { id: true, phone: true, fullName: true, createdAt: true },
      });

      res.status(201).json({ token: signToken(user.id), user });
    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({ error: "Internal server error." });
    }
  }
);

// POST /api/auth/login
router.post(
  "/login",
  [body("phone").notEmpty(), body("password").notEmpty()],
  async (req, res) => {
    try {
      const { phone, password } = req.body;

      // Database Query Audit
      const user = await prisma.user.findUnique({ where: { phone } });
      
      // Null User Handling
      if (!user) {
        return res.status(401).json({ message: "Invalid phone number or password" });
      }
      
      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        return res.status(401).json({ message: "Invalid phone number or password" });
      }

      res.json({
        token: signToken(user.id),
        user: { id: user.id, phone: user.phone, fullName: user.fullName },
      });
    } catch (error) {
      // Comprehensive Error Logging
      console.error('Login error:', error);
      // Clean Response Payload
      res.status(500).json({ error: "Internal server error." });
    }
  }
);

// GET /api/auth/me
router.get("/me", require("../middleware/auth").authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { id: true, phone: true, fullName: true, createdAt: true },
    });
    res.json(user);
  } catch (error) {
    console.error('Me error:', error);
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;
