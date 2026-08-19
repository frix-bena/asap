"use client";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  X,
  Smartphone,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";

export default function DepositModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // States: "FORM" | "WAITING_PIN" | "SUCCESS"
  const [step, setStep] = useState<"FORM" | "WAITING_PIN" | "SUCCESS">("FORM");
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [confirmedData, setConfirmedData] = useState<any>(null);

  const qc = useQueryClient();
  const quickAmounts = [100, 250, 500, 1000, 2500, 5000];

  // Try to load user profile to get default registered phone
  useEffect(() => {
    api
      .get("/api/auth/me")
      .then((res) => {
        if (res.data?.phone) {
          setPhone(res.data.phone);
        }
      })
      .catch(() => {});
  }, []);

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
          setConfirmedData(res.data);
          setStep("SUCCESS");
          qc.invalidateQueries({ queryKey: ["wallet"] });
          qc.invalidateQueries({ queryKey: ["wallet-history"] });
          onSuccess();
        } else if (res.data?.status === "FAILED") {
          clearInterval(interval);
          setError(
            res.data.resultDesc || "M-Pesa payment was cancelled or failed."
          );
        }
      } catch (err) {
        console.warn("Polling error:", err);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [step, checkoutId, qc, onSuccess]);

  const [isMockMode, setIsMockMode] = useState(false);
  const [confirmingDev, setConfirmingDev] = useState(false);

  const handleInitiateSTK = async () => {
    const num = parseFloat(amount);
    if (!num || num <= 0) {
      setError("Please enter a valid deposit amount.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await api.post("/api/wallet/deposit", {
        amount: num,
        phone: phone || undefined,
      });

      if (res.data?.checkoutRequestId) {
        setCheckoutId(res.data.checkoutRequestId);
        setIsMockMode(Boolean(res.data.isMock));
        setStep("WAITING_PIN");
      } else {
        throw new Error(res.data?.message || "Failed to initiate M-Pesa STK push.");
      }
    } catch (err: any) {
      const errorMsg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        "Deposit request failed. Please check your phone number and try again.";
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
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-box max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
        {/* Step 1: Input Form */}
        {step === "FORM" && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <Smartphone size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-100">
                    Deposit via M-Pesa
                  </h2>
                  <p className="text-xs text-slate-400">
                    STK Push prompt directly to your phone
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                  M-Pesa Registered Phone Number
                </label>
                <input
                  type="tel"
                  className="input-field w-full px-3.5 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-100 text-sm font-semibold focus:outline-none focus:border-emerald-500"
                  placeholder="07XXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                  Deposit Amount (KES)
                </label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  className="input-field w-full px-3.5 py-3 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-100 text-xl font-bold focus:outline-none focus:border-emerald-500"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>

              <div className="flex gap-2 flex-wrap">
                {quickAmounts.map((p) => (
                  <button
                    key={p}
                    onClick={() => setAmount(String(p))}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                      amount === String(p)
                        ? "border-emerald-500 bg-emerald-500/15 text-emerald-400 font-semibold"
                        : "border-slate-700 bg-slate-800/40 text-slate-300 hover:border-slate-600"
                    }`}
                  >
                    +KES {p.toLocaleString()}
                  </button>
                ))}
              </div>

              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 flex items-start gap-2.5 text-xs text-slate-400">
                <ShieldCheck size={18} className="text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  Payment is sent directly to <strong>vault</strong> under prompt name <strong>vault agencies</strong>. The receiver account number is securely masked.
                </span>
              </div>

              <button
                disabled={!amount || loading}
                onClick={handleInitiateSTK}
                className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-sm shadow-lg shadow-emerald-950 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Sending M-Pesa Prompt...</span>
                  </>
                ) : (
                  <span>Send M-Pesa STK Push</span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Waiting for PIN */}
        {step === "WAITING_PIN" && (
          <div className="text-center py-4">
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
              <strong className="text-emerald-400">KES {parseFloat(amount).toLocaleString()}</strong>.
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
                  <Loader2 size={10} className="animate-spin" /> Waiting for PIN...
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
              onClick={() => setStep("FORM")}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all"
            >
              Cancel / Back
            </button>
          </div>
        )}

        {/* Step 3: Success */}
        {step === "SUCCESS" && (
          <div className="text-center py-4">
            <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center rounded-full bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400">
              <CheckCircle2 size={32} />
            </div>

            <h3 className="text-xl font-bold text-emerald-400 mb-1">
              Deposit Confirmed!
            </h3>
            <p className="text-xs text-slate-400 mb-5">
              Your wallet balance has been credited immediately.
            </p>

            <div className="bg-slate-800/50 border border-slate-800 rounded-xl p-4 text-left text-xs space-y-2 mb-6">
              <div className="flex justify-between">
                <span className="text-slate-400">Amount Credited:</span>
                <span className="font-bold text-emerald-400 text-sm">
                  KES {parseFloat(confirmedData?.amount || amount).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">M-Pesa Receipt:</span>
                <span className="font-mono font-semibold text-slate-200">
                  {confirmedData?.receipt || "Confirmed"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Updated Balance:</span>
                <span className="font-bold text-slate-100">
                  KES {parseFloat(confirmedData?.walletBalance || 0).toLocaleString()}
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-all"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
