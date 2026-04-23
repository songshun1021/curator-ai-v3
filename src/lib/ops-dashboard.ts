import "server-only";

import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { getOpsDashboardTimezone } from "@/lib/ops-auth";
import { getPlatformTrialConfig, getTrialStatus } from "@/lib/trial-ledger";
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

const execFile = promisify(execFileCallback);
const RANGE_DAYS: Record<OpsDashboardRange, number> = {
  today: 1,
  "7d": 7,
  "30d": 30,
};

type TrialEventRow = {
  id: string;
  trial_id: string;
  timestamp: string;
  context: string;
  label: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_chars: number;
  output_chars: number;
  ip_hash: string;
  cost_cny: number;
  provider?: string;
  model?: string;
};

type TrialLedger = {
  trialUsers?: Record<string, unknown>;
  trialEvents?: TrialEventRow[];
  ipRateLimits?: Array<Record<string, unknown>>;
};

type FeedbackRecord = OpsFeedbackItem & {
  host?: string;
  ipHash?: string;
  userAgent?: string;
};

type AccessSummary = {
  status: "ok" | "unavailable" | "error";
  recent4xx: number;
  recent5xx: number;
  sampledLines: number;
};

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function parseBooleanEnv(name: string) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

function getTrialLedgerPath() {
  return process.env.TRIAL_LEDGER_PATH?.trim() || path.join(process.cwd(), "data", "trial-ledger.json");
}

function getFeedbackFilePath() {
  return process.env.FEEDBACK_SUBMISSIONS_PATH?.trim() || path.join(process.cwd(), "data", "feedback-submissions.jsonl");
}

function getPm2ProcessName() {
  return process.env.OPS_DASHBOARD_PM2_PROCESS?.trim() || "curator-ai";
}

function getHealthBaseUrl() {
  const port = process.env.PORT?.trim() || "3000";
  return `http://127.0.0.1:${port}`;
}

function getNginxErrorLogCandidates() {
  return [
    process.env.OPS_DASHBOARD_NGINX_ERROR_LOG?.trim(),
    "/www/wwwlogs/offerdesk.cn.error.log",
    "/www/wwwlogs/8.217.176.253.error.log",
    "/www/wwwlogs/error.log",
  ].filter(Boolean) as string[];
}

function getNginxAccessLogCandidates() {
  return [
    process.env.OPS_DASHBOARD_NGINX_ACCESS_LOG?.trim(),
    "/www/wwwlogs/offerdesk.cn.log",
    "/www/wwwlogs/8.217.176.253.log",
    "/www/wwwlogs/access.log",
  ].filter(Boolean) as string[];
}

function getPm2ErrorLogCandidates() {
  const processName = getPm2ProcessName();
  return [
    process.env.OPS_DASHBOARD_PM2_ERROR_LOG?.trim(),
    path.join(os.homedir(), ".pm2", "logs", `${processName}-error.log`),
  ].filter(Boolean) as string[];
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveFirstExistingPath(candidates: string[]) {
  for (const candidate of candidates) {
    if (candidate && (await fileExists(candidate))) return candidate;
  }
  return null;
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

async function readJsonLines<T>(filePath: string): Promise<T[]> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as T];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

async function readTailText(filePath: string, maxBytes = 180_000) {
  const handle = await fs.open(filePath, "r");
  try {
    const stat = await handle.stat();
    const start = Math.max(0, stat.size - maxBytes);
    const buffer = Buffer.alloc(stat.size - start);
    await handle.read(buffer, 0, buffer.length, start);
    return buffer.toString("utf8");
  } finally {
    await handle.close();
  }
}

function getDateParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return {
    key: `${year}-${month}-${day}`,
    label: `${month}/${day}`,
  };
}

function toTimeZoneDayKey(value: string | Date, timezone: string) {
  const date = value instanceof Date ? value : new Date(value);
  return getDateParts(date, timezone).key;
}

