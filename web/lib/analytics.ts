// Point d'entrée analytics unique — cf. scripts/build.mjs pour l'équivalent
// vanilla déjà en prod sur la landing statique. Même contrat : jamais de PII
// en clair dans les props (email_captured ne transporte pas l'adresse).
// TODO: brancher window.posthog.capture / window.plausible ici.

export type AnalyticsEvent =
  | { name: "funnel_step_view"; props: { step_number: number; step_name: string } }
  | { name: "funnel_step_complete"; props: { step_number: number; answer: unknown } }
  | { name: "funnel_abandoned"; props: { last_step: string } }
  | { name: "anonymous_session_started"; props: Record<string, never> }
  | { name: "email_captured"; props: { step_number: number } }
  | { name: "account_secured"; props: { method: "password" | "google" } }
  | { name: "account_conversion_failed"; props: { reason: string } }
  | { name: "result_cta_clicked"; props: Record<string, never> };

export function trackEvent<E extends AnalyticsEvent>(name: E["name"], props: E["props"]): void {
  if (typeof window !== "undefined" && window.console?.debug) {
    console.debug("[trackEvent]", name, props);
  }
}
