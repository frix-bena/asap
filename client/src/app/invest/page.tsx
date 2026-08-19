"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import api from "@/lib/api";
import {
  Zap,
  TrendingUp,
  Star,
  Gem,
  CheckCircle2,
  Loader2,
  AlertCircle,
  X,
  Smartphone,
  ShieldCheck,
  ArrowDownCircle,
  Wallet,
} from "lucide-react";
import DashboardLayout from "../dashboard/layout";
import DepositModal from "@/components/DepositModal";

// ── Hardcoded KES investment packages ────────────────────────────────────────
const PACKAGES = [
  {
    id: "tier-250",
    name: "Starter",
    price: 250,
    dailyReturn: 70,
    durationDays: 30,
    referralBonus: 50,
    description: "Perfect entry point — earn KES 70 every day for 30 days.",
    icon: Zap,
    gradient: "from-cyan-500 to-teal-600",
    accent: "text-cyan-400",
    glow: "rgba(6,182,212,0.12)",
  },
  {
    id: "tier-500",
    name: "Basic",
    price: 500,
    dailyReturn: 140,
    durationDays: 30,
    referralBonus: 100,
    description: "Double your daily returns — KES 140 credited every 24 hours.",
    icon: TrendingUp,
    gradient: "from-violet-500 to-purple-700",
    accent: "text-violet-400",
    glow: "rgba(139,92,246,0.12)",
  },
  {
    id: "tier-750",
    name: "Growth",
    price: 750,
    dailyReturn: 210,
    durationDays: 30,
    referralBonus: 150,
    description: "Accelerate your earnings — KES 210 every day.",
    icon: Star,
    gradient: "from-amber-400 to-orange-600",
    accent: "text-amber-400",
    glow: "rgba(251,191,36,0.12)",
  },
  {
    id: "tier-2500",
    name: "Premium",
    price: 2500,
    dailyReturn: 700,
    durationDays: 30,
    referralBonus: 500,
    description: "High-performance plan — KES 700 daily returns.",
    icon: Gem,
    gradient: "from-pink-500 to-rose-600",
    accent: "text-pink-400",
    glow: "rgba(236,72,153,0.12)",
  },
];

const kes = (n: number) => `KES ${n.toLocaleString("en-KE")}`;

