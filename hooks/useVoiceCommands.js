import { useEffect, useRef, useCallback, useState } from "react";
import { AppState, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import NetInfo from "@react-native-community/netinfo";
import Constants from "expo-constants";

// expo-speech-recognition: native-only, không chạy được trên Expo Go
let ExpoSpeechRecognitionModule = null;
let useSpeechRecognitionEvent = (_event, _cb) => {}; // no-op fallback

const _isExpoGo = Constants.appOwnership === "expo";
if (!_isExpoGo) {
  try {
    const mod = require("expo-speech-recognition");
    ExpoSpeechRecognitionModule = mod.ExpoSpeechRecognitionModule;
    useSpeechRecognitionEvent = mod.useSpeechRecognitionEvent;
  } catch (e) {
    if (__DEV__) console.warn("expo-speech-recognition not available:", e);
  }
}

// ============ CONFIG ============
const CONFIG = {
  // Timing
  DEBOUNCE_MS: 800,
  API_TIMEOUT_MS: 5000,
  RESTART_DELAY_MS: 300,
  MAX_RESTART_ATTEMPTS: 5,
  RESTART_BACKOFF_MS: 1000,

  // API
  MAX_API_RETRIES: 2,
  API_RETRY_DELAY_MS: 500,

  // Filtering
  MAX_WORDS: 8,
  MIN_LENGTH: 1,
};

// ============ KEYWORD CONFIG ============
const COMMANDS = [
  {
    action: "INC_POINT",
    exact: [
      "điểm",
      "diem",
      "có",
      "co",
      "point",
      "yes",
      "được",
      "duoc",
      "vào",
      "vao",
    ],
    feedback: "Điểm",
  },
  {
    action: "SIDE_OUT",
    exact: ["đổi", "doi", "mất", "mat", "side", "out"],
    contains: ["đổi giao", "mất giao", "side out"],
    feedback: "Đổi giao",
  },
  {
    action: "TOGGLE_SERVER",
    exact: ["tay", "hai", "2"],
    contains: ["đổi tay", "doi tay"],
    feedback: "Đổi tay",
  },
  {
    action: "SWAP_SIDES",
    exact: ["bên", "ben"],
    contains: ["đổi bên", "doi ben"],
    feedback: "Đổi bên",
  },
  {
    action: "UNDO",
    exact: ["lại", "lai", "sai", "nhầm", "nham"],
    contains: ["hoàn tác", "hoan tac", "quay lại"],
    feedback: "Hoàn tác",
  },
  {
    action: "TIMEOUT",
    exact: ["nghỉ", "nghi", "timeout", "time"],
    feedback: "Timeout",
  },
  {
    action: "CONTINUE",
    exact: ["tiếp", "tiep", "chơi", "choi", "đi", "di"],
    contains: ["tiếp tục", "tiep tuc"],
    feedback: "Tiếp tục",
  },
];

const HINT_WORDS = [
  "điểm",
  "diem",
  "ghi",
  "cho",
  "được",
  "vào",
  "đổi",
  "doi",
  "mất",
  "mat",
  "chuyển",
  "tay",
  "bên",
  "ben",
  "lại",
  "lai",
  "sai",
  "nhầm",
  "hủy",
  "nghỉ",
  "nghi",
  "timeout",
  "tiếp",
  "tiep",
  "tục",
  "chơi",
];

// ============ LOGGER ============
const LOG_ENABLED = __DEV__;

const log = {
  info: (...args) => LOG_ENABLED && console.log("[Voice]", ...args),
  warn: (...args) => LOG_ENABLED && console.warn("[Voice]", ...args),
  error: (...args) => console.error("[Voice]", ...args),
};

// ============ HELPERS ============
const normalize = (text) => {
  if (!text) return "";
  return text
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[.,!?]/g, "");
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ============ KEYWORD MATCHING ============
function matchKeyword(text) {
  if (!text || text.length < CONFIG.MIN_LENGTH) return null;

  const lower = text.toLowerCase().trim();
  const normalized = normalize(text);
  const words = lower.split(/\s+/);
  const firstWord = words[0];

  for (const cmd of COMMANDS) {
    // Exact match
    if (cmd.exact) {
      for (const kw of cmd.exact) {
        if (
          lower === kw ||
          firstWord === kw ||
          normalized === normalize(kw) ||
          normalize(firstWord) === normalize(kw)
        ) {
          return {
            action: cmd.action,
            feedback: cmd.feedback,
            matched: kw,
            method: "keyword",
          };
        }
      }
    }
    // Contains match
    if (cmd.contains) {
      for (const kw of cmd.contains) {
        if (lower.includes(kw) || normalized.includes(normalize(kw))) {
          return {
            action: cmd.action,
            feedback: cmd.feedback,
            matched: kw,
            method: "keyword",
          };
        }
      }
    }
  }

  return null;
}

function looksLikeCommand(text) {
  if (!text) return false;

  const lower = text.toLowerCase();
  const normalized = normalize(text);
  const words = lower.split(/\s+/);

  if (words.length > CONFIG.MAX_WORDS) return false;
  if (text.length < CONFIG.MIN_LENGTH) return false;

  for (const hint of HINT_WORDS) {
    if (lower.includes(hint) || normalized.includes(normalize(hint))) {
      return true;
    }
  }

  return false;
}

// ============ API CALL WITH RETRY ============
async function callAPIWithRetry(
  apiUrl,
  transcript,
  retries = CONFIG.MAX_API_RETRIES
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);

  try {
    const startTime = Date.now();

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`API ${res.status}`);
    }

    const data = await res.json();
    const latency = Date.now() - startTime;

    log.info(`API ${latency}ms | "${transcript}" → ${data.intent || "null"}`);

    if (data.intent && data.feedback) {
      return { action: data.intent, feedback: data.feedback, method: "ai" };
    }

    return null;
  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === "AbortError") {
      log.warn("API timeout");
    } else {
      log.warn("API error:", err.message);
    }

    if (retries > 0) {
      await sleep(CONFIG.API_RETRY_DELAY_MS);
      return callAPIWithRetry(apiUrl, transcript, retries - 1);
    }

    return null;
  }
}

