"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { X, ArrowDownCircle, Loader2 } from "lucide-react";

export default function DepositModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [amount, setAmount] = useState("");
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (amt: number) => api.post("/api/wallet/deposit", { amount: amt }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wallet"] }); onSuccess(); onClose(); },
  });

  const quickAmounts = [100, 500, 1000, 5000];

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-violet-600/20">
              <ArrowDownCircle size={20} className="text-violet-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Deposit Funds</h2>
              <p className="text-xs text-slate-400">Add virtual funds to your wallet</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {mutation.isSuccess && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
            ✅ Deposit successful!
          </div>
        )}
        {mutation.isError && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {(mutation.error as any)?.response?.data?.error || "Deposit failed."}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Amount (KES)</label>
            <input
              type="number" min="1" step="any"
              className="input-field text-lg"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {quickAmounts.map((p) => (
              <button key={p} onClick={() => setAmount(String(p))}
                className={`btn-secondary text-sm px-3 py-1.5 ${amount === String(p) ? "border-violet-500 text-violet-300" : ""}`}>
                KES {p.toLocaleString()}
              </button>
            ))}
          </div>
          <button
            disabled={!amount || mutation.isPending}
            onClick={() => mutation.mutate(parseFloat(amount))}
            className="btn-primary w-full mt-2">
            {mutation.isPending ? <><Loader2 size={16} className="animate-spin" /> Processing...</> : "Confirm Deposit"}
          </button>
        </div>
      </div>
    </div>
  );
}
