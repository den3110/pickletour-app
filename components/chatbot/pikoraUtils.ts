import type { ChatBotPageSnapshot } from "@/context/ChatBotPageContext";
import type {
  PikoraAssistantMode,
  PikoraFallbackRouteContext,
  PikoraMessage,
  PikoraReasoningMode,
  PikoraSessionFocus,
  PikoraSessionFocusEntity,
  PikoraSessionFocusOverride,
  PikoraVerificationMode,
} from "./pikoraTypes";

function compactText(value: unknown, maxLength = 180) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function compactList(list: unknown, limit = 8, maxLength = 80) {
  const seen = new Set<string>();

  return (Array.isArray(list) ? list : [])
    .map((item) => compactText(item, maxLength))
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function compactStats(stats?: Record<string, unknown>) {
  if (!stats || typeof stats !== "object") return undefined;

  const next: Record<string, string | number> = {};
  Object.entries(stats).forEach(([key, value]) => {
    const safeKey = compactText(key, 48);
    if (!safeKey) return;

    if (typeof value === "number" && Number.isFinite(value)) {
      next[safeKey] = value;
      return;
    }

    const safeValue = compactText(value, 96);
    if (safeValue) {
      next[safeKey] = safeValue;
    }
  });

  return Object.keys(next).length ? next : undefined;
}

function compactStructuredItems(
  items: ChatBotPageSnapshot["visibleTournaments"],
) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      id: compactText(item?.id, 64),
      name: compactText(item?.name, 140),
      status: compactText(item?.status, 32),
      location: compactText(item?.location, 96),
      startDate: compactText(item?.startDate, 48),
      endDate: compactText(item?.endDate, 48),
    }))
    .filter((item) => item.name)
    .slice(0, 8);
}

function filterSegments(segments: string[]) {
  return (Array.isArray(segments) ? segments : [])
    .filter(Boolean)
    .filter((segment) => !segment.startsWith("("))
    .filter((segment) => segment !== "index");
}

export function normalizeReasoningMode(
  value?: string | null,
): PikoraReasoningMode {
  return value === "force_reasoner" ? "force_reasoner" : "auto";
}

export function normalizeAssistantMode(
  value?: string | null,
): PikoraAssistantMode {
  if (value === "operator") return "operator";
  if (value === "analyst") return "analyst";
  return "balanced";
}

export function normalizeVerificationMode(
  value?: string | null,
): PikoraVerificationMode {
  return value === "strict" ? "strict" : "balanced";
}

function normalizeSessionFocusEntity(
  entity?: PikoraSessionFocusEntity | null,
): PikoraSessionFocusEntity | null {
  if (!entity || typeof entity !== "object") return null;

  const next = {
    entityId: compactText(entity.entityId, 96),
    label: compactText(entity.label, 140),
    path: compactText(entity.path, 240),
    tournamentId: compactText(entity.tournamentId, 96),
  };

  return next.entityId || next.label || next.path ? next : null;
}

export function normalizeSessionFocus(
  sessionFocus?: PikoraSessionFocus | null,
): PikoraSessionFocus | null {
  if (!sessionFocus || typeof sessionFocus !== "object") return null;

  const activeType = ["tournament", "club", "news", "player", "match"].includes(
    String(sessionFocus.activeType || ""),
  )
    ? (String(sessionFocus.activeType || "") as PikoraSessionFocus["activeType"])
    : "";

  const next: PikoraSessionFocus = {
    activeType,
    tournament: normalizeSessionFocusEntity(sessionFocus.tournament),
    club: normalizeSessionFocusEntity(sessionFocus.club),
    news: normalizeSessionFocusEntity(sessionFocus.news),
    player: normalizeSessionFocusEntity(sessionFocus.player),
    match: normalizeSessionFocusEntity(sessionFocus.match),
    updatedAt: compactText(sessionFocus.updatedAt, 64),
  };

  const hasEntity = ["tournament", "club", "news", "player", "match"].some(
    (key) => Boolean(next[key as keyof PikoraSessionFocus]),
  );

  return hasEntity ? next : null;
}

