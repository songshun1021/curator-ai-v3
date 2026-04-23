export const ONBOARDING_STORAGE_KEY = "curator.onboarded";
export const ONBOARDING_VERSION = "v1";
export const ONBOARDING_OPEN_EVENT = "curator:open-onboarding";

export function hasCompletedOnboarding() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === ONBOARDING_VERSION;
}

export function markOnboardingCompleted() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ONBOARDING_STORAGE_KEY, ONBOARDING_VERSION);
}

export function resetOnboardingState() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
}
