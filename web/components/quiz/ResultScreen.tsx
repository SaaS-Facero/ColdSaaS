"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { trackEvent } from "@/lib/analytics";
import { SECTOR_LABELS, BUDGET_LABELS, TIME_LABELS } from "./labels";
import { screenVariants, SPRING } from "./motion";
import type { QuizAnswers } from "./types";

const TOTAL_SAAS = 340; // TODO: remplacer par le vrai décompte (vue Supabase en prod), jamais un Math.random().

function useCountUp(target: number, durationMs: number, start: boolean) {
  const [value, setValue] = useState(0);
  const frame = useRef<number>();

  useEffect(() => {
    if (!start) return;
    const startTime = performance.now();
    function tick(now: number) {
      const progress = Math.min((now - startTime) / durationMs, 1);
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setValue(Math.round(target * eased));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    }
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [target, durationMs, start]);

  return value;
}

export function ResultScreen({ answers, prenom }: { answers: QuizAnswers; prenom: string | null }) {
  const [showMatch, setShowMatch] = useState(false);
  const total = useCountUp(TOTAL_SAAS, 900, true);
  const match = useCountUp(answers.matchCount ?? 3, 700, showMatch);

  useEffect(() => {
    const t = setTimeout(() => setShowMatch(true), 1300);
    return () => clearTimeout(t);
  }, []);

  const metaParts = [
    answers.secteur.map((s) => SECTOR_LABELS[s]).join(", "),
    answers.budget ? `budget ${BUDGET_LABELS[answers.budget]}` : null,
    answers.temps ? `${TIME_LABELS[answers.temps]} par semaine` : null,
  ].filter(Boolean);

  return (
    <motion.div
      custom={1}
      variants={screenVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={SPRING}
      className="flex h-full flex-col items-center justify-center px-1 pb-6 pt-8 text-center"
    >
      <h2 className="mb-2 text-2xl font-bold">
        {prenom ? `Ok ${prenom}, voici ce qu'on a trouvé.` : "Voici ce qu'on a trouvé."}
      </h2>
      <div className="text-5xl font-extrabold tabular-nums text-cobalt">{total}</div>
      <p className="mb-6 mt-1 text-sm text-steel">SaaS vérifiés dans la base</p>
      <div className="text-4xl font-extrabold tabular-nums text-verified-green">{match}</div>
      <p className="mb-1 mt-1 text-sm">correspondent à ton profil</p>
      <p className="mb-8 text-sm text-steel">{metaParts.join(" · ")}</p>
      <button
        type="button"
        onClick={() => trackEvent("result_cta_clicked", {})}
        className="w-full rounded-xl bg-cobalt py-3.5 font-bold text-white transition-transform hover:scale-[1.01]"
      >
        Débloquer les {answers.matchCount ?? 3} résultats
      </button>
    </motion.div>
  );
}
