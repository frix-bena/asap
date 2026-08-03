import { create } from "zustand";
import { persist } from "zustand/middleware";

interface User { id: string; email: string; fullName: string; }
interface Wallet { balance: string; totalDeposited: string; totalWithdrawn: string; totalEarned: string; }

interface AuthState {
  user:    User | null;
  token:   string | null;
  wallet:  Wallet | null;
  setAuth: (user: User, token: string) => void;
  setWallet: (wallet: Wallet) => void;
  logout:  () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null, token: null, wallet: null,
      setAuth:   (user, token) => { localStorage.setItem("invest_token", token); set({ user, token }); },
      setWallet: (wallet) => set({ wallet }),
      logout:    () => { localStorage.removeItem("invest_token"); set({ user: null, token: null, wallet: null }); },
    }),
    { name: "invest-auth", partialize: (s) => ({ user: s.user, token: s.token }) }
  )
);
