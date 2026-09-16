import type { Budget, Secteur, Temps } from "./types";

export const SECTOR_LABELS: Record<Secteur, string> = {
  b2b: "B2B",
  b2c: "B2C",
  both: "B2B et B2C",
};

export const BUDGET_LABELS: Record<Budget, string> = {
  low: "moins de 5 000 €",
  mid: "5 000 € – 20 000 €",
  high: "20 000 € – 50 000 €",
  undecided: "pas encore fixé",
};

export const TIME_LABELS: Record<Temps, string> = {
  low: "moins de 5h/sem.",
  midlow: "5–10h/sem.",
  midhigh: "10–20h/sem.",
  full: "temps plein",
};
