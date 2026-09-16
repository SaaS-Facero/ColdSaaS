import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ColdTrend — Trouve ton SaaS en 60 secondes",
  description: "SaaS à vendre ou à copier, vérifiés Stripe x TrustMRR.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-ink text-white antialiased">{children}</body>
    </html>
  );
}
