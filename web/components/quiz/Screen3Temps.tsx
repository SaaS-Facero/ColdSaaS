"use client";

import { OptionCard } from "./OptionCard";
import { QuizScreenShell } from "./QuizScreenShell";
import type { Temps } from "./types";

const OPTIONS: { value: Temps; label: string }[] = [
  { value: "low", label: "Moins de 5h" },
  { value: "midlow", label: "5–10h" },
  { value: "midhigh", label: "10–20h" },
  { value: "full", label: "Temps plein" },
];

export function Screen3Temps({
  direction,
  value,
  onChange,
  onNext,
}: {
  direction: 1 | -1;
  value: Temps | null;
  onChange: (v: Temps) => void;
  onNext: () => void;
}) {
  return (
    <QuizScreenShell
      direction={direction}
      title="Combien d'heures par semaine tu peux vraiment y consacrer ?"
      subtext="Pas besoin de tout plaquer. La plupart de nos utilisateurs démarrent à côté d'un job."
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
      {OPTIONS.map((opt) => (
        <OptionCard
          key={opt.value}
          label={opt.label}
          selected={value === opt.value}
          onClick={() => onChange(opt.value)}
        />
      ))}
    </QuizScreenShell>
  );
}
