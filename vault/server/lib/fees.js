/**
 * Tiered withdrawal fee calculator
 *
 * | Withdraw Amount (KES) | Fee        | Min payout |
 * |------------------------|------------|------------|
 * | 50 – 99                | Flat 10    | 40         |
 * | 100 – 499              | 15%        | 85         |
 * | 500 – 999              | 12%        | 440        |
 * | 1 000 – 4 999          | 10%        | 900        |
 * | 5 000+                 | 7%         | 4 650      |
 */

const WITHDRAWAL_MIN = 50;

const FEE_BRACKETS = [
  { min: 50,   max: 99,   flatFee: 10,   pctFee: null },
  { min: 100,  max: 499,  flatFee: null, pctFee: 0.15 },
  { min: 500,  max: 999,  flatFee: null, pctFee: 0.12 },
  { min: 1000, max: 4999, flatFee: null, pctFee: 0.10 },
  { min: 5000, max: Infinity, flatFee: null, pctFee: 0.07 },
];

/**
 * @param {number} amount – gross withdrawal amount in KES
 * @returns {{ gross: number, fee: number, net: number }}
 */
function calculateWithdrawalFee(amount) {
  if (amount < WITHDRAWAL_MIN) {
    throw new Error(`Minimum withdrawal is KES ${WITHDRAWAL_MIN}.`);
  }

  const bracket = FEE_BRACKETS.find(b => amount >= b.min && amount <= b.max);
  if (!bracket) throw new Error("No fee bracket found for this amount.");

  const fee = bracket.flatFee !== null
    ? bracket.flatFee
    : Math.round(amount * bracket.pctFee * 100) / 100;

  const net = Math.round((amount - fee) * 100) / 100;
  return { gross: amount, fee, net };
}

module.exports = { calculateWithdrawalFee, WITHDRAWAL_MIN };
