"use client";

import { X } from "lucide-react";

export function ContextBadge({
  label,
  removable,
  onRemove,
  subtle = false,
}: {
  label: string;
  removable?: boolean;
  onRemove?: () => void;
  subtle?: boolean;
}) {
  const tone = removable
    ? "border-blue-100/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(236,244,255,0.82))] text-blue-700 shadow-[0_8px_18px_rgba(59,130,246,0.05)]"
    : subtle
      ? "border-zinc-200 bg-zinc-50/90 text-zinc-400"
      : "border-white/70 bg-white/80 text-zinc-600";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] ${tone}`}>
      {label}
      {removable ? (
        <button
          type="button"
          onClick={onRemove}
          className="curator-button-ghost h-4 w-4 rounded-full p-0 text-current hover:bg-white/65 hover:text-current"
        >
          <X size={10} />
        </button>
      ) : null}
    </span>
  );
}
