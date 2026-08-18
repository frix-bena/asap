"use client";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Wallet, TrendingUp, Coins, ArrowDownCircle, ArrowUpCircle, Loader2 } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { useState } from "react";
import DepositModal from "@/components/DepositModal";
import WithdrawModal from "@/components/WithdrawModal";

const fmt = (v: any) => parseFloat(v || "0").toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function DashboardPage() {
  const [showDeposit,  setShowDeposit]  = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);

  const { data: wallet, isLoading: wLoading, refetch: refetchWallet } = useQuery({
    queryKey: ["wallet"],
    queryFn:  () => api.get("/api/wallet").then((r) => r.data),
  });

  const { data: investments = [] } = useQuery({
    queryKey: ["active-investments"],
    queryFn:  () => api.get("/api/invest/active").then((r) => r.data),
  });

  const { data: history } = useQuery({
    queryKey: ["roi-history"],
    queryFn:  () => api.get("/api/history?type=ROI_PAYOUT&limit=30").then((r) => r.data),
  });

  // Build chart data from ROI payouts
  const chartData = (history?.data ?? [])
    .slice()
    .reverse()
    .map((tx: any, i: number) => ({
      day: `Day ${i + 1}`,
      earned: parseFloat(tx.amount),
    }));

  const stats = [
    { label: "Total Balance",      value: wallet?.balance,        icon: Wallet,      cls: "card-violet", from: "from-violet-500", to: "to-purple-700" },
    { label: "Active Investments", value: investments.length,     icon: TrendingUp,  cls: "card-teal",   from: "from-cyan-500",   to: "to-teal-700", isCount: true },
    { label: "Total Earned",       value: wallet?.totalEarned,    icon: Coins,       cls: "card-amber",  from: "from-amber-400",  to: "to-orange-600" },
  ];

  if (wLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-violet-400" size={32} />
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Overview</h2>
          <p className="text-slate-400 text-sm mt-0.5">Your portfolio at a glance</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setShowDeposit(true)}
            className="btn-primary">
            <ArrowDownCircle size={16} /> Deposit
          </button>
          <button onClick={() => setShowWithdraw(true)}
            className="btn-secondary flex items-center gap-2">
            <ArrowUpCircle size={16} /> Withdraw
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {stats.map(({ label, value, icon: Icon, cls, from, to, isCount }) => (
          <div key={label} className={`glass p-6 ${cls} relative overflow-hidden`}>
            <div className={`absolute inset-0 bg-gradient-to-br ${from} ${to} opacity-5`} />
            <div className="flex items-start justify-between relative">
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</p>
                <p className="text-3xl font-bold mt-2">
                  {isCount ? value : `KES ${fmt(value)}`}
                </p>
              </div>
              <div className={`p-2.5 rounded-xl bg-gradient-to-br ${from} ${to} bg-opacity-10`}>
                <Icon size={20} className="text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ROI Chart */}
      <div className="glass p-6">
        <h3 className="text-base font-semibold mb-1">Daily ROI Earnings</h3>
        <p className="text-xs text-slate-500 mb-5">Last 30 payout cycles</p>
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
            No ROI payouts yet. Invest to start earning.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="roiGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="day" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false}
                tickFormatter={(v) => `KES ${v}`} />
              <Tooltip
                contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                labelStyle={{ color: "#94a3b8" }}
                itemStyle={{ color: "#a78bfa" }}
                formatter={(v: any) => [`KES ${v.toFixed(4)}`, "ROI Earned"]}
              />
              <Area type="monotone" dataKey="earned" stroke="#7c3aed" strokeWidth={2} fill="url(#roiGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Active Investments */}
      {investments.length > 0 && (
        <div className="glass p-6">
          <h3 className="text-base font-semibold mb-4">Active Investments</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs uppercase tracking-wider">
                  <th className="text-left pb-3 font-medium">Plan</th>
                  <th className="text-right pb-3 font-medium">Principal</th>
                  <th className="text-right pb-3 font-medium">Daily Rate</th>
                  <th className="text-right pb-3 font-medium">Earned</th>
                  <th className="text-right pb-3 font-medium">Matures</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {investments.map((inv: any) => (
                  <tr key={inv.id} className="text-slate-200">
                    <td className="py-3">
                      <span className="badge badge-violet">{inv.plan.name}</span>
                    </td>
                    <td className="text-right py-3">KES {fmt(inv.principal)}</td>
                    <td className="text-right py-3 text-emerald-400">
                      {(parseFloat(inv.plan.dailyRatePct) * 100).toFixed(1)}%
                    </td>
                    <td className="text-right py-3 text-amber-400">KES {fmt(inv.earnedToDate)}</td>
                    <td className="text-right py-3 text-slate-400">
                      {new Date(inv.maturityDate).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showDeposit  && <DepositModal  onClose={() => setShowDeposit(false)}  onSuccess={() => refetchWallet()} />}
      {showWithdraw && <WithdrawModal onClose={() => setShowWithdraw(false)} onSuccess={() => refetchWallet()} wallet={wallet} />}
    </div>
  );
}
