"use client";

import { OptionCard } from "./OptionCard";
import { QuizScreenShell } from "./QuizScreenShell";
import type { Budget } from "./types";

const OPTIONS: { value: Budget; label: string }[] = [
  { value: "low", label: "Moins de 5 000 €" },
  { value: "mid", label: "5 000 – 20 000 €" },
  { value: "high", label: "20 000 – 50 000 €" },
  { value: "undecided", label: "Je regarde, pas encore de budget fixé" },
];

export function Screen2Budget({
  direction,
  value,
  onChange,
  onNext,
}: {
  direction: 1 | -1;
  value: Budget | null;
  onChange: (v: Budget) => void;
  onNext: () => void;
}) {
  return (
    <QuizScreenShell
      direction={direction}
      title="Pour ne te montrer que ce que tu peux vraiment acheter."
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
