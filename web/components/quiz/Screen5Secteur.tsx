"use client";

import { OptionCard } from "./OptionCard";
import { QuizScreenShell } from "./QuizScreenShell";
import type { Secteur } from "./types";

const OPTIONS: { value: Secteur; label: string; hint: string }[] = [
  { value: "b2b", label: "B2B", hint: "tu vends à des entreprises" },
  { value: "b2c", label: "B2C", hint: "tu vends à des particuliers" },
  { value: "both", label: "Les deux", hint: "peu importe le client tant que ça marche" },
];

export function Screen5Secteur({
  direction,
  value,
  onToggle,
  onNext,
}: {
  direction: 1 | -1;
  value: Secteur[];
  onToggle: (v: Secteur) => void;
  onNext: () => void;
}) {
  return (
    <QuizScreenShell
      direction={direction}
      title="Tu vises plutôt les entreprises ou les particuliers ?"
      subtext="Certains SaaS vérifiés touchent les deux, on te les montre dans tous les cas."
      footer={
        <button
          type="button"
          disabled={value.length === 0}
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
          hint={opt.hint}
          multi
          selected={value.includes(opt.value)}
          onClick={() => onToggle(opt.value)}
        />
      ))}
    </QuizScreenShell>
  );
}
