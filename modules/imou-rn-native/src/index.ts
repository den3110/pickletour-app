// imou-rn-native — TypeScript surface API
//
// Phương châm: 1-to-1 với Python reference (`imou-pkg/imou/api.py`). Mọi field
// name giữ camelCase ở JS layer nhưng bên native module có thể nhận snake_case
// để dễ port. Async qua Promises.

import {
  NativeModules,
  NativeEventEmitter,
  Platform,
  requireNativeComponent,
  type ViewStyle,
} from 'react-native';

const LINKING_ERROR =
  `imou-rn-native chưa được link. Đảm bảo:\n` +
  Platform.select({
    ios: '- `cd ios && pod install`',
    android: '- Gradle sync project',
    default: '',
  });

const Native = NativeModules.ImouNative
  ? NativeModules.ImouNative
  : new Proxy({}, { get: () => { throw new Error(LINKING_ERROR); } });

const Events = new NativeEventEmitter(NativeModules.ImouNative);

// ───────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────

export interface Camera {
  deviceId: string;
  name: string;
  model: string;
  productId: string;
  online: boolean;
}

export type PtzMoveKind = 'eight' | 'four' | 'twoLR' | 'none';
export interface PtzCapability {
  /** Loại pan/tilt cam hỗ trợ. 'none' = cam cố định, không pan/tilt. */
  move: PtzMoveKind;
  /** Có optical zoom (GetZoomFocus) hay không. */
  zoom: boolean;
}

export interface Recording {
  begin: string; // YYYYMMDDTHHMMSS
  end: string;
  durationS: number;
  typeName: 'motion' | 'manual' | 'schedule' | 'alarm' | 'unknown';
}

/** Clip sự kiện/alarm (motion, human…) trên SD — service 90800. `thumbnail` là
 *  URL JPEG đã ký. `begin`/`end` (begin + durationS) dùng để playback by-time. */
export interface EventRecording {
  recordId: string;     // 90861 — token cho by-file playback (96700) nếu cần
  begin: string;        // 90869 — yyyyMMddTHHmmss
  end: string;          // begin + durationS
  durationS: number;    // 90868
  title: string;        // 90875 — "Human Detected"…
  eventCode: string;    // 90882 — "32100"…
  thumbnail: string;    // 90873 — signed JPEG URL
}

export interface Session {
  sessionId: string;
}

export interface ImouSessionInfo {
  uuidUser: string;
  uuidKey: string;
  sessionId: string;
  regionalHost: string;
}

export type CaptchaSolver =
  | { mode: 'webview' } // sẽ trigger event 'captchaRequired' để JS render Geetest modal
  | { mode: '2captcha'; apiKey: string };

export interface LoginOpts {
  phone: string;
  password: string;
  areaCode: string;
  captchaSolver?: CaptchaSolver;
}

export interface PlaybackOpts {
  encrypt?: 2 | 3;
  withAudio?: boolean;
  startOffsetSec?: number;
}

export interface RecordOpts {
  /** Lưu vào Photos (iOS) / MediaStore (Android) sau khi stop. */
  saveToGallery?: boolean;
}

export interface LiveOpts {
  withAudio?: boolean;
  /** 'hd' = main stream (default), 'sd' = sub stream (~1/4 bitrate) */
  quality?: 'hd' | 'sd';
}

export interface SnapshotOpts {
  /** When true, also saves the JPEG into the user's Photos library.
   *  Requires `NSPhotoLibraryAddUsageDescription` in Info.plist. */
  saveToGallery?: boolean;
}

export interface ErrorEvent {
  sessionId: string;
  code: string; // 'network' | 'decode' | 'auth' | 'session_lost' | ...
  message: string;
}

export interface PlaybackProgressEvent {
  sessionId: string;
  positionSec: number;  // giây đã phát từ begin
  durationSec: number;  // tổng end-begin
}

export interface CaptchaRequiredEvent {
  challengeId: string;
  captchaId: string;
  riskType: string;
}

