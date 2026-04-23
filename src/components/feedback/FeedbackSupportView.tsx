"use client";

import { FormEvent, useMemo, useState } from "react";
import { Download, Mail, MessageSquareText, QrCode, Users } from "lucide-react";
import {
  CuratorField,
  curatorInputClassName,
  curatorSelectClassName,
  curatorTextareaClassName,
} from "@/components/ui/curator-dialogs";
import { ArrowUpRight, Heart } from "lucide-react";
import { FEEDBACK_EMAIL, FEEDBACK_QQ_GROUP_ID, FEEDBACK_QR_CODE_PATH, type FeedbackSupportConfig, getDefaultFeedbackSupportConfig } from "@/lib/feedback";

const FEEDBACK_TYPE_OPTIONS = [
  { value: "bug", label: "Bug 报告" },
  { value: "idea", label: "功能建议" },
  { value: "experience", label: "体验反馈" },
  { value: "other", label: "其他" },
] as const;
const GITHUB_REPO_URL = "https://github.com/songshun1021/curator-ai-v3";

function parseFeedbackConfig(raw: string) {
  try {
    const parsed = JSON.parse(raw) as Partial<FeedbackSupportConfig>;
    return {
      config: {
        ...getDefaultFeedbackSupportConfig(),
        title: parsed.title?.trim() || getDefaultFeedbackSupportConfig().title,
        description: parsed.description?.trim() || getDefaultFeedbackSupportConfig().description,
        email: parsed.email?.trim() || FEEDBACK_EMAIL,
        qqGroupId: parsed.qqGroupId?.trim() || FEEDBACK_QQ_GROUP_ID,
        qrCodePath: parsed.qrCodePath?.trim() || FEEDBACK_QR_CODE_PATH,
      },
      parseError: "",
    };
  } catch {
    return {
      config: getDefaultFeedbackSupportConfig(),
      parseError: "当前反馈配置 JSON 格式有误，已回退到默认反馈信息展示。",
    };
  }
}

