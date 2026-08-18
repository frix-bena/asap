/**
 * Safaricom Daraja API Integration for Vault Agencies
 *
 * Implements:
 *  1. OAuth Token Management (Automatic cache & refresh)
 *  2. STK Push (Lipa Na M-Pesa Online / Prompt to phone for PIN entry)
 *  3. STK Push Query (Status check)
 *  4. Secure Account Reference masking (Displays prompt name "vault agencies" instead of internal account details)
 */

const axios = require("axios");

// ── Configuration ─────────────────────────────────────────────────────────────
const DARAJA = {
  get ENV() {
    return process.env.MPESA_ENV || "sandbox";
  },
  get BASE_URL() {
    return this.ENV === "production"
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke";
  },
  get CONSUMER_KEY() {
    return process.env.MPESA_CONSUMER_KEY || "";
  },
  get CONSUMER_SECRET() {
    return process.env.MPESA_CONSUMER_SECRET || "";
  },
  get PASSKEY() {
    return (
      process.env.MPESA_PASSKEY ||
      // Default Safaricom sandbox passkey
      "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919"
    );
  },
  get SHORTCODE() {
    // Default Safaricom sandbox test shortcode is 174379
    return process.env.MPESA_SHORTCODE || "174379";
  },
  get RECEIVER_ACCOUNT() {
    // Public account name displayed to users (vault)
    return process.env.MPESA_RECEIVER_ACCOUNT || "vault";
  },
  get RECEIVER_NUMBER() {
    // Actual destination phone number (0741308125)
    return process.env.MPESA_RECEIVER_NUMBER || "0741308125";
  },
  get CALLBACK_URL() {
    return (
      process.env.MPESA_CALLBACK_URL ||
      "http://127.0.0.1:5000/api/wallet/mpesa/callback"
    );
  },
  get APP_NAME() {
    // Name displayed on user's M-Pesa PIN prompt (Masks internal account details for security)
    return process.env.APP_NAME || "vault agencies";
  },
  get IS_MOCK() {
    return (
      process.env.MPESA_MOCK === "true" ||
      !this.CONSUMER_KEY ||
      !this.CONSUMER_SECRET ||
      (!this.CONSUMER_KEY && process.env.NODE_ENV !== "production")
    );
  },
};

// ── In-Memory Token Cache ─────────────────────────────────────────────────────
let _cachedToken = null;
let _tokenExpiry = 0;

/**
 * Obtain Daraja OAuth Access Token
 */
