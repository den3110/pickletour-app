import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";

export type CccdQrResult = {
  id?: string;
  name?: string;
  dob?: string; // DD/MM/YYYY (đã chuẩn hoá)
  gender?: string;
  address?: string;
  raw: string;
};
type Props = {
  visible: boolean;
  onClose: () => void;
  onResult: (r: CccdQrResult) => void;
  tint?: string;
  /** ms không quét được → coi như “tối/khó quét” để gợi ý */
  autoDimMs?: number;
};

const TINT = "#0a84ff";

/* ===== helpers parse ===== */
const cleanupName = (s = "") =>
  s
    .replace(/<+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
const is12 = (s?: string) => !!s && /^\d{12}$/.test(String(s));

const pad2 = (n: number) => String(n).padStart(2, "0");
const validDate = (y: number, m: number, d: number) => {
  if (y < 1930 || y > 2029) return false;
  if (m < 1 || m > 12) return false;
  const md = [
    31,
    (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return d >= 1 && d <= md[m - 1];
};
/** Chuẩn hoá DOB → DD/MM/YYYY. Hỗ trợ pattern đặc biệt: 94/19/1411 → 14/11/1994 */
function normalizeDob(raw?: string) {
  if (!raw) return "";
  raw = String(raw).trim();

  // DD/MM/YYYY
  const mDmy = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (mDmy) {
    const [, dd, mm, yyyy] = mDmy;
    const D = +dd,
      M = +mm,
      Y = +yyyy;
    if (validDate(Y, M, D)) return `${pad2(D)}/${pad2(M)}/${Y}`;
    // A/B/CDEF (A=YY last, B=YY first, CDEF=DDMM)
    const A = dd,
      B = mm,
      CDEF = yyyy;
    if ((B === "19" || B === "20") && CDEF.length === 4) {
      const D2 = +CDEF.slice(0, 2),
        M2 = +CDEF.slice(2, 4),
        Y2 = +(B + A);
      if (validDate(Y2, M2, D2)) return `${pad2(D2)}/${pad2(M2)}/${Y2}`;
    }
  }

  // YYYY-MM-DD
  const mIso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (mIso) {
    const [, y, mm, dd] = mIso;
    const Y = +y,
      M = +mm,
      D = +dd;
    if (validDate(Y, M, D)) return `${pad2(D)}/${pad2(M)}/${Y}`;
  }

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 8) {
    // YY(last) YY(first) DD MM  (94191411 → 1994-11-14)
    const yyLast = digits.slice(0, 2);
    const yyFirst = digits.slice(2, 4);
    const D = +digits.slice(4, 6);
    const M = +digits.slice(6, 8);
    const Y = +(yyFirst + yyLast);
    if ((yyFirst === "19" || yyFirst === "20") && validDate(Y, M, D)) {
      return `${pad2(D)}/${pad2(M)}/${Y}`;
    }
    // YYYYMMDD
    const Y2 = +digits.slice(0, 4),
      M2 = +digits.slice(4, 6),
      D2 = +digits.slice(6, 8);
    if (validDate(Y2, M2, D2)) return `${pad2(D2)}/${pad2(M2)}/${Y2}`;
    // DDMMYYYY
    const D3 = +digits.slice(0, 2),
      M3 = +digits.slice(2, 4),
      Y3 = +digits.slice(4, 8);
    if (validDate(Y3, M3, D3)) return `${pad2(D3)}/${pad2(M3)}/${Y3}`;
    // MMDDYYYY
    const M4 = +digits.slice(0, 2),
      D4 = +digits.slice(2, 4),
      Y4 = +digits.slice(4, 8);
    if (validDate(Y4, M4, D4)) return `${pad2(D4)}/${pad2(M4)}/${Y4}`;
  }

  if (digits.length === 6) {
    // YYMMDD
    const y1 = +digits.slice(0, 2),
      m1 = +digits.slice(2, 4),
      d1 = +digits.slice(4, 6);
    const Y1 = y1 >= 50 ? 1900 + y1 : 2000 + y1;
    if (validDate(Y1, m1, d1)) return `${pad2(d1)}/${pad2(m1)}/${Y1}`;
    // DDMMYY
    const d2 = +digits.slice(0, 2),
      m2 = +digits.slice(2, 4),
      y2 = +digits.slice(4, 6);
    const Y2 = y2 >= 50 ? 1900 + y2 : 2000 + y2;
    if (validDate(Y2, m2, d2)) return `${pad2(d2)}/${pad2(m2)}/${Y2}`;
  }

  return raw;
}

const tryJson = (x: string) => {
  try {
    const o = JSON.parse(x);
    return o && typeof o === "object" ? o : null;
  } catch {
    return null;
  }
};
const tryB64Json = (x: string) => {
  try {
    const atobFn = (globalThis as any)?.atob?.bind(globalThis);
    if (!atobFn) return null;
    return tryJson(atobFn(x));
  } catch {
    return null;
  }
};
const pick = (o: any, ks: string[]) => {
  for (const k of ks)
    if (o && o[k] != null && String(o[k]).trim() !== "")
      return String(o[k]).trim();
};
const fromObj = (o: any) => ({
  id: pick(o, [
    "id",
    "cccd",
    "soCCCD",
    "idNumber",
    "identityNumber",
    "personalId",
  ]),
  name: pick(o, ["name", "fullName", "hoTen"]),
  dob: pick(o, ["dob", "dateOfBirth", "ngaySinh"]),
  gender: pick(o, ["gender", "sex", "gioiTinh"]),
  address: pick(o, ["address", "diaChi", "permanentAddress"]),
});
const parseDelimited = (s: string) => {
  const parts = s
    .split(/[|;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  let id, name, dob, gender, address;
  for (const p of parts) if (!id && /^\d{12}$/.test(p)) id = p;
  name = parts.find((p) => /[A-Za-zÀ-ỹ]/.test(p) && !/^\d+$/.test(p));
  dob = parts.find(
    (p) =>
      /^\d{4}-\d{2}-\d{2}$/.test(p) ||
      /^\d{2}\/\d{2}\/\d{4}$/.test(p) ||
      /^\d{6,8}$/.test(p)
  );
  const g = parts.find((p) => /^(M|F|Nam|Nữ|Nu)$/i.test(p));
  if (g) gender = g;
  const textParts = parts.filter((p) => /[A-Za-zÀ-ỹ]/.test(p));
  address = textParts.sort((a, b) => b.length - a.length)[0];
  return { id, name, dob, gender, address };
};
const parseLabeled = (s: string) => {
  const get = (labs: string[]) => {
    for (const lb of labs) {
      const m = s.match(new RegExp(`${lb}\\s*[:=]\\s*([^;|]+)`, "i"));
      if (m?.[1]) return m[1].trim();
    }
  };
  return {
    id: get(["ID", "CCCD", "Identity", "Number", "So"]),
    name: get(["Name", "FullName", "HoTen"]),
    dob: get(["DOB", "Birth", "NgaySinh", "DateOfBirth"]),
    gender: get(["Gender", "Sex", "GioiTinh"]),
    address: get(["Address", "DiaChi", "Residence"]),
  };
};
const robustParse = (data: string) => {
  let o = tryJson(data);
  if (o) return fromObj(o);
  o = tryB64Json(data);
  if (o) return fromObj(o);
  const l = parseLabeled(data);
  if (Object.values(l).some(Boolean)) return l;
  const d = parseDelimited(data);
  if (Object.values(d).some(Boolean)) return d;
  const idOnly = (data.match(/\b\d{12}\b/) || [])[0];
  return { id: idOnly };
};

/* mask CCCD khi log */
const maskId = (id?: string) =>
  id && /^\d{12}$/.test(id)
    ? `${id.slice(0, 3)}******${id.slice(-3)}`
    : id || "";

/* ===== Component ===== */
export default function CccdQrModal({
  visible,
  onClose,
  onResult,
  tint = TINT,
  autoDimMs = 3000,
}: Props) {
  const [perm, requestPermission] = useCameraPermissions();
  const [active, setActive] = useState(true);

  // Torch (chỉ thủ công) + gợi ý thiếu sáng
  const [torchOn, setTorchOn] = useState(false);
  const [showDimHint, setShowDimHint] = useState(false);
  const [lastTick, setLastTick] = useState(Date.now());

  const scanAnim = useRef(new Animated.Value(0)).current;
  const scannedOnceRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    console.log("[CccdQrModal] open");
    if (!perm?.granted) {
      requestPermission().then((res) => {
        console.log("[CccdQrModal] permission requested →", res?.granted);
      });
    } else {
      console.log("[CccdQrModal] permission granted");
    }
    setActive(true);
    setTorchOn(false); // không auto bật
    setShowDimHint(false);
    setLastTick(Date.now());
    scannedOnceRef.current = false;

    Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, {
          toValue: 1,
          duration: 1300,
          useNativeDriver: true,
        }),
        Animated.timing(scanAnim, {
          toValue: 0,
          duration: 1300,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [visible]);

  // Nhận biết “khó quét” → chỉ NHẮC bật đèn (không tự bật)
  useEffect(() => {
    if (!visible || !active) return;
    const t = setInterval(() => {
      const idle = Date.now() - lastTick;
      if (idle > autoDimMs) {
        if (!showDimHint) {
          console.log("[CccdQrModal] dim-hint ON (idle ms):", idle);
          setShowDimHint(true);
        }
      }
    }, 700);
    return () => clearInterval(t);
  }, [visible, active, lastTick, autoDimMs, showDimHint]);

  // Cleanup khi đóng
  useEffect(() => {
    if (!visible || !active) {
      if (torchOn) {
        console.log("[CccdQrModal] cleanup: torch OFF");
        setTorchOn(false);
      }
    }
  }, [visible, active, torchOn]);

  // Logs
  useEffect(() => {
    console.log("[CccdQrModal] torch =", torchOn ? "ON" : "OFF");
  }, [torchOn]);

  const handleScanned = useCallback(
    ({ data }: { data: string }) => {
      if (!data || scannedOnceRef.current) return;
      scannedOnceRef.current = true;

      setLastTick(Date.now());
      const p = robustParse(String(data));
      const id =
        p.id && is12(p.id) ? p.id : (String(data).match(/\b\d{12}\b/) || [])[0];
      const name = cleanupName(p.name || "");
      const dob = normalizeDob(p.dob || ""); // ✅ chuẩn hoá về DD/MM/YYYY

      console.log("[CccdQrModal] scanned:", {
        id: maskId(id),
        name,
        dob,
        rawLen: String(data).length,
        preview: String(data).slice(0, 32),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setActive(false);
      setTorchOn(false);
      onResult?.({ ...p, id, name, dob, raw: String(data) });
    },
    [onResult]
  );

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={() => {
        console.log("[CccdQrModal] close requested");
        setActive(false);
        setTorchOn(false);
        onClose?.();
      }}
      presentationStyle="fullScreen"
      transparent={false}
      statusBarTranslucent
    >
      <View style={s.container}>
        <SafeAreaView style={{ flex: 1 }}>
          {perm?.granted ? (
            <View style={{ flex: 1 }}>
              {active && (
                <>
                  <CameraView
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    enableTorch={torchOn}
                    onBarcodeScanned={handleScanned}
                    barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  />

                  {/* Mask 4 cạnh + khung */}
                  <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                    <View style={s.mask} />
                    <View style={s.middleRow}>
                      <View style={s.sideMask} />
                      <View style={[s.frame, { borderColor: tint }]}>
                        <Animated.View
                          style={[
                            s.scanLine,
                            {
                              backgroundColor: tint,
                              transform: [
                                {
                                  translateY: scanAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0, 220],
                                  }),
                                },
                              ],
                            },
                          ]}
                        />
                      </View>
                      <View style={s.sideMask} />
                    </View>
                    <View style={s.mask} />
                  </View>

                  <Text style={s.hint}>Đưa QR CCCD vào khung</Text>

                  {showDimHint && (
                    <View style={s.dimBanner}>
                      <Text style={s.dimText}>
                        Thiếu sáng — bật đèn để quét nhanh hơn
                      </Text>
                    </View>
                  )}
                </>
              )}

              {/* Top bar */}
              <View style={s.topBar}>
                <Pressable
                  onPress={() => {
                    console.log("[CccdQrModal] user pressed Close");
                    setActive(false);
                    setTorchOn(false);
                    onClose?.();
                  }}
                  style={s.topBtn}
                >
                  <Text style={s.topBtnTxt}>Đóng</Text>
                </Pressable>

                <View
                  style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}
                >
                  <Pressable
                    onPress={() => setTorchOn((v) => !v)}
                    style={[s.topBtn, torchOn && s.topBtnActive]}
                  >
                    <Text style={s.topBtnTxt}>
                      {torchOn ? "Tắt đèn" : "Bật đèn"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : (
            <View style={s.center}>
              <Text style={s.title}>Cần cấp quyền camera</Text>
              <Pressable
                onPress={() => {
                  console.log("[CccdQrModal] request permission clicked");
                  requestPermission();
                }}
                style={[s.topBtn, { marginTop: 10 }]}
              >
                <Text style={s.topBtnTxt}>Cấp quyền</Text>
              </Pressable>
            </View>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  title: { color: "#fff", fontSize: 18, fontWeight: "700" },

  mask: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  middleRow: {
    height: 280,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  sideMask: { flex: 1, height: "100%", backgroundColor: "rgba(0,0,0,0.55)" },
  frame: {
    width: 260,
    height: 260,
    borderRadius: 14,
    borderWidth: 2,
    backgroundColor: "transparent",
    overflow: "hidden",
  },
  scanLine: { height: 2, width: "100%", opacity: 0.95 },

  hint: {
    position: "absolute",
    bottom: 28,
    alignSelf: "center",
    color: "#E8F6F3",
    fontSize: 16,
  },

  topBar: {
    position: "absolute",
    top: 10,
    left: 12,
    right: 12,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  topBtn: {
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  topBtnActive: { backgroundColor: "rgba(255,255,255,0.22)" },
  topBtnTxt: { color: "#fff", fontWeight: "600" },

  dimBanner: {
    position: "absolute",
    bottom: 60,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  dimText: { color: "#FFD966", fontWeight: "600" },
});