export function normalizeSessionFocusOverride(
  value?: Partial<PikoraSessionFocusOverride> | null,
): PikoraSessionFocusOverride {
  const mode = String(value?.mode || "auto").trim().toLowerCase();

  if (mode === "off") {
    return { mode: "off", sessionFocus: null };
  }

  if (mode === "pin") {
    const sessionFocus = normalizeSessionFocus(
      (value as PikoraSessionFocusOverride | null)?.sessionFocus,
    );
    if (sessionFocus) {
      return { mode: "pin", sessionFocus };
    }
  }

  return { mode: "auto", sessionFocus: null };
}

export function sessionFocusMatches(
  left?: PikoraSessionFocus | null,
  right?: PikoraSessionFocus | null,
) {
  const leftFocus = normalizeSessionFocus(left);
  const rightFocus = normalizeSessionFocus(right);
  if (!leftFocus || !rightFocus) return false;

  const leftType = String(leftFocus.activeType || "");
  const rightType = String(rightFocus.activeType || "");
  if (!leftType || !rightType || leftType !== rightType) return false;

  const leftEntity = leftFocus[leftType as keyof PikoraSessionFocus] as
    | PikoraSessionFocusEntity
    | null
    | undefined;
  const rightEntity = rightFocus[rightType as keyof PikoraSessionFocus] as
    | PikoraSessionFocusEntity
    | null
    | undefined;

  return Boolean(
    leftEntity?.entityId &&
      rightEntity?.entityId &&
      leftEntity.entityId === rightEntity.entityId,
  );
}

export function formatTimeLabel(value?: string | number | Date | null) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function makeClientMessageId(prefix = "pikora") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function mergePageSnapshot(
  registeredSnapshot?: ChatBotPageSnapshot | null,
  fallbackSnapshot?: ChatBotPageSnapshot | null,
) {
  const registeredVisibleTournaments = compactStructuredItems(
    registeredSnapshot?.visibleTournaments,
  );
  const fallbackVisibleTournaments = compactStructuredItems(
    fallbackSnapshot?.visibleTournaments,
  );

  const merged: ChatBotPageSnapshot = {
    pageType: compactText(
      registeredSnapshot?.pageType || fallbackSnapshot?.pageType,
      64,
    ),
    pageSection: compactText(
      registeredSnapshot?.pageSection || fallbackSnapshot?.pageSection,
      64,
    ),
    pageView: compactText(
      registeredSnapshot?.pageView || fallbackSnapshot?.pageView,
      64,
    ),
    entityTitle: compactText(
      registeredSnapshot?.entityTitle || fallbackSnapshot?.entityTitle,
      140,
    ),
    sectionTitle: compactText(
      registeredSnapshot?.sectionTitle || fallbackSnapshot?.sectionTitle,
      120,
    ),
    pageSummary: compactText(
      registeredSnapshot?.pageSummary || fallbackSnapshot?.pageSummary,
      240,
    ),
    activeLabels: compactList(
      [
        ...(registeredSnapshot?.activeLabels || []),
        ...(fallbackSnapshot?.activeLabels || []),
      ],
      8,
      64,
    ),
    visibleActions: compactList(
      [
        ...(registeredSnapshot?.visibleActions || []),
        ...(fallbackSnapshot?.visibleActions || []),
      ],
      8,
      64,
    ),
    highlights: compactList(
      [
        ...(registeredSnapshot?.highlights || []),
        ...(fallbackSnapshot?.highlights || []),
      ],
      8,
      96,
    ),
    metrics: compactList(
      [
        ...(registeredSnapshot?.metrics || []),
        ...(fallbackSnapshot?.metrics || []),
      ],
      8,
      96,
    ),
    stats:
      compactStats(registeredSnapshot?.stats) ||
      compactStats(fallbackSnapshot?.stats),
    visibleTournaments: registeredVisibleTournaments.length
      ? registeredVisibleTournaments
      : fallbackVisibleTournaments,
    tournamentId: compactText(
      registeredSnapshot?.tournamentId || fallbackSnapshot?.tournamentId,
      48,
    ),
    clubId: compactText(
      registeredSnapshot?.clubId || fallbackSnapshot?.clubId,
      48,
    ),
    newsSlug: compactText(
      registeredSnapshot?.newsSlug || fallbackSnapshot?.newsSlug,
      96,
    ),
    matchId: compactText(
      registeredSnapshot?.matchId || fallbackSnapshot?.matchId,
      48,
    ),
    courtId: compactText(
      registeredSnapshot?.courtId || fallbackSnapshot?.courtId,
      48,
    ),
  };

  const hasValue = Object.values(merged).some((value) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value),
  );

  return hasValue ? merged : null;
}

