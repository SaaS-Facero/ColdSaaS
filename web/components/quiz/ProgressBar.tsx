"use client";

import { motion } from "framer-motion";
import { SPRING } from "./motion";

export function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex gap-1.5 px-5 pt-4" aria-hidden="true">
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
          <motion.span
            className="block h-full bg-cobalt"
            initial={false}
            animate={{ width: i < current ? "100%" : "0%" }}
            transition={SPRING}
          />
        </span>
      ))}
    </div>
  );
}
