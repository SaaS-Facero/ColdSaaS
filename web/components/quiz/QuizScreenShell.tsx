"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { screenVariants, SPRING } from "./motion";

export function QuizScreenShell({
  direction,
  title,
  subtext,
  children,
  footer,
}: {
  direction: 1 | -1;
  title: string;
  subtext?: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <motion.div
      custom={direction}
      variants={screenVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={SPRING}
      className="flex h-full flex-col justify-start px-1 pb-6 pt-8"
    >
      <h2 className="mb-3 text-2xl font-bold leading-tight sm:text-[28px]">{title}</h2>
      {subtext ? <p className="mb-5 text-sm italic text-steel">{subtext}</p> : null}
      <div className="flex flex-col gap-2.5">{children}</div>
      <div className="mt-auto pt-6">{footer}</div>
    </motion.div>
  );
}
