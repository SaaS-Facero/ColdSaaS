import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-ink px-6 text-center">
      <h1 className="text-3xl font-bold">ColdTrend</h1>
      <p className="text-sm italic text-steel">Ici, « cold » veut dire vérifié, pas distant.</p>
      <p className="max-w-md text-steel">
        SaaS à vendre ou à copier, vérifiés Stripe × TrustMRR. Trouve le tien
        en 60 secondes.
      </p>
      <Link
        href="/quiz"
        className="rounded-xl bg-cobalt px-6 py-3.5 font-bold text-white transition-transform hover:scale-[1.02]"
      >
        Trouve ton SaaS en 60 secondes
      </Link>
    </main>
  );
}
