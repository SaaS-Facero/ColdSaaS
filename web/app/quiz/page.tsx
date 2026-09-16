import { Suspense } from "react";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { QuizFlow } from "@/components/quiz/QuizFlow";

// Suspense requis par Next.js App Router : QuizFlow lit useSearchParams()
// pour détecter le retour du callback OAuth (?secured=google).
export default function QuizPage() {
  return (
    <main className="h-[100dvh] bg-ink">
      <AuthProvider>
        <Suspense fallback={null}>
          <QuizFlow />
        </Suspense>
      </AuthProvider>
    </main>
  );
}
