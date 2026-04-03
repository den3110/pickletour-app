import AsyncStorage from "@react-native-async-storage/async-storage";

import type { PikoraMutationPreview, PikoraSessionFocusOverride } from "./pikoraTypes";
import {
  normalizeAssistantMode,
  normalizeReasoningMode,
  normalizeSessionFocusOverride,
  normalizeVerificationMode,
} from "./pikoraUtils";

export const PIKORA_REASONING_MODE_KEY = "pikora-reasoning-mode";
export const PIKORA_ASSISTANT_MODE_KEY = "pikora-assistant-mode";
export const PIKORA_VERIFICATION_MODE_KEY = "pikora-verification-mode";
export const PIKORA_SESSION_FOCUS_OVERRIDE_KEY = "pikora-session-focus-override";
export const PIKORA_COHORT_ID_KEY = "pikora-cohort-id";
export const PIKORA_UI_PREFS_KEY = "pikora-ui-preferences";
export const PIKORA_FORM_DRAFTS_KEY = "pikora-form-drafts";

type StoredModes = {
  reasoningMode: ReturnType<typeof normalizeReasoningMode>;
  assistantMode: ReturnType<typeof normalizeAssistantMode>;
  verificationMode: ReturnType<typeof normalizeVerificationMode>;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

async function readJsonRecord(key: string) {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return {};

  try {
    return asObject(JSON.parse(raw));
  } catch {
    return {};
  }
}

export async function loadStoredModes(): Promise<StoredModes> {
  const [reasoningMode, assistantMode, verificationMode] = await Promise.all([
    AsyncStorage.getItem(PIKORA_REASONING_MODE_KEY),
    AsyncStorage.getItem(PIKORA_ASSISTANT_MODE_KEY),
    AsyncStorage.getItem(PIKORA_VERIFICATION_MODE_KEY),
  ]);

  return {
    reasoningMode: normalizeReasoningMode(reasoningMode),
    assistantMode: normalizeAssistantMode(assistantMode),
    verificationMode: normalizeVerificationMode(verificationMode),
  };
}

export async function persistMode(
  key:
    | typeof PIKORA_REASONING_MODE_KEY
    | typeof PIKORA_ASSISTANT_MODE_KEY
    | typeof PIKORA_VERIFICATION_MODE_KEY,
  value: string,
) {
  await AsyncStorage.setItem(key, value);
}

export async function getOrCreatePikoraCohortId() {
  const existing = await AsyncStorage.getItem(PIKORA_COHORT_ID_KEY);
  if (existing) return existing;

  const nextId = `mobile-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  await AsyncStorage.setItem(PIKORA_COHORT_ID_KEY, nextId);
  return nextId;
}

export async function loadStoredSessionFocusOverride(): Promise<PikoraSessionFocusOverride> {
  const raw = await AsyncStorage.getItem(PIKORA_SESSION_FOCUS_OVERRIDE_KEY);
  if (!raw) return { mode: "auto", sessionFocus: null };

  try {
    return normalizeSessionFocusOverride(JSON.parse(raw));
  } catch {
    return { mode: "auto", sessionFocus: null };
  }
}

export async function persistSessionFocusOverride(
  override: PikoraSessionFocusOverride,
) {
  if (override.mode === "auto") {
    await AsyncStorage.removeItem(PIKORA_SESSION_FOCUS_OVERRIDE_KEY);
    return;
  }

  await AsyncStorage.setItem(
    PIKORA_SESSION_FOCUS_OVERRIDE_KEY,
    JSON.stringify(override),
  );
}

export async function applyLocalMutationFallback(
  mutationPreview?: PikoraMutationPreview | null,
) {
  if (!mutationPreview?.type) return;

  const payload = asObject(mutationPreview.payload);

  if (mutationPreview.type === "save_bot_preference") {
    await Promise.all([
      payload.reasoningMode
        ? AsyncStorage.setItem(
            PIKORA_REASONING_MODE_KEY,
            normalizeReasoningMode(String(payload.reasoningMode)),
          )
        : Promise.resolve(),
      payload.assistantMode
        ? AsyncStorage.setItem(
            PIKORA_ASSISTANT_MODE_KEY,
            normalizeAssistantMode(String(payload.assistantMode)),
          )
        : Promise.resolve(),
      payload.verificationMode
        ? AsyncStorage.setItem(
            PIKORA_VERIFICATION_MODE_KEY,
            normalizeVerificationMode(String(payload.verificationMode)),
          )
        : Promise.resolve(),
    ]);
    return;
  }

  if (mutationPreview.type === "save_ui_preference") {
    const scopeKey = String(payload.scopeKey || "page_default");
    const nextPrefs = await readJsonRecord(PIKORA_UI_PREFS_KEY);
    nextPrefs[scopeKey] = {
      ...asObject(nextPrefs[scopeKey]),
      ...payload,
    };
    await AsyncStorage.setItem(PIKORA_UI_PREFS_KEY, JSON.stringify(nextPrefs));
    return;
  }

  if (mutationPreview.type === "stage_form_draft") {
    const draftKey = String(payload.draftKey || "form_draft");
    const nextDrafts = await readJsonRecord(PIKORA_FORM_DRAFTS_KEY);
    nextDrafts[draftKey] = {
      ...asObject(nextDrafts[draftKey]),
      ...payload,
    };
    await AsyncStorage.setItem(PIKORA_FORM_DRAFTS_KEY, JSON.stringify(nextDrafts));
  }
}
