"use client";

import { AnimatePresence, motion } from "framer-motion";
import { OptionCard } from "./OptionCard";
import { QuizScreenShell } from "./QuizScreenShell";
import { SPRING } from "./motion";

const FOLLOWUPS: Record<"yes" | "no", string> = {
  yes: "On sait. C'est littéralement pour ça que ColdTrend existe : plus une seule fiche sans preuve derrière.",
  no: "Alors autant commencer avec des chiffres vérifiés plutôt que des idées générées — tu gagnes le détour.",
};

export function Screen6Frustration({
  direction,
  value,
  onChange,
  onNext,
}: {
  direction: 1 | -1;
  value: "yes" | "no" | null;
  onChange: (v: "yes" | "no") => void;
  onNext: () => void;
}) {
  return (
    <QuizScreenShell
      direction={direction}
      title="Tu as déjà passé des heures sur des listes d'idées génériques, sans rien trouver de crédible ?"
      footer={
        <button
          type="button"
          disabled={!value}
          onClick={onNext}
          className="w-full rounded-xl bg-cobalt py-3.5 font-bold text-white transition-transform enabled:hover:scale-[1.01] disabled:opacity-40"
        >
          Continuer
        </button>
      }
    >
      <OptionCard label="Oui, exactement ça" selected={value === "yes"} onClick={() => onChange("yes")} />
      <OptionCard
        label="Pas encore, c'est ma première recherche"
        selected={value === "no"}
        onClick={() => onChange("no")}
      />
      <AnimatePresence>
        {value ? (
          <motion.p
            key={value}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING}
            className="mt-1 rounded-2xl border border-verified-green/25 bg-verified-green/[0.08] px-4 py-3.5 text-sm"
          >
            {FOLLOWUPS[value]}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </QuizScreenShell>
  );
}