function buildPathWithParams(
  routeKey: string,
  params: Record<string, unknown>,
  search: Record<string, unknown> = {},
) {
  const searchParams = new URLSearchParams();
  Object.entries(search).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    searchParams.set(key, String(value));
  });

  const query = searchParams.toString();
  const path = routeKey.replace(/\[([^\]]+)\]/g, (_, key) =>
    compactText(params?.[key], 96),
  );

  return query ? `${path}?${query}` : path;
}

export function getFallbackRouteContext(
  segments: string[],
  rawParams: Record<string, unknown>,
  pathname = "",
): PikoraFallbackRouteContext {
  const params = rawParams || {};
  const routeSegments = filterSegments(segments);
  const routeKey = routeSegments.join("/");

  let pageSnapshot: ChatBotPageSnapshot | null = null;
  let capabilityKeys: string[] = ["navigate", "copy_link"];

  if (!routeKey) {
    pageSnapshot = {
      pageType: "home",
      entityTitle: "Trang chủ",
      pageSummary: "Điểm vào chính của PickleTour trên mobile.",
      visibleActions: ["Xem giải đấu", "Xem live", "Mở trợ lý"],
    };
    capabilityKeys = ["navigate", "copy_link", "open_new_tab"];
  } else if (routeKey === "chat") {
    pageSnapshot = {
      pageType: "chat",
      entityTitle: "Pikora",
      pageSummary: "Màn hình trò chuyện đầy đủ của Pikora trên mobile.",
    };
    capabilityKeys = ["navigate", "copy_link", "copy_current_url"];
  } else if (routeKey === "tournaments") {
    pageSnapshot = {
      pageType: "tournament_list",
      entityTitle: "Giải đấu",
      pageSummary: "Danh sách giải đấu đang hiển thị trên mobile.",
    };
  } else if (routeKey === "live") {
    pageSnapshot = {
      pageType: "live_matches",
      entityTitle: "Live",
      pageSummary: "Danh sách trận đấu đang live.",
    };
  } else if (routeKey === "rankings") {
    pageSnapshot = {
      pageType: "leaderboard",
      entityTitle: "Xếp hạng",
      pageSummary: "Bảng xếp hạng PickleTour trên mobile.",
    };
    capabilityKeys = [
      "navigate",
      "copy_link",
      "set_page_state",
      "prefill_text",
      "focus_element",
    ];
  } else if (routeKey === "my_tournament") {
    pageSnapshot = {
      pageType: "my_tournaments",
      entityTitle: "Giải của tôi",
      pageSummary: "Danh sách giải người dùng đã hoặc đang tham gia.",
    };
    capabilityKeys = ["navigate", "copy_link", "set_page_state"];
  } else if (routeKey === "profile") {
    pageSnapshot = {
      pageType: "profile",
      entityTitle: "Hồ sơ",
      pageSummary: "Trang hồ sơ cá nhân của người dùng hiện tại.",
    };
  } else if (routeKey === "profile/[id]") {
    pageSnapshot = {
      pageType: "player_profile",
      entityTitle: "Hồ sơ người chơi",
      pageSummary: "Trang hồ sơ công khai của người chơi hiện tại.",
    };
  } else if (routeKey === "clubs") {
    pageSnapshot = {
      pageType: "clubs_list",
      entityTitle: "Câu lạc bộ",
      pageSummary: "Danh sách câu lạc bộ PickleTour.",
    };
  } else if (routeKey === "clubs/[id]") {
    pageSnapshot = {
      pageType: "club_detail",
      entityTitle: "Chi tiết câu lạc bộ",
      pageSummary: "Trang chi tiết câu lạc bộ hiện tại.",
      clubId: compactText(params?.id, 48),
    };
    capabilityKeys = ["navigate", "copy_link", "open_dialog"];
  } else if (routeKey === "news") {
    pageSnapshot = {
      pageType: "news_list",
      entityTitle: "Tin tức",
      pageSummary: "Danh sách tin tức PickleTour trên mobile.",
    };
  } else if (routeKey === "news/[slug]") {
    pageSnapshot = {
      pageType: "news_detail",
      entityTitle: "Chi tiết bài viết",
      pageSummary: "Trang bài viết tin tức đang mở.",
      newsSlug: compactText(params?.slug, 96),
    };
  } else if (
    routeKey === "tournament/[id]" ||
    routeKey === "tournament/[id]/home"
  ) {
    pageSnapshot = {
      pageType: "tournament_detail",
      entityTitle: "Tổng quan giải đấu",
      pageSummary: "Màn hình tổng quan giải đấu trên mobile.",
      tournamentId: compactText(params?.id, 48),
    };
    capabilityKeys = ["navigate", "copy_link", "open_dialog"];
  } else if (routeKey === "tournament/[id]/register") {
    pageSnapshot = {
      pageType: "tournament_register",
      entityTitle: "Đăng ký giải đấu",
      pageSummary: "Màn hình đăng ký giải đấu trên mobile.",
      tournamentId: compactText(params?.id, 48),
    };
    capabilityKeys = [
      "navigate",
      "copy_link",
      "set_page_state",
      "prefill_text",
      "focus_element",
    ];
  } else if (routeKey === "tournament/[id]/bracket") {
    pageSnapshot = {
      pageType: "tournament_bracket",
      entityTitle: "Sơ đồ giải đấu",
      pageSummary: "Màn hình sơ đồ nhánh đấu của giải hiện tại.",
      tournamentId: compactText(params?.id, 48),
    };
    capabilityKeys = ["navigate", "copy_link", "set_query_param"];
  } else if (routeKey === "tournament/[id]/schedule") {
    pageSnapshot = {
      pageType: "tournament_schedule",
      entityTitle: "Lịch thi đấu",
      pageSummary: "Màn hình lịch thi đấu của giải hiện tại.",
      tournamentId: compactText(params?.id, 48),
    };
    capabilityKeys = ["navigate", "copy_link", "set_page_state"];
  } else if (routeKey === "tournament/[id]/draw") {
    pageSnapshot = {
      pageType: "tournament_draw",
      entityTitle: "Bốc thăm",
      pageSummary: "Màn hình bốc thăm giải đấu trên mobile.",
      tournamentId: compactText(params?.id, 48),
    };
    capabilityKeys = ["navigate", "copy_link", "set_query_param", "set_page_state"];
  } else if (routeKey === "tournament/[id]/manage") {
    pageSnapshot = {
      pageType: "tournament_manage",
      entityTitle: "Quản lý giải đấu",
      pageSummary: "Màn hình quản lý vận hành giải đấu trên mobile.",
      tournamentId: compactText(params?.id, 48),
    };
    capabilityKeys = [
      "navigate",
      "copy_link",
      "set_page_state",
      "prefill_text",
      "focus_element",
      "open_dialog",
    ];
  } else if (routeKey === "tournament/[id]/checkin") {
    pageSnapshot = {
      pageType: "tournament_checkin",
      entityTitle: "Check-in giải đấu",
      pageSummary: "Màn hình check-in giải đấu trên mobile.",
      tournamentId: compactText(params?.id, 48),
    };
    capabilityKeys = [
      "navigate",
      "copy_link",
      "prefill_text",
      "focus_element",
      "set_page_state",
    ];
  } else if (routeKey === "tournament/[id]/referee") {
    pageSnapshot = {
      pageType: "tournament_referee",
      entityTitle: "Điều phối trọng tài",
      pageSummary: "Màn hình referee của giải đấu hiện tại.",
      tournamentId: compactText(params?.id, 48),
    };
    capabilityKeys = ["navigate", "copy_link", "set_page_state"];
  } else if (routeKey === "match/[id]/home") {
    pageSnapshot = {
      pageType: "match_detail",
      entityTitle: "Chi tiết trận đấu",
      pageSummary: "Trang chi tiết trận đấu hiện tại.",
      matchId: compactText(params?.id, 48),
    };
  } else if (routeKey === "match/[id]/referee") {
    pageSnapshot = {
      pageType: "match_referee",
      entityTitle: "Referee trận đấu",
      pageSummary: "Màn hình chấm điểm và điều phối trọng tài trận đấu.",
      matchId: compactText(params?.id, 48),
    };
    capabilityKeys = ["navigate", "copy_link", "set_page_state"];
  } else if (routeKey === "match/live-setup") {
    pageSnapshot = {
      pageType: "match_live_setup",
      entityTitle: "Thiết lập live",
      pageSummary: "Màn hình cấu hình luồng live và camera.",
    };
    capabilityKeys = ["navigate", "copy_link", "open_dialog", "set_page_state"];
  } else if (routeKey === "match/score") {
    pageSnapshot = {
      pageType: "match_score",
      entityTitle: "Bảng điểm",
      pageSummary: "Màn hình score hiện tại của trận đấu.",
    };
  } else if (routeKey === "admin/home") {
    pageSnapshot = {
      pageType: "admin_home",
      entityTitle: "Admin",
      pageSummary: "Trang quản trị chính trên mobile.",
    };
    capabilityKeys = [
      "navigate",
      "copy_link",
      "set_page_state",
      "prefill_text",
      "focus_element",
      "open_dialog",
    ];
  } else if (routeKey === "live/home") {
    pageSnapshot = {
      pageType: "live_home",
      entityTitle: "Live Home",
      pageSummary: "Trang danh sách và điều hướng live trên mobile.",
    };
  } else if (
    routeKey === "live/studio" ||
    routeKey === "live/studio_court_android" ||
    routeKey === "live/studio_court_ios"
  ) {
    pageSnapshot = {
      pageType: "live_studio",
      entityTitle: "Live Studio",
      pageSummary: "Màn hình live studio trên mobile.",
      courtId: compactText(params?.courtId, 48),
      tournamentId: compactText(params?.tournamentId, 48),
    };
    capabilityKeys = [
      "navigate",
      "copy_link",
      "open_dialog",
      "set_page_state",
      "set_query_param",
    ];
  }

  const currentPath =
    compactText(pathname, 240) ||
    buildPathWithParams(`/${routeSegments.join("/")}`, params);
  const normalizedPath = currentPath.startsWith("/")
    ? currentPath
    : `/${currentPath}`;
  const currentUrl = `pickletour://${normalizedPath.replace(/^\/+/, "")}`;

  return {
    pageSnapshot,
    capabilityKeys,
    pageTitle:
      compactText(pageSnapshot?.entityTitle, 140) ||
      compactText(pageSnapshot?.pageType, 64) ||
      "Pikora",
    currentPath: normalizedPath,
    currentUrl,
    params,
  };
}