export interface CaptchaResponse {
  challengeId: string;
  lotNumber: string;
  captchaOutput: string;
  passToken: string;
  genTime: string;
}

// ───────────────────────────────────────────────────────────────────────
// Zoom helpers (× ↔ normalized)
// ───────────────────────────────────────────────────────────────────────
//
// QUAN TRỌNG: Imou cloud chỉ làm việc với zoom normalized [0..1]. Số "×" tối
// đa (maxX) KHÔNG có ở bất kỳ API/property nào — đã xác minh exhaustive trên
// standard_model + live. Vì vậy maxX phải do **app cấu hình** (user nhập lúc
// add cam, sửa qua nút edit). `Camera.model` (vd "DH-SD-6A9230U-HN") có thể
// dùng làm gợi ý mặc định nhưng không phải nguồn chính xác.
//
// Lưu ý: optical zoom rời rạc + phi tuyến, nên × suy ra chỉ là xấp xỉ tuyến
// tính; giá trị normalized đọc về (getZoomLevel) mới là vị trí vật lý thật.

/** Quy "×" (vd 10) về normalized [0..1] theo maxX app đã lưu cho cam. */
export function zoomXToNormalized(x: number, maxX: number): number {
  if (maxX <= 1) return 0;
  const n = (x - 1) / (maxX - 1);
  return Math.min(1, Math.max(0, n));
}

/** Quy normalized [0..1] về "×" theo maxX app đã lưu cho cam. */
export function zoomNormalizedToX(normalized: number, maxX: number): number {
  const n = Math.min(1, Math.max(0, normalized));
  return 1 + n * (maxX - 1);
}

// ── Resolution ────────────────────────────────────────────────────────────
export interface ResolutionOption { label: string; code: number }
/** Mã resolution device-specific cho service 96500 field 96505 (verified MITM
 *  hồ phải). Cam khác có thể khác mã — đây là tập phổ biến nhất. */
export const IMOU_RESOLUTIONS: ResolutionOption[] = [
  { label: '480P', code: 5 },
  { label: '1080P', code: 18 },
  { label: '4MP', code: 51 },
];

// ───────────────────────────────────────────────────────────────────────
// Module API
// ───────────────────────────────────────────────────────────────────────