// ============ MAIN HOOK ============
export function useVoiceCommands({
  enabled = false,
  onCommand,
  onError,
  onStatusChange,
  apiUrl,
  hapticFeedback = true,
  language = "vi-VN",
}) {
  // ===== STATE =====
  const [status, setStatus] = useState("idle"); // idle | starting | listening | processing | error
  const [lastCommand, setLastCommand] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [permissionGranted, setPermissionGranted] = useState(null);

  // ===== REFS =====
  const isActiveRef = useRef(false);
  const isMountedRef = useRef(true);
  const lastCommandTimeRef = useRef(0);
  const restartTimeoutRef = useRef(null);
  const restartAttemptsRef = useRef(0);
  const processingRef = useRef(false);
  const pendingTranscriptRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);

  // ===== HELPERS =====
  const safeSetState = useCallback((setter, value) => {
    if (isMountedRef.current) {
      setter(value);
    }
  }, []);

  const updateStatus = useCallback(
    (newStatus) => {
      safeSetState(setStatus, newStatus);
      onStatusChange?.(newStatus);
    },
    [onStatusChange, safeSetState]
  );

  const clearRestartTimeout = useCallback(() => {
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
  }, []);

  // ===== PROCESS TRANSCRIPT =====
  const processTranscript = useCallback(
    async (text) => {
      if (!text || !isMountedRef.current) return;

      if (processingRef.current) {
        pendingTranscriptRef.current = text;
        return;
      }

      const now = Date.now();
      if (now - lastCommandTimeRef.current < CONFIG.DEBOUNCE_MS) {
        log.info("Debounced");
        return;
      }

      log.info("📝", text);

      // === STEP 1: KEYWORD MATCH ===
      const keywordResult = matchKeyword(text);

      if (keywordResult) {
        log.info("✅ Keyword:", keywordResult.action);
        lastCommandTimeRef.current = Date.now();

        const command = { ...keywordResult, transcript: text };
        safeSetState(setLastCommand, command);

        if (hapticFeedback) {
          try {
            await Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success
            );
          } catch {}
        }

        onCommand?.(command);
        return;
      }

      // === STEP 2: CHECK HINT WORDS ===
      if (!looksLikeCommand(text)) {
        log.info("⏭️ Skip noise");
        return;
      }

      // === STEP 3: API (nếu có + online) ===
      if (!apiUrl) {
        log.info("❓ No match, no API");
        return;
      }

      if (!isOnline) {
        log.warn("📴 Offline, skip API");
        return;
      }

      log.info("🤖 Calling API...");
      processingRef.current = true;
      safeSetState(setIsProcessing, true);
      updateStatus("processing");

      try {
        const result = await callAPIWithRetry(apiUrl, text);

        if (result && isMountedRef.current) {
          lastCommandTimeRef.current = Date.now();

          const command = { ...result, transcript: text };
          log.info("✅ API:", result.action);
          safeSetState(setLastCommand, command);

          if (hapticFeedback) {
            try {
              await Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success
              );
            } catch {}
          }

          onCommand?.(command);
        }
      } catch (err) {
        log.error("Process error:", err);
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
    [apiUrl, isOnline, hapticFeedback, onCommand, safeSetState, updateStatus]
  );

  // ===== RESTART LISTENING =====
  const restartListening = useCallback(async () => {
    if (!enabled || !isActiveRef.current || !isMountedRef.current) return;

    clearRestartTimeout();

    const backoff = Math.min(
      CONFIG.RESTART_DELAY_MS +
        restartAttemptsRef.current * CONFIG.RESTART_BACKOFF_MS,
      3000
    );

    restartTimeoutRef.current = setTimeout(async () => {
      if (!isActiveRef.current || !isMountedRef.current) return;

      try {
        ExpoSpeechRecognitionModule?.start({
          lang: language,
          interimResults: true,
          continuous: true,
        });

        restartAttemptsRef.current = 0;
        log.info("🔄 Restarted");
      } catch (err) {
        restartAttemptsRef.current++;

        if (restartAttemptsRef.current >= CONFIG.MAX_RESTART_ATTEMPTS) {
          log.error("Max restart attempts reached");
          updateStatus("error");
          onError?.({
            code: "MAX_RESTART",
            message: "Không thể khởi động lại voice",
          });
          return;
        }

        log.warn(`Restart failed (${restartAttemptsRef.current}), retrying...`);
        restartListening();
      }
    }, backoff);
  }, [enabled, language, clearRestartTimeout, updateStatus, onError]);

  // ===== SPEECH RECOGNITION EVENTS =====
  useSpeechRecognitionEvent("start", () => {
    log.info("🎤 Started");
    updateStatus("listening");
  });

  useSpeechRecognitionEvent("end", () => {
    log.info("🔇 Ended");
    if (isActiveRef.current && isMountedRef.current) {
      restartListening();
    }
  });

  useSpeechRecognitionEvent("result", (event) => {
    const result = event.results[event.resultIndex];
    if (result) {
      const text = result[0]?.transcript || "";
      safeSetState(setTranscript, text);

      // Process khi có kết quả final
      if (result.isFinal && text) {
        processTranscript(text);
      }
    }
  });

  useSpeechRecognitionEvent("error", (event) => {
    const errorType = event.error;

    // Các lỗi có thể bỏ qua và restart
    const ignorableErrors = [
      "no-speech",
      "aborted",
      "network",
      "audio-capture",
    ];

    if (ignorableErrors.includes(errorType)) {
      log.info(`Ignorable error: ${errorType}, restarting...`);
      restartListening();
      return;
    }

    log.error("Error:", errorType, event.message);
    onError?.({ code: errorType, message: event.message });
    restartListening();
  });

  // ===== NETWORK LISTENER =====
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected && state.isInternetReachable !== false;
      safeSetState(setIsOnline, online);
      log.info(online ? "🌐 Online" : "📴 Offline");
    });

    return () => unsubscribe();
  }, [safeSetState]);

  // ===== APP STATE LISTENER =====
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      async (nextState) => {
        const prevState = appStateRef.current;
        appStateRef.current = nextState;

        if (prevState.match(/inactive|background/) && nextState === "active") {
          log.info("App active, restarting voice...");
          if (enabled && isActiveRef.current) {
            restartListening();
          }
        }

        if (nextState.match(/inactive|background/)) {
          log.info("App background, stopping voice...");
          clearRestartTimeout();
          try {
            ExpoSpeechRecognitionModule?.abort();
          } catch {}
        }
      }
    );

    return () => subscription.remove();
  }, [enabled, restartListening, clearRestartTimeout]);

  // ===== START LISTENING =====
  const startListening = useCallback(async () => {
    if (!enabled || !isMountedRef.current) return;

    log.info("Starting...");
    updateStatus("starting");

    // Request permission
    try {
      const result =
        await ExpoSpeechRecognitionModule?.requestPermissionsAsync();

      if (!result?.granted) {
        log.error("Permission denied");
        safeSetState(setPermissionGranted, false);
        updateStatus("error");
        onError?.({
          code: "PERMISSION_DENIED",
          message: "Không có quyền microphone hoặc speech recognition",
        });
        return;
      }

      safeSetState(setPermissionGranted, true);
    } catch (err) {
      log.error("Permission error:", err);
      updateStatus("error");
      onError?.(err);
      return;
    }

    try {
      isActiveRef.current = true;
      restartAttemptsRef.current = 0;

      ExpoSpeechRecognitionModule?.start({
        lang: language,
        interimResults: true,
        continuous: true, // Continuous mode để tránh beep và auto-restart
        // Android specific - dùng web_search model cho accuracy tốt hơn với single words
        androidIntentOptions: {
          EXTRA_LANGUAGE_MODEL: "web_search",
        },
      });

      log.info("🟢 Started", apiUrl ? "(+API)" : "");
    } catch (err) {
      log.error("Start error:", err);
      updateStatus("error");
      onError?.(err);

      setTimeout(() => {
        if (enabled && isMountedRef.current) {
          startListening();
        }
      }, 1000);
    }
  }, [enabled, language, apiUrl, updateStatus, onError, safeSetState]);

  // ===== STOP LISTENING =====
  const stopListening = useCallback(async () => {
    log.info("Stopping...");

    isActiveRef.current = false;
    clearRestartTimeout();

    try {
      ExpoSpeechRecognitionModule?.abort();
    } catch {}

    safeSetState(setTranscript, "");
    updateStatus("idle");

    log.info("🔴 Stopped");
  }, [clearRestartTimeout, safeSetState, updateStatus]);

  // ===== ENABLE/DISABLE =====
  useEffect(() => {
    if (enabled) {
      startListening();
    } else {
      stopListening();
    }
  }, [enabled, startListening, stopListening]);

  // ===== CLEANUP =====
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      isActiveRef.current = false;
      clearRestartTimeout();
      try {
        ExpoSpeechRecognitionModule?.abort();
      } catch {}
    };
  }, [clearRestartTimeout]);

  // ===== RETURN =====
  return {
    // Status
    status,
    isListening: status === "listening",
    isProcessing,
    isOnline,
    permissionGranted,

    // Data
    lastCommand,
    transcript,

    // Actions
    start: startListening,
    stop: stopListening,
  };
}