export function mapBackendMessage(item: Record<string, any>): PikoraMessage {
  const sources = Array.isArray(item?.meta?.sources) ? item.meta.sources : [];
  const feedback = item?.meta?.feedback || item?.feedback || null;
  const assistantMode =
    item?.meta?.assistantMode ||
    item?.meta?.personalization?.assistantMode ||
    "balanced";
  const verificationMode =
    item?.meta?.verificationMode ||
    item?.meta?.trustMeta?.verificationMode ||
    item?.meta?.personalization?.verificationMode ||
    "balanced";

  return {
    id:
      String(item?.id || item?._id || "") ||
      makeClientMessageId(item?.role === "user" ? "user" : "bot"),
    role: item?.role === "user" ? "user" : "bot",
    text: String(item?.message || ""),
    createdAt: item?.createdAt || "",
    timestampLabel: formatTimeLabel(item?.createdAt),
    navigation: item?.navigation || null,
    actions: Array.isArray(item?.meta?.actions) ? item.meta.actions : [],
    answerCards: Array.isArray(item?.meta?.answerCards)
      ? item.meta.answerCards
      : [],
    sources,
    workflow: item?.meta?.workflow || null,
    mutationPreview: item?.meta?.mutationPreview || null,
    sessionFocus: normalizeSessionFocus(
      item?.meta?.sessionFocus || item?.sessionFocus,
    ),
    sessionFocusState: item?.meta?.sessionFocusState || null,
    thinkingSteps: Array.isArray(item?.meta?.thinkingSteps)
      ? item.meta.thinkingSteps.map((step: any) => ({
          ...step,
          status: step?.status === "running" ? "done" : step?.status || "done",
        }))
      : [],
    rawThinking: String(item?.meta?.rawThinking || ""),
    reasoningAvailable: Boolean(
      item?.meta?.reasoningAvailable || item?.meta?.rawThinking,
    ),
    trustMeta: item?.meta?.trustMeta || null,
    assistantMode: normalizeAssistantMode(assistantMode),
    verificationMode: normalizeVerificationMode(verificationMode),
    surface: String(item?.meta?.surface || "mobile"),
    feedback,
    toolSummary: Array.isArray(item?.meta?.toolSummary)
      ? item.meta.toolSummary
      : [],
    suggestions: Array.isArray(item?.meta?.suggestions)
      ? item.meta.suggestions
      : [],
    meta: item?.meta || {},
  };
}

