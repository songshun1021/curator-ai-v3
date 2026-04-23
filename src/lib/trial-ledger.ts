import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createId } from "@/lib/id";

export const TRIAL_COOKIE_NAME = "curator_trial_id";

type TrialUserRow = {
  trial_id: string;
  created_at: string;
  last_seen_at: string;
  input_tokens_used: number;
  output_tokens_used: number;
  request_count_today: number;
  request_count_total: number;
  last_request_date: string | null;
  blocked_reason: string | null;
};

type TrialEventRow = {
  id: string;
  trial_id: string;
  timestamp: string;
  context: string;
  label: string;
  provider?: string;
  model?: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_chars: number;
  output_chars: number;
  ip_hash: string;
  cost_cny: number;
};

type IpRateLimitRow = {
  id: string;
  ip_hash: string;
  timestamp: string;
  hour_bucket: string;
};

type TrialLedger = {
  trialUsers: Record<string, TrialUserRow>;
  trialEvents: TrialEventRow[];
  ipRateLimits: IpRateLimitRow[];
};

export type PlatformTrialConfig = {
  enabled: boolean;
  provider: string;
  model: string;
  baseURL: string;
  apiKey: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
  dailyRequestLimit: number;
  hourlyIpLimit: number;
  dailyBudgetCny: number;
  monthlyBudgetCny: number;
  inputCostPerMillionCny: number;
  outputCostPerMillionCny: number;
};

export type TrialStatus = {
  mode: "platform" | "disabled";
  trialEnabled: boolean;
  remainingInputTokens: number | null;
  remainingOutputTokens: number | null;
  remainingRequestsToday: number | null;
  blockedReason: string | null;
  provider: string | null;
  model: string | null;
};

type TrialAllowanceResult =
  | { ok: true; user: TrialUserRow; ipHash: string }
  | { ok: false; reason: string; statusCode: number };

let ledgerPromise: Promise<TrialLedger> | null = null;

function shouldCountAgainstHourlyIpLimit(context: string) {
  return context !== "next-action-suggestions" && context !== "verify";
}

function getLedgerFilePath() {
  const configured = process.env.TRIAL_LEDGER_PATH?.trim();
  if (configured) return configured;
  return path.join(process.cwd(), "data", "trial-ledger.json");
}