// ── Investment & M-Pesa STK Push Modal ────────────────────────────────────────
function InvestmentModal({
  pkg,
  walletBalance,
  defaultPhone,
  onClose,
  onActivated,
}: {
  pkg: (typeof PACKAGES)[0];
  walletBalance: number;
  defaultPhone: string;
  onClose: () => void;
  onActivated: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const [paymentMethod, setPaymentMethod] = useState<"mpesa" | "wallet">(
    walletBalance >= pkg.price ? "wallet" : "mpesa"
  );
  const [phone, setPhone] = useState(defaultPhone || "");
  const [step, setStep] = useState<"SELECT" | "WAITING_PIN" | "SUCCESS">("SELECT");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);

  const hasSufficientBalance = walletBalance >= pkg.price;

  // Poll deposit status when in WAITING_PIN state
  useEffect(() => {
    if (step !== "WAITING_PIN" || !checkoutId) return;

    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > 50) {
        clearInterval(interval);
        setError("M-Pesa request timed out. Please check your phone or retry.");
        return;
      }

      try {
        const res = await api.get(`/api/wallet/deposit-status/${checkoutId}`);
        if (res.data?.status === "COMPLETED") {
          clearInterval(interval);
          setReceipt(res.data.receipt || "Confirmed");

          // Automatically activate the tier now that funds are deposited
          try {
            const actRes = await api.post("/api/invest/activate", { planId: pkg.id });
            qc.invalidateQueries({ queryKey: ["wallet"] });
            qc.invalidateQueries({ queryKey: ["active-investments"] });
            qc.invalidateQueries({ queryKey: ["wallet-history"] });
            setStep("SUCCESS");
            onActivated(actRes.data?.message || `${pkg.name} package activated successfully!`);
          } catch (actErr: any) {
            setError(actErr.response?.data?.error || "Deposit confirmed, but tier activation failed.");
          }
        } else if (res.data?.status === "FAILED") {
          clearInterval(interval);
          setError(res.data.resultDesc || "M-Pesa payment was cancelled or failed.");
        }
      } catch (pollErr) {
        console.warn("Status poll error:", pollErr);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [step, checkoutId, pkg, qc, onActivated]);

  // Handle wallet payment
  const handleWalletPay = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post("/api/invest/activate", { planId: pkg.id });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["active-investments"] });
      onActivated(res.data?.message || `${pkg.name} package activated successfully!`);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || "Activation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const [isMockMode, setIsMockMode] = useState(false);
  const [confirmingDev, setConfirmingDev] = useState(false);

  // Handle M-Pesa STK Push direct prompt to phone
  const handleMpesaSTK = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post("/api/wallet/deposit", {
        amount: pkg.price,
        phone: phone || undefined,
      });

      if (res.data?.checkoutRequestId) {
        setCheckoutId(res.data.checkoutRequestId);
        setIsMockMode(Boolean(res.data.isMock));
        setStep("WAITING_PIN");
      } else {
        throw new Error(res.data?.message || "Failed to trigger M-Pesa prompt.");
      }
    } catch (err: any) {
      const errorMsg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        "Failed to trigger M-Pesa prompt. Please check your phone number and try again.";
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleManualDevConfirm = async () => {
    if (!checkoutId) return;
    setConfirmingDev(true);
    try {
      await api.post(`/api/wallet/mock-confirm/${checkoutId}`);
    } catch (err: any) {
      setError(err.response?.data?.error || "Mock confirmation failed.");
    } finally {
      setConfirmingDev(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="glass p-7 w-full max-w-md relative bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>

        {/* Step 1: Selection & Form */}
        {step === "SELECT" && (
          <div>
            <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${pkg.gradient} mb-4`}>
              <pkg.icon size={22} className="text-white" />
            </div>

            <h2 className="text-xl font-bold mb-1">Activate {pkg.name} Package</h2>
            <p className="text-slate-400 text-xs mb-5">
              Pay once and earn {kes(pkg.dailyReturn)} daily for {pkg.durationDays} days.
            </p>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Plan Metrics */}
            <div className="bg-white/5 rounded-xl p-3.5 space-y-2 text-xs mb-5 border border-white/10">
              <Row label="Package Price" value={kes(pkg.price)} bold />
              <Row label="Daily Earnings" value={kes(pkg.dailyReturn)} cls={pkg.accent} />
              <Row label="Duration" value={`${pkg.durationDays} days`} />
              <Row label="Total 30-Day Return" value={kes(pkg.dailyReturn * pkg.durationDays)} cls="text-emerald-400 font-bold" />
              <div className="border-t border-white/8 pt-2">
                <Row label="Referral Bonus" value={kes(pkg.referralBonus)} cls="text-slate-300" />
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-2.5 mb-5">
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider">
                Select Payment Method
              </label>

              {/* Option 1: M-Pesa STK Push */}
              <button
                type="button"
                onClick={() => setPaymentMethod("mpesa")}
                className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                  paymentMethod === "mpesa"
                    ? "border-emerald-500 bg-emerald-500/10 text-slate-100"
                    : "border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
                    <Smartphone size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-200">
                      M-Pesa STK Push (Prompt to Phone)
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Prompts your handset to enter M-Pesa PIN
                    </div>
                  </div>
                </div>
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    paymentMethod === "mpesa"
                      ? "border-emerald-500 bg-emerald-500"
                      : "border-slate-600"
                  }`}
                >
                  {paymentMethod === "mpesa" && <div className="w-1.5 h-1.5 rounded-full bg-slate-900" />}
                </div>
              </button>

              {/* Option 2: Wallet Balance */}
              <button
                type="button"
                onClick={() => setPaymentMethod("wallet")}
                className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                  paymentMethod === "wallet"
                    ? "border-violet-500 bg-violet-500/10 text-slate-100"
                    : "border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-violet-500/20 text-violet-400">
                    <Wallet size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-200">
                      Pay from Wallet Balance
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Available: {kes(walletBalance)}{" "}
                      {!hasSufficientBalance && (
                        <span className="text-amber-400">(Insufficient)</span>
                      )}
                    </div>
                  </div>
                </div>
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    paymentMethod === "wallet"
                      ? "border-violet-500 bg-violet-500"
                      : "border-slate-600"
                  }`}
                >
                  {paymentMethod === "wallet" && <div className="w-1.5 h-1.5 rounded-full bg-slate-900" />}
                </div>
              </button>
            </div>

            {/* M-Pesa Phone Field when M-Pesa is selected */}
            {paymentMethod === "mpesa" && (
              <div className="mb-5 space-y-2">
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider">
                  M-Pesa Phone Number
                </label>
                <input
                  type="tel"
                  className="input-field w-full px-3.5 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-100 text-xs font-semibold focus:outline-none focus:border-emerald-500"
                  placeholder="07XXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-800 flex items-start gap-2 text-[11px] text-slate-400">
                  <ShieldCheck size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    Sent to <strong>vault</strong> under prompt name <strong>vault agencies</strong>.
                  </span>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-slate-300 hover:bg-white/5 transition-colors text-xs font-medium"
              >
                Cancel
              </button>

              {paymentMethod === "mpesa" ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleMpesaSTK}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs shadow-lg shadow-emerald-950 flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Sending Prompt...</span>
                    </>
                  ) : (
                    <>
                      <Smartphone size={14} />
                      <span>Send M-Pesa Prompt</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={loading || !hasSufficientBalance}
                  onClick={handleWalletPay}
                  className="flex-1 btn-primary text-xs"
                >
                  {loading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Activating…
                    </>
                  ) : (
                    `Pay ${kes(pkg.price)}`
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Waiting for PIN Entry on Handset */}
        {step === "WAITING_PIN" && (
          <div className="text-center py-3">
            <div className="relative w-16 h-16 mx-auto mb-4 flex items-center justify-center rounded-full bg-emerald-500/10 border-2 border-emerald-500/40 animate-pulse">
              <Smartphone size={28} className="text-emerald-400" />
            </div>

            <h3 className="text-lg font-bold text-slate-100 mb-1">
              M-Pesa PIN Prompt Sent!
            </h3>
            <p className="text-xs text-slate-400 mb-5 max-w-xs mx-auto">
              Please unlock your phone{" "}
              <strong className="text-slate-200">{phone || "registered number"}</strong>{" "}
              and enter your 4-digit PIN to authorize payment of{" "}
              <strong className="text-emerald-400">{kes(pkg.price)}</strong> to activate{" "}
              <strong className="text-slate-200">{pkg.name}</strong>.
            </p>

            <div className="bg-slate-800/50 border border-slate-800 rounded-xl p-3.5 text-left text-xs space-y-2 mb-5">
              <div className="flex justify-between">
                <span className="text-slate-400">Prompt / Business Name:</span>
                <span className="font-semibold text-emerald-400">vault agencies</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Receiver Account:</span>
                <span className="font-semibold text-slate-300">vault</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Status:</span>
                <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  <Loader2 size={10} className="animate-spin" /> Waiting for PIN on handset...
                </span>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                {error}
              </div>
            )}

            {isMockMode && (
              <button
                disabled={confirmingDev}
                onClick={handleManualDevConfirm}
                className="w-full mb-3 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 hover:bg-amber-500/25 text-amber-300 text-xs font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {confirmingDev ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Verifying PIN...</span>
                  </>
                ) : (
                  <span>Simulate PIN Entry (Dev Only)</span>
                )}
              </button>
            )}

            <button
              onClick={() => setStep("SELECT")}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all"
            >
              Cancel / Back
            </button>
          </div>
        )}

        {/* Step 3: Success Screen */}
        {step === "SUCCESS" && (
          <div className="text-center py-4">
            <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center rounded-full bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400">
              <CheckCircle2 size={32} />
            </div>

            <h3 className="text-xl font-bold text-emerald-400 mb-1">
              Deposit & Plan Activated!
            </h3>
            <p className="text-xs text-slate-400 mb-5">
              {pkg.name} package is now active. You will receive {kes(pkg.dailyReturn)} daily.
            </p>

            <div className="bg-slate-800/50 border border-slate-800 rounded-xl p-4 text-left text-xs space-y-2 mb-6">
              <div className="flex justify-between">
                <span className="text-slate-400">Amount Paid:</span>
                <span className="font-bold text-emerald-400 text-sm">{kes(pkg.price)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">M-Pesa Receipt:</span>
                <span className="font-mono font-semibold text-slate-200">
                  {receipt || "Confirmed"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Daily Return:</span>
                <span className="font-bold text-emerald-400">{kes(pkg.dailyReturn)}/day</span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-all"
            >
              View Active Portfolio
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  cls,
}: {
  label: string;
  value: string;
  bold?: boolean;
  cls?: string;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-slate-400">{label}</span>
      <span className={`${bold ? "font-bold text-white" : ""} ${cls ?? ""}`}>{value}</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function InvestPage() {
  const [confirming, setConfirming] = useState<(typeof PACKAGES)[0] | null>(null);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const { data: wallet, refetch: refetchWallet } = useQuery({
    queryKey: ["wallet"],
    queryFn: () => api.get("/api/wallet").then((r) => r.data),
  });

  const { data: user } = useQuery({
    queryKey: ["user-me"],
    queryFn: () => api.get("/api/auth/me").then((r) => r.data),
  });

  const walletBalance = parseFloat(wallet?.balance || "0");
  const defaultPhone = user?.phone || "";

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Investment Packages</h2>
            <p className="text-slate-400 text-sm mt-0.5">
              Choose a package — pay once, earn daily KES returns for 30 days
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowDepositModal(true)}
              className="btn-primary flex items-center gap-2"
            >
              <ArrowDownCircle size={16} /> Deposit Funds
            </button>
          </div>
        </div>

        {/* Flash message */}
        {msg && (
          <div
            className={`flex items-start gap-3 p-4 rounded-xl border text-sm ${
              msg.type === "ok"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : "bg-red-500/10 border-red-500/20 text-red-400"
            }`}
          >
            {msg.type === "ok" ? (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            ) : (
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
            )}
            <span>{msg.text}</span>
            <button
              className="ml-auto shrink-0 opacity-60 hover:opacity-100"
              onClick={() => setMsg(null)}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Package cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {PACKAGES.map((pkg) => {
            const Icon = pkg.icon;
            return (
              <div
                key={pkg.id}
                className="glass p-6 flex flex-col relative overflow-hidden hover:border-white/20 transition-all duration-200"
                style={{ boxShadow: `0 0 40px ${pkg.glow}` }}
              >
                {/* Icon */}
                <div
                  className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${pkg.gradient} mb-4 w-fit`}
                >
                  <Icon size={20} className="text-white" />
                </div>

                {/* Name + desc */}
                <h3 className="text-base font-bold mb-1">{pkg.name}</h3>
                <p className="text-slate-400 text-xs mb-5 leading-relaxed">{pkg.description}</p>

                {/* Metrics */}
                <div className="space-y-2 text-sm mb-6">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Invest</span>
                    <span className="font-bold text-white">{kes(pkg.price)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Daily earn</span>
                    <span className={`font-bold ${pkg.accent}`}>{kes(pkg.dailyReturn)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">30-day total</span>
                    <span className="text-emerald-400 font-semibold">
                      {kes(pkg.dailyReturn * pkg.durationDays)}
                    </span>
                  </div>
                </div>

                {/* CTA */}
                <div className="mt-auto">
                  <button
                    onClick={() => {
                      setMsg(null);
                      setConfirming(pkg);
                    }}
                    className="btn-primary w-full text-sm flex items-center justify-center gap-1.5"
                  >
                    <span>Invest {kes(pkg.price)}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* How it works */}
        <div className="glass p-6">
          <h3 className="font-semibold mb-4 text-slate-200">How it works</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 text-sm">
            {[
              {
                step: "1",
                title: "Pick a package or Deposit",
                desc: "Choose a plan or deposit to your vault. We send an M-Pesa prompt directly to your phone.",
              },
              {
                step: "2",
                title: "Enter M-Pesa PIN",
                desc: "Authorize the transaction on your handset. Funds are credited and invested immediately.",
              },
              {
                step: "3",
                title: "Earn every day",
                desc: "Your daily KES earnings are credited to your wallet every 24 hours automatically.",
              },
            ].map((s) => (
              <div key={s.step} className="flex gap-3">
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-violet-500/20 text-violet-400 text-xs font-bold shrink-0 mt-0.5">
                  {s.step}
                </span>
                <div>
                  <div className="font-medium text-white mb-0.5">{s.title}</div>
                  <div className="text-slate-400 leading-relaxed">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Investment & Direct STK Push Modal */}
      {confirming && (
        <InvestmentModal
          pkg={confirming}
          walletBalance={walletBalance}
          defaultPhone={defaultPhone}
          onClose={() => setConfirming(null)}
          onActivated={(text) => {
            setConfirming(null);
            setMsg({ type: "ok", text });
            refetchWallet();
          }}
        />
      )}

      {/* Standalone Deposit Modal */}
      {showDepositModal && (
        <DepositModal
          onClose={() => setShowDepositModal(false)}
          onSuccess={() => refetchWallet()}
        />
      )}
    </DashboardLayout>
  );
}
