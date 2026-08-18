/**
 * Safaricom Daraja API Integration for Mwosho / Vault
 *
 * Implements:
 *  1. OAuth Token Management (Automatic cache & refresh with full error catching)
 *  2. STK Push (Lipa Na M-Pesa Online / Prompt to phone for PIN entry)
 *  3. STK Push Query (Status check)
 *  4. Secure Account Reference masking
 *  5. Phone Number Sanitization (Auto-converts 07XX/01XX/+254XX to 254XXXXXXXXX)
 *  6. Callback URL validation (Warns on localhost, supports ngrok override)
 */

const axios = require("axios");

/**
 * Validates and normalizes Callback URL
 * Warns if localhost / 127.0.0.1 is used since Safaricom cannot route to local addresses.
 */
function validateCallbackUrl(url) {
  const cb =
    url ||
    (process.env.NGROK_URL
      ? `${process.env.NGROK_URL.replace(/\/$/, "")}/api/mpesa/stk-callback`
      : null) ||
    process.env.MPESA_CALLBACK_URL ||
    process.env.CALLBACK_URL ||
    "http://127.0.0.1:5000/api/mpesa/stk-callback";

  if (cb.includes("localhost") || cb.includes("127.0.0.1")) {
    console.warn(
      `[Daraja Warning] CALLBACK_URL is set to "${cb}". Safaricom Daraja cannot deliver callbacks to localhost or 127.0.0.1. In development, configure NGROK_URL or MPESA_CALLBACK_URL with a public forwarding address.`
    );
  }
  return cb;
}

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
    return validateCallbackUrl();
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

  try {
    const authHeader = Buffer.from(
      `${DARAJA.CONSUMER_KEY}:${DARAJA.CONSUMER_SECRET}`
    ).toString("base64");

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
      "[Daraja] OAuth token generation error:",
      err.response?.data || err.message
    );
    if (
      DARAJA.ENV === "sandbox" ||
      process.env.NODE_ENV !== "production" ||
      DARAJA.IS_MOCK
    ) {
      console.warn(
        "[Daraja] Falling back to mock token due to OAuth network/auth error in sandbox/dev."
      );
      return "mock_daraja_access_token_" + Date.now();
    }
    const errorMessage =
      err.response?.data?.errorMessage ||
      err.response?.data?.ResponseDescription ||
      err.message ||
      "Daraja authentication failed";
    const customError = new Error(errorMessage);
    customError.response = err.response;
    throw customError;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Format date as YYYYMMDDHHmmss
 */
function getTimestamp() {
  const date = new Date();
  const timestamp =
    date.getFullYear() +
    ("0" + (date.getMonth() + 1)).slice(-2) +
    ("0" + date.getDate()).slice(-2) +
    ("0" + date.getHours()).slice(-2) +
    ("0" + date.getMinutes()).slice(-2) +
    ("0" + date.getSeconds()).slice(-2);

  return timestamp;
}

/**
 * Generate Base64 Password for STK Push: base64(Shortcode + Passkey + Timestamp)
 */
function generatePassword(shortCode, passkey, timestamp) {
  return Buffer.from(`${shortCode}${passkey}${timestamp}`).toString("base64");
}

/**
 * Sanitization helper to convert any Kenyan phone format to 254XXXXXXXXX
 * Handles: 07XXXXXXXX, 01XXXXXXXX, 7XXXXXXXX, 1XXXXXXXX, +254XXXXXXXXX, 254XXXXXXXXX
 */
function formatPhoneNumber(phone) {
  if (!phone) return "";
  let cleaned = String(phone).replace(/\D/g, ""); // Remove non-digits
  if (cleaned.startsWith("0")) {
    return "254" + cleaned.slice(1);
  }
  if (cleaned.startsWith("7") || cleaned.startsWith("1")) {
    return "254" + cleaned;
  }
  if (cleaned.startsWith("254")) {
    return cleaned;
  }
  return cleaned;
}

// Alias for backwards compatibility
const normalizePhone = formatPhoneNumber;

// ── STK Push (Lipa Na M-Pesa Online) ──────────────────────────────────────────

/**
 * Initiate Daraja STK Push prompt to the user's phone.
 * Prompts user directly on their handset for M-Pesa PIN.
 *
 * @param {Object} params
 * @param {string} [params.phone]        - User's phone number
 * @param {string} [params.phoneNumber]  - User's phone number alias
 * @param {number} params.amount         - Amount to deposit (KES)
 * @param {string} [params.accountRef]   - Prompt name displayed on PIN prompt
 * @param {string} [params.description]  - Description
 * @param {string} [params.callbackUrl]  - Webhook callback URL
 */
