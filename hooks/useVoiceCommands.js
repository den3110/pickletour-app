import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Haptics from "expo-haptics";
import NetInfo from "@react-native-community/netinfo";
import Constants from "expo-constants";

import {
  looksLikeVoiceCommand,
  normalizeVoiceTranscript,
  parseVoiceCommand,
} from "@/utils/voiceCommandParser";

let ExpoSpeechRecognitionModule = null;
let useSpeechRecognitionEvent = (_event, _cb) => {};

const isExpoGo = Constants.appOwnership === "expo";
if (!isExpoGo) {
  try {
    const mod = require("expo-speech-recognition");
    ExpoSpeechRecognitionModule = mod.ExpoSpeechRecognitionModule;
    useSpeechRecognitionEvent = mod.useSpeechRecognitionEvent;
  } catch (error) {
    if (__DEV__) {
      console.warn("expo-speech-recognition not available:", error);
    }
  }
}

const CONFIG = {
  DEBOUNCE_MS: 700,
  DUPLICATE_WINDOW_MS: 1400,
  API_TIMEOUT_MS: 3500,
  RESTART_DELAY_MS: 250,
  MAX_RESTART_ATTEMPTS: 5,
  RESTART_BACKOFF_MS: 800,
  MAX_API_RETRIES: 1,
  API_RETRY_DELAY_MS: 400,
  MAX_WORDS: 10,
};

const LOG_ENABLED = __DEV__;
const log = {
  info: (...args) => LOG_ENABLED && console.log("[Voice]", ...args),
  warn: (...args) => LOG_ENABLED && console.warn("[Voice]", ...args),
  error: (...args) => console.error("[Voice]", ...args),
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function canUseSpeechModule() {
  return Boolean(
    ExpoSpeechRecognitionModule &&
      typeof ExpoSpeechRecognitionModule.start === "function" &&
      typeof ExpoSpeechRecognitionModule.abort === "function" &&
      typeof ExpoSpeechRecognitionModule.requestPermissionsAsync === "function"
  );
}

async function callAPIWithRetry(
  apiUrl,
  transcript,
  context,
  retries = CONFIG.MAX_API_RETRIES
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);

  try {
    const startedAt = Date.now();
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transcript,
        context,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`API ${response.status}`);
    }

    const data = await response.json();
    const latency = Date.now() - startedAt;
    log.info(
      `API ${latency}ms | "${transcript}" -> ${data.intent || "null"}`
    );

    if (!data.intent) {
      return null;
    }

    return {
      action: data.intent,
      feedback: data.feedback || "",
      method: data.method || "server_rule",
      confidence: Number(data.confidence || 0),
      teamKey: data.teamKey || undefined,
      teamUiSide: data.teamUiSide || undefined,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error?.name === "AbortError") {
      log.warn("API timeout");
    } else {
      log.warn("API error:", error?.message || error);
    }

    if (retries > 0) {
      await sleep(CONFIG.API_RETRY_DELAY_MS);
      return callAPIWithRetry(apiUrl, transcript, context, retries - 1);
    }

    return null;
  }
}

