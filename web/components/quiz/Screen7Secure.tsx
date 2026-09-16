"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { QuizScreenShell } from "./QuizScreenShell";
import { PasswordStrengthMeter } from "./PasswordStrengthMeter";
import { evaluatePasswordStrength } from "@/lib/passwordStrength";
import { useAuth } from "@/lib/auth/AuthContext";
import { SPRING } from "./motion";

const MIN_PASSWORD_LENGTH = 8;

// Écran 7 — jamais "inscription". Le compte existe depuis l'écran 1 ; on ne
// fait qu'ajouter un mot de passe à la session anonyme en cours. L'email
// est affiché en lecture seule (déjà capté à l'écran 4) : le re-demander
// serait un aveu que le funnel a "oublié" ce qu'il sait déjà.
export function Screen7Secure({
  direction,
  email,
  prenom,
  onEditEmail,
  onSecured,
}: {
  direction: 1 | -1;
  email: string;
  prenom: string | null;
  onEditEmail: () => void;
  onSecured: () => void;
}) {
  const { secureWithPassword, linkGoogle } = useAuth();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = evaluatePasswordStrength(password, { prenom, email });
  const canSubmit = password.length >= MIN_PASSWORD_LENGTH && strength.score >= 1 && !submitting;

  // Anti double-submit : le clic est ignoré tant qu'une requête est en vol,
  // pas seulement désactivé visuellement (un double clic rapide avant le
  // premier re-render pourrait sinon passer les deux).
  async function handleSecure() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    const { error: secureError } = await secureWithPassword(password);
    setSubmitting(false);
    if (secureError) {
      setError(secureError);
      return;
    }
    onSecured();
  }

  async function handleGoogle() {
    setSubmitting(true);
    setError(null);
    const { error: googleError } = await linkGoogle();
    // Pas de setSubmitting(false) en cas de succès : la page va rediriger
    // vers Google, on ne veut pas d'un flash de bouton réactivé avant ça.
    if (googleError) {
      setSubmitting(false);
      setError(googleError);
    }
  }

  return (
    <QuizScreenShell
      direction={direction}
      title="Ton résultat est prêt à être sauvegardé — ajoute un mot de passe pour y accéder quand tu veux."
      footer={
        <div className="flex flex-col gap-3">
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSecure}
            className="w-full rounded-xl bg-cobalt py-3.5 font-bold text-white transition-transform enabled:hover:scale-[1.01] disabled:opacity-40"
          >
            {submitting ? "Sécurisation…" : "Sécuriser mon accès"}
          </button>
          <div className="flex items-center gap-3 text-xs text-steel">
            <span className="h-px flex-1 bg-white/10" />
            ou continue avec Google
            <span className="h-px flex-1 bg-white/10" />
          </div>
          <motion.button
            type="button"
            onClick={handleGoogle}
            disabled={submitting}
            whileHover={{ scale: 1.015 }}
            transition={SPRING}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-white/15 bg-white/[0.03] py-3.5 font-semibold text-white/90 disabled:opacity-40"
          >
            <GoogleGlyph />
            Continuer avec Google
          </motion.button>
        </div>
      }
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-steel">Email</span>
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3.5">
          <span className="text-white/70">{email}</span>
          <button type="button" onClick={onEditEmail} className="text-sm text-cobalt-soft underline">
            Modifier
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-steel">Mot de passe</span>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className="w-full rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3.5 pr-11 text-white focus:border-cobalt focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-steel hover:text-white"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <PasswordStrengthMeter password={password} prenom={prenom} email={email} />
      </div>
    </QuizScreenShell>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.2-5.1l-6.6-5.4c-2 1.5-4.6 2.5-7.6 2.5-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.6 5.4C41.4 36 44 30.5 44 24c0-1.3-.1-2.7-.4-3.5z" />
    </svg>
  );
}
