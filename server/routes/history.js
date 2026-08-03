const router = require("express").Router();
const { authenticate } = require("../middleware/auth");
const { prisma } = require("../lib/prisma");

router.use(authenticate);

// GET /api/history?page=1&limit=20&type=ROI_PAYOUT
router.get("/", async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const type  = req.query.type;

  const where = { userId: req.user.sub, ...(type ? { type } : {}) };

  const [transactions, total] = await prisma.$transaction([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.transaction.count({ where }),
  ]);

  res.json({
    data: transactions,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

module.exports = router;
