import { LlmConfig, TrialStatus } from "@/types";

function hasInvalidByteStringChars(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 255) return true;
  }
  return false;
}

export function getInvalidUserApiConfigReason(config: LlmConfig) {
  if (!config.model?.trim() || !config.baseURL?.trim() || !config.apiKey?.trim()) {
    return "missing";
  }

  if (hasInvalidByteStringChars(config.apiKey.trim())) {
    return "api_key_non_latin1";
  }

  return null;
}

export function hasUserApiConfig(config: LlmConfig) {
  return getInvalidUserApiConfigReason(config) === null;
}

export function canUseAnyLlm(config: LlmConfig, trialStatus: TrialStatus | null | undefined) {
  return hasUserApiConfig(config) || Boolean(trialStatus?.trialEnabled);
}

export function shouldRefreshTrialStatusFromError(message: string) {
  return [
    "你今日的免费试用次数已用完",
    "今日平台试用额度已用完",
    "本月平台试用额度已用完",
    "免费试用输入额度已用完",
    "免费试用输出额度已用完",
  ].some((token) => message.includes(token));
}
