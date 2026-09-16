"use client";

import { OptionCard } from "./OptionCard";
import { QuizScreenShell } from "./QuizScreenShell";
import type { Intention } from "./types";

export function Screen1Intention({
  direction,
  value,
  onChange,
  onNext,
}: {
  direction: 1 | -1;
  value: Intention | null;
  onChange: (v: Intention) => void;
  onNext: () => void;
}) {
  return (
    <QuizScreenShell
      direction={direction}
      title="Tu veux racheter un SaaS qui tourne déjà, ou t'inspirer d'un concept pour repartir de zéro ?"
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
      <OptionCard
        label="Racheter"
        hint="Tu reprends les clients, le revenu, l'historique. Tu démarres avec du chiffre d'affaires."
        selected={value === "racheter"}
        onClick={() => onChange("racheter")}
      />
      <OptionCard
        label="Copier / m'inspirer"
        hint="Tu gardes l'idée validée, tu codes ta propre version."
        selected={value === "copier"}
        onClick={() => onChange("copier")}
      />
    </QuizScreenShell>
  );
}
