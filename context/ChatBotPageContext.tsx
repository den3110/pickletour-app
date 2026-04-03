import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type ChatBotActionHandler = (
  value?: string,
  payload?: Record<string, unknown>,
  action?: Record<string, unknown>,
) => unknown | Promise<unknown>;

export type ChatBotPageSnapshot = {
  pageType?: string;
  pageSection?: string;
  pageView?: string;
  entityTitle?: string;
  sectionTitle?: string;
  pageSummary?: string;
  activeLabels?: string[];
  visibleActions?: string[];
  highlights?: string[];
  metrics?: string[];
  stats?: Record<string, string | number>;
  visibleTournaments?: Array<{
    id?: string;
    name?: string;
    status?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
  }>;
  tournamentId?: string;
  clubId?: string;
  newsSlug?: string;
  matchId?: string;
  courtId?: string;
};

type ChatBotPageBindingConfig = {
  snapshot?: ChatBotPageSnapshot | null;
  capabilityKeys?: string[];
  actionHandlers?: Record<string, ChatBotActionHandler>;
};

type ChatBotPageContextValue = {
  snapshot: ChatBotPageSnapshot | null;
  capabilityKeys: string[];
  getActionHandler: (key?: string | null) => ChatBotActionHandler | null;
  setSnapshot: (snapshot?: ChatBotPageSnapshot | null) => void;
  clearSnapshot: () => void;
  setPageBindings: (config?: ChatBotPageBindingConfig | ChatBotPageSnapshot | null) => void;
  clearPageBindings: () => void;
};

const ChatBotPageContext = createContext<ChatBotPageContextValue>({
  snapshot: null,
  capabilityKeys: [],
  getActionHandler: () => null,
  setSnapshot: () => {},
  clearSnapshot: () => {},
  setPageBindings: () => {},
  clearPageBindings: () => {},
});

function trimText(value: unknown, maxLength = 180) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function sanitizeList(list: unknown, limit = 8, maxLength = 80) {
  const seen = new Set<string>();

  return (Array.isArray(list) ? list : [])
    .map((item) => trimText(item, maxLength))
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function sanitizeStats(
  stats: ChatBotPageSnapshot["stats"],
): ChatBotPageSnapshot["stats"] | null {
  if (!stats || typeof stats !== "object") return null;

  const next: Record<string, string | number> = {};

  Object.entries(stats).forEach(([key, value]) => {
    const safeKey = trimText(key, 48);
    if (!safeKey) return;

    if (typeof value === "number" && Number.isFinite(value)) {
      next[safeKey] = value;
      return;
    }

    const textValue = trimText(value, 96);
    if (textValue) {
      next[safeKey] = textValue;
    }
  });

  return Object.keys(next).length ? next : null;
}

function sanitizeStructuredItems(
  list: ChatBotPageSnapshot["visibleTournaments"],
  limit = 8,
) {
  return (Array.isArray(list) ? list : [])
    .map((item) => ({
      id: trimText(item?.id, 64),
      name: trimText(item?.name, 140),
      status: trimText(item?.status, 32),
      location: trimText(item?.location, 96),
      startDate: trimText(item?.startDate, 48),
      endDate: trimText(item?.endDate, 48),
    }))
    .filter((item) => item.name)
    .slice(0, limit);
}

function sanitizeSnapshot(snapshot?: ChatBotPageSnapshot | null) {
  if (!snapshot || typeof snapshot !== "object") return null;

  const next: ChatBotPageSnapshot = {
    pageType: trimText(snapshot.pageType, 64),
    pageSection: trimText(snapshot.pageSection, 64),
    pageView: trimText(snapshot.pageView, 64),
    entityTitle: trimText(snapshot.entityTitle, 140),
    sectionTitle: trimText(snapshot.sectionTitle, 120),
    pageSummary: trimText(snapshot.pageSummary, 240),
    activeLabels: sanitizeList(snapshot.activeLabels, 8, 64),
    visibleActions: sanitizeList(snapshot.visibleActions, 8, 64),
    highlights: sanitizeList(snapshot.highlights, 8, 96),
    metrics: sanitizeList(snapshot.metrics, 8, 96),
    stats: sanitizeStats(snapshot.stats) || undefined,
    visibleTournaments: sanitizeStructuredItems(snapshot.visibleTournaments, 8),
    tournamentId: trimText(snapshot.tournamentId, 48),
    clubId: trimText(snapshot.clubId, 48),
    newsSlug: trimText(snapshot.newsSlug, 96),
    matchId: trimText(snapshot.matchId, 48),
    courtId: trimText(snapshot.courtId, 48),
  };

  const hasValue = Object.values(next).some((value) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value),
  );

  return hasValue ? next : null;
}

