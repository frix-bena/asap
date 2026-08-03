import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "InvestVault — Simulated Investment Platform",
  description: "Grow your virtual portfolio with fixed daily returns.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased bg-[#080c14] text-slate-100`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
