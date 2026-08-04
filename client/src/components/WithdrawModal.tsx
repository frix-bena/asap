"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { X, ArrowUpCircle, Loader2 } from "lucide-react";

const fmt = (v: any) => parseFloat(v || "0").toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function WithdrawModal({
  onClose, onSuccess, wallet,
}: { onClose: () => void; onSuccess: () => void; wallet: any }) {
  const [amount, setAmount] = useState("");
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (amt: number) => api.post("/api/wallet/withdraw", { amount: amt }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wallet"] }); onSuccess(); onClose(); },
  });

  const balance = parseFloat(wallet?.balance || "0");
  const requested = parseFloat(amount || "0");
  const insufficient = requested > balance;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-600/20">
              <ArrowUpCircle size={20} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Withdraw Funds</h2>
              <p className="text-xs text-slate-400">
                Available: <span className="text-emerald-400 font-semibold">KES {fmt(wallet?.balance)}</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {mutation.isError && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {(mutation.error as any)?.response?.data?.error || "Withdrawal failed."}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Amount (KES)</label>
            <input
              type="number" min="1" max={balance} step="any"
              className={`input-field text-lg ${insufficient ? "border-red-500/50" : ""}`}
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {insufficient && (
              <p className="text-red-400 text-xs mt-1">Exceeds available balance.</p>
            )}
          </div>
          <button
            onClick={() => setAmount(String(balance.toFixed(2)))}
            className="btn-secondary text-xs px-3 py-1.5">
            Withdraw All
          </button>
          <button
            disabled={!amount || insufficient || mutation.isPending}
            onClick={() => mutation.mutate(parseFloat(amount))}
            className="btn-primary w-full" style={{ background: "linear-gradient(135deg,#d97706,#b45309)" }}>
            {mutation.isPending ? <><Loader2 size={16} className="animate-spin" /> Processing...</> : "Confirm Withdrawal"}
          </button>
        </div>
      </div>
    </div>
  );
}
