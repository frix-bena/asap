"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import api from "@/lib/api";
import {
  Wallet, TrendingUp, ArrowDownCircle, ArrowUpCircle,
  Gift, Loader2, ArrowDownCircle as DepositIcon, ArrowUpCircle as WithdrawIcon, Zap,
} from "lucide-react";
import DashboardLayout from "../dashboard/layout";
import DepositModal from "@/components/DepositModal";
import WithdrawModal from "@/components/WithdrawModal";

const kes = (v: any) =>
  `KES ${parseFloat(v || "0").toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TX_CONFIG: Record<string, { label: string; color: string; sign: string; badge: string }> = {
  DEPOSIT:        { label: "Deposit",        color: "text-emerald-400", sign: "+", badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  WITHDRAWAL:     { label: "Withdrawal",     color: "text-red-400",     sign: "-", badge: "bg-red-500/15 text-red-400 border-red-500/20" },
  ROI_PAYOUT:     { label: "Daily Earnings", color: "text-violet-400",  sign: "+", badge: "bg-violet-500/15 text-violet-400 border-violet-500/20" },
  REFERRAL_BONUS: { label: "Referral Bonus", color: "text-amber-400",   sign: "+", badge: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
};

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  label, value, icon: Icon, gradient, sub,
}: { label: string; value: string; icon: any; gradient: string; sub?: string }) {
  return (
    <div className={`glass p-6 relative overflow-hidden`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-5 pointer-events-none`} />
      <div className="flex items-start justify-between relative">
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold mt-2">{value}</p>
          {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
        </div>
        <div className={`p-2.5 rounded-xl bg-gradient-to-br ${gradient}`}>
          <Icon size={18} className="text-white" />
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function WalletPage() {
  const [showDeposit,  setShowDeposit]  = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);

  const {
    data: wallet, isLoading: wLoading, refetch: refetchWallet,
  } = useQuery({
    queryKey: ["wallet"],
    queryFn:  () => api.get("/api/wallet").then((r) => r.data),
  });

  const {
    data: txData, isLoading: txLoading,
  } = useQuery({
    queryKey: ["wallet-history"],
    queryFn:  () => api.get("/api/history?limit=20").then((r) => r.data),
  });

  const transactions: any[] = txData?.data ?? [];

  if (wLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="animate-spin text-violet-400" size={32} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">My Wallet</h2>
            <p className="text-slate-400 text-sm mt-0.5">Your balance and earnings at a glance</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowDeposit(true)} className="btn-primary">
              <ArrowDownCircle size={16} /> Deposit
            </button>
            <button onClick={() => setShowWithdraw(true)} className="btn-secondary flex items-center gap-2">
              <ArrowUpCircle size={16} /> Withdraw
            </button>
          </div>
        </div>

        {/* Prominent balance banner */}
        <div className="glass p-8 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-600 to-purple-800 opacity-10 pointer-events-none" />
          <div className="relative">
            <p className="text-sm text-slate-400 uppercase tracking-widest mb-1">Available Balance</p>
            <p className="text-5xl font-black tracking-tight">
              {kes(wallet?.balance)}
            </p>
            <p className="text-xs text-slate-500 mt-2">Ready to invest or withdraw</p>
          </div>
        </div>

        {/* Stat cards — earned breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard
            label="Total Earned"
            value={kes(wallet?.totalEarned)}
            icon={TrendingUp}
            gradient="from-emerald-500 to-teal-600"
            sub="ROI payouts + referral bonuses"
          />
          <StatCard
            label="Total Deposited"
            value={kes(wallet?.totalDeposited)}
            icon={DepositIcon}
            gradient="from-violet-500 to-purple-700"
            sub="Lifetime deposits into wallet"
          />
          <StatCard
            label="Total Withdrawn"
            value={kes(wallet?.totalWithdrawn)}
            icon={WithdrawIcon}
            gradient="from-amber-400 to-orange-600"
            sub="All-time withdrawals"
          />
          <StatCard
            label="Net Profit"
            value={kes(
              Math.max(
                0,
                parseFloat(wallet?.totalEarned || "0") - parseFloat(wallet?.totalWithdrawn || "0")
              )
            )}
            icon={Zap}
            gradient="from-pink-500 to-rose-600"
            sub="Earned minus withdrawn"
          />
        </div>

        {/* Earnings breakdown summary */}
        <div className="glass p-6">
          <h3 className="font-semibold text-slate-200 mb-5">Earnings Breakdown</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            {[
              {
                label: "Daily ROI Earned",
                value: kes(
                  transactions
                    .filter((t) => t.type === "ROI_PAYOUT")
                    .reduce((s: number, t: any) => s + parseFloat(t.amount || "0"), 0)
                ),
                color: "text-violet-400",
                desc: "Total from 24-hr payout cycles",
              },
              {
                label: "Referral Bonuses",
                value: kes(
                  transactions
                    .filter((t) => t.type === "REFERRAL_BONUS")
                    .reduce((s: number, t: any) => s + parseFloat(t.amount || "0"), 0)
                ),
                color: "text-amber-400",
                desc: "Earned by referring others",
              },
              {
                label: "Active Since",
                value: wallet?.updatedAt
                  ? new Date(wallet.updatedAt).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })
                  : "—",
                color: "text-slate-200",
                desc: "Last wallet activity",
              },
            ].map((item) => (
              <div key={item.label} className="bg-white/4 rounded-xl p-4 border border-white/8">
                <p className="text-xs text-slate-500 mb-1">{item.label}</p>
                <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
                <p className="text-xs text-slate-600 mt-1">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent transactions */}
        <div className="glass p-6">
          <h3 className="font-semibold text-slate-200 mb-5">Recent Transactions</h3>

          {txLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin text-violet-400" size={24} />
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              No transactions yet. Deposit funds to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-500 text-xs uppercase tracking-wider border-b border-white/5">
                    <th className="text-left pb-3 font-medium">Type</th>
                    <th className="text-right pb-3 font-medium">Amount</th>
                    <th className="text-center pb-3 font-medium">Status</th>
                    <th className="text-right pb-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {transactions.map((tx: any) => {
                    const cfg = TX_CONFIG[tx.type] ?? TX_CONFIG.DEPOSIT;
                    return (
                      <tr key={tx.id} className="hover:bg-white/2 transition-colors">
                        <td className="py-3.5">
                          <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.badge}`}>
                            {cfg.label}
                          </span>
                        </td>
                        <td className={`text-right py-3.5 font-semibold ${cfg.color}`}>
                          {cfg.sign}{kes(tx.amount)}
                        </td>
                        <td className="text-center py-3.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${
                            tx.status === "COMPLETED"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : tx.status === "FAILED"
                              ? "bg-red-500/10 text-red-400 border-red-500/20"
                              : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          }`}>
                            {tx.status}
                          </span>
                        </td>
                        <td className="text-right py-3.5 text-slate-500 text-xs">
                          {new Date(tx.createdAt).toLocaleString("en-KE", {
                            day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* Modals */}
      {showDeposit  && <DepositModal  onClose={() => setShowDeposit(false)}  onSuccess={() => refetchWallet()} />}
      {showWithdraw && <WithdrawModal onClose={() => setShowWithdraw(false)} onSuccess={() => refetchWallet()} wallet={wallet} />}
    </DashboardLayout>
  );
}
