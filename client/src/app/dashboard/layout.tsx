"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import {
  LayoutDashboard, TrendingUp, Wallet, History, LogOut, ChevronRight
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard",   icon: LayoutDashboard },
  { href: "/invest",    label: "Invest",       icon: TrendingUp       },
  { href: "/wallet",    label: "Wallet",        icon: Wallet           },
  { href: "/history",  label: "Transactions", icon: History          },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const { user, logout } = useAuthStore();

  const handleLogout = () => { logout(); router.push("/login"); };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="sidebar w-64 flex-shrink-0 flex flex-col p-5">
        <div className="mb-8">
          <h1 className="text-xl font-bold gradient-text">InvestVault</h1>
          <p className="text-xs text-slate-500 mt-0.5">Simulated Platform</p>
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}
              className={`nav-link ${pathname === href ? "active" : ""}`}>
              <Icon size={16} />
              {label}
              {pathname === href && <ChevronRight size={14} className="ml-auto opacity-60" />}
            </Link>
          ))}
        </nav>

        <div className="border-t border-white/5 pt-4 mt-4">
          <div className="flex items-center gap-3 mb-3 px-2">
            <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-sm font-bold">
              {user?.fullName?.[0] ?? "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.fullName}</p>
              <p className="text-xs text-slate-500 truncate">{user?.phone}</p>
            </div>
          </div>
          <button onClick={handleLogout}
            className="nav-link w-full text-red-400 hover:bg-red-500/10 hover:text-red-300">
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