export function buildOptimisticUserMessage(text: string): PikoraMessage {
  return {
    id: makeClientMessageId("user"),
    role: "user",
    text,
    timestampLabel: formatTimeLabel(),
    createdAt: new Date().toISOString(),
  };
}

export function buildStreamingDraft(): PikoraMessage {
  return {
    id: makeClientMessageId("stream"),
    role: "bot",
    text: "",
    timestampLabel: formatTimeLabel(),
    createdAt: new Date().toISOString(),
    isStreaming: true,
    thinkingSteps: [
      { id: "understand", label: "Đang hiểu yêu cầu...", status: "done" },
      { id: "context", label: "Đang đọc ngữ cảnh hiện tại...", status: "done" },
      { id: "memory", label: "Đang nạp lịch sử hội thoại...", status: "done" },
      { id: "draft", label: "Đang soạn câu trả lời...", status: "running" },
    ],
    actions: [],
    answerCards: [],
    sources: [],
    workflow: null,
    mutationPreview: null,
    sessionFocus: null,
    sessionFocusState: null,
    reasoningAvailable: false,
    rawThinking: "",
    suggestions: [],
    toolSummary: [],
    meta: { source: "agent-stream" },
  };
}

export function buildBotMessageFromPayload(
  payload: Record<string, any>,
  overrides: Partial<PikoraMessage> = {},
): PikoraMessage {
  const sources = Array.isArray(payload?.sources) ? payload.sources : [];
  const assistantMode =
    payload?.assistantMode || payload?.personalization?.assistantMode || "balanced";
  const verificationMode =
    payload?.verificationMode ||
    payload?.trustMeta?.verificationMode ||
    payload?.personalization?.verificationMode ||
    "balanced";

  return {
    id: String(payload?.messageId || payload?.id || makeClientMessageId("bot")),
    role: "bot",
    text:
      typeof payload?.text === "string"
        ? payload.text
        : typeof payload?.reply === "string"
          ? payload.reply
          : "Xin lỗi, hiện tại mình chưa thể trả lời câu này.",
    createdAt: payload?.createdAt || new Date().toISOString(),
    timestampLabel: formatTimeLabel(payload?.createdAt),
    navigation: payload?.navigation || null,
    actions: Array.isArray(payload?.actions) ? payload.actions : [],
    answerCards: Array.isArray(payload?.answerCards) ? payload.answerCards : [],
    sources,
    workflow: payload?.workflow || null,
    mutationPreview: payload?.mutationPreview || null,
    sessionFocus: normalizeSessionFocus(payload?.sessionFocus),
    sessionFocusState: payload?.sessionFocusState || null,
    thinkingSteps: Array.isArray(payload?.thinkingSteps) ? payload.thinkingSteps : [],
    rawThinking: String(payload?.rawThinking || payload?.reasoning || ""),
    reasoningAvailable: Boolean(
      payload?.reasoningAvailable || payload?.rawThinking || payload?.reasoning,
    ),
    trustMeta: payload?.trustMeta || null,
    assistantMode: normalizeAssistantMode(assistantMode),
    verificationMode: normalizeVerificationMode(verificationMode),
    surface: String(payload?.surface || "mobile"),
    feedback: payload?.feedback || null,
    toolSummary: Array.isArray(payload?.toolSummary) ? payload.toolSummary : [],
    suggestions: Array.isArray(payload?.suggestions) ? payload.suggestions : [],
    interrupted: Boolean(payload?.interrupted),
    meta: payload?.meta || {},
    ...overrides,
  };
}

export function uniqueSuggestionList(values: unknown, limit = 4) {
  return compactList(values, limit, 120);
}
