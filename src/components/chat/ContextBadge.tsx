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
    ? "border-sky-100 bg-sky-50/90 text-sky-600"
    : subtle
      ? "border-zinc-200 bg-zinc-50/90 text-zinc-400"
      : "border-white/70 bg-white/80 text-zinc-600";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] ${tone}`}>
      {label}
      {removable ? (
        <button type="button" onClick={onRemove} className="rounded-full p-0.5 transition hover:bg-sky-100/80">
          <X size={10} />
        </button>
      ) : null}
    </span>
  );
}
