"use client";

import { motion } from "framer-motion";
import { evaluatePasswordStrength } from "@/lib/passwordStrength";
import { SPRING } from "./motion";

export function PasswordStrengthMeter({
  password,
  prenom,
  email,
}: {
  password: string;
  prenom?: string | null;
  email?: string | null;
}) {
  const strength = evaluatePasswordStrength(password, { prenom, email });

  if (password.length === 0) return null;

  return (
    <div className="mt-2" aria-live="polite">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <motion.div
          className={`h-full rounded-full ${strength.colorClass}`}
          initial={false}
          animate={{ width: `${strength.widthPercent}%` }}
          transition={SPRING}
        />
      </div>
      <p className="mt-1.5 text-xs text-steel">{strength.label}</p>
    </div>
  );
}
