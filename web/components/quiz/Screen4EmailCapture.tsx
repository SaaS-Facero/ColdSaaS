"use client";

import { useState } from "react";
import { QuizScreenShell } from "./QuizScreenShell";
import { useAuth } from "@/lib/auth/AuthContext";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Écran 4 — capture email + consentement RGPD. C'est ICI, et seulement ici,
// que le consentement est demandé : c'est le premier moment où une donnée
// personnelle identifiante est traitée. Cadré comme un service du quiz
// ("on t'envoie ton résultat ici"), jamais comme une étape de compte.
export function Screen4EmailCapture({
  direction,
  email,
  onEmailChange,
  onNext,
}: {
  direction: 1 | -1;
  email: string | null;
  onEmailChange: (email: string) => void;
  onNext: () => void;
}) {
  const { captureEmail, sendSignInLinkToExistingAccount } = useAuth();
  const [localEmail, setLocalEmail] = useState(email ?? "");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isValidEmail = EMAIL_RE.test(localEmail.trim());
  const canSubmit = isValidEmail && consent && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setEmailTaken(false);

    const result = await captureEmail(localEmail.trim(), consent);
    setSubmitting(false);

    if (result.status === "ok") {
      onEmailChange(localEmail.trim());
      onNext();
      return;
    }
    if (result.status === "email_taken") {
      setEmailTaken(true);
      return;
    }
    setError(result.error);
  }

  async function handleSendLoginLink() {
    setSubmitting(true);
    const { error: linkError } = await sendSignInLinkToExistingAccount(localEmail.trim());
    setSubmitting(false);
    if (linkError) {
      setError(linkError);
      return;
    }
    setLinkSent(true);
  }

  if (emailTaken) {
    return (
      <QuizScreenShell
        direction={direction}
        title="Cet email a déjà un accès."
        footer={
          <button
            type="button"
            onClick={() => setEmailTaken(false)}
            className="w-full rounded-xl border border-white/15 py-3.5 font-semibold text-white/80 hover:border-white/30"
          >
            Utiliser un autre email
          </button>
        }
      >
        <p className="text-sm text-steel">
          Connecte-toi pour retrouver tes résultats précédents — pas besoin de
          refaire le quiz.
        </p>
        {linkSent ? (
          <p className="rounded-xl border border-verified-green/25 bg-verified-green/10 px-4 py-3 text-sm">
            Lien de connexion envoyé à {localEmail}. Vérifie ta boîte mail.
          </p>
        ) : (
          <button
            type="button"
            onClick={handleSendLoginLink}
            disabled={submitting}
            className="rounded-xl bg-cobalt px-4 py-3 text-sm font-semibold disabled:opacity-40"
          >
            M&apos;envoyer un lien de connexion
          </button>
        )}
      </QuizScreenShell>
    );
  }

  return (
    <QuizScreenShell
      direction={direction}
      title="On t'envoie ton résultat ici."
      subtext="Juste ton email — le détail des SaaS qui correspondent à ton profil arrive dedans."
      footer={
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="w-full rounded-xl bg-cobalt py-3.5 font-bold text-white transition-transform enabled:hover:scale-[1.01] disabled:opacity-40"
        >
          Continuer
        </button>
      }
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-steel">Email</span>
        <input
          type="email"
          autoComplete="email"
          value={localEmail}
          onChange={(e) => setLocalEmail(e.target.value)}
          className="w-full rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3.5 text-white focus:border-cobalt focus:outline-none"
        />
      </label>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <label className="mt-2 flex items-start gap-2.5 text-sm text-white/90">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-[18px] w-[18px] flex-shrink-0 accent-cobalt"
        />
        <span>
          J&apos;accepte de recevoir mon résultat par email.{" "}
          <a href="/confidentialite" className="text-cobalt-soft underline">
            Politique de confidentialité
          </a>
        </span>
      </label>
    </QuizScreenShell>
  );
}
