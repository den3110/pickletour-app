import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { router, useGlobalSearchParams, usePathname, useSegments } from "expo-router";
import Toast from "react-native-toast-message";
import { useSelector } from "react-redux";

import { useChatBotPageContext } from "@/context/ChatBotPageContext";
import {
  useClearChatHistoryMutation,
  useClearLearningMemoryMutation,
  useCommitChatMutationMutation,
  useLazyGetChatHistoryQuery,
  useSendChatFeedbackMutation,
  useSendChatTelemetryEventMutation,
  useSendMessageMutation,
} from "@/slices/chatApiSlice";
import { runPikoraAction } from "./pikoraNavigation";
import {
  applyLocalMutationFallback,
  getOrCreatePikoraCohortId,
  loadStoredModes,
  loadStoredSessionFocusOverride,
  persistMode,
  persistSessionFocusOverride,
  PIKORA_ASSISTANT_MODE_KEY,
  PIKORA_REASONING_MODE_KEY,
  PIKORA_VERIFICATION_MODE_KEY,
} from "./pikoraStorage";
import { sendPikoraMessageStream } from "./pikoraStream";
import type {
  PikoraAction,
  PikoraAssistantMode,
  PikoraMessage,
  PikoraMutationPreview,
  PikoraReasoningMode,
  PikoraSessionFocus,
  PikoraSessionFocusOverride,
  PikoraUiSurface,
  PikoraVerificationMode,
  PikoraWorkflow,
} from "./pikoraTypes";
import {
  buildBotMessageFromPayload,
  buildOptimisticUserMessage,
  buildStreamingDraft,
  getFallbackRouteContext,
  makeClientMessageId,
  mapBackendMessage,
  mergePageSnapshot,
  normalizeAssistantMode,
  normalizeReasoningMode,
  normalizeSessionFocus,
  normalizeSessionFocusOverride,
  normalizeVerificationMode,
  uniqueSuggestionList,
} from "./pikoraUtils";

type PendingActionConfirm = {
  action: PikoraAction;
  message?: PikoraMessage | null;
  presentation: PikoraUiSurface;
} | null;

type PendingWorkflowConfirm = {
  workflow: PikoraWorkflow;
  message?: PikoraMessage | null;
  presentation: PikoraUiSurface;
} | null;

type PendingMutationConfirm = {
  mutationPreview: PikoraMutationPreview;
  message?: PikoraMessage | null;
} | null;

type FeedbackDialogState = {
  messageId: string;
} | null;

type PikoraContextValue = {
  overlayOpen: boolean;
  openOverlay: () => void;
  closeOverlay: () => void;
  openChatScreen: () => void;
  input: string;
  setInput: (value: string) => void;
  messages: PikoraMessage[];
  liveDraft: PikoraMessage | null;
  isTyping: boolean;
  historyLoading: boolean;
  hasMoreHistory: boolean;
  loadOlderHistory: () => Promise<void>;
  sendMessage: (presentation: PikoraUiSurface, presetText?: string) => Promise<void>;
  sendSuggestion: (text: string, presentation: PikoraUiSurface) => Promise<void>;
  stopStreaming: () => void;
  clearHistory: () => Promise<void>;
  clearLearning: () => Promise<void>;
  reasoningMode: PikoraReasoningMode;
  assistantMode: PikoraAssistantMode;
  verificationMode: PikoraVerificationMode;
  setReasoningMode: (value: PikoraReasoningMode) => Promise<void>;
  setAssistantMode: (value: PikoraAssistantMode) => Promise<void>;
  setVerificationMode: (value: PikoraVerificationMode) => Promise<void>;
  sessionFocusOverride: PikoraSessionFocusOverride;
  setSessionFocusAuto: () => Promise<void>;
  setSessionFocusOff: () => Promise<void>;
  pinSessionFocus: (focus?: PikoraSessionFocus | null) => Promise<void>;
  routePageSnapshot: ReturnType<typeof mergePageSnapshot>;
  capabilityKeys: string[];
  currentPath: string;
  currentUrl: string;
  currentPageTitle: string;
  suggestions: string[];
  latestSessionFocus: PikoraSessionFocus | null;
  requestAction: (
    action: PikoraAction,
    message: PikoraMessage | null | undefined,
    presentation: PikoraUiSurface,
  ) => Promise<void>;
  requestWorkflow: (
    workflow: PikoraWorkflow,
    message: PikoraMessage | null | undefined,
    presentation: PikoraUiSurface,
  ) => Promise<void>;
  requestMutation: (
    mutationPreview: PikoraMutationPreview,
    message: PikoraMessage | null | undefined,
  ) => Promise<void>;
  openSource: (
    source: Record<string, any>,
    presentation: PikoraUiSurface,
  ) => Promise<void>;
  pendingActionConfirm: PendingActionConfirm;
  pendingWorkflowConfirm: PendingWorkflowConfirm;
  pendingMutationConfirm: PendingMutationConfirm;
  confirmPendingAction: () => Promise<void>;
  cancelPendingAction: () => void;
  confirmPendingWorkflow: () => Promise<void>;
  cancelPendingWorkflow: () => Promise<void>;
  confirmPendingMutation: () => Promise<void>;
  cancelPendingMutation: () => Promise<void>;
  feedbackEnabled: boolean;
  feedbackDialog: FeedbackDialogState;
  feedbackSubmittingId: string;
  requestFeedback: (message: PikoraMessage, value: "positive" | "negative") => Promise<void>;
  closeFeedbackDialog: () => void;
  submitNegativeFeedback: (reason: string, note: string) => Promise<void>;
};