export const ImouNative = {
  // ── Auth ────────────────────────────────────────────────────────────
  login(opts: LoginOpts): Promise<void> { return Native.login(opts); },
  logout(): Promise<void> { return Native.logout(); },
  isLoggedIn(): Promise<boolean> { return Native.isLoggedIn(); },
  /** Session hiện tại {uuidUser,uuidKey,sessionId,regionalHost} — upload backend
   *  để server auto-live dùng chung (Imou chỉ cho 1 phiên/tài khoản). */
  getSessionInfo(): Promise<ImouSessionInfo> { return Native.getSessionInfo(); },
  /** Nạp session lấy từ backend thay vì login lại (tránh đá phiên server). */
  importSession(s: ImouSessionInfo): Promise<void> { return Native.importSession(s); },
  /** Native tự relogin sau 12002 → JS nên upload session mới lên backend. */
  onSessionRenewed(cb: (s: ImouSessionInfo) => void) {
    return Events.addListener('sessionRenewed', cb);
  },

  /** Khi captchaSolver='webview', native sẽ emit 'captchaRequired' event.
   *  JS render Geetest modal → gọi submitCaptcha() để complete login. */
  submitCaptcha(resp: CaptchaResponse): Promise<void> {
    return Native.submitCaptcha(resp);
  },

  // ── Devices ─────────────────────────────────────────────────────────
  listDevices(): Promise<Camera[]> { return Native.listDevices(); },
  listRecordings(deviceId: string, date: string): Promise<Recording[]> {
    return Native.listRecordings(deviceId, date);
  },
  /** Danh sách clip sự kiện/alarm (motion, human…) trong 1 ngày — service 90800,
   *  kèm thumbnail JPEG. `date` format yyyy-MM-dd (giống listRecordings). */
  listEventRecordings(deviceId: string, date: string): Promise<EventRecording[]> {
    return Native.listEventRecordings(deviceId, date);
  },

  // ── Video sessions ──────────────────────────────────────────────────
  startLive(deviceId: string, opts: LiveOpts = {}): Promise<Session> {
    return Native.startLive(deviceId, opts);
  },
  startPlayback(
    deviceId: string,
    begin: string,
    end: string,
    opts: PlaybackOpts = {}
  ): Promise<Session> {
    return Native.startPlayback(deviceId, begin, end, opts);
  },
  stopSession(sessionId: string): Promise<void> {
    return Native.stopSession(sessionId);
  },
  /** Bắt đầu GHI session đang xem (live hoặc playback) ra .mp4 — giống nút
   *  record của Imou: quay lại đoạn ĐANG XEM từ bây giờ tới khi `stopRecording`.
   *  `sessionId` từ startLive/startPlayback. */
  startRecording(sessionId: string): Promise<void> {
    return Native.startRecording(sessionId);
  },
  /** Dừng ghi + finalize → `{ uri }` (file://). `saveToGallery` lưu Photos
   *  (iOS) / MediaStore (Android). Reject nếu chưa ghi được frame nào. */
  stopRecording(
    sessionId: string,
    opts: RecordOpts = {}
  ): Promise<{ uri: string; savedToGallery?: boolean }> {
    return Native.stopRecording(sessionId, opts);
  },

  // ── Runtime controls ────────────────────────────────────────────────
  /** Mute/unmute audio for an active session — instant, no restart. */
  setMuted(sessionId: string, muted: boolean): Promise<void> {
    return Native.setMuted(sessionId, muted);
  },
  /** Pause/resume video presentation. Stream keeps draining in the
   *  background; resume picks up where the layer left off. Useful for
   *  playback; for live, prefer `stopSession` to actually free bandwidth. */
  setPaused(sessionId: string, paused: boolean): Promise<void> {
    return Native.setPaused(sessionId, paused);
  },

  // ── Picture-in-Picture ──────────────────────────────────────────────
  /** Enter PiP for the given session. iOS only. Requires `audio` background
   *  mode + `UIBackgroundModes`. Returns rejected promise if device
   *  doesn't support PiP. */
  startPiP(sessionId: string): Promise<void> {
    return Native.startPiP(sessionId);
  },
  stopPiP(sessionId: string): Promise<void> {
    return Native.stopPiP(sessionId);
  },

  // ── Snapshot ────────────────────────────────────────────────────────
  snapshot(deviceId: string, opts: SnapshotOpts = {}):
      Promise<{ uri: string; savedToGallery?: boolean }> {
    return Native.snapshot(deviceId, opts);
  },

  // ── PTZ (cameras with `cm_ptz` capability only) ────────────────────
  /** Relative move 8-direction with normalized speeds + duration.
   *  - h ∈ [-1..1]: horizontal (negative=left, positive=right)
   *  - v ∈ [-1..1]: vertical (negative=down, positive=up)
   *  - zoom ∈ [-1..1]: zoom (negative=wide, positive=tele)
   *  - durationMs ∈ [1..99999]: default 500ms
   *  Mọi component có thể bằng 0 — pass `h: 0.7, v: 0, zoom: 0` để pure pan.
   *  Server reject với code khác 10000 nếu camera không có PTZ capability. */
  ptzMove(
    deviceId: string,
    opts: { h?: number; v?: number; zoom?: number; durationMs?: number },
  ): Promise<void> {
    return Native.ptzMove(deviceId, opts);
  },
  /** Reset PTZ to initial position. */
  ptzReset(deviceId: string): Promise<void> {
    return Native.ptzReset(deviceId);
  },
  /** Tự nhận diện khả năng PTZ của camera (không di chuyển cam). Probe cloud +
   *  cache per-device. Dùng để render UI đúng theo cam:
   *   - `move`: 'eight' (speed-dome 8 hướng) | 'four' (PT 4 hướng) |
   *             'twoLR' (pan trái-phải) | 'none' (cam cố định)
   *   - `zoom`: có optical zoom hay không */
  getPtzCapability(deviceId: string): Promise<PtzCapability> {
    return Native.getPtzCapability(deviceId);
  },
  /** Set absolute zoom, `level` ∈ [0..1] normalized (0=widest, 1=max optical).
   *  Đây là đơn vị **gốc** Imou cloud dùng — KHÔNG có số "×" trong cloud.
   *  Camera mất 1-3s di chuyển vật lý và **snap vào bước quang học rời rạc**
   *  (vd set 0.0 → đọc lại 0.0078). Nếu app muốn nhập theo "×", dùng `setZoomX`
   *  với maxX do user cấu hình (xem `zoomXToNormalized`). */
  setZoomLevel(
    deviceId: string,
    opts: { level: number },
  ): Promise<void> {
    return Native.setZoomLevel(deviceId, opts);
  },
  /** Đọc zoom hiện tại, trả về [0..1] normalized — đúng giá trị vật lý camera
   *  báo về sau khi optics settle. Cloud KHÔNG cung cấp số "×" tối đa; muốn hiển
   *  thị "×" thì app tự lưu maxX (user nhập khi add cam) rồi `zoomNormalizedToX`. */
  getZoomLevel(deviceId: string): Promise<number> {
    return Native.getZoomLevel(deviceId);
  },
  /** Đặt zoom theo "×" người dùng (vd 10×) — cần `maxX` mà app đã lưu cho cam
   *  (Imou cloud không expose maxX; user nhập lúc add cam, sửa qua nút edit). */
  setZoomX(deviceId: string, x: number, maxX: number): Promise<void> {
    return Native.setZoomLevel(deviceId, { level: zoomXToNormalized(x, maxX) });
  },
  /** Đọc zoom hiện tại quy ra "×" — cần `maxX` app đã lưu cho cam. */
  async getZoomX(deviceId: string, maxX: number): Promise<number> {
    return zoomNormalizedToX(await Native.getZoomLevel(deviceId), maxX);
  },

  // ── Resolution ──────────────────────────────────────────────────────
  /** Đổi resolution stream qua service 96500 (field 96505). `code` device-specific:
   *  xem `IMOU_RESOLUTIONS` (4MP=51, 1080P=18, 480P=5). Sau khi gọi, app PHẢI
   *  stop + start lại live stream để nhận stream theo resolution mới. */
  setResolution(deviceId: string, code: number): Promise<void> {
    return Native.setResolution(deviceId, code);
  },

  // ── Events ──────────────────────────────────────────────────────────
  onError(cb: (e: ErrorEvent) => void) {
    return Events.addListener('error', cb);
  },
  onCaptchaRequired(cb: (e: CaptchaRequiredEvent) => void) {
    return Events.addListener('captchaRequired', cb);
  },
  onSessionReady(cb: (e: Session) => void) {
    return Events.addListener('sessionReady', cb);
  },
  /** Playback only: vị trí phát hiện tại để vẽ thanh tua. Emit ~1 lần/giây.
   *  `positionSec` = số giây đã phát từ `begin`; `durationSec` = end-begin.
   *  Thời điểm ghi tuyệt đối = begin + positionSec. */
  onPlaybackProgress(cb: (e: PlaybackProgressEvent) => void) {
    return Events.addListener('playbackProgress', cb);
  },
};

// ───────────────────────────────────────────────────────────────────────
// <ImouVideoView /> — native rendering component
// ───────────────────────────────────────────────────────────────────────

interface ImouVideoViewProps {
  sessionId: string;
  resizeMode?: 'cover' | 'contain';
  onReady?: () => void;
  onError?: (e: ErrorEvent) => void;
  style?: ViewStyle;
}

export const ImouVideoView =
  requireNativeComponent<ImouVideoViewProps>('ImouVideoView');

// Geetest captcha modal — re-exported for convenience
export { ImouCaptcha } from './ImouCaptcha';

export default ImouNative;
