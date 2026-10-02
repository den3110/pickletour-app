// Thêm sân live / Hẹn giờ từ app (admin) — gửi qua backend proxy tới control-server desktop.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Text } from "@/components/ui/i18nText";
import { TextInput } from "@/components/ui/i18nTextInput";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, Redirect, router, useLocalSearchParams } from "expo-router";
import { useSelector } from "react-redux";
import { useTheme } from "@react-navigation/native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useLiveControlCallMutation } from "@/slices/liveControlApiSlice";
import { useUploadImageToFolderMutation } from "@/slices/uploadApiSlice";
import { prepareSupportImageForUpload } from "@/utils/supportImageUpload";

export default function LiveAddScreen() {
  const theme = useTheme();
  const isDark = theme.dark;
  const userInfo = useSelector((s: any) => s.auth?.userInfo);
  const isAdmin = !!(userInfo?.isAdmin || userInfo?.role === "admin" || userInfo?.isSuperAdmin);
  const { machineId } = useLocalSearchParams<{ machineId: string }>();

  const C = useMemo(
    () => ({
      bg: isDark ? theme.colors.background : "#F8FAFC",
      card: isDark ? "#111827" : "#FFFFFF",
      border: isDark ? "rgba(255,255,255,0.12)" : "#E2E8F0",
      text: theme.colors.text,
      sub: isDark ? "#94A3B8" : "#64748B",
      primary: "#0EA5E9",
      field: isDark ? "#0b1220" : "#F1F5F9",
    }),
    [isDark, theme],
  );

  const [callMut] = useLiveControlCallMutation();
  const [uploadImg] = useUploadImageToFolderMutation();
  const [logoUploading, setLogoUploading] = useState(false);
  const call = useCallback(
    (path: string, method = "GET", body?: any) =>
      callMut({ machineId: String(machineId), path, method, body }).unwrap(),
    [machineId, callMut]
  );

  const [opt, setOpt] = useState<any>({ tournaments: [], cams: [], rtspSources: [], fbPages: [], encoders: [] });
  const [loading, setLoading] = useState(true);

  // Form state
  const [tour, setTour] = useState<any>(null);
  const [courts, setCourts] = useState<any[]>([]);
  const [court, setCourt] = useState<any>(null);
  const [tourQuery, setTourQuery] = useState("");
  const [srcType, setSrcType] = useState<"rtsp" | "url" | "imou">("rtsp");
  const [rtspIdx, setRtspIdx] = useState<number>(-1);
  const [urlText, setUrlText] = useState("");
  const [camIdx, setCamIdx] = useState<number>(-1);
  const [destType, setDestType] = useState<"fb" | "youtube">("fb");
  const [fbPage, setFbPage] = useState<any>(null);
  const [crosspost, setCrosspost] = useState<string[]>([]);
  const [perMatch, setPerMatch] = useState(false);
  const [split, setSplit] = useState(false);
  const [recordClips, setRecordClips] = useState(false);
  const [hideTs, setHideTs] = useState(false);
  const [title, setTitle] = useState("");
  const [encoder, setEncoder] = useState("auto");
  const [overlayStyle, setOverlayStyle] = useState("classic");
  const [browserOverlayUrl, setBrowserOverlayUrl] = useState("");
  const [showTicker, setShowTicker] = useState(true);
  const [brandLogoUrl, setBrandLogoUrl] = useState("");
  const [schedAt, setSchedAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);

  // Modal picker
  const [picker, setPicker] = useState<{ title: string; items: { label: string; value: any }[]; onPick: (v: any) => void } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const d = await call("/api/options");
        setOpt({
          tournaments: d.tournaments || [], cams: d.cams || [],
          rtspSources: d.rtspSources || [], fbPages: d.fbPages || [],
          encoders: d.encoders || [],
        });
      } catch (e: any) {
        Alert.alert("Lỗi", e?.data?.message || e?.message || "Không tải được tuỳ chọn (máy offline?)");
      } finally {
        setLoading(false);
      }
    })();
  }, [call]);

  const searchTours = useCallback(async (q: string) => {
    try {
      const d = await call(`/api/options?q=${encodeURIComponent(q)}`);
      setOpt((o: any) => ({ ...o, tournaments: d.tournaments || [] }));
    } catch {}
  }, [call]);

  const pickTournament = async (t: any) => {
    setTour(t); setCourt(null); setCourts([]);
    try {
      const d = await call(`/api/options?tournamentId=${encodeURIComponent(t._id)}`);
      setCourts(d.courts || []);
    } catch {}
  };

  const pickLogo = async () => {
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.95 });
      if (r.canceled || !r.assets?.[0]) return;
      setLogoUploading(true);
      const file = await prepareSupportImageForUpload({ uri: r.assets[0].uri }, "logo");
      const res: any = await uploadImg({ folder: "overlay-logos", file, options: { format: "png", quality: 92 } }).unwrap();
      const url = res?.url || res?.data?.url;
      if (url) setBrandLogoUrl(url);
      else throw new Error("Không nhận được URL");
    } catch (e: any) {
      Alert.alert("Lỗi", "Tải logo thất bại: " + (e?.message || e));
    } finally {
      setLogoUploading(false);
    }
  };

  const buildPayload = () => {
    if (!tour) throw new Error("Chọn giải đấu");
    if (!court) throw new Error("Chọn sân");
    let source: any = {};
    if (srcType === "rtsp") { const s = opt.rtspSources[rtspIdx]; if (!s) throw new Error("Chọn nguồn RTSP"); source = { sourceUrl: s.url }; }
    else if (srcType === "url") { if (!urlText.trim()) throw new Error("Nhập link nguồn"); source = { sourceUrl: urlText.trim() }; }
    else { const c = opt.cams[camIdx]; if (!c) throw new Error("Chọn camera Imou"); source = { imouDeviceId: c.deviceId, venueId: c.venueId }; }
    let destinations: any[] = [];
    if (destType === "fb") {
      if (!fbPage) throw new Error("Chọn Facebook Page");
      const dest: any = { type: "fb", pageId: fbPage.pageId, pageName: fbPage.pageName, label: fbPage.pageName };
      const cp = crosspost.filter((id) => id && id !== fbPage.pageId);
      if (cp.length) { dest.crosspostPageIds = cp; dest.crosspostNames = cp.map((id) => opt.fbPages.find((x: any) => x.pageId === id)?.pageName || id); }
      destinations = [dest];
    } else destinations = [{ type: "youtube", label: "YouTube (tự tạo qua API)" }];
    const payload: any = {
      tournamentId: tour._id, tournamentName: tour.name,
      courtStationId: court._id, courtName: court.name,
      source, destinations,
      perMatchLive: perMatch, recordClips, splitPerTournament: split,
      title: title.trim(), encoder, overlayStyle, noTicker: !showTicker,
      advanced: { resolutionH: 1080, fps: 0, videoBitrateKbps: 4500 },
    };
    if (hideTs) payload.hideTimestamp = true;
    if (overlayStyle === "url") {
      if (!browserOverlayUrl.trim()) throw new Error("Nhập URL scoreboard");
      payload.browserOverlayUrl = browserOverlayUrl.trim();
    }
    if (brandLogoUrl.trim()) payload.brandLogoUrl = brandLogoUrl.trim();
    return payload;
  };

  const doStart = async () => {
    setBusy(true);
    try {
      await call("/api/start", "POST", buildPayload());
      Alert.alert("OK", "Đã bắt đầu live.");
      router.back();
    } catch (e: any) { Alert.alert("Lỗi", e?.data?.error || e?.data?.detail || e?.data?.message || e?.message || "Thử lại"); }
    finally { setBusy(false); }
  };
  const doSchedule = async () => {
    try {
      if (!schedAt) throw new Error("Chọn ngày giờ hẹn");
      if (schedAt.getTime() < Date.now() + 30000) throw new Error("Thời điểm hẹn phải ở tương lai");
      setBusy(true);
      await call("/api/schedule", "POST", { ...buildPayload(), startAt: schedAt.getTime() });
      Alert.alert("OK", "Đã hẹn giờ live lúc " + schedAt.toLocaleString("vi-VN"));
      router.back();
    } catch (e: any) { Alert.alert("Lỗi", e?.data?.error || e?.data?.detail || e?.data?.message || e?.message || "Thử lại"); }
    finally { setBusy(false); }
  };

  const openDateTime = () => {
    const base = schedAt || new Date(Date.now() + 3600000);
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: base, mode: "date", onChange: (_e, d) => {
          if (!d) return;
          DateTimePickerAndroid.open({
            value: d, mode: "time", is24Hour: true, onChange: (_e2, t) => {
              if (!t) return;
              const out = new Date(d); out.setHours(t.getHours(), t.getMinutes(), 0, 0);
              setSchedAt(out);
            },
          });
        },
      });
    } else { setIosPicker(base); }
  };
  const [iosPicker, setIosPicker] = useState<Date | null>(null);

  // Giữ identity ổn định (useCallback) để gõ TextInput không bị remount → mất focus/đóng bàn phím.
  const Row = useCallback(
    ({ label, children }: any) => (
      <View style={{ marginBottom: 12 }}>
        <Text style={{ color: C.sub, fontSize: 13, marginBottom: 5 }}>{label}</Text>
        {children}
      </View>
    ),
    [C],
  );
  const SelectBtn = useCallback(
    ({ text, onPress }: any) => (
      <Pressable onPress={onPress} style={[styles.select, { backgroundColor: C.field, borderColor: C.border }]}>
        <Text style={{ color: text ? C.text : C.sub }}>{text || "— Chọn —"}</Text>
      </Pressable>
    ),
    [C],
  );
  const Seg = useCallback(
    ({ options, value, onChange }: any) => (
      <View style={styles.seg}>
        {options.map((o: any) => (
          <Pressable key={o.v} onPress={() => onChange(o.v)} style={[styles.segItem, { backgroundColor: value === o.v ? C.primary : C.field, borderColor: C.border }]}>
            <Text style={{ color: value === o.v ? "#fff" : C.text, fontWeight: "600", fontSize: 13 }}>{o.l}</Text>
          </Pressable>
        ))}
      </View>
    ),
    [C],
  );
  const Toggle = useCallback(
    ({ label, value, onValueChange }: any) => (
      <View style={[styles.toggleRow]}>
        <Text style={{ color: C.text, flex: 1 }}>{label}</Text>
        <Switch value={value} onValueChange={onValueChange} />
      </View>
    ),
    [C],
  );

  if (!isAdmin) return <Redirect href="/(tabs)/more" />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { borderColor: C.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Text style={{ color: C.primary, fontSize: 16 }}>‹ Quay lại</Text></Pressable>
        <Text style={[styles.h1, { color: C.text }]}>Thêm sân live</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={C.primary} style={{ marginTop: 30 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          <Row label="Giải đấu">
            <TextInput
              value={tourQuery}
              onChangeText={(v: string) => { setTourQuery(v); searchTours(v); }}
              placeholder="Tìm tên giải…"
              placeholderTextColor={C.sub}
              style={[styles.input, { backgroundColor: C.field, borderColor: C.border, color: C.text }]}
            />
            <View style={{ height: 6 }} />
            <SelectBtn text={tour?.name} onPress={() => setPicker({ title: "Chọn giải", items: opt.tournaments.map((t: any) => ({ label: t.name, value: t })), onPick: pickTournament })} />
          </Row>

          {!!tour && (
            <Row label="Sân">
              <SelectBtn text={court ? `${court.name}${court.hasMatch ? " · (đang có trận)" : ""}` : ""} onPress={() => setPicker({ title: "Chọn sân", items: courts.map((c: any) => ({ label: `${c.name}${c.hasMatch ? " · (đang có trận)" : ""}`, value: c })), onPick: setCourt })} />
            </Row>
          )}

          <Row label="Nguồn">
            <Seg options={[{ v: "rtsp", l: "RTSP lưu" }, { v: "url", l: "Link" }, { v: "imou", l: "Imou" }]} value={srcType} onChange={setSrcType} />
            <View style={{ height: 8 }} />
            {srcType === "rtsp" && <SelectBtn text={opt.rtspSources[rtspIdx]?.label} onPress={() => setPicker({ title: "Nguồn RTSP", items: opt.rtspSources.map((s: any, i: number) => ({ label: s.label, value: i })), onPick: setRtspIdx })} />}
            {srcType === "url" && <TextInput value={urlText} onChangeText={setUrlText} placeholder="rtsp:// hoặc m3u8…" placeholderTextColor={C.sub} style={[styles.input, { backgroundColor: C.field, borderColor: C.border, color: C.text }]} />}
            {srcType === "imou" && <SelectBtn text={opt.cams[camIdx]?.label} onPress={() => setPicker({ title: "Camera Imou", items: opt.cams.map((c: any, i: number) => ({ label: c.label, value: i })), onPick: setCamIdx })} />}
          </Row>

          <Row label="Điểm đến">
            <Seg options={[{ v: "fb", l: "Facebook" }, { v: "youtube", l: "YouTube" }]} value={destType} onChange={setDestType} />
            {destType === "fb" && (
              <>
                <View style={{ height: 8 }} />
                <SelectBtn text={fbPage?.pageName} onPress={() => setPicker({ title: "Facebook Page", items: opt.fbPages.map((p: any) => ({ label: p.pageName, value: p })), onPick: setFbPage })} />
                <Pressable
                  onPress={() => setPicker({
                    title: "Crosspost (chọn nhiều)", multi: true, selected: crosspost,
                    items: opt.fbPages.filter((p: any) => p.pageId !== fbPage?.pageId).map((p: any) => ({ label: p.pageName, value: p.pageId })),
                    onPick: setCrosspost,
                  } as any)}
                  style={[styles.select, { backgroundColor: C.field, borderColor: C.border, marginTop: 6 }]}
                >
                  <Text style={{ color: crosspost.length ? C.text : C.sub }}>
                    {crosspost.length ? `Crosspost: ${crosspost.length} page` : "Crosspost (tuỳ chọn)"}
                  </Text>
                </Pressable>
              </>
            )}
          </Row>

          <Row label="Tiêu đề (để trống = Tên giải - Tên sân)">
            <TextInput value={title} onChangeText={setTitle} placeholder="Tiêu đề live…" placeholderTextColor={C.sub} style={[styles.input, { backgroundColor: C.field, borderColor: C.border, color: C.text }]} />
          </Row>

          {opt.encoders?.length ? (
            <Row label="Encoder">
              <SelectBtn text={encoder === "auto" ? "Tự động (GPU)" : (opt.encoders.find((e: any) => e.value === encoder)?.label || encoder)} onPress={() => setPicker({ title: "Encoder", items: [{ label: "Tự động (GPU)", value: "auto" }, ...opt.encoders.map((e: any) => ({ label: e.label, value: e.value }))], onPick: setEncoder })} />
            </Row>
          ) : null}

          <Row label="Kiểu overlay bảng điểm">
            <SelectBtn
              text={{ classic: "Classic (mặc định)", A: "A · Broadcast Pro", B: "B · Aurora Glass", C: "C · Minimal Clean", D: "D · Neon Volt", url: "Scoreboard từ URL" }[overlayStyle] || "Classic (mặc định)"}
              onPress={() => setPicker({ title: "Kiểu overlay", items: [
                { label: "Classic (mặc định)", value: "classic" },
                { label: "A · Broadcast Pro", value: "A" },
                { label: "B · Aurora Glass", value: "B" },
                { label: "C · Minimal Clean", value: "C" },
                { label: "D · Neon Volt", value: "D" },
                { label: "Scoreboard từ URL (tuỳ chỉnh)", value: "url" },
              ], onPick: setOverlayStyle })}
            />
            {overlayStyle === "url" && (
              <TextInput
                value={browserOverlayUrl}
                onChangeText={setBrowserOverlayUrl}
                placeholder="https://… (trang overlay HTML của bạn)"
                placeholderTextColor={C.sub}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, { backgroundColor: C.field, borderColor: C.border, color: C.text, marginTop: 8 }]}
              />
            )}
          </Row>

          <Row label="Logo overlay (trống = logo PickleTour)">
            <TextInput
              value={brandLogoUrl}
              onChangeText={setBrandLogoUrl}
              placeholder="https://… hoặc bấm Tải ảnh lên"
              placeholderTextColor={C.sub}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, { backgroundColor: C.field, borderColor: C.border, color: C.text }]}
            />
            <Pressable onPress={pickLogo} disabled={logoUploading} style={[styles.select, { backgroundColor: C.field, borderColor: C.border, marginTop: 6, flexDirection: "row", alignItems: "center", gap: 8 }]}>
              {logoUploading ? <ActivityIndicator size="small" color={C.primary} /> : null}
              <Text style={{ color: C.text }}>{logoUploading ? "Đang tải…" : "📷 Tải ảnh lên"}</Text>
            </Pressable>
            {!!brandLogoUrl && (
              <Image source={{ uri: brandLogoUrl }} resizeMode="contain" style={{ height: 48, width: 120, marginTop: 8, alignSelf: "flex-start" }} />
            )}
          </Row>

          <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
            <Toggle label="Chữ chạy cuối màn hình (ticker)" value={showTicker} onValueChange={setShowTicker} />
            <Toggle label="Live riêng từng trận" value={perMatch} onValueChange={setPerMatch} />
            <Toggle label="Tách live theo giải (đổi giải → live mới)" value={split} onValueChange={setSplit} />
            <Toggle label="Ghi + cắt clip lên Drive" value={recordClips} onValueChange={setRecordClips} />
            <Toggle label="Ẩn ngày giờ camera (làm mờ)" value={hideTs} onValueChange={setHideTs} />
          </View>

          <Row label="Hẹn giờ (để trống = live ngay)">
            <SelectBtn text={schedAt ? schedAt.toLocaleString("vi-VN") : ""} onPress={openDateTime} />
            {!!schedAt && <Pressable onPress={() => setSchedAt(null)} style={{ marginTop: 6 }}><Text style={{ color: C.sub }}>Xoá hẹn giờ</Text></Pressable>}
          </Row>

          <Pressable onPress={doStart} disabled={busy} style={[styles.bigBtn, { backgroundColor: C.primary, opacity: busy ? 0.6 : 1 }]}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>● Bắt đầu live ngay</Text>
          </Pressable>
          {!!schedAt && (
            <Pressable onPress={doSchedule} disabled={busy} style={[styles.bigBtnOutline, { borderColor: C.primary, opacity: busy ? 0.6 : 1 }]}>
              <Text style={{ color: C.primary, fontWeight: "800", fontSize: 16 }}>⏰ Hẹn giờ live</Text>
            </Pressable>
          )}
          <Text style={{ color: C.sub, fontSize: 12, marginTop: 10 }}>
            Vị trí overlay dùng mặc định — chỉnh được ngay khi đang live ở màn Điều khiển Live.
          </Text>
        </ScrollView>
      )}

      {/* iOS datetime modal */}
      {Platform.OS === "ios" && iosPicker != null && (
        <Modal transparent animationType="slide" onRequestClose={() => setIosPicker(null)}>
          <Pressable style={styles.modalBg} onPress={() => setIosPicker(null)}>
            <Pressable style={[styles.sheet, { backgroundColor: C.card }]} onPress={(e) => e.stopPropagation()}>
              <DateTimePicker value={iosPicker} mode="datetime" display="spinner" onChange={(_e, d) => d && setIosPicker(d)} themeVariant={isDark ? "dark" : "light"} />
              <Pressable onPress={() => { setSchedAt(iosPicker); setIosPicker(null); }} style={[styles.bigBtn, { backgroundColor: C.primary }]}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>Chọn</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* Picker modal */}
      {picker && (
        <Modal transparent animationType="slide" onRequestClose={() => setPicker(null)}>
          <Pressable style={styles.modalBg} onPress={() => setPicker(null)}>
            <Pressable style={[styles.sheet, { backgroundColor: C.card, maxHeight: "70%" }]} onPress={(e) => e.stopPropagation()}>
              <Text style={{ color: C.text, fontWeight: "800", fontSize: 16, marginBottom: 10 }}>{(picker as any).title}</Text>
              <ScrollView>
                {(picker.items || []).length === 0 && <Text style={{ color: C.sub }}>(trống)</Text>}
                {(picker.items || []).map((it, i) => {
                  const multi = (picker as any).multi;
                  const sel = multi ? ((picker as any).selected || []).includes(it.value) : false;
                  return (
                    <Pressable
                      key={i}
                      onPress={() => {
                        if (multi) {
                          const cur = (picker as any).selected || [];
                          const next = cur.includes(it.value) ? cur.filter((x: any) => x !== it.value) : [...cur, it.value];
                          (picker as any).selected = next;
                          setPicker({ ...(picker as any) });
                          picker.onPick(next);
                        } else { picker.onPick(it.value); setPicker(null); }
                      }}
                      style={[styles.pickItem, { borderColor: C.border }]}
                    >
                      <Text style={{ color: C.text }}>{it.label}</Text>
                      {multi && sel ? <Text style={{ color: C.primary, fontWeight: "700" }}>✓</Text> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Pressable onPress={() => setPicker(null)} style={[styles.bigBtnOutline, { borderColor: C.border, marginTop: 8 }]}>
                <Text style={{ color: C.text, fontWeight: "700" }}>Đóng</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {busy && <View style={styles.busy}><ActivityIndicator color="#fff" size="large" /></View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  h1: { fontSize: 18, fontWeight: "800" },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  select: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12 },
  seg: { flexDirection: "row", gap: 8 },
  segItem: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 9, alignItems: "center" },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12 },
  toggleRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  bigBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  bigBtnOutline: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8, borderWidth: 1.5 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  pickItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1 },
  busy: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.25)", alignItems: "center", justifyContent: "center" },
});