const PikoraContext = createContext<PikoraContextValue | null>(null);

function mergeMessages(existing: PikoraMessage[], incoming: PikoraMessage[]) {
  const map = new Map<string, PikoraMessage>();
  [...existing, ...incoming].forEach((item) => {
    map.set(item.id, item);
  });

  return Array.from(map.values()).sort((left, right) => {
    const leftTime = new Date(left.createdAt || 0).getTime();
    const rightTime = new Date(right.createdAt || 0).getTime();
    return leftTime - rightTime;
  });
}

function finalizeThinkingSteps(message?: PikoraMessage | null) {
  return Array.isArray(message?.thinkingSteps)
    ? message!.thinkingSteps!.map((step) => ({
        ...step,
        status: step?.status === "running" ? "done" : step?.status || "done",
      }))
    : [];
}

function getDefaultSuggestions(pageType = "", isAuthed = false) {
  if (pageType.startsWith("tournament")) {
    return ["Lịch thi đấu giải này", "Mở nhánh đấu", "Luật của giải này"];
  }
  if (pageType.startsWith("club")) {
    return ["CLB này có gì mới?", "Mở chi tiết CLB", "Cách tham gia CLB"];
  }
  if (pageType.startsWith("news")) {
    return ["Tóm tắt bài này", "Tin mới nhất", "Bài này nói gì quan trọng?"];
  }
  if (pageType.startsWith("live")) {
    return ["Có trận nào đang live?", "Mở live studio", "Luồng live nào đang chạy?"];
  }
  if (pageType.startsWith("match")) {
    return ["Tóm tắt trận này", "Mở referee", "Tỷ số hiện tại"];
  }

  return isAuthed
    ? ["Giải của tôi", "Bảng xếp hạng", "Tin mới nhất"]
    : ["Giải nào sắp diễn ra?", "Cách đăng ký tài khoản", "Tin mới nhất"];
}

function extractWorkflowAction(step: Record<string, any> | null | undefined) {
  if (!step || typeof step !== "object") return null;
  if (step.action && typeof step.action === "object") {
    return step.action as PikoraAction;
  }
  if (step.type || step.path || step.payload) {
    return step as unknown as PikoraAction;
  }
  return null;
}

function getErrorMessage(error: any) {
  return (
    error?.data?.message ||
    error?.data?.error ||
    error?.message ||
    error?.error ||
    "Pikora đang bận, vui lòng thử lại."
  );
}

