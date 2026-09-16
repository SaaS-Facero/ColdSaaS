"use client";

import { Check } from "lucide-react";

export function OptionCard({
  label,
  hint,
  selected,
  multi,
  onClick,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  multi?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-soft ${
        selected ? "border-cobalt bg-cobalt/10" : "border-white/10 bg-white/[0.03] hover:border-white/20"
      }`}
    >
      <span className="flex flex-col gap-0.5">
        <span className="font-semibold">{label}</span>
        {hint ? <span className="text-sm text-steel">{hint}</span> : null}
      </span>
      {multi ? (
        <span
          className={`ml-auto flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition-colors ${
            selected ? "border-cobalt bg-cobalt text-white" : "border-white/20 text-transparent"
          }`}
        >
          <Check size={14} strokeWidth={2.5} />
        </span>
      ) : null}
    </button>
  );
}
