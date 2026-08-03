import { sid } from "./liveUtils";

export type LiveWatchPayload = {
  item: any;
  sessionKey?: string;
  startPosition?: number;
  muted?: boolean;
  shouldPlay?: boolean;
};

// Handoff in-memory: màn feed set payload NGAY TRƯỚC khi router.push sang
// trang /live/watch (item live-feed quá lớn để nhét vào route params).
let payload: LiveWatchPayload | null = null;

export function setLiveWatchPayload(next: LiveWatchPayload | null) {
  payload = next;
}

export function consumeLiveWatchPayload(expectedId?: string) {
  const current = payload;
  if (!current) return null;
  const id = sid(current.item?._id || current.item?.matchId || current.item?.id);
  if (expectedId && id && expectedId !== id) return null;
  return current;
}