export function PikoraProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const segments = useSegments();
  const globalParams = useGlobalSearchParams();
  const { snapshot, capabilityKeys: registeredCapabilityKeys, getActionHandler } =
    useChatBotPageContext();
  const userInfo = useSelector((state: any) => state.auth?.userInfo || null);
  const [sendMessageRequest] = useSendMessageMutation();
  const [triggerHistory] = useLazyGetChatHistoryQuery();
  const [clearChatHistoryRequest] = useClearChatHistoryMutation();
  const [clearLearningRequest] = useClearLearningMemoryMutation();
  const [sendFeedbackRequest] = useSendChatFeedbackMutation();
  const [sendTelemetryRequest] = useSendChatTelemetryEventMutation();
  const [commitMutationRequest] = useCommitChatMutationMutation();

  const [overlayOpen, setOverlayOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<PikoraMessage[]>([]);
  const [liveDraft, setLiveDraft] = useState<PikoraMessage | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [reasoningMode, setReasoningModeState] = useState<PikoraReasoningMode>("auto");
  const [assistantMode, setAssistantModeState] =
    useState<PikoraAssistantMode>("balanced");
  const [verificationMode, setVerificationModeState] =
    useState<PikoraVerificationMode>("balanced");
  const [sessionFocusOverride, setSessionFocusOverrideState] =
    useState<PikoraSessionFocusOverride>({ mode: "auto", sessionFocus: null });
  const [cohortId, setCohortId] = useState("");
  const [pendingActionConfirm, setPendingActionConfirm] =
    useState<PendingActionConfirm>(null);
  const [pendingWorkflowConfirm, setPendingWorkflowConfirm] =
    useState<PendingWorkflowConfirm>(null);
  const [pendingMutationConfirm, setPendingMutationConfirm] =
    useState<PendingMutationConfirm>(null);
  const [feedbackDialog, setFeedbackDialog] = useState<FeedbackDialogState>(null);
  const [feedbackSubmittingId, setFeedbackSubmittingId] = useState("");

  const liveDraftRef = useRef<PikoraMessage | null>(null);
  const historyHydratedUserIdRef = useRef("");
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    liveDraftRef.current = liveDraft;
  }, [liveDraft]);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const [storedModes, storedFocusOverride, nextCohortId] = await Promise.all([
          loadStoredModes(),
          loadStoredSessionFocusOverride(),
          getOrCreatePikoraCohortId(),
        ]);
        if (!mounted) return;

        setReasoningModeState(storedModes.reasoningMode);
        setAssistantModeState(storedModes.assistantMode);
        setVerificationModeState(storedModes.verificationMode);
        setSessionFocusOverrideState(storedFocusOverride);
        setCohortId(nextCohortId);
      } catch (error) {
        console.log("[Pikora] load local state error:", error);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const fallbackRouteContext = useMemo(
    () =>
      getFallbackRouteContext(
        segments as string[],
        globalParams as Record<string, unknown>,
        pathname || "",
      ),
    [globalParams, pathname, segments],
  );

  const routePageSnapshot = useMemo(
    () => mergePageSnapshot(snapshot, fallbackRouteContext.pageSnapshot),
    [fallbackRouteContext.pageSnapshot, snapshot],
  );

  const capabilityKeys = useMemo(() => {
    const seen = new Set<string>();
    return [
      ...(Array.isArray(registeredCapabilityKeys) ? registeredCapabilityKeys : []),
      ...(Array.isArray(fallbackRouteContext.capabilityKeys)
        ? fallbackRouteContext.capabilityKeys
        : []),
    ]
      .map((item) => String(item || "").trim().toLowerCase())
      .filter(Boolean)
      .filter((item) => {
        if (seen.has(item)) return false;
        seen.add(item);
        return true;
      });
  }, [fallbackRouteContext.capabilityKeys, registeredCapabilityKeys]);

  const latestSessionFocus = useMemo(() => {
    if (liveDraft?.sessionFocus) {
      return normalizeSessionFocus(liveDraft.sessionFocus);
    }

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const current = normalizeSessionFocus(messages[index]?.sessionFocus);
      if (current) return current;
    }
    return null;
  }, [liveDraft?.sessionFocus, messages]);

  const suggestions = useMemo(() => {
    const liveSuggestions = uniqueSuggestionList(liveDraft?.suggestions, 4);
    if (liveSuggestions.length) return liveSuggestions;

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const next = uniqueSuggestionList(messages[index]?.suggestions, 4);
      if (next.length) return next;
    }

    return getDefaultSuggestions(routePageSnapshot?.pageType || "", Boolean(userInfo?._id));
  }, [liveDraft?.suggestions, messages, routePageSnapshot?.pageType, userInfo?._id]);

  const currentPath = fallbackRouteContext.currentPath;
  const currentUrl = fallbackRouteContext.currentUrl;
  const currentPageTitle =
    String(routePageSnapshot?.entityTitle || fallbackRouteContext.pageTitle || "Pikora");

  const hydrateHistory = useCallback(
    async (before?: string | null) => {
      if (!userInfo?.token || historyLoading) return;

      setHistoryLoading(true);
      try {
        const response = await triggerHistory(
          { before: before || undefined, limit: 20 },
          true,
        ).unwrap();
        const mappedMessages = Array.isArray(response?.messages)
          ? response.messages.map((item: Record<string, any>) => mapBackendMessage(item))
          : [];

        setMessages((previous) =>
          before ? mergeMessages(mappedMessages, previous) : mergeMessages([], mappedMessages),
        );
        setHasMoreHistory(Boolean(response?.hasMore));
        setHistoryCursor(response?.nextCursor ? String(response.nextCursor) : null);
      } catch (error) {
        console.log("[Pikora] get history error:", error);
      } finally {
        setHistoryLoading(false);
      }
    },
    [historyLoading, triggerHistory, userInfo?.token],
  );

  useEffect(() => {
    const nextUserId = String(userInfo?._id || "");
    if (!nextUserId) {
      historyHydratedUserIdRef.current = "";
      setHasMoreHistory(false);
      setHistoryCursor(null);
      return;
    }

    if (historyHydratedUserIdRef.current === nextUserId) return;
    historyHydratedUserIdRef.current = nextUserId;
    void hydrateHistory();
  }, [hydrateHistory, userInfo?._id]);

  const logClientEvent = useCallback(
    async ({
      messageId,
      type,
      label,
      actionType,
      success,
      detail,
    }: {
      messageId?: string;
      type: string;
      label?: string;
      actionType?: string;
      success?: boolean;
      detail?: string;
    }) => {
      if (!type) return;
      try {
        await sendTelemetryRequest({
          messageId,
          type,
          label,
          actionType,
          success,
          detail,
          surface: "mobile",
        }).unwrap();
      } catch (error) {
        console.log("[Pikora] telemetry error:", error);
      }
    },
    [sendTelemetryRequest],
  );

  const finalizeDraft = useCallback(
    (overrides: Partial<PikoraMessage> = {}, options?: { dropIfEmpty?: boolean }) => {
      const currentDraft = liveDraftRef.current;
      abortControllerRef.current = null;
      setIsTyping(false);

      if (!currentDraft) {
        setLiveDraft(null);
        return;
      }

      const finalized: PikoraMessage = {
        ...currentDraft,
        ...overrides,
        isStreaming: false,
        thinkingSteps: overrides.thinkingSteps || finalizeThinkingSteps(currentDraft),
      };

      setLiveDraft(null);

      const hasRenderableContent = Boolean(
        finalized.text.trim() ||
          finalized.rawThinking ||
          finalized.answerCards?.length ||
          finalized.actions?.length ||
          finalized.sources?.length ||
          finalized.workflow ||
          finalized.mutationPreview,
      );

      if (options?.dropIfEmpty && !hasRenderableContent) {
        return;
      }

      setMessages((previous) => mergeMessages(previous, [finalized]));
    },
    [],
  );

  const openOverlay = useCallback(() => {
    setOverlayOpen(true);
  }, []);

  const closeOverlay = useCallback(() => {
    setOverlayOpen(false);
  }, []);

  const openChatScreen = useCallback(() => {
    setOverlayOpen(false);
    router.push("/(tabs)/chat" as any);
  }, []);

  const setReasoningMode = useCallback(async (value: PikoraReasoningMode) => {
    const nextValue = normalizeReasoningMode(value);
    setReasoningModeState(nextValue);
    await persistMode(PIKORA_REASONING_MODE_KEY, nextValue);
  }, []);

  const setAssistantMode = useCallback(async (value: PikoraAssistantMode) => {
    const nextValue = normalizeAssistantMode(value);
    setAssistantModeState(nextValue);
    await persistMode(PIKORA_ASSISTANT_MODE_KEY, nextValue);
  }, []);

  const setVerificationMode = useCallback(
    async (value: PikoraVerificationMode) => {
      const nextValue = normalizeVerificationMode(value);
      setVerificationModeState(nextValue);
      await persistMode(PIKORA_VERIFICATION_MODE_KEY, nextValue);
    },
    [],
  );

  const applySessionFocusOverride = useCallback(
    async (override: PikoraSessionFocusOverride) => {
      const normalized = normalizeSessionFocusOverride(override);
      setSessionFocusOverrideState(normalized);
      await persistSessionFocusOverride(normalized);
    },
    [],
  );

  const setSessionFocusAuto = useCallback(async () => {
    await applySessionFocusOverride({ mode: "auto", sessionFocus: null });
  }, [applySessionFocusOverride]);

  const setSessionFocusOff = useCallback(async () => {
    await applySessionFocusOverride({ mode: "off", sessionFocus: null });
  }, [applySessionFocusOverride]);

  const pinSessionFocus = useCallback(
    async (focus?: PikoraSessionFocus | null) => {
      const normalized = normalizeSessionFocus(focus || latestSessionFocus);
      if (!normalized) return;
      await applySessionFocusOverride({ mode: "pin", sessionFocus: normalized });
    },
    [applySessionFocusOverride, latestSessionFocus],
  );

  const executeAction = useCallback(
    async (
      action: PikoraAction,
      message: PikoraMessage | null | undefined,
      presentation: PikoraUiSurface,
    ) => {
      const result = await runPikoraAction(action, {
        currentPath,
        currentUrl,
        currentParams: fallbackRouteContext.params,
        presentation,
        getActionHandler,
        closeOverlay,
      });

      await logClientEvent({
        messageId: message?.id || action?.messageId,
        type:
          result.status === "degraded" ? "action_degraded" : "action_executed",
        label: action?.label || action?.description || action?.type || "action",
        actionType: action?.type || "",
        success: true,
        detail: String(result.detail || ""),
      });

      Toast.show({
        type: result.status === "degraded" ? "info" : "success",
        text1:
          result.status === "degraded" ? "Đã dùng hướng thay thế" : "Đã chạy thao tác",
        text2: action?.label || action?.description || "Pikora đã xử lý yêu cầu.",
      });
    },
    [
      closeOverlay,
      currentPath,
      currentUrl,
      fallbackRouteContext.params,
      getActionHandler,
      logClientEvent,
    ],
  );

  const executeWorkflow = useCallback(
    async (
      workflow: PikoraWorkflow,
      message: PikoraMessage | null | undefined,
      presentation: PikoraUiSurface,
    ) => {
      const steps = Array.isArray(workflow?.steps) ? workflow.steps : [];
      let finalStatus: "workflow_executed" | "workflow_degraded" | "workflow_unsupported" =
        "workflow_executed";

      for (const rawStep of steps) {
        const action = extractWorkflowAction(rawStep as Record<string, any>);
        if (!action) {
          finalStatus = "workflow_unsupported";
          break;
        }

        try {
          const result = await runPikoraAction(action, {
            currentPath,
            currentUrl,
            currentParams: fallbackRouteContext.params,
            presentation,
            getActionHandler,
            closeOverlay,
          });
          if (result.status === "degraded" && finalStatus === "workflow_executed") {
            finalStatus = "workflow_degraded";
          }
        } catch {
          finalStatus = "workflow_unsupported";
          break;
        }
      }

      await logClientEvent({
        messageId: message?.id,
        type: finalStatus,
        label: workflow?.title || "workflow",
        actionType: "workflow",
        success: finalStatus !== "workflow_unsupported",
        detail: workflow?.runLabel || "",
      });

      if (finalStatus === "workflow_unsupported") {
        throw new Error("Workflow chưa thể chạy trọn vẹn trên màn hình hiện tại.");
      }

      Toast.show({
        type: "success",
        text1: "Đã chạy workflow",
        text2: workflow?.title || "Pikora đã hoàn tất chuỗi thao tác.",
      });
    },
    [
      closeOverlay,
      currentPath,
      currentUrl,
      fallbackRouteContext.params,
      getActionHandler,
      logClientEvent,
    ],
  );

  const commitMutation = useCallback(
    async (mutationPreview: PikoraMutationPreview, message: PikoraMessage | null | undefined) => {
      const response = await commitMutationRequest({
        mutationPreview,
        surface: "mobile",
      }).unwrap();

      await applyLocalMutationFallback(response?.mutation || mutationPreview);

      const payload = response?.mutation?.payload || mutationPreview?.payload || {};
      if (mutationPreview.type === "save_bot_preference") {
        if ((payload as Record<string, unknown>)?.reasoningMode) {
          setReasoningModeState(
            normalizeReasoningMode(String((payload as Record<string, unknown>).reasoningMode)),
          );
        }
        if ((payload as Record<string, unknown>)?.assistantMode) {
          setAssistantModeState(
            normalizeAssistantMode(String((payload as Record<string, unknown>).assistantMode)),
          );
        }
        if ((payload as Record<string, unknown>)?.verificationMode) {
          setVerificationModeState(
            normalizeVerificationMode(
              String((payload as Record<string, unknown>).verificationMode),
            ),
          );
        }
      }

      await logClientEvent({
        messageId: message?.id,
        type: "mutation_confirmed",
        label: mutationPreview?.title || mutationPreview?.type || "mutation",
        actionType: mutationPreview?.type || "",
        success: true,
        detail: response?.message || "",
      });

      Toast.show({
        type: "success",
        text1: "Đã lưu thay đổi",
        text2: mutationPreview?.title || "Pikora đã áp dụng thay đổi nhẹ.",
      });
    },
    [commitMutationRequest, logClientEvent],
  );

  const updateMessageFeedback = useCallback(
    (messageId: string, feedback: Record<string, unknown> | null) => {
      setMessages((previous) =>
        previous.map((item) =>
          item.id === messageId ? { ...item, feedback } : item,
        ),
      );
      setLiveDraft((previous) =>
        previous?.id === messageId ? { ...previous, feedback } : previous,
      );
    },
    [],
  );

  const requestAction = useCallback(
    async (
      action: PikoraAction,
      message: PikoraMessage | null | undefined,
      presentation: PikoraUiSurface,
    ) => {
      if (action?.requiresConfirm) {
        setPendingActionConfirm({ action, message, presentation });
        return;
      }

      try {
        await executeAction(action, message, presentation);
      } catch (error) {
        await logClientEvent({
          messageId: message?.id || action?.messageId,
          type: "action_unsupported",
          label: action?.label || action?.description || action?.type || "action",
          actionType: action?.type || "",
          success: false,
          detail: getErrorMessage(error),
        });
        Toast.show({
          type: "error",
          text1: "Chưa thể chạy thao tác",
          text2: getErrorMessage(error),
        });
      }
    },
    [executeAction, logClientEvent],
  );

  const requestWorkflow = useCallback(
    async (
      workflow: PikoraWorkflow,
      message: PikoraMessage | null | undefined,
      presentation: PikoraUiSurface,
    ) => {
      if (!workflow?.steps?.length) return;
      if (workflow?.requiresConfirm !== false) {
        setPendingWorkflowConfirm({ workflow, message, presentation });
        return;
      }

      try {
        await executeWorkflow(workflow, message, presentation);
      } catch (error) {
        Toast.show({
          type: "error",
          text1: "Workflow chưa chạy được",
          text2: getErrorMessage(error),
        });
      }
    },
    [executeWorkflow],
  );

  const requestMutation = useCallback(
    async (
      mutationPreview: PikoraMutationPreview,
      message: PikoraMessage | null | undefined,
    ) => {
      if (!mutationPreview?.type) return;
      if (mutationPreview?.requiresConfirm !== false) {
        setPendingMutationConfirm({ mutationPreview, message });
        return;
      }

      try {
        await commitMutation(mutationPreview, message);
      } catch (error) {
        Toast.show({
          type: "error",
          text1: "Không thể lưu thay đổi",
          text2: getErrorMessage(error),
        });
      }
    },
    [commitMutation],
  );

  const openSource = useCallback(
    async (source: Record<string, any>, presentation: PikoraUiSurface) => {
      const target =
        source?.deepLink || source?.path || source?.url || source?.href || source?.value;
      if (!target) return;

      try {
        await executeAction(
          {
            type: /^https?:/i.test(String(target)) ? "open_new_tab" : "navigate",
            label: String(source?.label || source?.title || "Mở nguồn"),
            path: String(target),
          },
          null,
          presentation,
        );
      } catch (error) {
        Toast.show({
          type: "error",
          text1: "Không mở được nguồn",
          text2: getErrorMessage(error),
        });
      }
    },
    [executeAction],
  );

  const requestFeedback = useCallback(
    async (message: PikoraMessage, value: "positive" | "negative") => {
      if (!userInfo?._id) return;
      if (value === "negative") {
        setFeedbackDialog({ messageId: message.id });
        return;
      }

      setFeedbackSubmittingId(message.id);
      try {
        const response = await sendFeedbackRequest({
          messageId: message.id,
          value,
        }).unwrap();
        updateMessageFeedback(message.id, response?.feedback || { value });
      } catch (error) {
        Toast.show({
          type: "error",
          text1: "Không gửi được phản hồi",
          text2: getErrorMessage(error),
        });
      } finally {
        setFeedbackSubmittingId("");
      }
    },
    [sendFeedbackRequest, updateMessageFeedback, userInfo?._id],
  );

  const closeFeedbackDialog = useCallback(() => {
    setFeedbackDialog(null);
  }, []);

  const submitNegativeFeedback = useCallback(
    async (reason: string, note: string) => {
      const currentMessageId = feedbackDialog?.messageId;
      if (!currentMessageId) return;

      setFeedbackSubmittingId(currentMessageId);
      try {
        const response = await sendFeedbackRequest({
          messageId: currentMessageId,
          value: "negative",
          reason,
          note,
        }).unwrap();
        updateMessageFeedback(
          currentMessageId,
          response?.feedback || { value: "negative", reason, note },
        );
        setFeedbackDialog(null);
      } catch (error) {
        Toast.show({
          type: "error",
          text1: "Không gửi được phản hồi",
          text2: getErrorMessage(error),
        });
      } finally {
        setFeedbackSubmittingId("");
      }
    },
    [feedbackDialog?.messageId, sendFeedbackRequest, updateMessageFeedback],
  );

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const sendMessage = useCallback(
    async (presentation: PikoraUiSurface, presetText?: string) => {
      const text = String(presetText ?? input).trim();
      if (!text || isTyping) return;

      const optimisticUserMessage = buildOptimisticUserMessage(text);
      const initialDraft = buildStreamingDraft();

      setMessages((previous) => mergeMessages(previous, [optimisticUserMessage]));
      setLiveDraft(initialDraft);
      setInput("");
      setIsTyping(true);

      const requestPayload = {
        message: text,
        reasoningMode,
        assistantMode,
        verificationMode,
        pageSnapshot: routePageSnapshot,
        capabilityKeys,
        sessionFocusOverride:
          sessionFocusOverride.mode === "auto" ? null : sessionFocusOverride,
        cohortId,
        surface: "mobile",
      };

      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (presetText) {
        await logClientEvent({
          messageId: optimisticUserMessage.id,
          type: "suggestion_clicked",
          label: text,
          actionType: "suggestion",
          success: true,
          detail: currentPath,
        });
      }

      const updateDraft = (updater: (draft: PikoraMessage) => PikoraMessage) => {
        setLiveDraft((previous) => {
          const base = previous || buildStreamingDraft();
          const nextDraft = updater(base);
          liveDraftRef.current = nextDraft;
          return nextDraft;
        });
      };

      try {
        await sendPikoraMessageStream({
          token: userInfo?.token || "",
          ...requestPayload,
          currentPath,
          currentUrl,
          pageTitle: currentPageTitle,
          pageType: routePageSnapshot?.pageType,
          pageSection: routePageSnapshot?.pageSection,
          pageView: routePageSnapshot?.pageView,
          clubId: routePageSnapshot?.clubId,
          newsSlug: routePageSnapshot?.newsSlug,
          profileUserId:
            currentPath.startsWith("/profile/")
              ? String((fallbackRouteContext.params as Record<string, unknown>)?.id || "")
              : "",
          courtId: routePageSnapshot?.courtId,
          signal: controller.signal,
          onEvent: (event, data) => {
            if (event === "thinking") {
              updateDraft((draft) => ({
                ...draft,
                thinkingSteps: [
                  ...(draft.thinkingSteps || []).filter(
                    (step) => step?.label !== String(data?.step || ""),
                  ),
                  {
                    id: makeClientMessageId("step"),
                    label: String(data?.step || "Đang xử lý..."),
                    status: "done",
                  },
                ],
              }));
              return;
            }

            if (event === "tool_start") {
              updateDraft((draft) => ({
                ...draft,
                thinkingSteps: [
                  ...(draft.thinkingSteps || []),
                  {
                    id: makeClientMessageId("tool"),
                    label: String(data?.label || data?.tool || "Đang chạy tool"),
                    status: "running",
                  },
                ],
              }));
              return;
            }

            if (event === "tool_done") {
              updateDraft((draft) => {
                const nextSteps = [...(draft.thinkingSteps || [])];
                for (let index = nextSteps.length - 1; index >= 0; index -= 1) {
                  if (nextSteps[index]?.status === "running") {
                    nextSteps[index] = {
                      ...nextSteps[index],
                      label: String(
                        data?.resultPreview || data?.label || data?.tool || "Đã hoàn tất",
                      ),
                      status: "done",
                    };
                    break;
                  }
                }

                return { ...draft, thinkingSteps: nextSteps };
              });
              return;
            }

            if (event === "reasoning_delta") {
              updateDraft((draft) => ({
                ...draft,
                rawThinking: `${draft.rawThinking || ""}${String(data?.delta || "")}`,
                reasoningAvailable: true,
              }));
              return;
            }

            if (event === "message_delta") {
              updateDraft((draft) => ({
                ...draft,
                text: `${draft.text || ""}${String(data?.delta || "")}`,
              }));
              return;
            }

            if (event === "suggestions") {
              updateDraft((draft) => ({
                ...draft,
                suggestions: uniqueSuggestionList(data?.suggestions, 4),
              }));
              return;
            }

            if (event === "persisted") {
              updateDraft((draft) => ({
                ...draft,
                id: String(data?.messageId || draft.id),
              }));
              return;
            }

            if (event === "reply" || event === "message_done") {
              updateDraft((draft) =>
                buildBotMessageFromPayload(data, {
                  id: String(data?.messageId || draft.id),
                  text:
                    typeof data?.text === "string"
                      ? data.text
                      : typeof data?.reply === "string"
                        ? data.reply
                        : draft.text,
                  rawThinking:
                    typeof data?.rawThinking === "string"
                      ? data.rawThinking
                      : draft.rawThinking,
                  thinkingSteps:
                    draft.thinkingSteps && draft.thinkingSteps.length
                      ? finalizeThinkingSteps(draft)
                      : [],
                  suggestions: uniqueSuggestionList(
                    data?.suggestions || draft.suggestions,
                    4,
                  ),
                  answerCards:
                    Array.isArray(data?.answerCards) && data.answerCards.length
                      ? data.answerCards
                      : draft.answerCards,
                  actions:
                    Array.isArray(data?.actions) && data.actions.length
                      ? data.actions
                      : draft.actions,
                  sources:
                    Array.isArray(data?.sources) && data.sources.length
                      ? data.sources
                      : draft.sources,
                  workflow: data?.workflow || draft.workflow,
                  mutationPreview: data?.mutationPreview || draft.mutationPreview,
                  sessionFocus:
                    normalizeSessionFocus(data?.sessionFocus) || draft.sessionFocus,
                  sessionFocusState: data?.sessionFocusState || draft.sessionFocusState,
                  toolSummary:
                    Array.isArray(data?.toolSummary) && data.toolSummary.length
                      ? data.toolSummary
                      : draft.toolSummary,
                }),
              );
              return;
            }

            if (event === "error") {
              updateDraft((draft) => ({
                ...draft,
                text: draft.text || String(data?.message || "Pikora đang bận, vui lòng thử lại."),
                interrupted: true,
              }));
            }
          },
        });

        finalizeDraft({}, { dropIfEmpty: true });
      } catch (error: any) {
        const hasPartialOutput = Boolean(
          liveDraftRef.current?.text ||
            liveDraftRef.current?.rawThinking ||
            liveDraftRef.current?.actions?.length ||
            liveDraftRef.current?.answerCards?.length,
        );

        if (error?.name === "AbortError") {
          finalizeDraft({ interrupted: true }, { dropIfEmpty: true });
          return;
        }

        if (!hasPartialOutput) {
          try {
            const response = await sendMessageRequest(requestPayload).unwrap();
            finalizeDraft({}, { dropIfEmpty: true });
            setMessages((previous) =>
              mergeMessages(previous, [buildBotMessageFromPayload(response)]),
            );
            return;
          } catch (fallbackError) {
            finalizeDraft(
              {
                text: getErrorMessage(fallbackError),
                interrupted: true,
                reasoningAvailable: false,
              },
              { dropIfEmpty: false },
            );
            return;
          }
        }

        finalizeDraft(
          {
            interrupted: true,
            text:
              liveDraftRef.current?.text ||
              "Pikora đã dừng giữa chừng vì kết nối bị gián đoạn.",
          },
          { dropIfEmpty: false },
        );
      }
    },
    [
      assistantMode,
      capabilityKeys,
      cohortId,
      currentPageTitle,
      currentPath,
      currentUrl,
      finalizeDraft,
      input,
      isTyping,
      logClientEvent,
      reasoningMode,
      routePageSnapshot,
      sendMessageRequest,
      sessionFocusOverride,
      userInfo?.token,
      verificationMode,
    ],
  );

  const sendSuggestion = useCallback(
    async (text: string, presentation: PikoraUiSurface) => {
      await sendMessage(presentation, text);
    },
    [sendMessage],
  );

  const clearHistory = useCallback(async () => {
    abortControllerRef.current?.abort();
    setLiveDraft(null);
    setMessages([]);
    setHasMoreHistory(false);
    setHistoryCursor(null);

    if (!userInfo?.token) return;

    try {
      await clearChatHistoryRequest(undefined).unwrap();
      Toast.show({
        type: "success",
        text1: "Đã xóa lịch sử chat",
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: "Không thể xóa lịch sử",
        text2: getErrorMessage(error),
      });
    }
  }, [clearChatHistoryRequest, userInfo?.token]);

  const clearLearning = useCallback(async () => {
    if (!userInfo?.token) return;

    try {
      await clearLearningRequest(undefined).unwrap();
      Toast.show({
        type: "success",
        text1: "Đã xóa bộ nhớ học",
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: "Không thể xóa bộ nhớ học",
        text2: getErrorMessage(error),
      });
    }
  }, [clearLearningRequest, userInfo?.token]);

  const loadOlderHistory = useCallback(async () => {
    if (!historyCursor || historyLoading) return;
    await hydrateHistory(historyCursor);
  }, [historyCursor, historyLoading, hydrateHistory]);

  const confirmPendingAction = useCallback(async () => {
    const pending = pendingActionConfirm;
    setPendingActionConfirm(null);
    if (!pending?.action) return;

    try {
      await executeAction(pending.action, pending.message, pending.presentation);
    } catch (error) {
      await logClientEvent({
        messageId: pending.message?.id || pending.action?.messageId,
        type: "action_unsupported",
        label:
          pending.action?.label ||
          pending.action?.description ||
          pending.action?.type ||
          "action",
        actionType: pending.action?.type || "",
        success: false,
        detail: getErrorMessage(error),
      });
      Toast.show({
        type: "error",
        text1: "Chưa thể chạy thao tác",
        text2: getErrorMessage(error),
      });
    }
  }, [executeAction, logClientEvent, pendingActionConfirm]);

  const cancelPendingAction = useCallback(() => {
    setPendingActionConfirm(null);
  }, []);

  const confirmPendingWorkflow = useCallback(async () => {
    const pending = pendingWorkflowConfirm;
    setPendingWorkflowConfirm(null);
    if (!pending?.workflow) return;

    try {
      await executeWorkflow(pending.workflow, pending.message, pending.presentation);
    } catch (error) {
      Toast.show({
        type: "error",
        text1: "Workflow chưa chạy được",
        text2: getErrorMessage(error),
      });
    }
  }, [executeWorkflow, pendingWorkflowConfirm]);

  const cancelPendingWorkflow = useCallback(async () => {
    const pending = pendingWorkflowConfirm;
    setPendingWorkflowConfirm(null);
    await logClientEvent({
      messageId: pending?.message?.id,
      type: "workflow_unsupported",
      label: pending?.workflow?.title || "workflow",
      actionType: "workflow",
      success: false,
      detail: "cancelled_by_user",
    });
  }, [logClientEvent, pendingWorkflowConfirm]);

  const confirmPendingMutation = useCallback(async () => {
    const pending = pendingMutationConfirm;
    setPendingMutationConfirm(null);
    if (!pending?.mutationPreview) return;

    try {
      await commitMutation(pending.mutationPreview, pending.message);
    } catch (error) {
      Toast.show({
        type: "error",
        text1: "Không thể lưu thay đổi",
        text2: getErrorMessage(error),
      });
    }
  }, [commitMutation, pendingMutationConfirm]);

  const cancelPendingMutation = useCallback(async () => {
    const pending = pendingMutationConfirm;
    setPendingMutationConfirm(null);
    await logClientEvent({
      messageId: pending?.message?.id,
      type: "mutation_cancelled",
      label: pending?.mutationPreview?.title || pending?.mutationPreview?.type || "mutation",
      actionType: pending?.mutationPreview?.type || "",
      success: false,
      detail: "cancelled_by_user",
    });
  }, [logClientEvent, pendingMutationConfirm]);

  const value = useMemo<PikoraContextValue>(
    () => ({
      overlayOpen,
      openOverlay,
      closeOverlay,
      openChatScreen,
      input,
      setInput,
      messages,
      liveDraft,
      isTyping,
      historyLoading,
      hasMoreHistory,
      loadOlderHistory,
      sendMessage,
      sendSuggestion,
      stopStreaming,
      clearHistory,
      clearLearning,
      reasoningMode,
      assistantMode,
      verificationMode,
      setReasoningMode,
      setAssistantMode,
      setVerificationMode,
      sessionFocusOverride,
      setSessionFocusAuto,
      setSessionFocusOff,
      pinSessionFocus,
      routePageSnapshot,
      capabilityKeys,
      currentPath,
      currentUrl,
      currentPageTitle,
      suggestions,
      latestSessionFocus,
      requestAction,
      requestWorkflow,
      requestMutation,
      openSource,
      pendingActionConfirm,
      pendingWorkflowConfirm,
      pendingMutationConfirm,
      confirmPendingAction,
      cancelPendingAction,
      confirmPendingWorkflow,
      cancelPendingWorkflow,
      confirmPendingMutation,
      cancelPendingMutation,
      feedbackEnabled: Boolean(userInfo?._id),
      feedbackDialog,
      feedbackSubmittingId,
      requestFeedback,
      closeFeedbackDialog,
      submitNegativeFeedback,
    }),
    [
      overlayOpen,
      openOverlay,
      closeOverlay,
      openChatScreen,
      input,
      messages,
      liveDraft,
      isTyping,
      historyLoading,
      hasMoreHistory,
      loadOlderHistory,
      sendMessage,
      sendSuggestion,
      stopStreaming,
      clearHistory,
      clearLearning,
      reasoningMode,
      assistantMode,
      verificationMode,
      setReasoningMode,
      setAssistantMode,
      setVerificationMode,
      sessionFocusOverride,
      setSessionFocusAuto,
      setSessionFocusOff,
      pinSessionFocus,
      routePageSnapshot,
      capabilityKeys,
      currentPath,
      currentUrl,
      currentPageTitle,
      suggestions,
      latestSessionFocus,
      requestAction,
      requestWorkflow,
      requestMutation,
      openSource,
      pendingActionConfirm,
      pendingWorkflowConfirm,
      pendingMutationConfirm,
      confirmPendingAction,
      cancelPendingAction,
      confirmPendingWorkflow,
      cancelPendingWorkflow,
      confirmPendingMutation,
      cancelPendingMutation,
      userInfo?._id,
      feedbackDialog,
      feedbackSubmittingId,
      requestFeedback,
      closeFeedbackDialog,
      submitNegativeFeedback,
    ],
  );

  return <PikoraContext.Provider value={value}>{children}</PikoraContext.Provider>;
}

export function usePikora() {
  const context = useContext(PikoraContext);
  if (!context) {
    throw new Error("usePikora must be used within PikoraProvider");
  }
  return context;
}
