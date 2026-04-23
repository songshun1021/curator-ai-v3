export type AsciiFieldPresetId = "career" | "growth" | "workspace";

export type AsciiFieldPhysics = {
  repelRadius: number;
  repelForce: number;
  spring: number;
  friction: number;
  rippleSpeed: number;
  rippleForce: number;
};

export type AsciiFieldPreset = {
  id: AsciiFieldPresetId;
  label: string;
  description: string;
  glyphs: string[];
  accentClassName: string;
  physics: AsciiFieldPhysics;
  eyebrow: string;
  narrativeTitle: string;
  narrativeBody: string;
  goodFit: string;
  badFit: string;
  ambientNote: string;
};

export const ASCII_FIELD_PRESETS: AsciiFieldPreset[] = [
  {
    id: "career",
    label: "职业引力场",
    description: "把 JD 关键词、简历证据和投递动作可视化成一个被牵引和重组的场。",
    glyphs: ["J", "D", "S", "T", "A", "R", "+", ">", "#", "%", "/"],
    accentClassName:
      "border-[rgba(0,122,255,0.18)] bg-[rgba(0,122,255,0.08)] text-[var(--color-primary)]",
    physics: {
      repelRadius: 88,
      repelForce: 0.9,
      spring: 0.038,
      friction: 0.86,
      rippleSpeed: 2.6,
      rippleForce: 1.25,
    },
    eyebrow: "Recommended",
    narrativeTitle: "岗位关键词、经历证据、行动路径在这里重新对齐。",
    narrativeBody:
      "这版最贴近 Curator 的主链路。用户不是在看抽象粒子，而是在看自己如何从一份简历、一段 JD，走向更清楚的下一步。",
    goodFit: "适合做独立实验页、品牌展示页，或 onboarding 中的短时氛围插页。",
    badFit: "不适合变成工作台常驻动态背景，否则会和文件、编辑、对话争夺注意力。",
    ambientNote: "默认推荐方向，偏产品蓝，强调“把投递这件事组织清楚”。",
  },
  {
    id: "growth",
    label: "成长记忆场",
    description: "把复盘里的问题、盲区和行动项变成会留下回响的记忆纹理。",
    glyphs: ["M", "R", "V", "?", "!", "+", "~", "*"],
    accentClassName:
      "border-[rgba(90,102,140,0.18)] bg-[rgba(90,102,140,0.08)] text-[var(--text-body)]",
    physics: {
      repelRadius: 72,
      repelForce: 0.56,
      spring: 0.046,
      friction: 0.88,
      rippleSpeed: 2.1,
      rippleForce: 1.6,
    },
    eyebrow: "Reflection",
    narrativeTitle: "每次复盘不会消失，而是留下下一轮准备的回声。",
    narrativeBody:
      "这版更像一张被持续修正的能力地图。它适合解释 Curator 为什么不是一次性生成器，而是会越用越懂你的求职工作台。",
    goodFit: "适合放在成长画像、复盘后完成态、或产品故事页里做二层表达。",
    badFit: "不适合承担首屏主视觉，因为它的情绪偏内省，不够直接引导新用户理解主价值。",
    ambientNote: "波纹权重大于排斥，强调“问题被看见后，会继续影响下一次准备”。",
  },
  {
    id: "workspace",
    label: "智能工作台",
    description: "把文件、对话、生成与上下文组织成一个更理性的 ASCII 网格界面。",
    glyphs: ["[", "]", "{", "}", "/", "\\", "|", "<", ">", "_", "=", "+"],
    accentClassName:
      "border-[rgba(15,23,42,0.12)] bg-[rgba(15,23,42,0.05)] text-[var(--text-body)]",
    physics: {
      repelRadius: 64,
      repelForce: 0.44,
      spring: 0.058,
      friction: 0.9,
      rippleSpeed: 1.8,
      rippleForce: 0.95,
    },
    eyebrow: "Structure",
    narrativeTitle: "不是炫技动效，而是把工作台的秩序感提前显露出来。",
    narrativeBody:
      "这版最理性。字符和位移都更收敛，像在提示用户：Curator 的价值不是替你热闹，而是替你把文件、上下文和行动串起来。",
    goodFit: "适合做 docs 封面、空态背景，或产品发布页里的结构型视觉元素。",
    badFit: "不适合单独承担品牌情绪层，因为它的情绪更稳，戏剧性最弱。",
    ambientNote: "位移最小、网格感最强，更像一个有秩序的 AI 工作台。",
  },
];

export const ASCII_FIELD_PRESET_MAP: Record<AsciiFieldPresetId, AsciiFieldPreset> =
  ASCII_FIELD_PRESETS.reduce(
    (accumulator, preset) => {
      accumulator[preset.id] = preset;
      return accumulator;
    },
    {} as Record<AsciiFieldPresetId, AsciiFieldPreset>,
  );
