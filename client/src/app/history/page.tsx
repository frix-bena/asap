"use client";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { ArrowDownCircle, ArrowUpCircle, TrendingUp, Loader2 } from "lucide-react";
import DashboardLayout from "../dashboard/layout";

const fmt = (v: any) => parseFloat(v || "0").toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const txConfig: Record<string, any> = {
  DEPOSIT:     { label: "Deposit",    icon: ArrowDownCircle, cls: "text-emerald-400", badge: "badge-green"  },
  WITHDRAWAL:  { label: "Withdrawal", icon: ArrowUpCircle,   cls: "text-red-400",     badge: "badge-amber"  },
  ROI_PAYOUT:  { label: "ROI Payout", icon: TrendingUp,      cls: "text-violet-400",  badge: "badge-violet" },
};

export default function HistoryPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["history"],
    queryFn:  () => api.get("/api/history?limit=50").then((r) => r.data),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Transaction History</h2>
          <p className="text-slate-400 text-sm mt-0.5">All deposits, withdrawals, and ROI payouts</p>
        </div>

        <div className="glass p-6">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin text-violet-400" size={28} /></div>
          ) : data?.data?.length === 0 ? (
            <div className="text-center py-16 text-slate-500">No transactions yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 text-xs uppercase tracking-wider border-b border-white/5">
                    <th className="text-left pb-3 font-medium">Type</th>
                    <th className="text-right pb-3 font-medium">Amount</th>
                    <th className="text-center pb-3 font-medium">Status</th>
                    <th className="text-right pb-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data?.data?.map((tx: any) => {
                    const cfg = txConfig[tx.type] ?? txConfig.DEPOSIT;
                    const Icon = cfg.icon;
                    return (
                      <tr key={tx.id} className="hover:bg-white/2 transition-colors">
                        <td className="py-3.5">
                          <div className="flex items-center gap-3">
                            <div className={`p-1.5 rounded-lg bg-white/5`}>
                              <Icon size={14} className={cfg.cls} />
                            </div>
                            <span className={`badge ${cfg.badge} text-xs`}>{cfg.label}</span>
                          </div>
                        </td>
                        <td className={`text-right py-3.5 font-semibold ${cfg.cls}`}>
                          {tx.type === "WITHDRAWAL" ? "-" : "+"}KES {fmt(tx.amount)}
                        </td>
                        <td className="text-center py-3.5">
                          <span className={`badge ${tx.status === "COMPLETED" ? "badge-green" : "badge-amber"} text-xs`}>
                            {tx.status}
                          </span>
                        </td>
                        <td className="text-right py-3.5 text-slate-400 text-xs">
                          {new Date(tx.createdAt).toLocaleString()}
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
    </DashboardLayout>
  );
}
