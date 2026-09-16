"use client";

import { useCallback, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import type { ProfilePatch } from "@/lib/supabase/types";

const DEBOUNCE_MS = 300;

// Sync silencieuse profiles — jamais de UI "Enregistré ✓" (ça casserait
// l'immersion du quiz), jamais bloquante (échec = log silencieux, la
// progression du funnel ne dépend jamais du succès de cette écriture).
export function useProfileSync(userId: string | null) {
  const pending = useRef<ProfilePatch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);

  const flush = useCallback(async () => {
    if (!userId || inFlight.current) return;
    const patch = pending.current;
    if (Object.keys(patch).length === 0) return;
    pending.current = {};
    inFlight.current = true;
    try {
      const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
      if (error) {
        console.warn("[ColdTrend] profile sync failed silently:", error.message);
        // On ne remet pas le patch en file : une réponse déjà saisie par
        // l'utilisateur reste visible dans son state local ; on préfère un
        // enregistrement DB en retard/manqué plutôt que bloquer le funnel.
      }
    } finally {
      inFlight.current = false;
    }
  }, [userId]);

  // Vide la file au démontage (fermeture d'onglet gérée séparément via
  // beforeunload dans QuizFlow, cf. funnel_abandoned).
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const queueUpdate = useCallback(
    (patch: ProfilePatch) => {
      pending.current = { ...pending.current, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, DEBOUNCE_MS);
    },
    [flush]
  );

  return { queueUpdate, flushNow: flush };
}
