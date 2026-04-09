"use client";

export function ContextBadge({ label, removable, onRemove }: { label: string; removable?: boolean; onRemove?: () => void }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${removable ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}>
      {label}
      {removable ? (
        <button type="button" onClick={onRemove} className="text-[10px]">
          x
        </button>
      ) : null}
    </span>
  );
}
