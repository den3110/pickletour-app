import { Platform } from "react-native";

import { BASE_URL, getDeviceId, getDeviceName } from "@/slices/apiSlice";

type StreamEventHandler = (event: string, data: Record<string, any>) => void;

type SendPikoraMessageStreamOptions = {
  token?: string;
  message: string;
  reasoningMode: string;
  assistantMode: string;
  verificationMode: string;
  pageSnapshot?: Record<string, unknown> | null;
  capabilityKeys?: string[];
  sessionFocusOverride?: Record<string, unknown> | null;
  cohortId?: string;
  currentPath?: string;
  currentUrl?: string;
  pageTitle?: string;
  pageType?: string;
  pageSection?: string;
  pageView?: string;
  clubId?: string;
  newsSlug?: string;
  profileUserId?: string;
  courtId?: string;
  knowledgeMode?: string;
  signal?: AbortSignal | null;
  onEvent?: StreamEventHandler;
};

function normalizeBaseUrl(value?: string | null) {
  return String(value || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/\/+$/, "");
}

function resolveChatStreamUrl(baseUrl: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  return /\/api$/i.test(normalized)
    ? `${normalized}/chat/stream`
    : `${normalized}/api/chat/stream`;
}

function consumeSseChunk(
  buffer: string,
  chunk: string,
  onEvent?: StreamEventHandler,
) {
  const nextBuffer = `${buffer || ""}${chunk || ""}`;
  const records = nextBuffer.split(/\r?\n\r?\n/);
  const remainder = records.pop() ?? "";

  records.forEach((record) => {
    const lines = record.split(/\r?\n/);
    let eventName = "message";
    const dataLines: string[] = [];

    lines.forEach((line) => {
      if (!line) return;
      if (line.startsWith(":")) return;
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim() || "message";
        return;
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    });

    if (!dataLines.length) return;

    const rawData = dataLines.join("\n");
    if (rawData === "[DONE]") {
      onEvent?.("done", {});
      return;
    }

    try {
      onEvent?.(eventName, JSON.parse(rawData));
    } catch {
      // Ignore malformed event payloads and continue streaming.
    }
  });

  return remainder;
}

/**
 * Stream SSE via fetch + ReadableStream (works on RN 0.83+ / Hermes).
 * Falls back to XHR if ReadableStream is unavailable.
 */
async function streamViaFetch({
  url,
  headers,
  body,
  signal,
  onEvent,
}: {
  url: string;
  headers: Record<string, string>;
  body: string;
  signal?: AbortSignal | null;
  onEvent?: StreamEventHandler;
}) {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body,
    signal: signal ?? undefined,
    // @ts-ignore — RN-specific hint to enable streaming
    reactNative: { textStreaming: true },
  });

  if (!response.ok) {
    let detail = "";
    try {
      const errorBody = await response.text();
      const parsed = JSON.parse(errorBody);
      detail = parsed?.message || parsed?.error || errorBody;
    } catch {
      detail = `Stream request failed (${response.status})`;
    }
    throw new Error(detail);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    // Fallback: read entire body at once (no streaming)
    const text = await response.text();
    consumeSseChunk("", text, onEvent);
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    buffer = consumeSseChunk(buffer, chunk, onEvent);
  }

  // Flush any remaining buffer
  if (buffer.trim()) {
    consumeSseChunk("", buffer + "\n\n", onEvent);
  }
}

