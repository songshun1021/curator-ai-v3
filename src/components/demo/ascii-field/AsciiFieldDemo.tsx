"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import {
  ASCII_FIELD_PRESETS,
  ASCII_FIELD_PRESET_MAP,
  AsciiFieldPresetId,
} from "@/components/demo/ascii-field/ascii-field-presets";
import { useAsciiField } from "@/components/demo/ascii-field/useAsciiField";

function SegmentedPresetPicker({
  activePresetId,
  onSelect,
}: {
  activePresetId: AsciiFieldPresetId;
  onSelect: (presetId: AsciiFieldPresetId) => void;
}) {
  return (
    <div className="glass-soft flex flex-wrap items-center gap-2 border-white/65 p-2">
      {ASCII_FIELD_PRESETS.map((preset) => {
        const active = preset.id === activePresetId;
        return (
          <button
            key={preset.id}
            type="button"
            className={`rounded-full px-3 py-2 text-xs font-medium transition-colors duration-[var(--dur-fast)] ${
              active
                ? `glass-inline ${preset.accentClassName}`
                : "text-zinc-500 hover:bg-white/70 hover:text-zinc-800"
            }`}
            onClick={() => onSelect(preset.id)}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}

function FieldCanvas({ presetId }: { presetId: AsciiFieldPresetId }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const preset = ASCII_FIELD_PRESET_MAP[presetId];

  useAsciiField(canvasRef, preset);

  return (
    <div className="glass-subpanel relative min-h-[320px] overflow-hidden border-white/70 bg-white/72 p-3 md:min-h-[560px]">
      <div className="pointer-events-none absolute inset-x-6 top-5 z-10 flex items-center justify-between">
        <span className={`glass-inline px-3 py-1 text-[11px] uppercase tracking-[0.22em] ${preset.accentClassName}`}>
          {preset.eyebrow}
        </span>
        <span className="glass-inline border-[var(--line-hair)] px-3 py-1 text-[11px] tracking-[0.18em] text-zinc-500">
          ASCII Field Demo
        </span>
      </div>

      <div className="h-full min-h-[296px] rounded-[18px] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.82)_0%,rgba(247,249,253,0.68)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.88),inset_0_-1px_0_rgba(15,23,42,0.03)] md:min-h-[536px]">
        <canvas ref={canvasRef} className="block h-full w-full" aria-label={`${preset.label} ASCII 交互场`} />
      </div>
    </div>
  );
}

export function AsciiFieldDemo() {
  const [activePresetId, setActivePresetId] = useState<AsciiFieldPresetId>("career");
  const activePreset = ASCII_FIELD_PRESET_MAP[activePresetId];

  const comparisonNote = useMemo(() => {
    if (activePresetId === "growth") {
      return "这一版更适合解释 Curator 的长期价值，而不是承担首屏拉新。";
    }

    if (activePresetId === "workspace") {
      return "这一版最稳，但品牌情绪最弱，更像结构表达而不是情绪表达。";
    }

    return "这一版最接近“让用户一眼理解 Curator 在替他组织什么”。";
  }, [activePresetId]);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[var(--bg-canvas)] px-3 py-3 text-[var(--text-body)]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-white/55 via-white/18 to-transparent" />
      </div>

      <div className="glass-panel relative mx-auto flex min-h-[calc(100vh-24px)] w-full max-w-[1440px] flex-col overflow-hidden border-white/60 bg-white/70">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/60 px-5 py-4 md:px-6">
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-zinc-400">Experiment</div>
            <h1 className="mt-1 text-lg font-semibold text-[var(--text-title)] md:text-xl">ASCII 交互场 Demo</h1>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/" className="curator-button-ghost curator-button-sm">
              <ArrowLeft size={14} />
              返回工作台
            </Link>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[360px_minmax(0,1fr)] lg:p-4">
          <section className="glass-subpanel flex min-h-0 flex-col border-white/65 bg-white/72 p-4 md:p-5">
            <SegmentedPresetPicker activePresetId={activePresetId} onSelect={setActivePresetId} />

            <div className="mt-5">
              <div className={`inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${activePreset.accentClassName}`}>
                {activePreset.eyebrow}
              </div>
              <h2 className="mt-3 text-[26px] font-semibold leading-[1.2] tracking-[-0.02em] text-[var(--text-title)]">
                {activePreset.label}
              </h2>
              <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">{activePreset.description}</p>
            </div>

            <div className="glass-soft mt-5 border-white/60 bg-white/76 p-4">
              <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">产品含义</div>
              <div className="mt-2 text-sm font-semibold text-[var(--text-title)]">{activePreset.narrativeTitle}</div>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{activePreset.narrativeBody}</p>
            </div>

            <div className="mt-4 grid gap-3">
              <article className="glass-soft border-white/60 bg-white/74 p-4">
                <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">适合放哪</div>
                <p className="mt-2 text-sm leading-6 text-[var(--text-body)]">{activePreset.goodFit}</p>
              </article>
              <article className="glass-soft border-white/60 bg-white/74 p-4">
                <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">不适合放哪</div>
                <p className="mt-2 text-sm leading-6 text-[var(--text-body)]">{activePreset.badFit}</p>
              </article>
            </div>

            <div className="mt-4 rounded-[16px] border border-[var(--line-hair)] bg-[rgba(255,255,255,0.62)] px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="glass-inline mt-0.5 flex h-7 w-7 items-center justify-center border-[rgba(0,122,255,0.14)] bg-[rgba(0,122,255,0.08)] text-[var(--color-primary)]">
                  <Sparkles size={14} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--text-title)]">{activePreset.ambientNote}</div>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{comparisonNote}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="flex min-h-0 flex-col gap-3">
            <FieldCanvas presetId={activePresetId} />

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="glass-soft border-white/65 bg-white/74 px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">说明</div>
                <p className="mt-2 text-sm leading-6 text-[var(--text-body)]">
                  这是独立实验页，只用来验证“ASCII 交互场是否能成为 Curator 的品牌氛围层和能力隐喻层”。
                  它不进入首页主链路，也不会替代当前工作台的信息结构。
                </p>
              </div>

              <div className="glass-soft flex items-center justify-between gap-3 border-white/65 bg-white/74 px-4 py-4 md:min-w-[280px]">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">结论方向</div>
                  <div className="mt-2 text-sm font-medium text-[var(--text-title)]">若只保留一版，优先继续收敛职业引力场</div>
                </div>
                <ArrowRight size={16} className="shrink-0 text-[var(--color-primary)]" />
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