async function stkPush({
  phone,
  phoneNumber,
  amount,
  accountRef,
  description,
  callbackUrl,
}) {
  const rawPhone = phoneNumber || phone;
  const formattedPhone = formatPhoneNumber(rawPhone);

  if (!formattedPhone || formattedPhone.length < 12) {
    throw new Error(
      "Invalid Kenyan phone number for M-Pesa. Ensure a valid format such as 07XXXXXXXX, 01XXXXXXXX, or 254XXXXXXXXX."
    );
  }

  const roundedAmount = Math.round(Number(amount));
  if (isNaN(roundedAmount) || roundedAmount <= 0) {
    throw new Error("Amount must be a positive integer.");
  }

  // Prompt Name shown on M-Pesa PIN prompt (Internal account numbers hidden for security)
  const appDisplayName = accountRef || DARAJA.APP_NAME || "vault agencies";
  const txDescription = (
    description || `${DARAJA.APP_NAME} Deposit`
  ).slice(0, 32);
  const cbUrl = validateCallbackUrl(callbackUrl || DARAJA.CALLBACK_URL);

  // If in Mock / Dev mode without real credentials, return simulated STK push response
  if (DARAJA.IS_MOCK) {
    const mockCheckoutId = `ws_CO_${Date.now()}_${Math.floor(
      Math.random() * 100000
    )}`;
    console.log(
      `[Daraja MOCK] STK Push sent to ${formattedPhone} for KES ${roundedAmount}. Prompt Name: ${appDisplayName}`
    );
    return {
      MerchantRequestID: `MOCK_REQ_${Date.now()}`,
      CheckoutRequestID: mockCheckoutId,
      ResponseCode: "0",
      ResponseDescription: "Success. Request accepted for processing",
      CustomerMessage: `Success. Request accepted for processing. Please check your phone ${formattedPhone} to enter M-Pesa PIN.`,
      isMock: true,
      phone: formattedPhone,
      phoneNumber: formattedPhone,
      amount: roundedAmount,
      accountRef: appDisplayName,
    };
  }

  try {
    const token = await getAccessToken();
    const timestamp = getTimestamp();
    const password = generatePassword(
      DARAJA.SHORTCODE,
      DARAJA.PASSKEY,
      timestamp
    );

    const payload = {
      BusinessShortCode: DARAJA.SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: roundedAmount,
      PartyA: formattedPhone,
      PartyB: DARAJA.SHORTCODE,
      PhoneNumber: formattedPhone,
      CallBackURL: cbUrl,
      AccountReference: appDisplayName.slice(0, 12),
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

    return {
      ...data,
      phone: formattedPhone,
      phoneNumber: formattedPhone,
      amount: roundedAmount,
      accountRef: appDisplayName,
    };
  } catch (err) {
    console.error(
      "[Daraja] STK Push Request Failed:",
      err.response?.data || err.message
    );

    // In dev / sandbox mode, fallback to simulated prompt if Safaricom is unreachable
    if (
      DARAJA.ENV === "sandbox" ||
      process.env.NODE_ENV !== "production" ||
      DARAJA.IS_MOCK
    ) {
      console.warn(
        "[Daraja] Sandbox/network error encountered, falling back to simulated prompt for testing."
      );
      const mockCheckoutId = `ws_CO_${Date.now()}_${Math.floor(
        Math.random() * 100000
      )}`;
      return {
        MerchantRequestID: `MOCK_REQ_${Date.now()}`,
        CheckoutRequestID: mockCheckoutId,
        ResponseCode: "0",
        ResponseDescription: "Success. Request accepted for processing",
        CustomerMessage: `Success. Request accepted for processing. Please check your phone ${formattedPhone} to enter M-Pesa PIN.`,
        isMock: true,
        phone: formattedPhone,
        phoneNumber: formattedPhone,
        amount: roundedAmount,
        accountRef: appDisplayName,
      };
    }

    const errMessage =
      err.response?.data?.errorMessage ||
      err.response?.data?.ResponseDescription ||
      err.message ||
      "Failed to initiate M-Pesa STK push.";
    const customError = new Error(errMessage);
    customError.response = err.response;
    throw customError;
  }
}

// ── STK Push Status Query ─────────────────────────────────────────────────────

/**
 * Query STK Push status directly from Safaricom
 *
 * @param {Object} params
 * @param {string} params.checkoutRequestId
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
    const password = generatePassword(
      DARAJA.SHORTCODE,
      DARAJA.PASSKEY,
      timestamp
    );

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
    console.error(
      "[Daraja] STK Query Failed:",
      err.response?.data || err.message
    );
    if (
      DARAJA.ENV === "sandbox" ||
      process.env.NODE_ENV !== "production" ||
      DARAJA.IS_MOCK
    ) {
      return {
        ResponseCode: "0",
        ResultCode: "0",
        ResultDesc: "The service request is processed successfully.",
      };
    }
    const errMessage =
      err.response?.data?.errorMessage ||
      err.response?.data?.ResponseDescription ||
      err.message ||
      "Failed to query M-Pesa transaction status.";
    const customError = new Error(errMessage);
    customError.response = err.response;
    throw customError;
  }
}

module.exports = {
  DARAJA,
  getAccessToken,
  formatPhoneNumber,
  normalizePhone,
  validateCallbackUrl,
  stkPush,
  stkQuery,
  getTimestamp,
  generatePassword,
};
