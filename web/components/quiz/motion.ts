import type { Transition } from "framer-motion";

// Signature de spring unique réutilisée sur tout le funnel (screens, barre
// de progression, indicateur de force du mot de passe) — cf. contrainte
// "une seule signature de spring" du brief.
export const SPRING: Transition = { type: "spring", stiffness: 300, damping: 28, mass: 0.9 };

export const screenVariants = {
  enter: (direction: 1 | -1) => ({ opacity: 0, x: direction * 24 }),
  center: { opacity: 1, x: 0 },
  exit: (direction: 1 | -1) => ({ opacity: 0, x: direction * -24 }),
};
