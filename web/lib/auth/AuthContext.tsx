"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { trackEvent } from "@/lib/analytics";

type ActionResult = { error: string | null };

type EmailCaptureResult =
  | { status: "ok" }
  | { status: "email_taken" }
  | { status: "error"; error: string };

interface AuthContextValue {
  user: User | null;
  isAnonymous: boolean;
  ready: boolean;
  ensureAnonymousSession: () => Promise<User | null>;
  captureEmail: (email: string, consent: boolean) => Promise<EmailCaptureResult>;
  secureWithPassword: (password: string) => Promise<ActionResult>;
  linkGoogle: () => Promise<ActionResult>;
  sendSignInLinkToExistingAccount: (email: string) => Promise<ActionResult>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Message renvoyé par GoTrue quand updateUser({ email }) cible une adresse
// déjà liée à un AUTRE compte permanent. Le texte exact dépend de la version
// du SDK (message vs. code "email_exists") — on matche sur les deux pour
// rester robuste aux montées de version.
function isEmailAlreadyTakenError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("already") || normalized.includes("email_exists");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const signingIn = useRef(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUser(data.session?.user ?? null);
      setReady(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  // Idempotent et protégé contre les doubles déclenchements (double clic,
  // StrictMode qui monte deux fois en dev) : si un user existe déjà
  // (anonyme ou permanent) ou si un appel est déjà en vol, on ne resigne pas.
  const ensureAnonymousSession = useCallback(async (): Promise<User | null> => {
    if (user) return user;
    if (signingIn.current) return null;
    signingIn.current = true;
    try {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) {
        trackEvent("account_conversion_failed", { reason: error.message });
        return null;
      }
      trackEvent("anonymous_session_started", {});
      setUser(data.user);
      return data.user;
    } finally {
      signingIn.current = false;
    }
  }, [user]);

  // Écran 4 — capture email + consentement RGPD. Le consentement est
  // vérifié ICI (pas avant, pas à l'écran 7) : c'est le moment exact de la
  // collecte de la première donnée personnelle identifiante.
  const captureEmail = useCallback(
    async (email: string, consent: boolean, stepNumber = 4): Promise<EmailCaptureResult> => {
      if (!consent) {
        return { status: "error", error: "Le consentement est requis pour recevoir ton résultat." };
      }
      const { error } = await supabase.auth.updateUser({ email });
      if (error) {
        if (isEmailAlreadyTakenError(error.message)) {
          return { status: "email_taken" };
        }
        trackEvent("account_conversion_failed", { reason: error.message });
        return { status: "error", error: error.message };
      }
      // Ne bloque pas le funnel en attendant la confirmation email — elle
      // arrive en tâche de fond (lien de confirmation envoyé par Supabase).
      trackEvent("email_captured", { step_number: stepNumber });
      return { status: "ok" };
    },
    []
  );

  // Écran 7 — "Sécurise ton accès". La session anonyme existante passe à
  // is_anonymous = false ; aucune nouvelle ligne profiles n'est créée
  // (même id depuis l'écran 1), donc aucune donnée de quiz n'est perdue.
  const secureWithPassword = useCallback(async (password: string): Promise<ActionResult> => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      trackEvent("account_conversion_failed", { reason: error.message });
      return { error: error.message };
    }
    await supabase.from("profiles").update({ converted: true }).eq("id", user?.id ?? "");
    trackEvent("account_secured", { method: "password" });
    return { error: null };
  }, [user]);

  // Alternative OAuth — linkIdentity (pas signInWithOAuth) : lie l'identité
  // Google à la session anonyme EN COURS au lieu d'en ouvrir une nouvelle,
  // ce qui préserverait un compte différent et perdrait tout l'historique
  // du quiz déjà attaché à l'utilisateur anonyme actuel.
  const linkGoogle = useCallback(async (): Promise<ActionResult> => {
    const { error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      trackEvent("account_conversion_failed", { reason: error.message });
      return { error: error.message };
    }
    // linkIdentity redirige immédiatement le navigateur vers Google ; le
    // reste de la conversion (converted = true, account_secured) est géré
    // par app/auth/callback/route.ts au retour.
    return { error: null };
  }, []);

  // Cas "email déjà utilisé par un autre compte" (rare, cf. brief) :
  // au lieu de bloquer, on propose une reconnexion honnête sur le compte
  // existant via magic link. Accepte de perdre la session anonyme en cours
  // (ses réponses de quiz) — c'est le compromis assumé de ce chemin rare.
  const sendSignInLinkToExistingAccount = useCallback(async (email: string): Promise<ActionResult> => {
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) {
      trackEvent("account_conversion_failed", { reason: error.message });
      return { error: error.message };
    }
    return { error: null };
  }, []);

  const value: AuthContextValue = {
    user,
    isAnonymous: user?.is_anonymous ?? false,
    ready,
    ensureAnonymousSession,
    captureEmail,
    secureWithPassword,
    linkGoogle,
    sendSignInLinkToExistingAccount,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