async function ensureParentDir(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function loadLedger() {
  if (!ledgerPromise) {
    ledgerPromise = (async () => {
      const filePath = getLedgerFilePath();
      await ensureParentDir(filePath);
      try {
        const content = await fs.readFile(filePath, "utf8");
        const parsed = JSON.parse(content) as Partial<TrialLedger>;
        return {
          trialUsers: parsed.trialUsers ?? {},
          trialEvents: parsed.trialEvents ?? [],
          ipRateLimits: parsed.ipRateLimits ?? [],
        };
      } catch {
        return {
          trialUsers: {},
          trialEvents: [],
          ipRateLimits: [],
        };
      }
    })();
  }
  return ledgerPromise;
}

async function saveLedger(ledger: TrialLedger) {
  const filePath = getLedgerFilePath();
  await ensureParentDir(filePath);
  await fs.writeFile(filePath, JSON.stringify(ledger, null, 2), "utf8");
}

function getNowIso() {
  return new Date().toISOString();
}

function getDateKey(iso = getNowIso()) {
  return iso.slice(0, 10);
}

function getMonthKey(iso = getNowIso()) {
  return iso.slice(0, 7);
}

function getHourKey(iso = getNowIso()) {
  return iso.slice(0, 13);
}

function hashIp(ip: string) {
  return createHash("sha256").update(ip).digest("hex");
}

function getConfigNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getPlatformTrialConfig(): PlatformTrialConfig {
  return {
    enabled: process.env.PLATFORM_TRIAL_ENABLED === "true",
    provider: process.env.PLATFORM_PROVIDER?.trim() || "通义千问",
    model: process.env.PLATFORM_MODEL?.trim() || "qwen3.6-flash",
    baseURL: process.env.PLATFORM_BASE_URL?.trim() || "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKey: process.env.PLATFORM_API_KEY?.trim() || "",
    inputTokenLimit: getConfigNumber("FREE_TRIAL_INPUT_TOKENS", 400000),
    outputTokenLimit: getConfigNumber("FREE_TRIAL_OUTPUT_TOKENS", 100000),
    dailyRequestLimit: getConfigNumber("FREE_TRIAL_DAILY_REQUESTS", 10),
    hourlyIpLimit: getConfigNumber("FREE_TRIAL_HOURLY_IP_LIMIT", 20),
    dailyBudgetCny: getConfigNumber("TRIAL_DAILY_BUDGET_CNY", 3),
    monthlyBudgetCny: getConfigNumber("TRIAL_MONTHLY_BUDGET_CNY", 40),
    inputCostPerMillionCny: getConfigNumber("TRIAL_INPUT_COST_PER_MILLION_CNY", 1.2),
    outputCostPerMillionCny: getConfigNumber("TRIAL_OUTPUT_COST_PER_MILLION_CNY", 7.2),
  };
}

function hasUsablePlatformConfig(config: PlatformTrialConfig) {
  return Boolean(config.enabled && config.apiKey && config.baseURL && config.model);
}

async function getOrCreateTrialUser(trialId: string) {
  const ledger = await loadLedger();
  let user = ledger.trialUsers[trialId];

  if (!user) {
    const now = getNowIso();
    user = {
      trial_id: trialId,
      created_at: now,
      last_seen_at: now,
      input_tokens_used: 0,
      output_tokens_used: 0,
      request_count_today: 0,
      request_count_total: 0,
      last_request_date: getDateKey(now),
      blocked_reason: null,
    };
    ledger.trialUsers[trialId] = user;
    await saveLedger(ledger);
  }

  const today = getDateKey();
  if (user.last_request_date !== today) {
    user.request_count_today = 0;
    user.last_request_date = today;
    user.last_seen_at = getNowIso();
    ledger.trialUsers[trialId] = user;
    await saveLedger(ledger);
  }

  return { ledger, user };
}

function getDailySpend(ledger: TrialLedger, dayKey: string) {
  return ledger.trialEvents
    .filter((event) => event.timestamp.startsWith(dayKey))
    .reduce((sum, event) => sum + event.cost_cny, 0);
}

function getMonthlySpend(ledger: TrialLedger, monthKey: string) {
  return ledger.trialEvents
    .filter((event) => event.timestamp.startsWith(monthKey))
    .reduce((sum, event) => sum + event.cost_cny, 0);
}

function getHourlyIpRequestCount(ledger: TrialLedger, ipHash: string, hourKey: string) {
  return ledger.ipRateLimits.filter((item) => item.ip_hash === ipHash && item.hour_bucket === hourKey).length;
}

export async function getTrialStatus(trialId: string | null): Promise<TrialStatus> {
  const config = getPlatformTrialConfig();
  if (!hasUsablePlatformConfig(config)) {
    return {
      mode: "disabled",
      trialEnabled: false,
      remainingInputTokens: null,
      remainingOutputTokens: null,
      remainingRequestsToday: null,
      blockedReason: "平台试用未启用",
      provider: null,
      model: null,
    };
  }

  if (!trialId) {
    return {
      mode: "platform",
      trialEnabled: true,
      remainingInputTokens: config.inputTokenLimit,
      remainingOutputTokens: config.outputTokenLimit,
      remainingRequestsToday: null,
      blockedReason: null,
      provider: config.provider,
      model: config.model,
    };
  }

  const { ledger, user } = await getOrCreateTrialUser(trialId);
  const dailySpend = getDailySpend(ledger, getDateKey());
  const monthlySpend = getMonthlySpend(ledger, getMonthKey());

  const blockedReason =
    user.blocked_reason ||
    (user.input_tokens_used >= config.inputTokenLimit ? "输入额度已用完" : null) ||
    (user.output_tokens_used >= config.outputTokenLimit ? "输出额度已用完" : null) ||
    (dailySpend >= config.dailyBudgetCny ? "今日平台试用额度已用完" : null) ||
    (monthlySpend >= config.monthlyBudgetCny ? "本月平台试用额度已用完" : null);

  return {
    mode: "platform",
    trialEnabled: !blockedReason,
    remainingInputTokens: Math.max(0, config.inputTokenLimit - user.input_tokens_used),
    remainingOutputTokens: Math.max(0, config.outputTokenLimit - user.output_tokens_used),
    remainingRequestsToday: null,
    blockedReason,
    provider: config.provider,
    model: config.model,
  };
}

export async function reserveTrialRequest(trialId: string, ip: string, context: string): Promise<TrialAllowanceResult> {
  const config = getPlatformTrialConfig();
  if (!hasUsablePlatformConfig(config)) {
    return { ok: false, reason: "平台试用未启用，请填写你自己的 API Key 后继续使用。", statusCode: 400 };
  }

  const { ledger, user } = await getOrCreateTrialUser(trialId);
  const ipHash = hashIp(ip || "unknown");
  const now = getNowIso();
  const dayKey = getDateKey(now);
  const hourKey = getHourKey(now);

  const dailySpend = getDailySpend(ledger, dayKey);
  const monthlySpend = getMonthlySpend(ledger, getMonthKey(now));
  const ipCount = getHourlyIpRequestCount(ledger, ipHash, hourKey);
  const enforceHourlyIpLimit = shouldCountAgainstHourlyIpLimit(context);

  const blockedReason =
    user.blocked_reason ||
    (user.input_tokens_used >= config.inputTokenLimit ? "免费试用输入额度已用完，请填写你自己的 API Key 后继续使用。" : null) ||
    (user.output_tokens_used >= config.outputTokenLimit ? "免费试用输出额度已用完，请填写你自己的 API Key 后继续使用。" : null) ||
    (enforceHourlyIpLimit && ipCount >= config.hourlyIpLimit ? "当前访问过于频繁，请稍后再试。" : null) ||
    (dailySpend >= config.dailyBudgetCny ? "今日平台试用额度已用完，请填写你自己的 API Key 后继续使用。" : null) ||
    (monthlySpend >= config.monthlyBudgetCny ? "本月平台试用额度已用完，请填写你自己的 API Key 后继续使用。" : null);

  if (blockedReason) {
    return { ok: false, reason: blockedReason, statusCode: enforceHourlyIpLimit && ipCount >= config.hourlyIpLimit ? 429 : 402 };
  }

  user.request_count_today += 1;
  user.request_count_total += 1;
  user.last_request_date = dayKey;
  user.last_seen_at = now;
  ledger.trialUsers[trialId] = user;
  if (enforceHourlyIpLimit) {
    ledger.ipRateLimits.push({
      id: createId(),
      ip_hash: ipHash,
      timestamp: now,
      hour_bucket: hourKey,
    });
  }
  await saveLedger(ledger);

  return { ok: true, user, ipHash };
}

function normalizeUsageTokens(value: number | undefined, fallbackChars: number) {
  if (typeof value === "number" && value > 0) return Math.ceil(value);
  return Math.max(1, Math.ceil(fallbackChars));
}

export async function recordTrialUsage(args: {
  trialId: string;
  ipHash: string;
  context: string;
  label: string;
  inputChars: number;
  outputChars: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}) {
  const config = getPlatformTrialConfig();
  const { ledger, user } = await getOrCreateTrialUser(args.trialId);

  const inputTokens = normalizeUsageTokens(args.promptTokens, args.inputChars);
  const outputTokens = normalizeUsageTokens(args.completionTokens, args.outputChars);
  const totalTokens =
    typeof args.totalTokens === "number" && args.totalTokens > 0 ? Math.ceil(args.totalTokens) : inputTokens + outputTokens;
  const costCny =
    (inputTokens / 1_000_000) * config.inputCostPerMillionCny +
    (outputTokens / 1_000_000) * config.outputCostPerMillionCny;

  user.input_tokens_used += inputTokens;
  user.output_tokens_used += outputTokens;
  user.last_seen_at = getNowIso();
  ledger.trialUsers[args.trialId] = user;

  ledger.trialEvents.push({
    id: createId(),
    trial_id: args.trialId,
    timestamp: getNowIso(),
    context: args.context,
    label: args.label,
    provider: config.provider,
    model: config.model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    input_chars: args.inputChars,
    output_chars: args.outputChars,
    ip_hash: args.ipHash,
    cost_cny: costCny,
  });

  await saveLedger(ledger);
}

export function buildTrialCookie(trialId: string) {
  const oneYear = 60 * 60 * 24 * 365;
  return `${TRIAL_COOKIE_NAME}=${trialId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${oneYear}`;
}

export function getClientIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return headers.get("x-real-ip") || "unknown";
}
