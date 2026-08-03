// Investment tier configuration
// depositAmt  → how much user pays (KES)
// dailyClaim  → what they earn per 24h cycle (KES)
// referralBonus → what the referrer earns each time they invite someone (based on referrer's own tier)

const INVESTMENT_TIERS = [
  { name: "Tier 1", depositAmt: 250,   dailyClaim: 70,   referralBonus: 50,   sortOrder: 1 },
  { name: "Tier 2", depositAmt: 500,   dailyClaim: 140,  referralBonus: 100,  sortOrder: 2 },
  { name: "Tier 3", depositAmt: 750,   dailyClaim: 210,  referralBonus: 150,  sortOrder: 3 },
  { name: "Tier 4", depositAmt: 2500,  dailyClaim: 700,  referralBonus: 500,  sortOrder: 4 },
  { name: "Tier 5", depositAmt: 5000,  dailyClaim: 1400, referralBonus: 1000, sortOrder: 5 },
];

const CLAIM_WINDOW_HOURS = 24;
const SIGNUP_BONUS_KES   = 50;

module.exports = { INVESTMENT_TIERS, CLAIM_WINDOW_HOURS, SIGNUP_BONUS_KES };
