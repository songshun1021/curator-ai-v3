"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Copy,
  Gauge,
  LogOut,
  MessageSquareText,
  RefreshCcw,
  ShieldAlert,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  OpsCountBucket,
  OpsDashboardData,
  OpsDashboardRange,
  OpsFeedbackItem,
  OpsHealthCheck,
  OpsLogPayload,
  OpsLogSummary,
  OpsLogType,
  OpsMetricPoint,
  OpsProcessStatus,
} from "@/types";

const rangeOptions: Array<{ value: OpsDashboardRange; label: string }> = [
  { value: "today", label: "今天" },
  { value: "7d", label: "近 7 天" },
  { value: "30d", label: "近 30 天" },
];

function formatNumber(value: number) {
  return value.toLocaleString("zh-CN");
}

function formatCurrency(value: number) {
  return `¥${value.toFixed(2)}`;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatBytes(bytes: number | null) {
  if (typeof bytes !== "number" || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let current = bytes;
  let unitIndex = 0;
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }
  return `${current.toFixed(current >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatUptime(seconds: number | null) {
  if (typeof seconds !== "number" || seconds < 0) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`;
  return `${minutes} 分钟`;
}

function cardShellClassName(extra?: string) {
  return cn("glass-soft rounded-[20px] border border-white/75 bg-white/78 p-4", extra);
}

function StatusBadge({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "error" | "neutral";
  children: ReactNode;
}) {
  const toneClass =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : tone === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-zinc-200 bg-zinc-50 text-zinc-600";
  return <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium", toneClass)}>{children}</span>;
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Users;
}) {
  return (
    <div className={cardShellClassName()}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{value}</p>
          <p className="mt-2 text-xs leading-5 text-zinc-500">{hint}</p>
        </div>
        <div className="glass-inline flex h-10 w-10 items-center justify-center rounded-full border-white/80 bg-white/80 text-zinc-600">
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

function MiniBarChart({
  title,
  description,
  points,
  formatter = formatNumber,
}: {
  title: string;
  description: string;
  points: OpsMetricPoint[];
  formatter?: (value: number) => string;
}) {
  const maxValue = Math.max(...points.map((item) => item.value), 1);
  return (
    <div className={cardShellClassName("space-y-4")}>
      <div>
        <p className="text-sm font-semibold text-zinc-900">{title}</p>
        <p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {points.map((point) => (
          <div key={point.date} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>{point.label}</span>
              <span className="font-medium text-zinc-700">{formatter(point.value)}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,rgba(56,189,248,0.72),rgba(14,116,244,0.74))]"
                style={{ width: `${Math.max(8, (point.value / maxValue) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BucketList({
  title,
  description,
  buckets,
  emptyText,
}: {
  title: string;
  description: string;
  buckets: OpsCountBucket[];
  emptyText: string;
}) {
  return (
    <div className={cardShellClassName("space-y-4")}>
      <div>
        <p className="text-sm font-semibold text-zinc-900">{title}</p>
        <p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p>
      </div>
      {buckets.length === 0 ? (
        <p className="text-sm text-zinc-500">{emptyText}</p>
      ) : (
        <div className="space-y-3">
          {buckets.map((bucket) => (
            <div key={bucket.key} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-zinc-700">{bucket.label}</span>
                <span className="shrink-0 text-zinc-500">
                  {formatNumber(bucket.count)} · {formatPercent(bucket.share)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,rgba(125,211,252,0.7),rgba(59,130,246,0.72))]"
                  style={{ width: `${Math.max(8, bucket.share * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FeedbackList({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: OpsFeedbackItem[];
}) {
  return (
    <div className={cardShellClassName("space-y-4")}>
      <div>
        <p className="text-sm font-semibold text-zinc-900">{title}</p>
        <p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">当前时间范围内暂无反馈。</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-[var(--line-hair)] bg-white/72 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      tone={item.type === "bug" ? "error" : item.type === "idea" ? "ok" : item.type === "experience" ? "warn" : "neutral"}
                    >
                      {item.type}
                    </StatusBadge>
                    <span className="text-xs text-zinc-400">{formatDateTime(item.createdAt)}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-zinc-900">{item.title}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-zinc-600">{item.content}</p>
                  <p className="mt-2 text-xs text-zinc-400">
                    {item.sourcePath || "未记录来源"}
                    {item.contact ? ` · ${item.contact}` : ""}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProcessCard({ process }: { process: OpsProcessStatus | null }) {
  return (
    <div className={cardShellClassName("space-y-4")}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-900">PM2 进程状态</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">读取当前线上 `curator-ai` 进程状态，不包含危险操作。</p>
        </div>
        <StatusBadge tone={process?.status === "online" ? "ok" : process ? "warn" : "neutral"}>
          {process?.status || "未采集到"}
        </StatusBadge>
      </div>
      {!process ? (
        <p className="text-sm text-zinc-500">暂未采集到 PM2 进程状态，可能是本机开发环境没有 PM2。</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl border border-[var(--line-hair)] bg-white/72 p-3">
            <p className="text-xs text-zinc-400">进程名</p>
            <p className="mt-1 font-medium text-zinc-900">{process.name}</p>
          </div>
          <div className="rounded-2xl border border-[var(--line-hair)] bg-white/72 p-3">
            <p className="text-xs text-zinc-400">运行时长</p>
            <p className="mt-1 font-medium text-zinc-900">{formatUptime(process.uptimeSeconds)}</p>
          </div>
          <div className="rounded-2xl border border-[var(--line-hair)] bg-white/72 p-3">
            <p className="text-xs text-zinc-400">重启次数</p>
            <p className="mt-1 font-medium text-zinc-900">{process.restarts ?? "—"}</p>
          </div>
          <div className="rounded-2xl border border-[var(--line-hair)] bg-white/72 p-3">
            <p className="text-xs text-zinc-400">CPU / 内存</p>
            <p className="mt-1 font-medium text-zinc-900">
              {process.cpu ?? 0}% · {formatBytes(process.memoryBytes)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function HealthChecksCard({
  checks,
  blockedReason,
}: {
  checks: OpsHealthCheck[];
  blockedReason: string | null;
}) {
  return (
    <div className={cardShellClassName("space-y-4")}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-900">服务健康</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">关键接口探针与平台试用限制状态。</p>
        </div>
        <StatusBadge tone={blockedReason ? "warn" : "ok"}>{blockedReason ? "有额度限制" : "总体正常"}</StatusBadge>
      </div>
      <div className="space-y-3">
        {checks.map((item) => (
          <div key={item.key} className="rounded-2xl border border-[var(--line-hair)] bg-white/72 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-zinc-900">{item.label}</p>
                <p className="mt-1 text-xs text-zinc-500">{item.message}</p>
              </div>
              <StatusBadge tone={item.ok ? "ok" : "error"}>
                {item.ok ? "通过" : item.statusCode ? `HTTP ${item.statusCode}` : "失败"}
              </StatusBadge>
            </div>
            <p className="mt-2 text-xs text-zinc-400">
              {item.responseTimeMs !== null ? `${item.responseTimeMs} ms` : "—"} · {formatDateTime(item.checkedAt)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlatformCard({ data }: { data: OpsDashboardData["health"]["platform"] }) {
  return (
    <div className={cardShellClassName("space-y-4")}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-900">平台试用与预算</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">展示当前模型、思考模式、剩余额度与预算消耗。</p>
        </div>
        <StatusBadge tone={data.enabled ? "ok" : "warn"}>{data.enabled ? "可用" : "受限"}</StatusBadge>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl border border-[var(--line-hair)] bg-white/72 p-3">
          <p className="text-xs text-zinc-400">当前模型</p>
          <p className="mt-1 font-medium text-zinc-900">{data.provider} · {data.model}</p>
        </div>
        <div className="rounded-2xl border border-[var(--line-hair)] bg-white/72 p-3">
          <p className="text-xs text-zinc-400">思考模式</p>
          <p className="mt-1 font-medium text-zinc-900">
            {data.thinkingEnabled === null ? "未显式设置" : data.thinkingEnabled ? "开启" : "关闭"}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--line-hair)] bg-white/72 p-3">
          <p className="text-xs text-zinc-400">剩余输入 / 输出</p>
          <p className="mt-1 font-medium text-zinc-900">
            {data.remainingInputTokens !== null ? formatNumber(data.remainingInputTokens) : "—"} /{" "}
            {data.remainingOutputTokens !== null ? formatNumber(data.remainingOutputTokens) : "—"}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--line-hair)] bg-white/72 p-3">
          <p className="text-xs text-zinc-400">限制说明</p>
          <p className="mt-1 font-medium text-zinc-900">{data.blockedReason || "当前无阻断"}</p>
        </div>
      </div>

      <div className="space-y-3">
        {[
          {
            label: "今日预算",
            cost: data.budget.todayCostCny,
            budget: data.budget.dailyBudgetCny,
            ratio: data.budget.dailyUsageRatio,
          },
          {
            label: "本月预算",
            cost: data.budget.monthCostCny,
            budget: data.budget.monthlyBudgetCny,
            ratio: data.budget.monthlyUsageRatio,
          },
        ].map((item) => (
          <div key={item.label} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-zinc-500">{item.label}</span>
              <span className="font-medium text-zinc-700">
                {formatCurrency(item.cost)} / {formatCurrency(item.budget)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
              <div
                className={cn(
                  "h-full rounded-full",
                  (item.ratio ?? 0) >= 0.9
                    ? "bg-[linear-gradient(90deg,rgba(251,146,60,0.8),rgba(239,68,68,0.8))]"
                    : "bg-[linear-gradient(90deg,rgba(134,239,172,0.8),rgba(59,130,246,0.75))]",
                )}
                style={{ width: `${Math.max(4, Math.min(100, (item.ratio ?? 0) * 100))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorSummaryCard({
  summary,
  onExpand,
  expandedContent,
  loading,
  error,
  onCopy,
}: {
  summary: OpsLogSummary;
  onExpand: () => void;
  expandedContent: string | null;
  loading: boolean;
  error: string | null;
  onCopy: () => void;
}) {
  const tone = summary.status === "ok" ? (summary.errorCount > 0 ? "warn" : "neutral") : summary.status === "error" ? "error" : "neutral";
  return (
    <div className={cardShellClassName("space-y-4")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-900">{summary.label}</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">{summary.summary}</p>
        </div>
        <StatusBadge tone={tone}>{summary.status}</StatusBadge>
      </div>
      <div className="rounded-2xl border border-[var(--line-hair)] bg-white/72 p-3">
        <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
          <span>
            最近 {summary.lineCount} 行 · error {summary.errorCount} · warn {summary.warnCount}
          </span>
          <span>{formatDateTime(summary.updatedAt)}</span>
        </div>
        {summary.preview ? (
          <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap rounded-xl bg-zinc-950/95 p-3 text-[11px] leading-5 text-zinc-100 soft-scrollbar">
            {summary.preview}
          </pre>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">暂无日志预览。</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="curator-button-functional curator-button-sm" onClick={onExpand} disabled={loading}>
          {loading ? "加载中..." : expandedContent ? "重新加载全文" : "展开全文"}
        </button>
        <button
          type="button"
          className="curator-button-secondary curator-button-sm"
          onClick={onCopy}
          disabled={!expandedContent && !summary.preview}
        >
          <Copy size={14} />
          复制
        </button>
      </div>
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
      {expandedContent ? (
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-zinc-950/95 p-3 text-[11px] leading-5 text-zinc-100 soft-scrollbar">
          {expandedContent}
        </pre>
      ) : null}
    </div>
  );
}

function LoginCard() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/ops/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = (await response.json().catch(() => ({ message: "后台登录失败。" }))) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message || "后台登录失败。");
      }
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "后台登录失败。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="glass-panel mx-auto w-full max-w-md border-white/70 bg-white/78 p-8">
      <div className="mb-6 space-y-2 text-center">
        <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-400">Internal Ops</p>
        <h1 className="text-2xl font-semibold text-zinc-900">管理后台登录</h1>
        <p className="text-sm leading-6 text-zinc-500">这是内部只读看板入口，不对普通用户暴露。请输入后台口令继续。</p>
      </div>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="curator-input-surface h-11 w-full px-4 text-sm"
          placeholder="请输入后台口令"
          autoFocus
        />
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <button type="submit" className="curator-button-primary h-11 w-full text-sm" disabled={loading}>
          {loading ? "登录中..." : "进入后台"}
        </button>
      </form>
    </div>
  );
}

function UnconfiguredCard() {
  return (
    <div className="glass-panel mx-auto w-full max-w-2xl border-white/70 bg-white/78 p-8">
      <div className="flex items-start gap-4">
        <div className="glass-inline flex h-11 w-11 items-center justify-center rounded-full border-white/80 bg-white/80 text-amber-600">
          <ShieldAlert size={20} />
        </div>
        <div className="space-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-400">Internal Ops</p>
            <h1 className="mt-1 text-2xl font-semibold text-zinc-900">后台尚未完成配置</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              需要先在服务端环境变量中配置后台口令哈希和会话密钥，当前不会允许直接进入。
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--line-hair)] bg-white/76 p-4">
            <p className="text-sm font-medium text-zinc-900">至少需要这两个环境变量</p>
            <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-zinc-950/95 p-3 text-[11px] leading-5 text-zinc-100">
{`OPS_DASHBOARD_PASSWORD_HASH=sha256:...
OPS_DASHBOARD_SESSION_SECRET=请填写一串随机长密钥`}
            </pre>
          </div>
          <div className="rounded-2xl border border-[var(--line-hair)] bg-white/76 p-4">
            <p className="text-sm font-medium text-zinc-900">生成口令哈希（建议）</p>
            <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-zinc-950/95 p-3 text-[11px] leading-5 text-zinc-100">
{`pnpm ops:hash-password 你的后台口令`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function copyText(text: string) {
  return navigator.clipboard.writeText(text);
}

function DashboardView() {
  const [range, setRange] = useState<OpsDashboardRange>("7d");
  const [data, setData] = useState<OpsDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [logPayloads, setLogPayloads] = useState<Partial<Record<OpsLogType, OpsLogPayload>>>({});
  const [logLoading, setLogLoading] = useState<Partial<Record<OpsLogType, boolean>>>({});
  const [logErrors, setLogErrors] = useState<Partial<Record<OpsLogType, string>>>({});

  async function loadDashboard(nextRange: OpsDashboardRange) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/ops/dashboard?range=${nextRange}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({ message: "后台数据加载失败。" }))) as
        | OpsDashboardData
        | { message?: string };
      if (!response.ok) {
        throw new Error("message" in payload ? payload.message || "后台数据加载失败。" : "后台数据加载失败。");
      }
      setData(payload as OpsDashboardData);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "后台数据加载失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard(range);
  }, [range]);

  async function loadLog(type: OpsLogType) {
    setLogLoading((current) => ({ ...current, [type]: true }));
    setLogErrors((current) => ({ ...current, [type]: "" }));
    try {
      const response = await fetch(`/api/ops/logs?type=${type}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({ message: "日志加载失败。" }))) as
        | OpsLogPayload
        | { message?: string };
      if (!response.ok) {
        throw new Error("message" in payload ? payload.message || "日志加载失败。" : "日志加载失败。");
      }
      setLogPayloads((current) => ({ ...current, [type]: payload as OpsLogPayload }));
    } catch (reason) {
      setLogErrors((current) => ({
        ...current,
        [type]: reason instanceof Error ? reason.message : "日志加载失败。",
      }));
    } finally {
      setLogLoading((current) => ({ ...current, [type]: false }));
    }
  }

  async function logout() {
    setLogoutLoading(true);
    try {
      await fetch("/api/ops/auth/logout", { method: "POST" });
      window.location.reload();
    } finally {
      setLogoutLoading(false);
    }
  }

  const modelCountDescription = useMemo(() => {
    if (!data) return "";
    return data.usage.byModel.some((item) => item.key === "未记录（旧数据）")
      ? "旧的 trial ledger 事件没有单独记录模型名，新事件会逐步补齐。"
      : "按服务端试用账本中的模型字段聚合。";
  }, [data]);

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-5 sm:px-6">
      <div className="glass-panel flex flex-col gap-4 border-white/70 bg-white/78 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-400">Curator Internal Ops</p>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-900">运营与运维后台</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            聚合用户量、模型调用、用户反馈，以及服务健康、错误日志与平台预算状态。
          </p>
          <p className="mt-2 text-xs text-zinc-400">
            {data?.generatedAt ? `上次刷新：${formatDateTime(data.generatedAt)} · ${data.timezone}` : "正在加载数据..."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full border border-white/80 bg-white/70 p-1">
            {rangeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition",
                  range === option.value ? "bg-sky-500 text-white shadow-sm" : "text-zinc-500 hover:bg-white hover:text-zinc-800",
                )}
                onClick={() => setRange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button type="button" className="curator-button-functional curator-button-sm" onClick={() => void loadDashboard(range)} disabled={loading}>
            <RefreshCcw size={14} className={loading ? "animate-spin" : ""} />
            刷新
          </button>
          <button type="button" className="curator-button-secondary curator-button-sm" onClick={() => void logout()} disabled={logoutLoading}>
            <LogOut size={14} />
            {logoutLoading ? "退出中..." : "退出"}
          </button>
        </div>
      </div>

      {error ? (
        <div className={cardShellClassName("border-rose-200 bg-rose-50/80")}>
          <p className="text-sm font-medium text-rose-700">{error}</p>
        </div>
      ) : null}

      {loading && !data ? (
        <div className={cardShellClassName("flex items-center gap-3")}>
          <RefreshCcw size={16} className="animate-spin text-zinc-500" />
          <span className="text-sm text-zinc-500">正在加载后台数据...</span>
        </div>
      ) : null}

      {data ? (
        <>
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="今日用户量" value={formatNumber(data.overview.todayUsers)} hint="当天发起过至少一次 AI 请求的唯一用户数。" icon={Users} />
            <StatCard label="今日模型调用" value={formatNumber(data.overview.todayRequests)} hint="当天平台试用账本中的总事件条数。" icon={Activity} />
            <StatCard label="今日反馈数" value={formatNumber(data.overview.todayFeedbackCount)} hint="当天新提交的用户反馈数量。" icon={MessageSquareText} />
            <StatCard label="今日预估成本" value={formatCurrency(data.overview.todayCostCny)} hint="按账本 cost_cny 聚合的当天估算成本。" icon={Gauge} />
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <MiniBarChart title="用户趋势" description="按天统计唯一 trial 用户数。" points={data.usage.dailyUsers} />
            <MiniBarChart title="调用趋势" description="按天统计平台试用事件条数。" points={data.usage.dailyRequests} />
            <MiniBarChart title="成本趋势" description="按天聚合账本中的估算成本。" points={data.usage.dailyCostCny} formatter={formatCurrency} />
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <BucketList title="调用场景分布" description="按 context 聚合，能看出生成、建议、导入等入口的占比。" buckets={data.usage.byContext} emptyText="当前时间范围内暂无调用记录。" />
            <BucketList title="模型分布" description={modelCountDescription} buckets={data.usage.byModel} emptyText="当前时间范围内暂无模型记录。" />
            <BucketList title="反馈类型分布" description={`当前范围内共有 ${formatNumber(data.feedback.rangeCount)} 条反馈。`} buckets={data.feedback.byType} emptyText="当前时间范围内暂无反馈。" />
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
            <FeedbackList title="最新反馈" description="内部后台只读展示用户最近提交的反馈内容。" items={data.feedback.recent} />
            <div className="grid grid-cols-1 gap-4">
              <ProcessCard process={data.health.process} />
              <PlatformCard data={data.health.platform} />
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <HealthChecksCard checks={data.health.checks} blockedReason={data.health.platform.blockedReason} />
            <div className={cardShellClassName("space-y-4")}>
              <div>
                <p className="text-sm font-semibold text-zinc-900">最近 24h 访问健康</p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">从 Nginx access log 中抽样统计 4xx / 5xx 响应。</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-[var(--line-hair)] bg-white/72 p-3">
                  <p className="text-xs text-zinc-400">4xx</p>
                  <p className="mt-1 text-xl font-semibold text-zinc-900">{formatNumber(data.health.access.recent4xx)}</p>
                </div>
                <div className="rounded-2xl border border-[var(--line-hair)] bg-white/72 p-3">
                  <p className="text-xs text-zinc-400">5xx</p>
                  <p className="mt-1 text-xl font-semibold text-zinc-900">{formatNumber(data.health.access.recent5xx)}</p>
                </div>
              </div>
              <p className="text-xs text-zinc-500">
                状态：{data.health.access.status} · 样本行数 {formatNumber(data.health.access.sampledLines)}
              </p>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {([
              { key: "pm2-error", summary: data.errors.pm2Error },
              { key: "nginx-error", summary: data.errors.nginxError },
              { key: "nginx-access", summary: data.errors.nginxAccess },
            ] as Array<{ key: OpsLogType; summary: OpsLogSummary }>).map((item) => (
              <ErrorSummaryCard
                key={item.key}
                summary={item.summary}
                onExpand={() => void loadLog(item.key)}
                expandedContent={logPayloads[item.key]?.content ?? null}
                loading={Boolean(logLoading[item.key])}
                error={logErrors[item.key] ?? null}
                onCopy={() =>
                  void copyText(logPayloads[item.key]?.content || item.summary.preview || "").catch(() => undefined)
                }
              />
            ))}
          </section>

          <section className={cardShellClassName("space-y-4")}>
            <div>
              <p className="text-sm font-semibold text-zinc-900">最近问题信号</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">优先展示 bug / 体验类反馈，帮助快速感知线上问题。</p>
            </div>
            {data.errors.feedbackIssues.length === 0 ? (
              <p className="text-sm text-zinc-500">最近没有明显的问题类反馈。</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {data.errors.feedbackIssues.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-[var(--line-hair)] bg-white/72 p-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={14} className="text-amber-500" />
                      <p className="text-sm font-medium text-zinc-900">{item.title}</p>
                    </div>
                    <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-zinc-600">{item.content}</p>
                    <p className="mt-2 text-xs text-zinc-400">{formatDateTime(item.createdAt)} · {item.type}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

export function OpsDashboardApp({
  configured,
  authenticated,
}: {
  configured: boolean;
  authenticated: boolean;
}) {
  return (
    <main className="h-screen overflow-auto bg-[#f5f5f2] text-zinc-900 soft-scrollbar">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-white/55 via-white/18 to-transparent" />
      </div>
      <div className="relative min-h-screen px-4 py-6 sm:px-6">
        {!configured ? <UnconfiguredCard /> : authenticated ? <DashboardView /> : <LoginCard />}
      </div>
    </main>
  );
}
