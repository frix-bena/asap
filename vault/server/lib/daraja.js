/**
 * Safaricom Daraja API Integration — Vault
 *
 * Implements:
 *  1. OAuth token management (auto-refresh)
 *  2. STK Push  (Lipa Na M-Pesa Online / C2B)
 *  3. B2C Payment (withdraw funds to user's phone)
 */

const axios = require("axios");

// ─── Daraja Config (set these in .env) ────────────────────────────────
const DARAJA = {
  BASE_URL:         process.env.MPESA_ENV === "production"
                      ? "https://api.safaricom.co.ke"
                      : "https://sandbox.safaricom.co.ke",
  CONSUMER_KEY:     process.env.MPESA_CONSUMER_KEY,
  CONSUMER_SECRET:  process.env.MPESA_CONSUMER_SECRET,
  // STK Push (Lipa Na M-Pesa)
  SHORTCODE:        process.env.MPESA_SHORTCODE,     // Paybill or Till number
  PASSKEY:          process.env.MPESA_PASSKEY,
  STK_CALLBACK_URL: process.env.MPESA_STK_CALLBACK,  // https://yourdomain.com/api/mpesa/stk-callback
  // B2C
  B2C_INITIATOR:    process.env.MPESA_B2C_INITIATOR,
  B2C_SECURITY_CRED: process.env.MPESA_B2C_SECURITY_CREDENTIAL, // encrypted
  B2C_RESULT_URL:   process.env.MPESA_B2C_RESULT_URL,
  B2C_TIMEOUT_URL:  process.env.MPESA_B2C_TIMEOUT_URL,
};

// ─── Token Cache ───────────────────────────────────────────────────────
let _token    = null;
let _tokenExp = 0;

async function getAccessToken() {
  if (_token && Date.now() < _tokenExp) return _token;

  const creds = Buffer.from(`${DARAJA.CONSUMER_KEY}:${DARAJA.CONSUMER_SECRET}`).toString("base64");
  const { data } = await axios.get(`${DARAJA.BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${creds}` },
  });

  _token    = data.access_token;
  _tokenExp = Date.now() + (parseInt(data.expires_in) - 60) * 1000; // refresh 1 min early
  return _token;
}

// ─── Helpers ───────────────────────────────────────────────────────────
function getTimestamp() {
  return new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14); // YYYYMMDDHHmmss
}

function getPassword(timestamp) {
  const raw = `${DARAJA.SHORTCODE}${DARAJA.PASSKEY}${timestamp}`;
  return Buffer.from(raw).toString("base64");
}

// Normalize phone: 0712345678 → 254712345678
function normalizePhone(phone) {
  const p = String(phone).replace(/\D/g, "");
  if (p.startsWith("0"))   return "254" + p.slice(1);
  if (p.startsWith("254")) return p;
  return p;
}

// ─── STK Push ─────────────────────────────────────────────────────────
/**
 * @param {string} phone  – user's M-Pesa phone (any format)
 * @param {number} amount – KES amount to charge
 * @param {string} accountRef – e.g. userId or investmentId
 * @param {string} description – shown on M-Pesa prompt
 * @returns Safaricom response (includes CheckoutRequestID)
 */
async function stkPush({ phone, amount, accountRef, description }) {
  const token     = await getAccessToken();
  const timestamp = getTimestamp();
  const password  = getPassword(timestamp);

  const { data } = await axios.post(
    `${DARAJA.BASE_URL}/mpesa/stkpush/v1/processrequest`,
    {
      BusinessShortCode: DARAJA.SHORTCODE,
      Password:          password,
      Timestamp:         timestamp,
      TransactionType:   "CustomerPayBillOnline",
      Amount:            Math.ceil(amount),   // M-Pesa requires integers
      PartyA:            normalizePhone(phone),
      PartyB:            DARAJA.SHORTCODE,
      PhoneNumber:       normalizePhone(phone),
      CallBackURL:       DARAJA.STK_CALLBACK_URL,
      AccountReference:  accountRef,
      TransactionDesc:   description || "Vault Investment",
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return data;
}

// ─── B2C Payment ──────────────────────────────────────────────────────
/**
 * Sends funds from the Vault Paybill to a user's phone.
 * @param {string} phone      – recipient's M-Pesa phone
 * @param {number} amount     – net KES to send (after fee deduction)
 * @param {string} occasion   – transaction occasion string
 * @param {string} remarks    – visible to recipient
 * @returns Safaricom response
 */
async function b2cPayment({ phone, amount, occasion, remarks }) {
  const token = await getAccessToken();

  const { data } = await axios.post(
    `${DARAJA.BASE_URL}/mpesa/b2c/v3/paymentrequest`,
    {
      InitiatorName:      DARAJA.B2C_INITIATOR,
      SecurityCredential: DARAJA.B2C_SECURITY_CRED,
      CommandID:          "BusinessPayment",   // Immediate payment, no conditions
      Amount:             Math.floor(amount),  // Safaricom requires integers
      PartyA:             DARAJA.SHORTCODE,
      PartyB:             normalizePhone(phone),
      Remarks:            remarks || "Vault withdrawal",
      QueueTimeOutURL:    DARAJA.B2C_TIMEOUT_URL,
      ResultURL:          DARAJA.B2C_RESULT_URL,
      Occasion:           occasion || "",
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return data;
}

module.exports = { stkPush, b2cPayment, normalizePhone };