export function useVoiceCommands({
  enabled = false,
  onCommand,
  onError,
  onStatusChange,
  apiUrl = "",
  context = {},
  hapticFeedback = true,
  language = "vi-VN",
  trackTranscript = true,
}) {
  const [status, setStatus] = useState("idle");
  const [lastCommand, setLastCommand] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [permissionGranted, setPermissionGranted] = useState(null);

  const isActiveRef = useRef(false);
  const isMountedRef = useRef(true);
  const lastCommandTimeRef = useRef(0);
  const lastProcessedRef = useRef({ normalized: "", at: 0 });
  const restartTimeoutRef = useRef(null);
  const restartAttemptsRef = useRef(0);
  const processingRef = useRef(false);
  const pendingTranscriptRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);

  const safeSetState = useCallback((setter, value) => {
    if (isMountedRef.current) {
      setter(value);
    }
  }, []);

  const updateStatus = useCallback(
    (nextStatus) => {
      safeSetState(setStatus, nextStatus);
      onStatusChange?.(nextStatus);
    },
    [onStatusChange, safeSetState]
  );

  const emitCommand = useCallback(
    async (command) => {
      if (!command) return;
      lastCommandTimeRef.current = Date.now();
      safeSetState(setLastCommand, command);

      if (hapticFeedback) {
        try {
          await Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success
          );
        } catch {}
      }

      onCommand?.(command);
    },
    [hapticFeedback, onCommand, safeSetState]
  );

  const clearRestartTimeout = useCallback(() => {
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
  }, []);

  const processTranscript = useCallback(
    async (rawText) => {
      const text = String(rawText || "").trim();
      if (!text || !isMountedRef.current) return;

      if (processingRef.current) {
        pendingTranscriptRef.current = text;
        return;
      }

      const normalized = normalizeVoiceTranscript(text);
      if (!normalized) return;

      const words = normalized.split(/\s+/).filter(Boolean);
      if (words.length > CONFIG.MAX_WORDS) {
        log.info("Skip long transcript:", normalized);
        return;
      }

      const now = Date.now();
      if (
        normalized === lastProcessedRef.current.normalized &&
        now - lastProcessedRef.current.at < CONFIG.DUPLICATE_WINDOW_MS
      ) {
        log.info("Duplicate transcript ignored:", normalized);
        return;
      }
      lastProcessedRef.current = { normalized, at: now };

      if (now - lastCommandTimeRef.current < CONFIG.DEBOUNCE_MS) {
        log.info("Debounced");
        return;
      }

      log.info("Transcript:", text);

      const localResult = parseVoiceCommand(text, context);
      if (localResult) {
        log.info("Local:", localResult.action);
        await emitCommand({
          ...localResult,
          method: "local_rule",
          transcript: text,
          normalizedTranscript: normalized,
        });
        return;
      }

      if (!looksLikeVoiceCommand(text)) {
        log.info("Skip non-command transcript");
        return;
      }

      if (!apiUrl) {
        log.info("No API fallback configured");
        return;
      }

      if (!isOnline) {
        log.warn("Offline, skip API fallback");
        return;
      }

      processingRef.current = true;
      safeSetState(setIsProcessing, true);
      updateStatus("processing");

      try {
        const result = await callAPIWithRetry(apiUrl, text, context);
        if (result && isMountedRef.current) {
          log.info("Server:", result.action);
          await emitCommand({
            ...result,
            transcript: text,
            normalizedTranscript: normalized,
          });
        }
      } catch (error) {
        log.error("Process transcript error:", error);
      } finally {
        processingRef.current = false;
        safeSetState(setIsProcessing, false);

        if (isMountedRef.current && isActiveRef.current) {
          updateStatus("listening");
        }

        if (pendingTranscriptRef.current) {
          const pending = pendingTranscriptRef.current;
          pendingTranscriptRef.current = null;
          processTranscript(pending);
        }
      }
    },
    [
      apiUrl,
      context,
      emitCommand,
      isOnline,
      safeSetState,
      updateStatus,
    ]
  );

  const restartListening = useCallback(async () => {
    if (!enabled || !isActiveRef.current || !isMountedRef.current) return;
    if (!canUseSpeechModule()) return;

    clearRestartTimeout();

    const delayMs = Math.min(
      CONFIG.RESTART_DELAY_MS +
        restartAttemptsRef.current * CONFIG.RESTART_BACKOFF_MS,
      3000
    );

    restartTimeoutRef.current = setTimeout(async () => {
      if (!isActiveRef.current || !isMountedRef.current) return;

      try {
        ExpoSpeechRecognitionModule.start({
          lang: language,
          interimResults: true,
          continuous: true,
          androidIntentOptions: {
            EXTRA_LANGUAGE_MODEL: "web_search",
          },
        });
        restartAttemptsRef.current = 0;
        log.info("Restarted");
      } catch (error) {
        restartAttemptsRef.current += 1;

        if (restartAttemptsRef.current >= CONFIG.MAX_RESTART_ATTEMPTS) {
          updateStatus("error");
          onError?.({
            code: "MAX_RESTART",
            message: "Không thể khởi động lại voice command.",
          });
          return;
        }

        log.warn(
          `Restart failed (${restartAttemptsRef.current}), retrying...`,
          error
        );
        restartListening();
      }
    }, delayMs);
  }, [clearRestartTimeout, enabled, language, onError, updateStatus]);

  useSpeechRecognitionEvent("start", () => {
    log.info("Started");
    updateStatus("listening");
  });

  useSpeechRecognitionEvent("end", () => {
    log.info("Ended");
    if (isActiveRef.current && isMountedRef.current) {
      restartListening();
    }
  });

  useSpeechRecognitionEvent("result", (event) => {
    const result = event?.results?.[event?.resultIndex];
    if (!result) return;

    const text = result?.[0]?.transcript || "";
    if (trackTranscript) {
      safeSetState(setTranscript, text);
    }

    if (result?.isFinal && text) {
      processTranscript(text);
    }
  });

  useSpeechRecognitionEvent("error", (event) => {
    const code = event?.error || "unknown";
    const ignorableErrors = new Set([
      "no-speech",
      "aborted",
      "network",
      "audio-capture",
    ]);

    if (ignorableErrors.has(code)) {
      log.info(`Ignorable error: ${code}`);
      restartListening();
      return;
    }

    log.error("Speech error:", code, event?.message || "");
    onError?.({
      code,
      message: event?.message || "Voice command failed",
    });
    restartListening();
  });

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(
        state.isConnected && state.isInternetReachable !== false
      );
      safeSetState(setIsOnline, online);
    });

    return () => unsubscribe();
  }, [safeSetState]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;

      if (prevState.match(/inactive|background/) && nextState === "active") {
        if (enabled && isActiveRef.current) {
          restartListening();
        }
      }

      if (nextState.match(/inactive|background/)) {
        clearRestartTimeout();
        try {
          ExpoSpeechRecognitionModule?.abort?.();
        } catch {}
      }
    });

    return () => subscription.remove();
  }, [clearRestartTimeout, enabled, restartListening]);

  const startListening = useCallback(async () => {
    if (!enabled || !isMountedRef.current) return;

    if (!canUseSpeechModule()) {
      safeSetState(setPermissionGranted, false);
      updateStatus("error");
      onError?.({
        code: "VOICE_UNAVAILABLE",
        message: isExpoGo
          ? "Voice command chỉ hoạt động trên dev build hoặc bản native, không chạy trong Expo Go."
          : "Thiết bị chưa có speech recognition module khả dụng.",
      });
      return;
    }

    updateStatus("starting");

    try {
      const permission =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();

      if (!permission?.granted) {
        safeSetState(setPermissionGranted, false);
        updateStatus("error");
        onError?.({
          code: "PERMISSION_DENIED",
          message:
            "Không có quyền microphone hoặc speech recognition cho voice command.",
        });
        return;
      }

      safeSetState(setPermissionGranted, true);
    } catch (error) {
      updateStatus("error");
      onError?.(error);
      return;
    }

    try {
      isActiveRef.current = true;
      restartAttemptsRef.current = 0;

      ExpoSpeechRecognitionModule.start({
        lang: language,
        interimResults: true,
        continuous: true,
        androidIntentOptions: {
          EXTRA_LANGUAGE_MODEL: "web_search",
        },
      });
      log.info("Listening", apiUrl ? "(+server fallback)" : "(local only)");
    } catch (error) {
      log.error("Start error:", error);
      updateStatus("error");
      onError?.(error);
    }
  }, [
    apiUrl,
    enabled,
    language,
    onError,
    safeSetState,
    updateStatus,
  ]);

  const stopListening = useCallback(async () => {
    isActiveRef.current = false;
    clearRestartTimeout();
    pendingTranscriptRef.current = null;
    processingRef.current = false;
    safeSetState(setIsProcessing, false);

    try {
      ExpoSpeechRecognitionModule?.abort?.();
    } catch {}

    if (trackTranscript) {
      safeSetState(setTranscript, "");
    }

    updateStatus("idle");
  }, [clearRestartTimeout, safeSetState, trackTranscript, updateStatus]);

  useEffect(() => {
    if (enabled) {
      startListening();
    } else {
      stopListening();
    }
  }, [enabled, startListening, stopListening]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      isActiveRef.current = false;
      clearRestartTimeout();
      try {
        ExpoSpeechRecognitionModule?.abort?.();
      } catch {}
    };
  }, [clearRestartTimeout]);

  return {
    status,
    isListening: status === "listening",
    isProcessing,
    isOnline,
    permissionGranted,
    lastCommand,
    transcript,
    start: startListening,
    stop: stopListening,
  };
}