export function ChatBotPageContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [snapshot, setSnapshotState] = useState<ChatBotPageSnapshot | null>(
    null,
  );
  const [capabilityKeys, setCapabilityKeys] = useState<string[]>([]);
  const actionHandlersRef = useRef<Record<string, ChatBotActionHandler>>({});

  const setSnapshot = useCallback((nextSnapshot?: ChatBotPageSnapshot | null) => {
    setSnapshotState(sanitizeSnapshot(nextSnapshot));
  }, []);

  const clearSnapshot = useCallback(() => {
    setSnapshotState(null);
  }, []);

  const setPageBindings = useCallback(
    (config?: ChatBotPageBindingConfig | ChatBotPageSnapshot | null) => {
      const configObject =
        config && typeof config === "object" && "snapshot" in config
          ? (config as ChatBotPageBindingConfig)
          : { snapshot: config as ChatBotPageSnapshot | null };

      const sanitizedSnapshot = sanitizeSnapshot(configObject?.snapshot || null);
      const nextCaps = sanitizeList(configObject?.capabilityKeys, 16, 48).map(
        (item) => item.toLowerCase(),
      );

      setSnapshotState((prev) => {
        const prevString = JSON.stringify(prev);
        const nextString = JSON.stringify(sanitizedSnapshot);
        return prevString === nextString ? prev : sanitizedSnapshot;
      });

      setCapabilityKeys((prev) => {
        const prevString = JSON.stringify(prev);
        const nextString = JSON.stringify(nextCaps);
        return prevString === nextString ? prev : nextCaps;
      });

      actionHandlersRef.current =
        configObject?.actionHandlers &&
        typeof configObject.actionHandlers === "object"
          ? configObject.actionHandlers
          : {};
    },
    [],
  );

  const clearPageBindings = useCallback(() => {
    setSnapshotState(null);
    setCapabilityKeys([]);
    actionHandlersRef.current = {};
  }, []);

  const getActionHandler = useCallback((key?: string | null) => {
    if (!key) return null;
    return actionHandlersRef.current?.[key] || null;
  }, []);

  const value = useMemo(
    () => ({
      snapshot,
      capabilityKeys,
      getActionHandler,
      setSnapshot,
      clearSnapshot,
      setPageBindings,
      clearPageBindings,
    }),
    [
      snapshot,
      capabilityKeys,
      getActionHandler,
      setSnapshot,
      clearSnapshot,
      setPageBindings,
      clearPageBindings,
    ],
  );

  return (
    <ChatBotPageContext.Provider value={value}>
      {children}
    </ChatBotPageContext.Provider>
  );
}

export function useChatBotPageContext() {
  return useContext(ChatBotPageContext);
}

export function useRegisterChatBotPageSnapshot(
  snapshot?: ChatBotPageSnapshot | null,
) {
  const { setPageBindings, clearPageBindings } = useChatBotPageContext();
  const serialized = useMemo(() => JSON.stringify(snapshot || null), [snapshot]);

  useEffect(() => {
    if (!serialized || serialized === "null") {
      clearPageBindings();
      return undefined;
    }

    setPageBindings({ snapshot: JSON.parse(serialized) });

    return () => {
      clearPageBindings();
    };
  }, [clearPageBindings, serialized, setPageBindings]);
}

export function useRegisterChatBotPageContext(
  config?: ChatBotPageBindingConfig | null,
) {
  const { setPageBindings, clearPageBindings } = useChatBotPageContext();
  const serializedSnapshot = useMemo(
    () => JSON.stringify(config?.snapshot || null),
    [config?.snapshot],
  );
  const capabilityKeys = useMemo(
    () => (Array.isArray(config?.capabilityKeys) ? config.capabilityKeys : []),
    [config?.capabilityKeys],
  );
  const actionHandlers = config?.actionHandlers;

  useEffect(() => {
    const nextSnapshot =
      serializedSnapshot && serializedSnapshot !== "null"
        ? JSON.parse(serializedSnapshot)
        : null;

    setPageBindings({
      snapshot: nextSnapshot,
      capabilityKeys,
      actionHandlers,
    });

    return () => {
      clearPageBindings();
    };
  }, [
    actionHandlers,
    capabilityKeys,
    clearPageBindings,
    serializedSnapshot,
    setPageBindings,
  ]);
}
