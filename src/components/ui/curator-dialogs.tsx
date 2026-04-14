"use client";

import { type ReactNode, useEffect, useRef } from "react";

export type CuratorMenuItem = {
  label: string;
  onSelect?: () => void;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
};

type CuratorContextMenuProps = {
  open: boolean;
  position: { x: number; y: number };
  items: CuratorMenuItem[];
  onClose: () => void;
};

export function CuratorContextMenu({ open, position, items, onClose }: CuratorContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-[90] min-w-[196px] overflow-hidden rounded-2xl border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,250,252,0.88))] p-1.5 shadow-[0_22px_56px_rgba(15,23,42,0.16)] backdrop-blur-2xl"
      style={{ left: position.x, top: position.y }}
    >
      {items.map((item, index) =>
        item.separator ? (
          <div key={`separator-${index}`} className="my-1 h-px bg-zinc-200" />
        ) : (
          <button
            key={`${item.label}-${index}`}
            type="button"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              onClose();
              item.onSelect?.();
            }}
            className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-sm transition ${
              item.disabled
                ? "cursor-not-allowed text-zinc-300"
                : item.danger
                  ? "bg-[linear-gradient(180deg,rgba(254,242,242,0.96),rgba(255,228,230,0.88))] text-rose-700 shadow-[0_10px_24px_rgba(244,63,94,0.1)] hover:bg-[linear-gradient(180deg,rgba(255,228,230,0.98),rgba(254,205,211,0.92))]"
                  : "bg-[linear-gradient(180deg,rgba(239,246,255,0.92),rgba(255,255,255,0.84))] text-zinc-800 shadow-[0_10px_24px_rgba(59,130,246,0.08)] hover:bg-[linear-gradient(180deg,rgba(219,234,254,0.96),rgba(255,255,255,0.9))]"
            }`}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}

type CuratorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  widthClassName?: string;
};

export function CuratorDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  widthClassName = "max-w-lg",
}: CuratorDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(15,23,42,0.22)] px-4 backdrop-blur-[6px]">
      <button type="button" className="absolute inset-0 cursor-default" onClick={() => onOpenChange(false)} aria-label="关闭弹窗" />
      <div
        className={`glass-panel relative z-10 w-full ${widthClassName} overflow-hidden p-5`}
      >
        <div className="pointer-events-none absolute inset-x-10 top-0 h-20 rounded-full bg-[radial-gradient(circle,rgba(191,219,254,0.52),transparent_72%)] blur-2xl" />
        <div className="relative mb-4 space-y-1.5">
          <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
          {description ? <p className="text-sm leading-6 text-zinc-700">{description}</p> : null}
        </div>
        <div className="relative space-y-4">{children}</div>
        {footer ? <div className="relative mt-5 flex flex-wrap justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}

type CuratorNoticeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
};

export function CuratorNoticeDialog({ open, onOpenChange, title, description }: CuratorNoticeDialogProps) {
  return (
    <CuratorDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      widthClassName="max-w-md"
      footer={
        <button
          type="button"
          className="curator-button-secondary"
          onClick={() => onOpenChange(false)}
        >
          知道了
        </button>
      }
    >
      <div />
    </CuratorDialog>
  );
}

type CuratorConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmTone?: "default" | "danger";
  onConfirm: () => void | Promise<void>;
};

export function CuratorConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  confirmTone = "default",
  onConfirm,
}: CuratorConfirmDialogProps) {
  return (
    <CuratorDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      widthClassName="max-w-md"
      footer={
        <>
          <button
            type="button"
            className="curator-button-secondary"
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={confirmTone === "danger" ? "curator-button-danger" : "curator-button-primary"}
            onClick={() => void onConfirm()}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div />
    </CuratorDialog>
  );
}

export function CuratorField({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-zinc-700">{label}</span>
      {children}
      {hint ? <span className="block text-xs leading-5 text-zinc-600">{hint}</span> : null}
    </label>
  );
}

export const curatorInputClassName =
  "curator-input-surface w-full px-3 py-2 text-sm";

export const curatorTextareaClassName = `${curatorInputClassName} min-h-[140px] resize-y`;

export const curatorSelectClassName = curatorInputClassName;