function buildRangeKeys(range: OpsDashboardRange, timezone: string) {
  const days = RANGE_DAYS[range];
  const keys: Array<{ key: string; label: string }> = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    keys.push(getDateParts(date, timezone));
  }
  return keys;
}

function asMetricSeries(
  keys: Array<{ key: string; label: string }>,
  source: Map<string, number>,
): OpsMetricPoint[] {
  return keys.map((item) => ({
    date: item.key,
    label: item.label,
    value: source.get(item.key) ?? 0,
  }));
}

function toBuckets(source: Map<string, number>, labelMap?: Record<string, string>) {
  const total = Array.from(source.values()).reduce((sum, value) => sum + value, 0);
  const rows: OpsCountBucket[] = Array.from(source.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({
      key,
      label: labelMap?.[key] ?? key,
      count,
      share: total > 0 ? count / total : 0,
    }));
  return rows;
}

async function runCommand(command: string, args: string[]) {
  try {
    const result = await execFile(command, args, {
      timeout: 8_000,
      maxBuffer: 1024 * 1024 * 4,
      windowsHide: true,
    });
    return { ok: true as const, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      ok: false as const,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error ?? ""),
    };
  }
}

async function getPm2ProcessStatus(): Promise<OpsProcessStatus | null> {
  const shellCommand =
    process.platform === "win32"
      ? { command: "cmd", args: ["/c", "pm2 jlist"] }
      : { command: "/bin/sh", args: ["-lc", "pm2 jlist"] };
  const result = await runCommand(shellCommand.command, shellCommand.args);
  if (!result.ok || !result.stdout.trim()) return null;

  try {
    const items = JSON.parse(result.stdout) as Array<Record<string, any>>;
    const processName = getPm2ProcessName();
    const entry = items.find((item) => item.name === processName) ?? items[0];
    if (!entry) return null;

    const startedAt = typeof entry.pm2_env?.pm_uptime === "number" ? entry.pm2_env.pm_uptime : null;
    const uptimeSeconds = startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : null;

    return {
      name: String(entry.name ?? processName),
      status: String(entry.pm2_env?.status ?? "unknown"),
      uptimeSeconds,
      restarts: typeof entry.pm2_env?.restart_time === "number" ? entry.pm2_env.restart_time : null,
      cpu: typeof entry.monit?.cpu === "number" ? entry.monit.cpu : null,
      memoryBytes: typeof entry.monit?.memory === "number" ? entry.monit.memory : null,
      pmId: typeof entry.pm_id === "number" ? entry.pm_id : null,
      execCwd: String(entry.pm2_env?.pm_cwd ?? ""),
    };
  } catch {
    return null;
  }
}

async function runHealthCheck(key: string, label: string, pathname: string): Promise<OpsHealthCheck> {
  const startedAt = Date.now();
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch(`${getHealthBaseUrl()}${pathname}`, { cache: "no-store" });
    const responseTimeMs = Date.now() - startedAt;
    return {
      key,
      label,
      ok: response.ok,
      message: response.ok ? "接口正常" : `HTTP ${response.status}`,
      statusCode: response.status,
      responseTimeMs,
      checkedAt,
    };
  } catch (error) {
    return {
      key,
      label,
      ok: false,
      message: error instanceof Error ? error.message : "健康检查失败",
      statusCode: null,
      responseTimeMs: Date.now() - startedAt,
      checkedAt,
    };
  }
}

function parseNginxAccessLine(line: string) {
  const timestampMatch = line.match(/\[([^\]]+)\]/);
  const statusMatch = line.match(/"\s+(\d{3})\s+/);
  if (!timestampMatch || !statusMatch) return null;

  const parsedDate = parseNginxTimestamp(timestampMatch[1]);
  if (!parsedDate) return null;

  return {
    timestamp: parsedDate,
    status: Number(statusMatch[1]),
    raw: line,
  };
}