function streamViaXhr({
  url,
  headers,
  body,
  signal,
  onEvent,
}: {
  url: string;
  headers: Record<string, string>;
  body: string;
  signal?: AbortSignal | null;
  onEvent?: StreamEventHandler;
}) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let buffer = "";
    let lastIndex = 0;
    let settled = false;

    const flush = () => {
      const chunk = xhr.responseText?.slice(lastIndex) || "";
      lastIndex = xhr.responseText?.length || 0;
      if (!chunk) return;
      buffer = consumeSseChunk(buffer, chunk, onEvent);
    };

    const finish = (handler: () => void) => {
      if (settled) return;
      settled = true;
      if (signal) {
        signal.removeEventListener("abort", abortHandler);
      }
      handler();
    };

    const abortHandler = () => {
      try {
        xhr.abort();
      } catch {
        // ignore
      }
      const error = new Error("Aborted");
      error.name = "AbortError";
      finish(() => reject(error));
    };

    if (signal?.aborted) {
      abortHandler();
      return;
    }

    if (signal) {
      signal.addEventListener("abort", abortHandler, { once: true });
    }

    xhr.open("POST", url, true);
    Object.entries(headers).forEach(([key, value]) => {
      if (!value) return;
      xhr.setRequestHeader(key, value);
    });

    xhr.onreadystatechange = () => {
      if (xhr.readyState === 3 || xhr.readyState === 4) {
        try {
          flush();
        } catch (error) {
          finish(() => reject(error));
          return;
        }
      }

      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300) {
          finish(resolve);
          return;
        }

        let detail = xhr.responseText || "";
        try {
          const parsed = JSON.parse(xhr.responseText || "{}");
          detail = parsed?.message || parsed?.error || detail;
        } catch {
          // ignore
        }
        finish(() =>
          reject(new Error(detail || `Stream request failed (${xhr.status})`)),
        );
      }
    };

    xhr.onerror = () => {
      finish(() => reject(new Error("Không thể kết nối luồng trả lời.")));
    };

    xhr.send(body);
  });
}

export async function sendPikoraMessageStream(
  options: SendPikoraMessageStreamOptions,
) {
  const [deviceId, deviceName] = await Promise.all([
    getDeviceId(),
    getDeviceName(),
  ]);

  const headers: Record<string, string> = {
    Accept: "text/event-stream",
    "Content-Type": "application/json",
    "X-Platform": Platform.OS,
    "X-Device-Id": deviceId,
    "X-Device-Name": String(deviceName || ""),
    "x-pkt-surface": "mobile",
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (options.currentPath) {
    headers["x-pkt-current-path"] = String(options.currentPath);
  }
  if (options.currentUrl) {
    headers["x-pkt-current-url"] = String(options.currentUrl);
  }
  if (options.pageTitle) {
    headers["x-pkt-page-title"] = String(options.pageTitle);
  }
  if (options.pageType) {
    headers["x-pkt-page-type"] = String(options.pageType);
  }
  if (options.pageSection) {
    headers["x-pkt-page-section"] = String(options.pageSection);
  }
  if (options.pageView) {
    headers["x-pkt-page-view"] = String(options.pageView);
  }
  if (options.clubId) {
    headers["x-pkt-club-id"] = String(options.clubId);
  }
  if (options.newsSlug) {
    headers["x-pkt-news-slug"] = String(options.newsSlug);
  }
  if (options.profileUserId) {
    headers["x-pkt-profile-user-id"] = String(options.profileUserId);
  }
  if (options.courtId) {
    headers["x-pkt-court-id"] = String(options.courtId);
  }
  if (options.cohortId) {
    headers["x-pkt-cohort-id"] = String(options.cohortId);
  }

  const body = JSON.stringify({
    message: options.message,
    reasoningMode: options.reasoningMode,
    assistantMode: options.assistantMode,
    verificationMode: options.verificationMode,
    pageSnapshot: options.pageSnapshot || null,
    capabilityKeys: Array.isArray(options.capabilityKeys)
      ? options.capabilityKeys
      : [],
    sessionFocusOverride: options.sessionFocusOverride || null,
    knowledgeMode: options.knowledgeMode || "auto",
    cohortId: options.cohortId || "",
    surface: "mobile",
  });

  const streamArgs = {
    url: resolveChatStreamUrl(BASE_URL),
    headers,
    body,
    signal: options.signal,
    onEvent: options.onEvent,
  };

  try {
    await streamViaFetch(streamArgs);
  } catch (fetchError: any) {
    // If the error is from abort or HTTP status, propagate it
    if (fetchError?.name === "AbortError" || fetchError?.message?.includes("Stream request failed")) {
      throw fetchError;
    }
    // Otherwise fallback to XHR (ReadableStream may not be available)
    await streamViaXhr(streamArgs);
  }
}
