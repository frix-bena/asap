"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useState } from "react";
import { TrendingUp, Zap, Shield, Star, Loader2 } from "lucide-react";
import DashboardLayout from "../dashboard/layout";

const planIcons: Record<string, any> = { Starter: Zap, Growth: TrendingUp, Elite: Star };
const planColors: Record<string, string> = {
  Starter: "from-cyan-500 to-teal-600",
  Growth:  "from-violet-500 to-purple-700",
  Elite:   "from-amber-400 to-orange-600",
};

const fmt = (v: any) => parseFloat(v || "0").toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function InvestPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<any>(null);
  const [amount, setAmount]     = useState("");
  const [msg, setMsg]           = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["plans"],
    queryFn:  () => api.get("/api/invest/plans").then((r) => r.data),
  });

  const mutation = useMutation({
    mutationFn: ({ planId, amount }: { planId: string; amount: number }) =>
      api.post("/api/invest/commit", { planId, amount }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["active-investments"] });
      setMsg({ type: "ok", text: "Investment committed successfully!" });
      setSelected(null); setAmount("");
    },
    onError: (err: any) => {
      setMsg({ type: "err", text: err.response?.data?.error || "Commit failed." });
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold">Investment Plans</h2>
          <p className="text-slate-400 text-sm mt-0.5">Choose a plan and commit virtual funds to start earning daily ROI</p>
        </div>

        {msg && (
          <div className={`p-3 rounded-lg text-sm border ${msg.type === "ok" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
            {msg.text}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-violet-400" size={32} /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {plans.map((plan: any) => {
              const Icon = planIcons[plan.name] ?? Shield;
              const grad = planColors[plan.name] ?? "from-violet-500 to-purple-700";
              const isSelected = selected?.id === plan.id;
              return (
                <div key={plan.id}
                  onClick={() => { setSelected(isSelected ? null : plan); setMsg(null); }}
                  className={`glass p-6 cursor-pointer transition-all duration-200 ${isSelected ? "border-violet-500/50 ring-1 ring-violet-500/30" : "hover:border-white/15"}`}>
                  <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${grad} mb-4`}>
                    <Icon size={22} className="text-white" />
                  </div>
                  <h3 className="text-lg font-bold mb-1">{plan.name}</h3>
                  <p className="text-slate-400 text-sm mb-4">{plan.description}</p>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Daily Rate</span>
                      <span className="text-emerald-400 font-bold">
                        {(parseFloat(plan.dailyRatePct) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Duration</span>
                      <span>{plan.durationDays} days</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Min / Max</span>
                      <span>KES {fmt(plan.minAmount)} – KES {fmt(plan.maxAmount)}</span>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="mt-5 pt-5 border-t border-white/10 space-y-3" onClick={(e) => e.stopPropagation()}>
                      <input type="number" className="input-field" placeholder="Enter amount"
                        min={plan.minAmount} max={plan.maxAmount}
                        value={amount} onChange={(e) => setAmount(e.target.value)} />
                      <button
                        disabled={!amount || mutation.isPending}
                        className="btn-primary w-full"
                        onClick={() => mutation.mutate({ planId: plan.id, amount: parseFloat(amount) })}>
                        {mutation.isPending ? <><Loader2 size={14} className="animate-spin" /> Committing...</> : "Commit Funds"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