function parseNginxTimestamp(value: string) {
  const match = value.match(/^(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+\-]\d{4})$/);
  if (!match) return null;

  const [, day, monthName, year, hour, minute, second, offset] = match;
  const months: Record<string, string> = {
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    May: "05",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12",
  };
  const month = months[monthName];
  if (!month) return null;
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}${offset.slice(0, 3)}:${offset.slice(3)}`);
}

async function getAccessSummary(): Promise<AccessSummary> {
  const resolvedPath = await resolveFirstExistingPath(getNginxAccessLogCandidates());
  if (!resolvedPath) {
    return { status: "unavailable", recent4xx: 0, recent5xx: 0, sampledLines: 0 };
  }

  try {
    const raw = await readTailText(resolvedPath, 220_000);
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    let recent4xx = 0;
    let recent5xx = 0;
    let sampledLines = 0;

    for (const line of lines) {
      const parsed = parseNginxAccessLine(line);
      if (!parsed) continue;
      sampledLines += 1;
      if (parsed.timestamp.getTime() < cutoff) continue;
      if (parsed.status >= 400 && parsed.status < 500) recent4xx += 1;
      if (parsed.status >= 500) recent5xx += 1;
    }

    return { status: "ok", recent4xx, recent5xx, sampledLines };
  } catch {
    return { status: "error", recent4xx: 0, recent5xx: 0, sampledLines: 0 };
  }
}

async function summarizeLogFile(
  type: OpsLogType,
  label: string,
  candidates: string[],
): Promise<OpsLogSummary> {
  const resolvedPath = await resolveFirstExistingPath(candidates);
  const updatedAt = new Date().toISOString();
  if (!resolvedPath) {
    return {
      type,
      label,
      status: "unavailable",
      summary: "未找到可读取的日志文件",
      updatedAt,
      lineCount: 0,
      errorCount: 0,
      warnCount: 0,
      preview: "",
    };
  }

  try {
    const raw = await readTailText(resolvedPath, 160_000);
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const previewLines = lines.slice(-24);
    const errorCount = previewLines.filter((line) => /error|exception|failed|5\d{2}/i.test(line)).length;
    const warnCount = previewLines.filter((line) => /warn|timeout|4\d{2}/i.test(line)).length;

    return {
      type,
      label,
      status: "ok",
      summary:
        previewLines.length > 0
          ? `已读取最近 ${previewLines.length} 行，error 关键词 ${errorCount} 条，warn/timeout 关键词 ${warnCount} 条。`
          : "日志文件存在，但最近没有内容。",
      updatedAt,
      lineCount: previewLines.length,
      errorCount,
      warnCount,
      preview: previewLines.join("\n"),
    };
  } catch (error) {
    return {
      type,
      label,
      status: "error",
      summary: error instanceof Error ? error.message : "日志读取失败",
      updatedAt,
      lineCount: 0,
      errorCount: 0,
      warnCount: 0,
      preview: "",
    };
  }
}

async function getLogPayload(type: OpsLogType): Promise<OpsLogPayload> {
  const config: Record<OpsLogType, { label: string; candidates: string[] }> = {
    "pm2-error": { label: "PM2 错误日志", candidates: getPm2ErrorLogCandidates() },
    "nginx-error": { label: "Nginx 错误日志", candidates: getNginxErrorLogCandidates() },
    "nginx-access": { label: "Nginx 访问日志", candidates: getNginxAccessLogCandidates() },
  };

  const current = config[type];
  const resolvedPath = await resolveFirstExistingPath(current.candidates);
  const updatedAt = new Date().toISOString();

  if (!resolvedPath) {
    return {
      type,
      label: current.label,
      status: "unavailable",
      updatedAt,
      content: "未找到可读取的日志文件。",
      lineCount: 0,
    };
  }

  try {
    const raw = await readTailText(resolvedPath, 240_000);
    const lines = raw.split(/\r?\n/).filter(Boolean).slice(-200);
    return {
      type,
      label: current.label,
      status: "ok",
      updatedAt,
      content: lines.join("\n"),
      lineCount: lines.length,
    };
  } catch (error) {
    return {
      type,
      label: current.label,
      status: "error",
      updatedAt,
      content: error instanceof Error ? error.message : "日志读取失败",
      lineCount: 0,
    };
  }
}

function clampRange(range: string | null | undefined): OpsDashboardRange {
  if (range === "today" || range === "7d" || range === "30d") return range;
  return "7d";
}

function filterFeedbackRecord(record: FeedbackRecord): OpsFeedbackItem {
  return {
    id: record.id,
    createdAt: record.createdAt,
    type: record.type,
    title: record.title,
    content: record.content,
    contact: record.contact,
    sourcePath: record.sourcePath,
  };
}

export async function getOpsDashboardData(rangeInput: string | null | undefined): Promise<OpsDashboardData> {
  const range = clampRange(rangeInput);
  const timezone = getOpsDashboardTimezone();
  const rangeKeys = buildRangeKeys(range, timezone);
  const rangeKeySet = new Set(rangeKeys.map((item) => item.key));
  const todayKey = rangeKeys[rangeKeys.length - 1]?.key ?? toTimeZoneDayKey(new Date(), timezone);

  const [ledger, feedbackRecords, trialStatus, pm2Process, access, pm2Error, nginxError, nginxAccess, trialStatusCheck] =
    await Promise.all([
      readJsonFile<TrialLedger>(getTrialLedgerPath(), { trialEvents: [] }),
      readJsonLines<FeedbackRecord>(getFeedbackFilePath()),
      getTrialStatus(null),
      getPm2ProcessStatus(),
      getAccessSummary(),
      summarizeLogFile("pm2-error", "PM2 错误日志", getPm2ErrorLogCandidates()),
      summarizeLogFile("nginx-error", "Nginx 错误日志", getNginxErrorLogCandidates()),
      summarizeLogFile("nginx-access", "Nginx 访问日志", getNginxAccessLogCandidates()),
      runHealthCheck("trial-status", "平台试用状态接口", "/api/trial/status"),
    ]);

  const events = Array.isArray(ledger.trialEvents) ? ledger.trialEvents : [];
  const platformConfig = getPlatformTrialConfig();
  const thinkingEnabled = parseBooleanEnv("PLATFORM_ENABLE_THINKING");

  const todayEvents = events.filter((event) => toTimeZoneDayKey(event.timestamp, timezone) === todayKey);
  const rangeEvents = events.filter((event) => rangeKeySet.has(toTimeZoneDayKey(event.timestamp, timezone)));

  const dailyUsersMap = new Map<string, Set<string>>();
  const dailyRequestMap = new Map<string, number>();
  const dailyCostMap = new Map<string, number>();
  const contextMap = new Map<string, number>();
  const modelMap = new Map<string, number>();

  for (const event of rangeEvents) {
    const key = toTimeZoneDayKey(event.timestamp, timezone);
    const userSet = dailyUsersMap.get(key) ?? new Set<string>();
    userSet.add(event.trial_id);
    dailyUsersMap.set(key, userSet);

    dailyRequestMap.set(key, (dailyRequestMap.get(key) ?? 0) + 1);
    dailyCostMap.set(key, roundCurrency((dailyCostMap.get(key) ?? 0) + Number(event.cost_cny ?? 0)));
    contextMap.set(event.context || "unknown", (contextMap.get(event.context || "unknown") ?? 0) + 1);

    const modelKey = event.model?.trim() || "未记录（旧数据）";
    modelMap.set(modelKey, (modelMap.get(modelKey) ?? 0) + 1);
  }

  const dailyUsersCountMap = new Map<string, number>();
  for (const [key, value] of Array.from(dailyUsersMap.entries())) {
    dailyUsersCountMap.set(key, value.size);
  }

  const todayFeedbackCount = feedbackRecords.filter((record) => toTimeZoneDayKey(record.createdAt, timezone) === todayKey).length;
  const rangeFeedback = feedbackRecords.filter((record) => rangeKeySet.has(toTimeZoneDayKey(record.createdAt, timezone)));
  const feedbackTypeMap = new Map<string, number>();
  for (const record of rangeFeedback) {
    feedbackTypeMap.set(record.type || "other", (feedbackTypeMap.get(record.type || "other") ?? 0) + 1);
  }

  const feedbackIssues = feedbackRecords
    .filter((record) => record.type === "bug" || record.type === "experience")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 5)
    .map(filterFeedbackRecord);

  const todayCost = roundCurrency(
    todayEvents.reduce((sum, event) => sum + Number(event.cost_cny ?? 0), 0),
  );
  const todayUsers = new Set(todayEvents.map((event) => event.trial_id)).size;
  const todayRequests = todayEvents.length;

  const dailySpendToday = roundCurrency(
    events
      .filter((event) => toTimeZoneDayKey(event.timestamp, timezone) === todayKey)
      .reduce((sum, event) => sum + Number(event.cost_cny ?? 0), 0),
  );
  const monthKey = todayKey.slice(0, 7);
  const monthSpend = roundCurrency(
    events
      .filter((event) => toTimeZoneDayKey(event.timestamp, timezone).startsWith(monthKey))
      .reduce((sum, event) => sum + Number(event.cost_cny ?? 0), 0),
  );

  return {
    timezone,
    generatedAt: new Date().toISOString(),
    range,
    overview: {
      todayUsers,
      todayRequests,
      todayFeedbackCount,
      todayCostCny: todayCost,
    },
    usage: {
      dailyUsers: asMetricSeries(rangeKeys, dailyUsersCountMap),
      dailyRequests: asMetricSeries(rangeKeys, dailyRequestMap),
      dailyCostCny: asMetricSeries(rangeKeys, dailyCostMap),
      byContext: toBuckets(contextMap),
      byModel: toBuckets(modelMap),
    },
    feedback: {
      todayCount: todayFeedbackCount,
      rangeCount: rangeFeedback.length,
      byType: toBuckets(feedbackTypeMap, {
        bug: "问题反馈",
        idea: "功能建议",
        experience: "体验反馈",
        other: "其他",
      }),
      recent: rangeFeedback
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, 12)
        .map(filterFeedbackRecord),
    },
    health: {
      process: pm2Process,
      platform: {
        provider: platformConfig.provider,
        model: trialStatus.model || platformConfig.model,
        enabled: trialStatus.trialEnabled,
        remainingInputTokens: trialStatus.remainingInputTokens,
        remainingOutputTokens: trialStatus.remainingOutputTokens,
        blockedReason: trialStatus.blockedReason,
        thinkingEnabled,
        budget: {
          todayCostCny: dailySpendToday,
          monthCostCny: monthSpend,
          dailyBudgetCny: platformConfig.dailyBudgetCny,
          monthlyBudgetCny: platformConfig.monthlyBudgetCny,
          dailyUsageRatio: platformConfig.dailyBudgetCny > 0 ? dailySpendToday / platformConfig.dailyBudgetCny : null,
          monthlyUsageRatio: platformConfig.monthlyBudgetCny > 0 ? monthSpend / platformConfig.monthlyBudgetCny : null,
        },
      },
      checks: [trialStatusCheck],
      access,
    },
    errors: {
      pm2Error,
      nginxError,
      nginxAccess,
      feedbackIssues,
    },
  };
}

export async function getOpsLogContent(typeInput: string | null | undefined) {
  const type =
    typeInput === "pm2-error" || typeInput === "nginx-error" || typeInput === "nginx-access"
      ? typeInput
      : null;
  if (!type) return null;
  return getLogPayload(type);
}
