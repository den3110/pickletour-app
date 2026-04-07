import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useColorScheme } from "@/hooks/useColorScheme";
import type {
  PikoraAction,
  PikoraMessage,
  PikoraMutationPreview,
  PikoraSource,
  PikoraUiSurface,
  PikoraWorkflow,
} from "./pikoraTypes";
import { usePikora } from "./PikoraProvider";

type PikoraSurfaceProps = {
  presentation: PikoraUiSurface;
  bottomPaddingOffset?: number;
  onBack?: (() => void) | null;
};

type ColorPalette = ReturnType<typeof getColors>;

type ChipButtonProps = {
  label: string;
  onPress?: () => void;
  tone?: "default" | "accent" | "success" | "warning" | "danger";
  active?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  compact?: boolean;
  colors: ColorPalette;
};

function getColors(isDark: boolean) {
  return {
    isDark,
    page: isDark ? "#101113" : "#f5f5f7",
    shell: isDark ? "#16171a" : "#ffffff",
    shellRaised: isDark ? "#1d1f24" : "#eef1f5",
    shellElevated: isDark ? "#24262c" : "#f8fafc",
    assistantBubble: isDark ? "#1a1c21" : "#ffffff",
    userBubble: isDark ? "#2b2d33" : "#e8eaef",
    composer: isDark ? "#1b1d22" : "#ffffff",
    composerInput: isDark ? "#24272e" : "#f3f4f7",
    text: isDark ? "#f6f7fb" : "#15161a",
    muted: isDark ? "#9ea3ad" : "#69707d",
    subtle: isDark ? "#7f8794" : "#8f96a3",
    border: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)",
    accent: "#10a37f",
    accentSoft: isDark ? "rgba(16,163,127,0.16)" : "rgba(16,163,127,0.12)",
    success: "#10a37f",
    warning: "#f59e0b",
    danger: "#ef4444",
  };
}

function getToneColors(colors: ColorPalette, tone: ChipButtonProps["tone"], active: boolean) {
  if (tone === "accent") {
    return {
      backgroundColor: active ? colors.accent : colors.accentSoft,
      borderColor: active ? colors.accent : "transparent",
      textColor: active ? "#ffffff" : colors.accent,
    };
  }

  if (tone === "success") {
    return {
      backgroundColor: active ? colors.success : "rgba(16,163,127,0.12)",
      borderColor: active ? colors.success : "transparent",
      textColor: active ? "#ffffff" : colors.success,
    };
  }

  if (tone === "warning") {
    return {
      backgroundColor: active ? colors.warning : "rgba(245,158,11,0.14)",
      borderColor: active ? colors.warning : "transparent",
      textColor: active ? "#ffffff" : colors.warning,
    };
  }

  if (tone === "danger") {
    return {
      backgroundColor: active ? colors.danger : "rgba(239,68,68,0.14)",
      borderColor: active ? colors.danger : "transparent",
      textColor: active ? "#ffffff" : colors.danger,
    };
  }

  return {
    backgroundColor: active ? colors.shellElevated : colors.shellRaised,
    borderColor: active ? colors.border : "transparent",
    textColor: active ? colors.text : colors.muted,
  };
}