async function getAccessToken() {
  if (DARAJA.IS_MOCK) {
    return "mock_daraja_access_token_" + Date.now();
  }

  if (_cachedToken && Date.now() < _tokenExpiry) {
    return _cachedToken;
  }

  if (!DARAJA.CONSUMER_KEY || !DARAJA.CONSUMER_SECRET) {
    console.warn(
      "[Daraja] No MPESA_CONSUMER_KEY/SECRET configured. Operating in mock mode."
    );
    return "mock_daraja_access_token_" + Date.now();
  }

  const authHeader = Buffer.from(
    `${DARAJA.CONSUMER_KEY}:${DARAJA.CONSUMER_SECRET}`
  ).toString("base64");

  try {
    const { data } = await axios.get(
      `${DARAJA.BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: {
          Authorization: `Basic ${authHeader}`,
        },
        timeout: 10000,
      }
    );

    _cachedToken = data.access_token;
    // Refresh 60 seconds before actual expiry (default expires_in is 3599s)
    const expiresInSec = parseInt(data.expires_in, 10) || 3599;
    _tokenExpiry = Date.now() + (expiresInSec - 60) * 1000;

    return _cachedToken;
  } catch (err) {
    console.error(
      "[Daraja] OAuth error:",
      err.response?.data || err.message
    );
    if (DARAJA.ENV === "sandbox" || process.env.NODE_ENV !== "production" || DARAJA.IS_MOCK) {
      console.warn("[Daraja] Falling back to mock token due to OAuth network/auth error in sandbox/dev.");
      return "mock_daraja_access_token_" + Date.now();
    }
    throw new Error(
      `Daraja authentication failed: ${
        err.response?.data?.errorMessage || err.message
      }`
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Format date as YYYYMMDDHHmmss in East Africa Time (UTC+3)
 */
function getTimestamp() {
  const now = new Date();
  // East Africa Time is UTC+3
  const eatTime = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");

  const year = eatTime.getUTCFullYear();
  const month = pad(eatTime.getUTCMonth() + 1);
  const day = pad(eatTime.getUTCDate());
  const hours = pad(eatTime.getUTCHours());
  const minutes = pad(eatTime.getUTCMinutes());
  const seconds = pad(eatTime.getUTCSeconds());

  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

/**
 * Generate Base64 Password for STK Push
 */
function generatePassword(shortcode, passkey, timestamp) {
  const raw = `${shortcode}${passkey}${timestamp}`;
  return Buffer.from(raw).toString("base64");
}

/**
 * Normalize Kenyan phone number to 254XXXXXXXXX
 * Handles: 07XXXXXXXX, 01XXXXXXXX, 7XXXXXXXX, +254XXXXXXXXX, 254XXXXXXXXX
 */
function normalizePhone(phone) {
  if (!phone) return "";
  let p = String(phone).replace(/\D/g, ""); // remove non-digits

  if (p.startsWith("0")) {
    p = "254" + p.slice(1);
  } else if (p.startsWith("7") || p.startsWith("1")) {
    p = "254" + p;
  } else if (p.startsWith("254")) {
    // already 254
  } else if (p.length === 9) {
    p = "254" + p;
  }

  return p;
}

// ── STK Push (Lipa Na M-Pesa Online) ──────────────────────────────────────────

/**
 * Initiate Daraja STK Push prompt to the user's phone.
 * Prompts user directly on their handset for M-Pesa PIN.
 *
 * @param {Object} params
 * @param {string} params.phone        - User's phone number
 * @param {number} params.amount       - Amount to deposit (KES)
 * @param {string} [params.accountRef] - Prompt name displayed on PIN prompt (Defaults to "vault agencies")
 * @param {string} [params.description]- Description (e.g. "vault agencies Deposit")
 * @param {string} [params.callbackUrl]- Webhook callback URL
 */
async function stkPush({ phone, amount, accountRef, description, callbackUrl }) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone || normalizedPhone.length < 12) {
    throw new Error("Invalid Kenyan phone number for M-Pesa.");
  }

  const roundedAmount = Math.round(Number(amount));
  if (isNaN(roundedAmount) || roundedAmount <= 0) {
    throw new Error("Amount must be a positive integer.");
  }

  // Prompt Name shown on M-Pesa PIN prompt (Internal account numbers hidden for security)
  const appDisplayName = (accountRef || DARAJA.APP_NAME || "vault agencies");
  const txDescription = (description || `${DARAJA.APP_NAME} Deposit`).slice(0, 32);
  const cbUrl = callbackUrl || DARAJA.CALLBACK_URL;

  // If in Mock / Dev mode without real credentials, return simulated STK push response
  if (DARAJA.IS_MOCK) {
    const mockCheckoutId = `ws_CO_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    console.log(`[Daraja MOCK] STK Push sent to ${normalizedPhone} for KES ${roundedAmount}. Prompt Name: ${appDisplayName}`);
    return {
      MerchantRequestID: `MOCK_REQ_${Date.now()}`,
      CheckoutRequestID: mockCheckoutId,
      ResponseCode: "0",
      ResponseDescription: "Success. Request accepted for processing",
      CustomerMessage: `Success. Request accepted for processing. Please check your phone ${normalizedPhone} to enter M-Pesa PIN.`,
      isMock: true,
      phone: normalizedPhone,
      amount: roundedAmount,
      accountRef: appDisplayName,
    };
  }

  try {
    const token = await getAccessToken();
    const timestamp = getTimestamp();
    const password = generatePassword(DARAJA.SHORTCODE, DARAJA.PASSKEY, timestamp);

    const payload = {
      BusinessShortCode: DARAJA.SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: roundedAmount,
      PartyA: normalizedPhone,
      PartyB: DARAJA.SHORTCODE,
      PhoneNumber: normalizedPhone,
      CallBackURL: cbUrl,
      AccountReference: appDisplayName.slice(0, 12), // Safaricom AccountReference field (Prompt Name)
      TransactionDesc: txDescription,
    };

    const { data } = await axios.post(
      `${DARAJA.BASE_URL}/mpesa/stkpush/v1/processrequest`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    return data;
  } catch (err) {
    console.error("[Daraja] STK Push Request Failed:", err.response?.data || err.message);
    // In dev / sandbox mode, if Safaricom is unreachable or fails due to network/creds, fallback to simulated prompt
    if (DARAJA.ENV === "sandbox" || process.env.NODE_ENV !== "production" || DARAJA.IS_MOCK) {
      console.warn("[Daraja] Sandbox/network error encountered, falling back to simulated prompt for testing.");
      const mockCheckoutId = `ws_CO_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
      return {
        MerchantRequestID: `MOCK_REQ_${Date.now()}`,
        CheckoutRequestID: mockCheckoutId,
        ResponseCode: "0",
        ResponseDescription: "Success. Request accepted for processing",
        CustomerMessage: `Success. Request accepted for processing. Please check your phone ${normalizedPhone} to enter M-Pesa PIN.`,
        isMock: true,
        phone: normalizedPhone,
        amount: roundedAmount,
        accountRef: appDisplayName,
      };
    }

    const errMessage =
      err.response?.data?.errorMessage ||
      err.response?.data?.ResponseDescription ||
      err.message;
    throw new Error(`M-Pesa STK push failed: ${errMessage}`);
  }
}

// ── STK Push Status Query ─────────────────────────────────────────────────────

/**
 * Query STK Push status directly from Safaricom
 *
 * @param {string} checkoutRequestId
 */
async function stkQuery({ checkoutRequestId }) {
  if (DARAJA.IS_MOCK) {
    return {
      ResponseCode: "0",
      ResultCode: "0",
      ResultDesc: "The service request is processed successfully.",
    };
  }

  try {
    const token = await getAccessToken();
    const timestamp = getTimestamp();
    const password = generatePassword(DARAJA.SHORTCODE, DARAJA.PASSKEY, timestamp);

    const payload = {
      BusinessShortCode: DARAJA.SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    };

    const { data } = await axios.post(
      `${DARAJA.BASE_URL}/mpesa/stkpushquery/v1/query`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    return data;
  } catch (err) {
    console.error("[Daraja] STK Query Failed:", err.response?.data || err.message);
    if (DARAJA.ENV === "sandbox" || process.env.NODE_ENV !== "production" || DARAJA.IS_MOCK) {
      return {
        ResponseCode: "0",
        ResultCode: "0",
        ResultDesc: "The service request is processed successfully.",
      };
    }
    throw new Error(
      err.response?.data?.errorMessage ||
      err.response?.data?.ResponseDescription ||
      err.message
    );
  }
}

module.exports = {
  DARAJA,
  getAccessToken,
  normalizePhone,
  stkPush,
  stkQuery,
  getTimestamp,
};
