/**
 * M-Pesa Daraja Routes for Mwosho
 *
 * Endpoints:
 *  POST /api/mpesa/stk-push         - Prompt user directly on their registered phone for M-Pesa PIN
 *  POST /api/mpesa/stk-callback     - Safaricom Daraja STK Push webhook callback
 *  POST /api/mpesa/callback         - Alias for Daraja callback
 *  GET  /api/mpesa/status/:id       - Poll transaction status and balance update
 *  POST /api/mpesa/mock-confirm/:id - (Dev only) Simulate instant M-Pesa confirmation
 */

const router = require("express").Router();
const { authenticate } = require("../middleware/auth");
const { formatPhoneNumber } = require("../lib/daraja");
const {
  initiateMpesaDeposit,
  handleMpesaCallback,
  getDepositStatus,
  mockConfirmDeposit,
} = require("../services/walletService");

// ── POST /api/mpesa/stk-push ──────────────────────────────────────────────────
// Initiates Daraja STK Push prompt to user's phone for PIN entry
// Body: { amount: number, phone?: string, phoneNumber?: string }
router.post("/stk-push", authenticate, async (req, res) => {
  const { amount, phone, phoneNumber } = req.body;
  const rawPhone = phoneNumber || phone;

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Please enter a valid deposit amount (e.g. KES 100).",
    });
  }

  try {
    const formattedPhone = rawPhone ? formatPhoneNumber(rawPhone) : undefined;
    const result = await initiateMpesaDeposit(req.user.sub, parsedAmount, formattedPhone);
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error(
      "[Route /api/mpesa/stk-push] STK Push Error:",
      err.response?.data || err.message
    );
    return res.status(400).json({
      success: false,
      message:
        err.response?.data?.errorMessage ||
        err.response?.data?.ResponseDescription ||
        err.message ||
        "Failed to initiate M-Pesa STK push.",
    });
  }
});

// ── POST /api/mpesa/stk-callback & /api/mpesa/callback ────────────────────────
// Safaricom Daraja webhook. Publicly accessible by Safaricom servers.
async function processCallback(req, res) {
  // Always return 200 OK immediately with accepted response
  res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });

  try {
    await handleMpesaCallback(req.body);
  } catch (err) {
    console.error("[Daraja Callback Processing Error]:", err.message);
  }
}

router.post("/stk-callback", processCallback);
router.post("/callback", processCallback);

// ── GET /api/mpesa/status/:checkoutRequestId ──────────────────────────────────
// Allows the frontend to check real-time status as the user enters their PIN
router.get("/status/:checkoutRequestId", authenticate, async (req, res) => {
  const { checkoutRequestId } = req.params;
  try {
    const status = await getDepositStatus(req.user.sub, checkoutRequestId);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/mpesa/mock-confirm/:checkoutRequestId ───────────────────────────
// Dev helper to manually simulate user PIN confirmation
router.post("/mock-confirm/:checkoutRequestId", async (req, res) => {
  const { checkoutRequestId } = req.params;
  try {
    const result = await mockConfirmDeposit(checkoutRequestId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
