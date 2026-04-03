import type { ChatBotPageSnapshot } from "@/context/ChatBotPageContext";

export type PikoraReasoningMode = "auto" | "force_reasoner";
export type PikoraAssistantMode = "balanced" | "operator" | "analyst";
export type PikoraVerificationMode = "balanced" | "strict";

export type PikoraThinkingStep = {
  id?: string;
  label?: string;
  text?: string;
  status?: "pending" | "running" | "done" | "error";
  action?: PikoraAction;
};

export type PikoraActionPayload = {
  key?: string;
  value?: string;
  label?: string;
  selector?: string;
  handlerKey?: string;
  path?: string;
  url?: string;
  params?: Record<string, string | number | boolean | null | undefined>;
  [key: string]: unknown;
};

export type PikoraAction = {
  type?: string;
  label?: string;
  description?: string;
  path?: string;
  value?: string;
  selector?: string;
  requiresConfirm?: boolean;
  confirmTitle?: string;
  confirmBody?: string;
  payload?: PikoraActionPayload;
  messageId?: string;
};

export type PikoraWorkflow = {
  title?: string;
  summary?: string;
  runLabel?: string;
  requiresConfirm?: boolean;
  steps?: Array<PikoraThinkingStep | (PikoraAction & { title?: string })>;
};

export type PikoraMutationPreview = {
  type?: string;
  title?: string;
  summary?: string;
  changes?: string[];
  requiresConfirm?: boolean;
  payload?: Record<string, unknown>;
};

export type PikoraAnswerCard = {
  kind?: string;
  title?: string;
  subtitle?: string;
  badges?: string[];
  metrics?: string[];
  description?: string;
  path?: string;
  actions?: PikoraAction[];
};

export type PikoraSource = {
  kind?: string;
  label?: string;
  path?: string;
  url?: string;
  href?: string;
  deepLink?: string;
  value?: string;
  entityType?: string;
  entityId?: string;
  freshness?: string;
  tool?: string;
  tier?: string;
};

export type PikoraSessionFocusEntity = {
  entityId?: string;
  label?: string;
  path?: string;
  tournamentId?: string;
};

export type PikoraSessionFocus = {
  activeType?: "tournament" | "club" | "news" | "player" | "match" | "";
  tournament?: PikoraSessionFocusEntity | null;
  club?: PikoraSessionFocusEntity | null;
  news?: PikoraSessionFocusEntity | null;
  player?: PikoraSessionFocusEntity | null;
  match?: PikoraSessionFocusEntity | null;
  updatedAt?: string;
};

export type PikoraSessionFocusOverride =
  | { mode: "auto"; sessionFocus?: null }
  | { mode: "off"; sessionFocus?: null }
  | { mode: "pin"; sessionFocus: PikoraSessionFocus };

export type PikoraTrustMeta = {
  groundingStatus?: string;
  operatorStatus?: string;
  guardApplied?: boolean;
  sourceCount?: number;
  reasoned?: boolean;
  verificationMode?: string;
  [key: string]: unknown;
};

export type PikoraMessage = {
  id: string;
  role: "user" | "bot";
  text: string;
  createdAt?: string;
  timestampLabel: string;
  navigation?: Record<string, unknown> | null;
  actions?: PikoraAction[];
  answerCards?: PikoraAnswerCard[];
  sources?: PikoraSource[];
  workflow?: PikoraWorkflow | null;
  mutationPreview?: PikoraMutationPreview | null;
  sessionFocus?: PikoraSessionFocus | null;
  sessionFocusState?: Record<string, unknown> | null;
  thinkingSteps?: PikoraThinkingStep[];
  rawThinking?: string;
  reasoningAvailable?: boolean;
  trustMeta?: PikoraTrustMeta | null;
  assistantMode?: PikoraAssistantMode;
  verificationMode?: PikoraVerificationMode;
  surface?: string;
  feedback?: Record<string, unknown> | null;
  toolSummary?: Array<Record<string, unknown>>;
  suggestions?: string[];
  interrupted?: boolean;
  isStreaming?: boolean;
  meta?: Record<string, unknown>;
};

export type PikoraUiSurface = "overlay" | "screen";

export type PikoraFallbackRouteContext = {
  pageSnapshot: ChatBotPageSnapshot | null;
  capabilityKeys: string[];
  pageTitle: string;
  currentPath: string;
  currentUrl: string;
  params: Record<string, unknown>;
};