function ChipButton({
  label,
  onPress,
  tone = "default",
  active = false,
  icon,
  compact = false,
  colors,
}: ChipButtonProps) {
  const toneColors = getToneColors(colors, tone, active);

  return (
    <TouchableOpacity
      accessibilityRole="button"
      disabled={!onPress}
      onPress={onPress}
      style={[
        styles.chip,
        compact ? styles.chipCompact : null,
        {
          backgroundColor: toneColors.backgroundColor,
          borderColor: toneColors.borderColor,
        },
      ]}
    >
      {icon ? <Ionicons name={icon} size={compact ? 12 : 14} color={toneColors.textColor} /> : null}
      <Text style={[styles.chipLabel, compact ? styles.chipLabelCompact : null, { color: toneColors.textColor }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function HeaderButton({
  icon,
  onPress,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  colors: ColorPalette;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.headerButton,
        {
          backgroundColor: colors.shellRaised,
          borderColor: colors.border,
        },
      ]}
    >
      <Ionicons name={icon} size={18} color={colors.text} />
    </TouchableOpacity>
  );
}

function SectionLabel({ children, colors }: { children: React.ReactNode; colors: ColorPalette }) {
  return <Text style={[styles.sectionLabel, { color: colors.subtle }]}>{children}</Text>;
}

function OverlayDialog({
  visible,
  title,
  body,
  cancelLabel = "Hủy",
  confirmLabel = "Xác nhận",
  confirmTone = "accent",
  onCancel,
  onConfirm,
  children,
  colors,
}: {
  visible: boolean;
  title: string;
  body?: string;
  cancelLabel?: string;
  confirmLabel?: string;
  confirmTone?: ChipButtonProps["tone"];
  onCancel: () => void;
  onConfirm: () => void;
  children?: React.ReactNode;
  colors: ColorPalette;
}) {
  if (!visible) return null;

  return (
    <View style={styles.dialogBackdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
      <View
        style={[
          styles.dialogSheet,
          {
            backgroundColor: colors.shell,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={[styles.sheetGrabber, { backgroundColor: colors.border }]} />
        <Text style={[styles.dialogTitle, { color: colors.text }]}>{title}</Text>
        {body ? <Text style={[styles.dialogBody, { color: colors.muted }]}>{body}</Text> : null}
        {children}
        <View style={styles.dialogActions}>
          <ChipButton label={cancelLabel} onPress={onCancel} colors={colors} />
          <ChipButton
            label={confirmLabel}
            onPress={onConfirm}
            tone={confirmTone}
            active
            colors={colors}
          />
        </View>
      </View>
    </View>
  );
}

function formatSessionFocusLabel(mode: string) {
  if (mode === "off") return "Ngữ cảnh đang tắt";
  if (mode === "pin") return "Đang ghim ngữ cảnh";
  return "Tự động theo màn hình";
}

function getSourceLabel(source: PikoraSource) {
  return String(source.label || source.kind || source.entityType || "Nguồn");
}

function TrustStrip({ message, colors }: { message: PikoraMessage; colors: ColorPalette }) {
  if (!message?.trustMeta) return null;

  const items = [
    Number(message.trustMeta.sourceCount || 0) > 0
      ? `${Number(message.trustMeta.sourceCount)} nguồn`
      : "",
    message.trustMeta.groundingStatus ? `Grounding ${String(message.trustMeta.groundingStatus)}` : "",
    message.trustMeta.operatorStatus ? `Operator ${String(message.trustMeta.operatorStatus)}` : "",
    message.reasoningAvailable ? "Có reasoning" : "",
  ].filter(Boolean);

  if (!items.length) return null;

  return (
    <View style={styles.inlineRow}>
      {items.slice(0, 3).map((item) => (
        <View
          key={item}
          style={[
            styles.metaPill,
            {
              backgroundColor: colors.shellRaised,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.metaPillText, { color: colors.muted }]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

// __PIKORA_COMPONENTS__

function ThinkingBlock({
  message,
  showReasoning,
  setShowReasoning,
  colors,
}: {
  message: PikoraMessage;
  showReasoning: boolean;
  setShowReasoning: React.Dispatch<React.SetStateAction<boolean>>;
  colors: ColorPalette;
}) {
  const hasThinkingSteps = Array.isArray(message.thinkingSteps) && message.thinkingSteps.length > 0;
  const hasRawThinking = Boolean(message.rawThinking);

  if (!message.reasoningAvailable && !hasThinkingSteps && !hasRawThinking) return null;

  return (
    <View
      style={[
        styles.reasoningShell,
        {
          backgroundColor: colors.shellRaised,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.reasoningHeader}>
        <View style={styles.reasoningBadge}>
          <Ionicons name="sparkles-outline" size={13} color={colors.accent} />
          <Text style={[styles.reasoningBadgeText, { color: colors.text }]}>Reasoning</Text>
        </View>
        <ChipButton
          label={showReasoning ? "Ẩn chi tiết" : "Xem chi tiết"}
          onPress={() => setShowReasoning((value) => !value)}
          tone="accent"
          compact
          colors={colors}
        />
      </View>

      {showReasoning ? (
        <View style={styles.reasoningContent}>
          {hasThinkingSteps
            ? message.thinkingSteps!.slice(0, 5).map((step, index) => {
                const isRunning = step.status === "running";
                const isDone = step.status === "done";
                const stepColor = isRunning
                  ? colors.accent
                  : isDone
                    ? colors.success
                    : step.status === "error"
                      ? colors.danger
                      : colors.muted;

                return (
                  <View key={`${step.id || index}`} style={styles.reasoningStep}>
                    <View style={[styles.reasoningDot, { backgroundColor: stepColor }]} />
                    <Text style={[styles.reasoningStepText, { color: colors.text }]}>
                      {step.label || step.text || "Đang xử lý"}
                    </Text>
                  </View>
                );
              })
            : null}

          {hasRawThinking ? (
            <View
              style={[
                styles.rawThinkingBox,
                {
                  backgroundColor: colors.page,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.rawThinkingText, { color: colors.text }]}>
                {message.rawThinking}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function SuggestionsGrid({
  suggestions,
  onPress,
  colors,
}: {
  suggestions: string[];
  onPress: (suggestion: string) => void;
  colors: ColorPalette;
}) {
  if (!suggestions.length) return null;

  return (
    <View style={styles.suggestionGrid}>
      {suggestions.slice(0, 4).map((suggestion) => (
        <TouchableOpacity
          key={suggestion}
          onPress={() => onPress(suggestion)}
          style={[
            styles.suggestionCard,
            {
              backgroundColor: colors.shellRaised,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.suggestionCardText, { color: colors.text }]}>{suggestion}</Text>
          <Ionicons name="arrow-forward-outline" size={16} color={colors.muted} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

function SourcesRow({
  sources,
  colors,
  onOpen,
}: {
  sources?: PikoraSource[];
  colors: ColorPalette;
  onOpen: (source: PikoraSource) => void;
}) {
  if (!Array.isArray(sources) || !sources.length) return null;

  return (
    <View style={styles.contentBlock}>
      <SectionLabel colors={colors}>Nguồn</SectionLabel>
      <View style={styles.inlineRow}>
        {sources.slice(0, 6).map((source, index) => (
          <ChipButton
            key={`${getSourceLabel(source)}-${index}`}
            label={getSourceLabel(source)}
            onPress={() => onOpen(source)}
            tone="accent"
            icon="link-outline"
            colors={colors}
          />
        ))}
      </View>
    </View>
  );
}

function ActionsRow({
  actions,
  colors,
  onPress,
}: {
  actions?: PikoraAction[];
  colors: ColorPalette;
  onPress: (action: PikoraAction) => void;
}) {
  if (!Array.isArray(actions) || !actions.length) return null;

  return (
    <View style={styles.contentBlock}>
      <SectionLabel colors={colors}>Thao tác</SectionLabel>
      <View style={styles.inlineRow}>
        {actions.slice(0, 6).map((action, index) => (
          <ChipButton
            key={`${action.label || action.type || index}`}
            label={String(action.label || action.type || "Chạy")}
            onPress={() => onPress(action)}
            tone={action.requiresConfirm ? "warning" : "accent"}
            icon={action.requiresConfirm ? "shield-checkmark-outline" : "sparkles-outline"}
            colors={colors}
          />
        ))}
      </View>
    </View>
  );
}

function AnswerCards({
  message,
  colors,
  onAction,
}: {
  message: PikoraMessage;
  colors: ColorPalette;
  onAction: (action: PikoraAction) => void;
}) {
  if (!Array.isArray(message.answerCards) || !message.answerCards.length) return null;

  return (
    <View style={styles.contentBlock}>
      <SectionLabel colors={colors}>Gợi ý trả lời</SectionLabel>
      <View style={styles.cardList}>
        {message.answerCards.slice(0, 4).map((card, index) => (
          <View
            key={`${card.title || card.kind || index}`}
            style={[
              styles.richCard,
              {
                backgroundColor: colors.shellRaised,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.richCardHeader}>
              <Text style={[styles.richCardTitle, { color: colors.text }]}>
                {card.title || card.kind || "Thẻ"}
              </Text>
              {card.subtitle ? (
                <Text style={[styles.richCardSubtitle, { color: colors.muted }]}>{card.subtitle}</Text>
              ) : null}
            </View>

            {card.description ? (
              <Text style={[styles.richCardBody, { color: colors.text }]}>{card.description}</Text>
            ) : null}

            {Array.isArray(card.metrics) && card.metrics.length ? (
              <View style={styles.inlineRow}>
                {card.metrics.slice(0, 4).map((metric) => (
                  <View
                    key={metric}
                    style={[
                      styles.metaPill,
                      {
                        backgroundColor: colors.page,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.metaPillText, { color: colors.muted }]}>{metric}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {Array.isArray(card.actions) && card.actions.length ? (
              <View style={styles.inlineRow}>
                {card.actions.slice(0, 3).map((action, actionIndex) => (
                  <ChipButton
                    key={`${action.label || action.type || actionIndex}`}
                    label={String(action.label || action.type || "Mở")}
                    onPress={() => onAction(action)}
                    tone="accent"
                    colors={colors}
                  />
                ))}
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function WorkflowCard({
  workflow,
  colors,
  onRun,
}: {
  workflow?: PikoraWorkflow | null;
  colors: ColorPalette;
  onRun: (workflow: PikoraWorkflow) => void;
}) {
  if (!workflow?.steps?.length) return null;

  return (
    <View
      style={[
        styles.richCard,
        {
          backgroundColor: colors.shellRaised,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.workflowHeader}>
        <View style={styles.flex}>
          <SectionLabel colors={colors}>Workflow</SectionLabel>
          <Text style={[styles.richCardTitle, { color: colors.text }]}>
            {workflow.title || "Chuỗi thao tác"}
          </Text>
        </View>
        <ChipButton
          label={workflow.runLabel || "Chạy"}
          onPress={() => onRun(workflow)}
          tone="success"
          colors={colors}
        />
      </View>
      {workflow.summary ? (
        <Text style={[styles.richCardBody, { color: colors.muted }]}>{workflow.summary}</Text>
      ) : null}
      <View style={styles.workflowList}>
        {(workflow.steps || []).slice(0, 4).map((step, index) => {
          const workflowStep = step as Record<string, any>;
          return (
            <View key={`${workflowStep.id || index}`} style={styles.workflowStepRow}>
              <View style={[styles.workflowIndex, { backgroundColor: colors.page }]}>
                <Text style={[styles.workflowIndexText, { color: colors.muted }]}>{index + 1}</Text>
              </View>
              <Text style={[styles.workflowStepText, { color: colors.text }]}>
                {workflowStep.label || workflowStep.title || workflowStep.type || "Bước"}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function MutationCard({
  mutationPreview,
  colors,
  onCommit,
}: {
  mutationPreview?: PikoraMutationPreview | null;
  colors: ColorPalette;
  onCommit: (mutationPreview: PikoraMutationPreview) => void;
}) {
  if (!mutationPreview?.type) return null;

  return (
    <View
      style={[
        styles.richCard,
        {
          backgroundColor: colors.shellRaised,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.workflowHeader}>
        <View style={styles.flex}>
          <SectionLabel colors={colors}>Mutation</SectionLabel>
          <Text style={[styles.richCardTitle, { color: colors.text }]}>
            {mutationPreview.title || mutationPreview.type}
          </Text>
        </View>
        <ChipButton
          label="Xác nhận"
          onPress={() => onCommit(mutationPreview)}
          tone="warning"
          colors={colors}
        />
      </View>
      {mutationPreview.summary ? (
        <Text style={[styles.richCardBody, { color: colors.muted }]}>{mutationPreview.summary}</Text>
      ) : null}
      {(mutationPreview.changes || []).slice(0, 4).map((change, index) => (
        <View key={`${change}-${index}`} style={styles.workflowStepRow}>
          <Ionicons name="checkmark-circle-outline" size={16} color={colors.warning} />
          <Text style={[styles.workflowStepText, { color: colors.text }]}>{change}</Text>
        </View>
      ))}
    </View>
  );
}

function FeedbackRow({
  message,
  onFeedback,
  feedbackEnabled,
  feedbackSubmitting,
  colors,
}: {
  message: PikoraMessage;
  onFeedback: (value: "positive" | "negative") => void;
  feedbackEnabled: boolean;
  feedbackSubmitting: boolean;
  colors: ColorPalette;
}) {
  if (!feedbackEnabled) return null;

  return (
    <View style={styles.feedbackRow}>
      <Text style={[styles.feedbackLabel, { color: colors.muted }]}>Hữu ích không?</Text>
      <ChipButton
        label={feedbackSubmitting ? "Đang gửi" : "Có"}
        onPress={() => onFeedback("positive")}
        tone="success"
        active={message.feedback?.value === "positive"}
        icon="thumbs-up-outline"
        compact
        colors={colors}
      />
      <ChipButton
        label="Chưa ổn"
        onPress={() => onFeedback("negative")}
        tone="danger"
        active={message.feedback?.value === "negative"}
        icon="thumbs-down-outline"
        compact
        colors={colors}
      />
    </View>
  );
}

function MessageCard({
  message,
  colors,
  onAction,
  onWorkflow,
  onMutation,
  onSource,
  onFeedback,
  feedbackEnabled,
  feedbackSubmitting,
}: {
  message: PikoraMessage;
  colors: ColorPalette;
  onAction: (action: PikoraAction) => void;
  onWorkflow: (workflow: PikoraWorkflow) => void;
  onMutation: (mutationPreview: PikoraMutationPreview) => void;
  onSource: (source: PikoraSource) => void;
  onFeedback: (value: "positive" | "negative") => void;
  feedbackEnabled: boolean;
  feedbackSubmitting: boolean;
}) {
  const [showReasoning, setShowReasoning] = useState(true);
  const isUser = message.role === "user";

  return (
    <View style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowAssistant]}>
      {!isUser ? (
        <View style={styles.messageAuthorRow}>
          <View
            style={[
              styles.assistantAvatar,
              {
                backgroundColor: colors.accentSoft,
                borderColor: colors.border,
              },
            ]}
          >
            <Ionicons name="sparkles" size={14} color={colors.accent} />
          </View>
          <Text style={[styles.messageAuthor, { color: colors.text }]}>Pikora</Text>
          <Text style={[styles.messageTimestampInline, { color: colors.subtle }]}>
            {message.timestampLabel}
            {message.interrupted ? " · Đã dừng" : ""}
          </Text>
        </View>
      ) : null}

      <View
        style={[
          styles.messageBubble,
          isUser ? styles.userBubble : styles.assistantBubble,
          {
            backgroundColor: isUser ? colors.userBubble : colors.assistantBubble,
            borderColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.messageText, { color: colors.text }]}>{message.text || "..."}</Text>

        {isUser ? (
          <Text style={[styles.messageTimestamp, { color: colors.subtle }]}>
            {message.timestampLabel}
            {message.interrupted ? " · Đã dừng" : ""}
          </Text>
        ) : null}

        {!isUser ? <TrustStrip message={message} colors={colors} /> : null}
        {!isUser ? (
          <ThinkingBlock
            message={message}
            showReasoning={showReasoning}
            setShowReasoning={setShowReasoning}
            colors={colors}
          />
        ) : null}
        <AnswerCards message={message} colors={colors} onAction={onAction} />
        <SourcesRow sources={message.sources} colors={colors} onOpen={onSource} />
        <ActionsRow actions={message.actions} colors={colors} onPress={onAction} />
        <WorkflowCard workflow={message.workflow} colors={colors} onRun={onWorkflow} />
        <MutationCard
          mutationPreview={message.mutationPreview}
          colors={colors}
          onCommit={onMutation}
        />

        {!isUser && message.sessionFocusState?.mode ? (
          <View style={styles.contentBlock}>
            <SectionLabel colors={colors}>Session focus</SectionLabel>
            <ChipButton
              label={formatSessionFocusLabel(String(message.sessionFocusState.mode))}
              tone={message.sessionFocusState.mode === "off" ? "warning" : "success"}
              colors={colors}
            />
          </View>
        ) : null}

        {!isUser ? (
          <FeedbackRow
            message={message}
            onFeedback={onFeedback}
            feedbackEnabled={feedbackEnabled}
            feedbackSubmitting={feedbackSubmitting}
            colors={colors}
          />
        ) : null}
      </View>
    </View>
  );
}

function WelcomeHero({
  currentPageTitle,
  routeEntityTitle,
  suggestions,
  onSuggestion,
  colors,
}: {
  currentPageTitle: string;
  routeEntityTitle?: string;
  suggestions: string[];
  onSuggestion: (suggestion: string) => void;
  colors: ColorPalette;
}) {
  return (
    <View style={styles.welcomeWrap}>
      <View
        style={[
          styles.heroOrb,
          {
            backgroundColor: colors.accentSoft,
            borderColor: colors.border,
          },
        ]}
      >
        <Ionicons name="sparkles" size={26} color={colors.accent} />
      </View>
      <Text style={[styles.heroTitle, { color: colors.text }]}>Pikora</Text>
      <Text style={[styles.heroSubtitle, { color: colors.muted }]}>
        Hỏi bất cứ điều gì về PickleTour ngay trên màn hình hiện tại.
      </Text>
      <View style={styles.heroMeta}>
        <ChipButton label="Streaming" tone="accent" compact colors={colors} />
        <ChipButton label="Nguồn" compact colors={colors} />
        <ChipButton label="Workflow" compact colors={colors} />
      </View>
      <View
        style={[
          styles.heroContextCard,
          {
            backgroundColor: colors.shellRaised,
            borderColor: colors.border,
          },
        ]}
      >
        <SectionLabel colors={colors}>Ngữ cảnh hiện tại</SectionLabel>
        <Text style={[styles.heroContextTitle, { color: colors.text }]}>
          {currentPageTitle || routeEntityTitle || "PickleTour"}
        </Text>
        <Text style={[styles.heroContextText, { color: colors.muted }]}>
          Pikora sẽ dùng ngữ cảnh của route hiện tại, có thể kèm nguồn, answer cards, workflow và mutation preview.
        </Text>
      </View>
      <SuggestionsGrid suggestions={suggestions} onPress={onSuggestion} colors={colors} />
    </View>
  );
}

export function PikoraSurface({
  presentation = "screen",
  bottomPaddingOffset = 0,
  onBack = null,
}: PikoraSurfaceProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const [showSettings, setShowSettings] = useState(false);
  const [feedbackReason, setFeedbackReason] = useState("");
  const [feedbackNote, setFeedbackNote] = useState("");
  const scrollRef = useRef<ScrollView | null>(null);
  const {
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
    feedbackEnabled,
    feedbackDialog,
    feedbackSubmittingId,
    requestFeedback,
    closeFeedbackDialog,
    submitNegativeFeedback,
  } = usePikora();

  const colors = useMemo(() => getColors(colorScheme === "dark"), [colorScheme]);
  const allMessages = liveDraft ? [...messages, liveDraft] : messages;
  const showWelcome = allMessages.length === 0;
  const topInset = presentation === "overlay" ? 6 : -insets.top;

  useEffect(() => {
    const timeout = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 40);
    return () => clearTimeout(timeout);
  }, [allMessages.length, liveDraft?.text, liveDraft?.rawThinking]);

  useEffect(() => {
    if (!feedbackDialog) {
      setFeedbackReason("");
      setFeedbackNote("");
    }
  }, [feedbackDialog]);

  return (
    <SafeAreaView
      edges={presentation === "overlay" ? ["top", "bottom", "left", "right"] : ["left", "right"]}
      style={[
        styles.safeArea,
        {
          backgroundColor: presentation === "overlay" ? "transparent" : colors.page,
          paddingBottom:
            presentation === "overlay"
              ? 0
              : Math.max(insets.bottom, 8) + bottomPaddingOffset,
        },
      ]}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={[
            styles.shell,
            presentation === "overlay" ? styles.overlayShell : styles.screenShell,
            {
              backgroundColor: colors.shell,
              borderColor: colors.border,
              marginTop: topInset,
            },
          ]}
        >
          {presentation === "overlay" ? (
            <View style={styles.sheetHandleWrap}>
              <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            </View>
          ) : null}

          <View
            style={[
              styles.header,
              {
                borderBottomColor: colors.border,
                minHeight: presentation === "overlay" ? 72 : 72 + insets.top,
                paddingTop: presentation === "overlay" ? 0 : insets.top + 6,
              },
            ]}
          >
            <View style={styles.headerSide}>
              {presentation !== "overlay" && onBack ? (
                <HeaderButton
                  icon="chevron-back-outline"
                  onPress={onBack}
                  colors={colors}
                />
              ) : (
                <HeaderButton
                  icon="sparkles-outline"
                  onPress={() => setShowSettings((value) => !value)}
                  colors={colors}
                />
              )}
            </View>

            <View style={styles.headerCenter}>
              <View
                style={[
                  styles.headerTitlePill,
                  {
                    backgroundColor: colors.shellRaised,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.headerTitle, { color: colors.text }]}>Pikora</Text>
                <Ionicons name="chevron-down-outline" size={14} color={colors.muted} />
              </View>
              <Text style={[styles.headerSubtitle, { color: colors.muted }]}>
                {currentPageTitle || routePageSnapshot?.entityTitle || "PickleTour"}
              </Text>
            </View>

            <View style={styles.headerSideRight}>
              {presentation === "overlay" ? (
                <HeaderButton icon="expand-outline" onPress={openChatScreen} colors={colors} />
              ) : null}
              {presentation === "overlay" ? (
                <HeaderButton icon="close-outline" onPress={closeOverlay} colors={colors} />
              ) : (
                <HeaderButton
                  icon="options-outline"
                  onPress={() => setShowSettings((value) => !value)}
                  colors={colors}
                />
              )}
            </View>
          </View>

          {showSettings ? (
            <View
              style={[
                styles.settingsPanel,
                {
                  borderBottomColor: colors.border,
                  backgroundColor: colors.shellRaised,
                },
              ]}
            >
              <View style={styles.settingsSection}>
                <SectionLabel colors={colors}>Reasoning</SectionLabel>
                <View style={styles.inlineRow}>
                  <ChipButton
                    label="Auto"
                    active={reasoningMode === "auto"}
                    onPress={() => void setReasoningMode("auto")}
                    colors={colors}
                  />
                  <ChipButton
                    label="Reasoner"
                    tone="accent"
                    active={reasoningMode === "force_reasoner"}
                    onPress={() => void setReasoningMode("force_reasoner")}
                    colors={colors}
                  />
                </View>
              </View>

              <View style={styles.settingsSection}>
                <SectionLabel colors={colors}>Assistant</SectionLabel>
                <View style={styles.inlineRow}>
                  <ChipButton
                    label="Balanced"
                    active={assistantMode === "balanced"}
                    onPress={() => void setAssistantMode("balanced")}
                    colors={colors}
                  />
                  <ChipButton
                    label="Operator"
                    tone="accent"
                    active={assistantMode === "operator"}
                    onPress={() => void setAssistantMode("operator")}
                    colors={colors}
                  />
                  <ChipButton
                    label="Analyst"
                    active={assistantMode === "analyst"}
                    onPress={() => void setAssistantMode("analyst")}
                    colors={colors}
                  />
                </View>
              </View>

              <View style={styles.settingsSection}>
                <SectionLabel colors={colors}>Verification</SectionLabel>
                <View style={styles.inlineRow}>
                  <ChipButton
                    label="Balanced"
                    active={verificationMode === "balanced"}
                    onPress={() => void setVerificationMode("balanced")}
                    colors={colors}
                  />
                  <ChipButton
                    label="Strict"
                    tone="warning"
                    active={verificationMode === "strict"}
                    onPress={() => void setVerificationMode("strict")}
                    colors={colors}
                  />
                </View>
              </View>

              <View style={styles.settingsSection}>
                <SectionLabel colors={colors}>Session focus</SectionLabel>
                <View style={styles.inlineRow}>
                  <ChipButton label="Auto" onPress={() => void setSessionFocusAuto()} colors={colors} />
                  <ChipButton
                    label="Tắt"
                    tone="warning"
                    onPress={() => void setSessionFocusOff()}
                    colors={colors}
                  />
                  <ChipButton
                    label={latestSessionFocus ? "Ghim focus hiện tại" : "Chưa có focus"}
                    tone="success"
                    onPress={() => void pinSessionFocus()}
                    colors={colors}
                  />
                </View>
              </View>

              <View style={styles.settingsSection}>
                <SectionLabel colors={colors}>Dữ liệu</SectionLabel>
                <View style={styles.inlineRow}>
                  <ChipButton
                    label="Xóa lịch sử"
                    tone="danger"
                    onPress={() => void clearHistory()}
                    colors={colors}
                  />
                  <ChipButton
                    label="Xóa bộ nhớ học"
                    tone="warning"
                    onPress={() => void clearLearning()}
                    colors={colors}
                  />
                </View>
              </View>
            </View>
          ) : null}

          {sessionFocusOverride.mode !== "auto" ? (
            <View style={styles.statusRail}>
              <ChipButton
                label={formatSessionFocusLabel(sessionFocusOverride.mode)}
                tone={sessionFocusOverride.mode === "off" ? "warning" : "success"}
                compact
                colors={colors}
              />
            </View>
          ) : null}

          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={[
              styles.scrollContent,
              showWelcome ? styles.scrollContentWelcome : null,
            ]}
            keyboardShouldPersistTaps="handled"
          >
            {hasMoreHistory ? (
              <TouchableOpacity
                disabled={historyLoading}
                onPress={() => void loadOlderHistory()}
                style={[
                  styles.loadMoreButton,
                  {
                    backgroundColor: colors.shellRaised,
                    borderColor: colors.border,
                  },
                ]}
              >
                {historyLoading ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Text style={[styles.loadMoreText, { color: colors.muted }]}>
                    Tải lịch sử cũ hơn
                  </Text>
                )}
              </TouchableOpacity>
            ) : null}

            {showWelcome ? (
              <WelcomeHero
                currentPageTitle={currentPageTitle}
                routeEntityTitle={routePageSnapshot?.entityTitle}
                suggestions={suggestions}
                onSuggestion={(suggestion) => void sendSuggestion(suggestion, presentation)}
                colors={colors}
              />
            ) : null}

            {allMessages.map((message) => (
              <MessageCard
                key={message.id}
                message={message}
                colors={colors}
                onAction={(action) => void requestAction(action, message, presentation)}
                onWorkflow={(workflow) => void requestWorkflow(workflow, message, presentation)}
                onMutation={(mutationPreview) => void requestMutation(mutationPreview, message)}
                onSource={(source) => void openSource(source, presentation)}
                onFeedback={(value) => void requestFeedback(message, value)}
                feedbackEnabled={feedbackEnabled}
                feedbackSubmitting={feedbackSubmittingId === message.id}
              />
            ))}
          </ScrollView>

          <View
            style={[
              styles.composerDock,
              {
                borderTopColor: colors.border,
                backgroundColor: colors.shell,
              },
            ]}
          >
            {!showWelcome && suggestions.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.suggestionRail}
              >
                {suggestions.slice(0, 6).map((suggestion) => (
                  <ChipButton
                    key={suggestion}
                    label={suggestion}
                    onPress={() => void sendSuggestion(suggestion, presentation)}
                    tone="accent"
                    compact
                    colors={colors}
                  />
                ))}
              </ScrollView>
            ) : null}

            <View style={styles.modeRail}>
              <ChipButton
                label={reasoningMode === "force_reasoner" ? "Reasoner" : "Auto"}
                tone="accent"
                compact
                colors={colors}
              />
              <ChipButton label={assistantMode} compact colors={colors} />
              <ChipButton
                label={verificationMode === "strict" ? "Strict" : "Balanced"}
                tone="warning"
                compact
                colors={colors}
              />
            </View>

            <View
              style={[
                styles.composerBox,
                {
                  backgroundColor: colors.composer,
                  borderColor: colors.border,
                },
              ]}
            >
              <View
                style={[
                  styles.inputShell,
                  {
                    backgroundColor: colors.composerInput,
                  },
                ]}
              >
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => setShowSettings((value) => !value)}
                  style={styles.composerSideButton}
                >
                  <Ionicons name="add-circle-outline" size={21} color={colors.muted} />
                </TouchableOpacity>

                <TextInput
                  value={input}
                  onChangeText={setInput}
                  placeholder="Hỏi Pikora"
                  placeholderTextColor={colors.subtle}
                  multiline
                  maxLength={2000}
                  style={[styles.input, { color: colors.text }]}
                />

                {input.trim().length ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() =>
                      void (isTyping ? Promise.resolve(stopStreaming()) : sendMessage(presentation))
                    }
                    style={[
                      styles.sendButton,
                      {
                        backgroundColor: isTyping ? colors.danger : colors.accent,
                      },
                    ]}
                  >
                    <Ionicons
                      name={isTyping ? "stop-outline" : "arrow-up-outline"}
                      size={18}
                      color="#ffffff"
                    />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => void openChatScreen()}
                    style={styles.composerSideButton}
                  >
                    <Ionicons
                      name="ellipsis-horizontal"
                      size={20}
                      color={colors.muted}
                    />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </View>

        <OverlayDialog
          visible={Boolean(pendingActionConfirm)}
          title={pendingActionConfirm?.action?.confirmTitle || "Xác nhận thao tác"}
          body={
            pendingActionConfirm?.action?.confirmBody ||
            pendingActionConfirm?.action?.description ||
            "Pikora muốn chạy thao tác này trên màn hình hiện tại."
          }
          confirmLabel={pendingActionConfirm?.action?.label || "Tiếp tục"}
          colors={colors}
          onCancel={cancelPendingAction}
          onConfirm={() => void confirmPendingAction()}
        />

        <OverlayDialog
          visible={Boolean(pendingWorkflowConfirm)}
          title={pendingWorkflowConfirm?.workflow?.title || "Xác nhận workflow"}
          body={
            pendingWorkflowConfirm?.workflow?.summary ||
            "Pikora sẽ chạy một chuỗi thao tác nhẹ trên màn hình hiện tại."
          }
          confirmLabel={pendingWorkflowConfirm?.workflow?.runLabel || "Chạy workflow"}
          confirmTone="success"
          colors={colors}
          onCancel={() => void cancelPendingWorkflow()}
          onConfirm={() => void confirmPendingWorkflow()}
        />

        <OverlayDialog
          visible={Boolean(pendingMutationConfirm)}
          title={pendingMutationConfirm?.mutationPreview?.title || "Xác nhận thay đổi"}
          body={
            pendingMutationConfirm?.mutationPreview?.summary ||
            "Pikora sẽ lưu một thay đổi nhẹ có thể xem lại sau."
          }
          confirmLabel="Xác nhận lưu"
          confirmTone="warning"
          colors={colors}
          onCancel={() => void cancelPendingMutation()}
          onConfirm={() => void confirmPendingMutation()}
        />

        <OverlayDialog
          visible={Boolean(feedbackDialog)}
          title="Điều gì chưa ổn?"
          body="Chọn lý do chính để Pikora tối ưu câu trả lời ở các lần sau."
          confirmLabel={
            feedbackSubmittingId === feedbackDialog?.messageId ? "Đang gửi" : "Gửi phản hồi"
          }
          confirmTone="danger"
          colors={colors}
          onCancel={closeFeedbackDialog}
          onConfirm={() => void submitNegativeFeedback(feedbackReason, feedbackNote)}
        >
          <View style={[styles.inlineRow, styles.feedbackReasonRow]}>
            {["Sai ngữ cảnh", "Sai dữ liệu", "Chậm", "Khó hiểu"].map((reason) => (
              <ChipButton
                key={reason}
                label={reason}
                active={feedbackReason === reason}
                onPress={() => setFeedbackReason(reason)}
                tone={feedbackReason === reason ? "danger" : "default"}
                colors={colors}
              />
            ))}
          </View>
          <TextInput
            value={feedbackNote}
            onChangeText={setFeedbackNote}
            placeholder="Ghi thêm để Pikora sửa đúng chỗ cần thiết..."
            placeholderTextColor={colors.subtle}
            multiline
            style={[
              styles.feedbackInput,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: colors.shellRaised,
              },
            ]}
          />
        </OverlayDialog>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1 },
  shell: {
    flex: 1,
    borderWidth: 1,
    overflow: "hidden",
  },
  overlayShell: {
    marginHorizontal: 10,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
  },
  screenShell: {
    borderRadius: 0,
  },
  sheetHandleWrap: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 4,
  },
  sheetHandle: {
    width: 42,
    height: 5,
    borderRadius: 999,
  },
  header: {
    minHeight: 72,
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerSide: {
    width: 42,
    alignItems: "flex-start",
  },
  headerSideRight: {
    minWidth: 42,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    gap: 6,
  },
  headerButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitlePill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  settingsPanel: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  settingsSection: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  statusRail: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 20,
    gap: 16,
  },
  scrollContentWelcome: {
    flexGrow: 1,
  },
  loadMoreButton: {
    alignSelf: "center",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  loadMoreText: {
    fontSize: 13,
    fontWeight: "600",
  },
  welcomeWrap: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 36,
    gap: 16,
  },
  heroOrb: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.6,
  },
  heroSubtitle: {
    maxWidth: 280,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  heroMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  heroContextCard: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 8,
  },
  heroContextTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  heroContextText: {
    fontSize: 14,
    lineHeight: 21,
  },
  suggestionGrid: {
    width: "100%",
    gap: 10,
  },
  suggestionCard: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  suggestionCardText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "500",
  },
  messageRow: {
    width: "100%",
    gap: 8,
  },
  messageRowAssistant: {
    alignItems: "flex-start",
  },
  messageRowUser: {
    alignItems: "flex-end",
  },
  messageAuthorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
  },
  assistantAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  messageAuthor: {
    fontSize: 14,
    fontWeight: "700",
  },
  messageTimestampInline: {
    fontSize: 12,
    marginLeft: "auto",
  },
  messageBubble: {
    borderWidth: 1,
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  assistantBubble: {
    width: "100%",
    borderRadius: 24,
  },
  userBubble: {
    maxWidth: "88%",
    borderRadius: 24,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 24,
  },
  messageTimestamp: {
    fontSize: 12,
  },
  inlineRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metaPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  metaPillText: {
    fontSize: 11,
    fontWeight: "600",
  },
  contentBlock: {
    gap: 8,
  },
  cardList: {
    gap: 10,
  },
  richCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    gap: 10,
  },
  richCardHeader: {
    gap: 4,
  },
  richCardTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  richCardSubtitle: {
    fontSize: 12,
    fontWeight: "500",
  },
  richCardBody: {
    fontSize: 14,
    lineHeight: 21,
  },
  workflowHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  workflowList: {
    gap: 8,
  },
  workflowStepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  workflowIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  workflowIndexText: {
    fontSize: 12,
    fontWeight: "700",
  },
  workflowStepText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  reasoningShell: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    gap: 10,
  },
  reasoningHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  reasoningBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  reasoningBadgeText: {
    fontSize: 13,
    fontWeight: "700",
  },
  reasoningContent: {
    gap: 10,
  },
  reasoningStep: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  reasoningDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  reasoningStepText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  rawThinkingBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  rawThinkingText: {
    fontSize: 13,
    lineHeight: 20,
  },
  feedbackRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  feedbackLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chipCompact: {
    minHeight: 30,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  chipLabelCompact: {
    fontSize: 12,
  },
  composerDock: {
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 10,
  },
  suggestionRail: {
    gap: 8,
    paddingRight: 8,
  },
  modeRail: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  composerBox: {
    borderWidth: 1,
    borderRadius: 28,
    padding: 8,
  },
  inputShell: {
    minHeight: 56,
    borderRadius: 22,
    paddingLeft: 8,
    paddingRight: 8,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  composerSideButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 110,
    fontSize: 16,
    lineHeight: 22,
    paddingVertical: 0,
    textAlignVertical: "center",
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  dialogBackdrop: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.54)",
  },
  dialogSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 22,
    gap: 10,
  },
  sheetGrabber: {
    alignSelf: "center",
    width: 40,
    height: 5,
    borderRadius: 999,
    marginBottom: 4,
  },
  dialogTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  dialogBody: {
    fontSize: 14,
    lineHeight: 21,
  },
  dialogActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 6,
  },
  feedbackReasonRow: {
    marginTop: 8,
  },
  feedbackInput: {
    minHeight: 100,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
});
