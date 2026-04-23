import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

type CookieStoreLike = {
  get: (name: string) => { value: string } | undefined;
};

export const OPS_SESSION_COOKIE_NAME = "curator_ops_session";
export const OPS_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

function normalizeBooleanEnv(name: string, fallback: boolean) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  return fallback;
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeConfiguredPasswordHash(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^[a-f0-9]{64}$/i.test(trimmed)) return trimmed.toLowerCase();
  if (/^sha256:[a-f0-9]{64}$/i.test(trimmed)) {
    return trimmed.slice("sha256:".length).toLowerCase();
  }
  return null;
}

function toComparableBuffer(value: string) {
  return Buffer.from(value, "utf8");
}

function createSessionSignature(value: string, secret: string) {
  return createHmac("sha256", secret).update(value, "utf8").digest("base64url");
}

export function hashOpsPassword(password: string) {
  return `sha256:${sha256Hex(password)}`;
}

export function isOpsDashboardEnabled() {
  return normalizeBooleanEnv("OPS_DASHBOARD_ENABLED", true);
}

export function getOpsDashboardTimezone() {
  return process.env.OPS_DASHBOARD_TIMEZONE?.trim() || "Asia/Shanghai";
}

export function getOpsDashboardConfigState() {
  const passwordHash = normalizeConfiguredPasswordHash(process.env.OPS_DASHBOARD_PASSWORD_HASH ?? "");
  const sessionSecret = process.env.OPS_DASHBOARD_SESSION_SECRET?.trim() || "";
  return {
    enabled: isOpsDashboardEnabled(),
    configured: Boolean(passwordHash && sessionSecret),
    passwordHash,
    sessionSecret,
  };
}

export function verifyOpsPassword(password: string) {
  const { passwordHash } = getOpsDashboardConfigState();
  if (!passwordHash) return false;

  const provided = sha256Hex(password.trim());
  const expectedBuffer = toComparableBuffer(passwordHash);
  const actualBuffer = toComparableBuffer(provided);
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export function createOpsSessionToken(now = Date.now()) {
  const { sessionSecret } = getOpsDashboardConfigState();
  if (!sessionSecret) return null;

  const issuedAt = String(now);
  const signature = createSessionSignature(issuedAt, sessionSecret);
  return `${issuedAt}.${signature}`;
}

export function isValidOpsSessionToken(token: string | undefined | null) {
  const { sessionSecret } = getOpsDashboardConfigState();
  if (!token || !sessionSecret) return false;

  const [issuedAt, signature] = token.split(".");
  if (!issuedAt || !signature) return false;
  if (!/^\d+$/.test(issuedAt)) return false;

  const expected = createSessionSignature(issuedAt, sessionSecret);
  const expectedBuffer = toComparableBuffer(expected);
  const actualBuffer = toComparableBuffer(signature);
  if (expectedBuffer.length !== actualBuffer.length) return false;
  if (!timingSafeEqual(expectedBuffer, actualBuffer)) return false;

  const ageMs = Date.now() - Number(issuedAt);
  if (!Number.isFinite(ageMs) || ageMs < 0) return false;
  return ageMs <= OPS_SESSION_MAX_AGE_SECONDS * 1000;
}

export function getOpsPageState(cookieStore: CookieStoreLike) {
  const config = getOpsDashboardConfigState();
  const cookieValue = cookieStore.get(OPS_SESSION_COOKIE_NAME)?.value;

  return {
    enabled: config.enabled,
    configured: config.configured,
    authenticated: config.configured ? isValidOpsSessionToken(cookieValue) : false,
  };
}

export function getOpsSessionCookieValue(cookieStore: CookieStoreLike) {
  return cookieStore.get(OPS_SESSION_COOKIE_NAME)?.value;
}

export function getOpsSessionCookieOptions() {
  return {
    name: OPS_SESSION_COOKIE_NAME,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OPS_SESSION_MAX_AGE_SECONDS,
  };
}