export function FeedbackSupportView({ path, raw }: { path: string; raw: string }) {
  const { config, parseError } = useMemo(() => parseFeedbackConfig(raw), [raw]);
  const [feedbackType, setFeedbackType] = useState<(typeof FEEDBACK_TYPE_OPTIONS)[number]["value"]>("bug");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setNotice(null);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: feedbackType,
          title,
          content,
          contact,
          sourcePath: path,
        }),
      });

      const result = (await response.json().catch(() => ({ message: "反馈提交失败，请稍后再试。" }))) as {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(result.message || "反馈提交失败，请稍后再试。");
      }

      setTitle("");
      setContent("");
      setContact("");
      setFeedbackType("bug");
      setNotice({ type: "success", text: result.message || "已收到，会优先查看。谢谢你的反馈。" });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "反馈提交失败，请稍后再试。",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="h-full overflow-auto">
      <div className="space-y-4 p-5">
        <div className="glass-panel relative overflow-hidden rounded-[24px] border border-white/85 bg-white/80 px-5 py-4 shadow-[0_22px_52px_rgba(15,23,42,0.08)]">
          <div className="pointer-events-none absolute inset-x-12 top-0 h-16 rounded-full bg-[radial-gradient(circle,rgba(191,219,254,0.38),transparent_72%)] blur-2xl" />
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">Support</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">{config.title}</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-600">扫码进群、发邮件，或直接在这里留一句反馈。</p>
            </div>

            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="glass-inline inline-flex w-fit items-center gap-2 self-start rounded-full border border-[rgba(186,200,220,0.44)] bg-white/82 px-3.5 py-2 text-xs font-medium text-zinc-600 shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-sky-200/80 hover:bg-white/90 hover:text-sky-700"
            >
              <Heart size={13} strokeWidth={1.9} />
              觉得不错，去 GitHub 支持
              <ArrowUpRight size={13} strokeWidth={1.9} />
            </a>
          </div>
        </div>

        {parseError ? (
          <div className="rounded-[20px] border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-800 shadow-[0_14px_28px_rgba(251,191,36,0.08)]">
            {parseError}
          </div>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)]">
          <div className="space-y-5">
            <section className="glass-subpanel relative overflow-hidden rounded-[24px] border border-white/88 bg-[linear-gradient(180deg,rgba(255,255,255,0.90),rgba(249,251,255,0.82))] px-5 py-5 shadow-[0_24px_48px_rgba(15,23,42,0.07)]">
              <div className="pointer-events-none absolute -right-10 top-0 h-24 w-24 rounded-full bg-[radial-gradient(circle,rgba(125,211,252,0.24),transparent_72%)] blur-2xl" />
              <div className="flex items-start gap-3">
                <div className="glass-inline flex h-10 w-10 items-center justify-center rounded-full border-white/75 bg-white/82 text-zinc-600">
                  <QrCode size={18} strokeWidth={1.8} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">QQ 群反馈</p>
                  <h3 className="mt-1 text-base font-semibold text-zinc-900">扫码加入反馈群</h3>
                  <p className="mt-1 text-sm leading-6 text-zinc-600">适合快速提问和集中交流。</p>
                </div>
              </div>

              <div className="mt-4 rounded-[24px] border border-[rgba(186,200,220,0.42)] bg-[linear-gradient(180deg,rgba(248,250,253,0.98),rgba(241,245,251,0.92))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_18px_34px_rgba(15,23,42,0.06)]">
                <img
                  src={config.qrCodePath}
                  alt={`QQ群 ${config.qqGroupId} 二维码`}
                  className="mx-auto w-full max-w-[320px] rounded-[20px] object-contain"
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(186,200,220,0.36)] bg-white/82 px-3 py-2 text-xs font-medium text-zinc-600 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                  <Users size={14} strokeWidth={1.8} />
                  群号：{config.qqGroupId}
                </span>
                <a
                  href={config.qrCodePath}
                  target="_blank"
                  rel="noreferrer"
                  className="curator-button-functional curator-button-sm"
                >
                  查看大图
                </a>
                <a
                  href={config.qrCodePath}
                  download="offerdesk-feedback-group.jpg"
                  className="curator-button-ghost curator-button-sm"
                >
                  <Download size={14} strokeWidth={1.8} />
                  保存二维码
                </a>
              </div>
            </section>

            <section className="glass-subpanel relative overflow-hidden rounded-[24px] border border-white/88 bg-[linear-gradient(180deg,rgba(255,255,255,0.90),rgba(249,251,255,0.82))] px-5 py-5 shadow-[0_24px_48px_rgba(15,23,42,0.07)]">
              <div className="pointer-events-none absolute -left-8 bottom-0 h-20 w-20 rounded-full bg-[radial-gradient(circle,rgba(216,180,254,0.18),transparent_72%)] blur-2xl" />
              <div className="flex items-start gap-3">
                <div className="glass-inline flex h-10 w-10 items-center justify-center rounded-full border-white/75 bg-white/82 text-zinc-600">
                  <Mail size={18} strokeWidth={1.8} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">邮箱反馈</p>
                  <h3 className="mt-1 text-base font-semibold text-zinc-900">{config.email}</h3>
                  <p className="mt-1 text-sm leading-6 text-zinc-600">适合长问题、截图和复现步骤。</p>
                </div>
              </div>
              <div className="mt-4">
                <a
                  href={`mailto:${config.email}?subject=${encodeURIComponent("Offerdesk 产品反馈")}`}
                  className="curator-button-functional curator-button-sm"
                >
                  写邮件给我
                </a>
              </div>
            </section>
          </div>

          <section className="glass-subpanel relative overflow-hidden rounded-[24px] border border-white/88 bg-[linear-gradient(180deg,rgba(255,255,255,0.90),rgba(249,251,255,0.82))] px-5 py-5 shadow-[0_24px_48px_rgba(15,23,42,0.07)]">
            <div className="pointer-events-none absolute right-0 top-0 h-24 w-28 rounded-full bg-[radial-gradient(circle,rgba(191,219,254,0.22),transparent_72%)] blur-2xl" />
            <div className="flex items-start gap-3">
              <div className="glass-inline flex h-10 w-10 items-center justify-center rounded-full border-white/75 bg-white/82 text-zinc-600">
                <MessageSquareText size={18} strokeWidth={1.8} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">站内反馈</p>
                <h3 className="mt-1 text-base font-semibold text-zinc-900">直接提交反馈</h3>
                <p className="mt-1 text-sm leading-6 text-zinc-600">不用跳出当前页面，我会优先查看。</p>
              </div>
            </div>

            <form className="mt-4 space-y-3.5" onSubmit={(event) => void handleSubmit(event)}>
              <CuratorField label="反馈类型">
                <select
                  className={curatorSelectClassName}
                  value={feedbackType}
                  onChange={(event) => setFeedbackType(event.target.value as (typeof FEEDBACK_TYPE_OPTIONS)[number]["value"])}
                >
                  {FEEDBACK_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </CuratorField>

              <CuratorField label="反馈标题" hint="一句话说明重点。">
                <input
                  className={curatorInputClassName}
                  value={title}
                  maxLength={80}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="例如：定制简历保存结果和预期不一致"
                />
              </CuratorField>

              <CuratorField label="反馈内容" hint="写清步骤、结果和你的预期。">
                <textarea
                  className={curatorTextareaClassName}
                  value={content}
                  maxLength={4000}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="你做了什么？出现了什么？你原本希望发生什么？"
                />
              </CuratorField>

              <CuratorField label="联系方式（可选）" hint="留邮箱、微信或 QQ 即可。">
                <input
                  className={curatorInputClassName}
                  value={contact}
                  maxLength={200}
                  onChange={(event) => setContact(event.target.value)}
                  placeholder="例如：2661843432@qq.com / 微信号 / QQ 号"
                />
              </CuratorField>

              {notice ? (
                <div
                  className={`rounded-[20px] border px-4 py-3 text-sm shadow-[0_14px_28px_rgba(15,23,42,0.06)] ${
                    notice.type === "success"
                      ? "border-emerald-200 bg-emerald-50/90 text-emerald-700"
                      : "border-rose-200 bg-rose-50/90 text-rose-700"
                  }`}
                >
                  {notice.text}
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-4 border-t border-[rgba(186,200,220,0.34)] pt-4">
                <p className="text-xs leading-6 text-zinc-500">提交后只保存在站点后台，默认不公开。</p>
                <button type="submit" className="curator-button-primary curator-button-sm shrink-0" disabled={submitting}>
                  {submitting ? "提交中..." : "提交反馈"}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
