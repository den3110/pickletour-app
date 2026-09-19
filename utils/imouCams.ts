/**
 * 1 court có thể gắn nhiều cam Imou (sân bóng 3-4 cam theo góc quay).
 * Data mới nằm ở `court.imouCams[]`; data cũ (trước multi-cam) chỉ có `court.imou`.
 * Backend mirror `imou = imouCams[0]` nhưng client vẫn fallback để an toàn với
 * venue chưa được touch từ khi migrate.
 */

export interface ImouCam {
  deviceId: string;
  name?: string;
  productId?: string;
  maxZoomX?: number;
  linkedAt?: string;
}

/** Cam entry đã flatten kèm thông tin court — dùng cho list/switcher UI. */
export interface CourtCam {
  /** Unique key `${courtId}:${deviceId}` — 1 device có thể gắn ở 2 court. */
  key: string;
  courtId: string;
  courtName: string;
  deviceId: string;
  /** Tên góc quay ("Toàn cảnh", "Góc trái"…) — fallback deviceId. */
  camName: string;
  productId?: string;
  maxZoomX?: number;
}

/** Danh sách cam hiệu lực của 1 court — ưu tiên imouCams, fallback legacy imou. */
export function courtCams(court: any): ImouCam[] {
  if (Array.isArray(court?.imouCams) && court.imouCams.length) return court.imouCams;
  if (court?.imou?.deviceId) return [court.imou];
  return [];
}

/** Flatten toàn bộ cam của venue thành list CourtCam (mỗi cam 1 entry). */
export function venueCams(venue: any): CourtCam[] {
  const out: CourtCam[] = [];
  for (const c of venue?.courts || []) {
    for (const cam of courtCams(c)) {
      out.push({
        key: `${c._id}:${cam.deviceId}`,
        courtId: String(c._id),
        courtName: c.name,
        deviceId: cam.deviceId,
        camName: cam.name || cam.deviceId,
        productId: cam.productId,
        maxZoomX: cam.maxZoomX,
      });
    }
  }
  return out;
}

/** Gợi ý tên góc quay khi gắn cam — chủ sân chọn nhanh hoặc tự nhập. */
export const CAM_ANGLE_PRESETS = [
  'Toàn cảnh',
  'Góc trái',
  'Góc phải',
  'Trên lưới',
  'Cuối sân',
  'Cầu môn A',
  'Cầu môn B',
  'Khán đài',
];
