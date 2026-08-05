"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import api from "@/lib/api";
import {
  Zap, TrendingUp, Star, Gem,
  CheckCircle2, Loader2, AlertCircle, X,
} from "lucide-react";
import DashboardLayout from "../dashboard/layout";

// ── Hardcoded KES investment packages ────────────────────────────────────────
// These match the server-side tier config exactly.
const PACKAGES = [
  {
    id:           "tier-250",
    name:         "Starter",
    price:        250,
    dailyReturn:  70,
    durationDays: 30,
    referralBonus: 50,
    description:  "Perfect entry point — earn KES 70 every day for 30 days.",
    icon:         Zap,
    gradient:     "from-cyan-500 to-teal-600",
    accent:       "text-cyan-400",
    glow:         "rgba(6,182,212,0.12)",
  },
  {
    id:           "tier-500",
    name:         "Basic",
    price:        500,
    dailyReturn:  140,
    durationDays: 30,
    referralBonus: 100,
    description:  "Double your daily returns — KES 140 credited every 24 hours.",
    icon:         TrendingUp,
    gradient:     "from-violet-500 to-purple-700",
    accent:       "text-violet-400",
    glow:         "rgba(139,92,246,0.12)",
  },
  {
    id:           "tier-750",
    name:         "Growth",
    price:        750,
    dailyReturn:  210,
    durationDays: 30,
    referralBonus: 150,
    description:  "Accelerate your earnings — KES 210 every day.",
    icon:         Star,
    gradient:     "from-amber-400 to-orange-600",
    accent:       "text-amber-400",
    glow:         "rgba(251,191,36,0.12)",
  },
  {
    id:           "tier-2500",
    name:         "Premium",
    price:        2500,
    dailyReturn:  700,
    durationDays: 30,
    referralBonus: 500,
    description:  "High-performance plan — KES 700 daily returns.",
    icon:         Gem,
    gradient:     "from-pink-500 to-rose-600",
    accent:       "text-pink-400",
    glow:         "rgba(236,72,153,0.12)",
  },
];

const kes = (n: number) => `KES ${n.toLocaleString("en-KE")}`;

// ── Confirm modal ─────────────────────────────────────────────────────────────
function ConfirmModal({
  pkg,
  onConfirm,
  onCancel,
  isPending,
}: {
  pkg: (typeof PACKAGES)[0];
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="glass p-8 w-full max-w-md relative">
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>

        {/* Icon */}
        <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${pkg.gradient} mb-5`}>
          <pkg.icon size={24} className="text-white" />
        </div>

        <h2 className="text-xl font-bold mb-1">Confirm Investment</h2>
        <p className="text-slate-400 text-sm mb-6">
          Activating the <strong className="text-white">{pkg.name}</strong> package.
        </p>

        {/* Summary */}
        <div className="bg-white/5 rounded-xl p-4 space-y-2.5 text-sm mb-6 border border-white/10">
          <Row label="Package price"  value={kes(pkg.price)}         bold />
          <Row label="Daily earnings" value={kes(pkg.dailyReturn)}   cls={pkg.accent} />
          <Row label="Duration"       value={`${pkg.durationDays} days`} />
          <Row label="30-day total"   value={kes(pkg.dailyReturn * pkg.durationDays)} cls="text-emerald-400" />
          <div className="border-t border-white/8 pt-2">
            <Row label="Referral bonus" value={kes(pkg.referralBonus)} cls="text-slate-300" />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-slate-300 hover:bg-white/5 transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 btn-primary"
          >
            {isPending ? (
              <><Loader2 size={14} className="animate-spin" /> Activating…</>
            ) : (
              `Pay ${kes(pkg.price)}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({
  label, value, bold, cls,
}: { label: string; value: string; bold?: boolean; cls?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-slate-400">{label}</span>
      <span className={`${bold ? "font-bold text-white" : ""} ${cls ?? ""}`}>{value}</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function InvestPage() {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState<(typeof PACKAGES)[0] | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const mutation = useMutation({
    mutationFn: (planId: string) => api.post("/api/invest/activate", { planId }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["active-investments"] });
      setConfirming(null);
      setMsg({ type: "ok", text: res.data?.message || "Investment activated successfully!" });
    },
    onError: (err: any) => {
      setConfirming(null);
      setMsg({
        type: "err",
        text: err.response?.data?.error || "Activation failed. Please try again.",
      });
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold">Investment Packages</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            Choose a package — pay once, earn daily KES returns for 30 days
          </p>
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
            {msg.type === "ok"
              ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              : <AlertCircle   size={16} className="mt-0.5 shrink-0" />}
            <span>{msg.text}</span>
            <button className="ml-auto shrink-0 opacity-60 hover:opacity-100" onClick={() => setMsg(null)}>
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
                <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${pkg.gradient} mb-4 w-fit`}>
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
                    onClick={() => { setMsg(null); setConfirming(pkg); }}
                    className="btn-primary w-full text-sm"
                  >
                    Invest {kes(pkg.price)}
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
              { step: "1", title: "Pick a package", desc: "Select the plan that suits your budget. Your wallet is charged the exact package price." },
              { step: "2", title: "Earn every day",  desc: "Your daily KES earnings are credited to your wallet every 24 hours automatically." },
              { step: "3", title: "Refer & earn",    desc: "Refer a friend who activates a package and instantly earn the referral bonus." },
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

      {/* Confirm modal */}
      {confirming && (
        <ConfirmModal
          pkg={confirming}
          onConfirm={() => mutation.mutate(confirming.id)}
          onCancel={() => setConfirming(null)}
          isPending={mutation.isPending}
        />
      )}
    </DashboardLayout>
  );
}
