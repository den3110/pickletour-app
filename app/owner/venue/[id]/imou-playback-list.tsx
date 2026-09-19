// Owner: xem lại video Imou — chọn cam + ngày, list recording thường & event.
import React, { useEffect, useMemo, useState } from "react";
import {
  View, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Image, RefreshControl,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { pal } from "@/utils/courtFormat";
import { useGetVenueQuery } from "@/slices/venuesApiSlice";
import { venueCams, type CourtCam } from "@/utils/imouCams";
import { BASE_URL } from "@/slices/apiSlice";

interface Recording { begin: string; end: string; durationS: number; typeName: string }
interface EventRec { recordId: string; begin: string; end: string; durationS: number; title: string; eventCode: string; thumbnail: string }

function loadImouNative(): any | null {
  try { return require("imou-rn-native").default || require("imou-rn-native"); } catch { return null; }
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dateShortLabel(iso: string): string { const [, mm, dd] = iso.split("-"); return `${dd}/${mm}`; }
function fmtTime(b: string): string { const t = b.slice(9); return `${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}`; }
function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60); const s = sec % 60;
  return s ? `${m}p${s}s` : `${m}p`;
}
function shiftYmdt(ymdt: string, deltaSec: number): string {
  const y = +ymdt.slice(0, 4), mo = +ymdt.slice(4, 6) - 1, d = +ymdt.slice(6, 8);
  const h = +ymdt.slice(9, 11), mi = +ymdt.slice(11, 13), s = +ymdt.slice(13, 15);
  const dt = new Date(y, mo, d, h, mi, s + deltaSec);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}${pad(dt.getSeconds())}`;
}

const TYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  motion: { label: "Chuyển động", color: "#B45309", bg: "#FEF3C7" },
  manual: { label: "Ghi tay", color: "#1D4ED8", bg: "#DBEAFE" },
  schedule: { label: "Lịch trình", color: "#059669", bg: "#D1FAE5" },
  alarm: { label: "Cảnh báo", color: "#B91C1C", bg: "#FEE2E2" },
  unknown: { label: "Khác", color: "#475569", bg: "#F1F5F9" },
};

export default function ImouPlaybackListScreen() {
  const { id, deviceId: initialDevice, date: initialDate } = useLocalSearchParams<{ id: string; deviceId?: string; date?: string }>();
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const ImouNative = useMemo(loadImouNative, []);

  const { data: venue } = useGetVenueQuery(id, { skip: !id });
  const cams: CourtCam[] = useMemo(() => venueCams(venue), [venue]);

  const [activeDeviceId, setActiveDeviceId] = useState<string | null>((initialDevice as string) || null);
  const [date, setDate] = useState<string>((initialDate as string) || todayISO());
  const [tab, setTab] = useState<"all" | "event">("all");
  const [recordings, setRecordings] = useState<Recording[] | null>(null);
  const [events, setEvents] = useState<EventRec[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!activeDeviceId && cams.length) setActiveDeviceId(cams[0].deviceId);
  }, [cams, activeDeviceId]);

  const activeCam = cams.find((c) => c.deviceId === activeDeviceId);

  const load = async () => {
    if (!ImouNative || !activeDeviceId) return;
    setLoading(true); setErr(null); setRecordings(null); setEvents(null);
    try {
      const [rs, es] = await Promise.all([
        ImouNative.listRecordings(activeDeviceId, date).catch(() => []),
        ImouNative.listEventRecordings(activeDeviceId, date).catch(() => []),
      ]);
      setRecordings(rs || []); setEvents(es || []);
    } catch (e: any) { setErr(e?.message || "Không tải được danh sách"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [activeDeviceId, date]);

  const dates = useMemo(() => {
    const arr: string[] = [];
    const now = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(now); d.setDate(now.getDate() - i);
      arr.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }
    return arr;
  }, []);

  const normalizeEnd = (b: string, e: string): string => (!e || e <= b) ? shiftYmdt(b, 30) : e;

  const openPlayback = (begin: string, end: string, title: string | undefined) => {
    if (!activeDeviceId) return;
    router.push({
      pathname: "/owner/venue/[id]/imou-playback-view" as any,
      params: { id, deviceId: activeDeviceId, begin, end: normalizeEnd(begin, end), title: title || "" },
    });
  };

  if (!cams.length) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Stack.Screen options={{ title: "Xem lại camera" }} />
        <View style={styles.empty}>
          <Ionicons name="videocam-off" size={40} color={C.sub} />
          <Text style={{ color: C.text, fontWeight: "800", fontSize: 16 }}>Chưa có cam gắn vào sân</Text>
          <Text style={{ color: C.sub, textAlign: "center", fontSize: 13 }}>Vào "Camera Imou" để liên kết + gắn cam trước.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: "Xem lại camera" }} />

      <View style={styles.pickerBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 6, alignItems: "center" }}>
          {cams.map((c) => {
            const on = c.deviceId === activeDeviceId;
            return (
              <TouchableOpacity
                key={c.key}
                onPress={() => setActiveDeviceId(c.deviceId)}
                style={[styles.camChip, {
                  backgroundColor: on ? C.accent : C.accentSoft,
                  borderColor: C.accent,
                }]}
              >
                <Ionicons name="videocam" size={14} color={on ? C.onAccent : C.accent} />
                <Text style={{ color: on ? C.onAccent : C.accent, fontSize: 11, fontWeight: "800", maxWidth: 140 }} numberOfLines={1}>
                  {c.courtName} · {c.camName}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.pickerBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 6, alignItems: "center" }}>
          {dates.map((d) => {
            const on = d === date;
            return (
              <TouchableOpacity
                key={d}
                onPress={() => setDate(d)}
                style={[styles.dateChip, {
                  backgroundColor: on ? C.text : C.card,
                  borderColor: on ? C.text : C.border,
                }]}
              >
                <Text style={{ color: on ? C.bg : C.sub, fontSize: 11, fontWeight: "800" }}>
                  {d === todayISO() ? "Hôm nay" : dateShortLabel(d)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={{ flexDirection: "row", paddingHorizontal: 14, gap: 8, paddingBottom: 8, alignItems: "center" }}>
        <TabBtn C={C} label="Tất cả" count={recordings?.length ?? 0} active={tab === "all"} onPress={() => setTab("all")} />
        <TabBtn C={C} label="Sự kiện" count={events?.length ?? 0} active={tab === "event"} onPress={() => setTab("event")} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 48, gap: 10 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={C.accent} />}
      >
        {err && (
          <View style={[styles.errBox, { backgroundColor: "rgba(245,158,11,0.12)" }]}>
            <Ionicons name="warning" size={14} color={C.warning} />
            <Text style={{ color: C.warning, fontSize: 12, flex: 1 }}>{err}</Text>
          </View>
        )}

        {loading && !recordings && !events && (
          <View style={{ alignItems: "center", padding: 24 }}>
            <ActivityIndicator color={C.accent} />
            <Text style={{ color: C.sub, marginTop: 8, fontSize: 13 }}>Đang tải bản ghi…</Text>
          </View>
        )}

        {tab === "all" && recordings && (
          recordings.length === 0 ? <EmptyDay C={C} /> : (
            <View style={{ gap: 6 }}>
              {recordings.map((r, i) => {
                const meta = TYPE_META[r.typeName] || TYPE_META.unknown;
                return (
                  <TouchableOpacity
                    key={`${r.begin}-${i}`}
                    activeOpacity={0.7}
                    onPress={() => openPlayback(r.begin, r.end, `${fmtTime(r.begin)} · ${fmtDuration(r.durationS)}`)}
                    style={[styles.recRow, { backgroundColor: C.card, borderColor: C.border }]}
                  >
                    <View style={{ alignItems: "center", minWidth: 60 }}>
                      <Text style={{ color: C.text, fontWeight: "800", fontSize: 15 }}>{fmtTime(r.begin)}</Text>
                      <Text style={{ color: C.sub, fontSize: 10, marginTop: 2 }}>{fmtDuration(r.durationS)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.text, fontSize: 13, fontWeight: "600" }}>{fmtTime(r.begin)} — {fmtTime(r.end)}</Text>
                      <View style={{ alignSelf: "flex-start", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 4, backgroundColor: meta.bg }}>
                        <Text style={{ fontSize: 10, fontWeight: "800", color: meta.color }}>{meta.label}</Text>
                      </View>
                    </View>
                    <Ionicons name="play-circle" size={28} color={C.accent} />
                  </TouchableOpacity>
                );
              })}
            </View>
          )
        )}

        {tab === "event" && events && (
          events.length === 0 ? <EmptyDay C={C} /> : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {events.map((ev) => (
                <TouchableOpacity
                  key={ev.recordId}
                  activeOpacity={0.85}
                  onPress={() => openPlayback(ev.begin, ev.end, ev.title)}
                  style={[styles.eventCard, { backgroundColor: C.card, borderColor: C.border }]}
                >
                  <View style={styles.eventThumbWrap}>
                    <EventThumb url={ev.thumbnail} />
                    <View style={styles.eventPlay}>
                      <Ionicons name="play" size={18} color="#fff" />
                    </View>
                  </View>
                  <View style={{ padding: 8 }}>
                    <Text style={{ color: C.text, fontWeight: "800", fontSize: 13 }} numberOfLines={1}>{ev.title}</Text>
                    <Text style={{ color: C.sub, fontSize: 11, marginTop: 2 }}>{fmtTime(ev.begin)} · {fmtDuration(ev.durationS)}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )
        )}

        {activeCam && (
          <View style={[styles.hint, { backgroundColor: "rgba(56,189,248,0.10)" }]}>
            <Ionicons name="information-circle" size={14} color={C.info} />
            <Text style={{ color: C.info, fontSize: 12, flex: 1, lineHeight: 16 }}>
              Đang xem: {activeCam.camName}. Không có bản ghi? Kiểm tra thẻ SD của cam qua app Imou Life gốc.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function EventThumb({ url }: { url?: string }) {
  const [errored, setErrored] = useState(false);
  if (!url || errored) {
    return (
      <View style={[styles.eventThumb, styles.eventThumbFallback]}>
        <Ionicons name="videocam" size={22} color="rgba(255,255,255,0.4)" />
      </View>
    );
  }
  const proxied = `${BASE_URL}/api/imou/thumb?u=${encodeURIComponent(url)}`;
  return <Image source={{ uri: proxied }} style={styles.eventThumb} resizeMode="cover" onError={() => setErrored(true)} />;
}

function TabBtn({ C, label, count, active, onPress }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
        paddingVertical: 10, borderRadius: 10,
        backgroundColor: active ? C.accent : C.card,
        borderWidth: 1, borderColor: active ? C.accent : C.border,
      }}
    >
      <Text style={{ color: active ? C.onAccent : C.sub, fontWeight: "800", fontSize: 13 }}>{label}</Text>
      <View style={{ backgroundColor: active ? "rgba(255,255,255,0.2)" : C.field, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999 }}>
        <Text style={{ fontSize: 10, fontWeight: "800", color: active ? "#fff" : C.sub }}>{count}</Text>
      </View>
    </TouchableOpacity>
  );
}
function EmptyDay({ C }: any) {
  return (
    <View style={{ alignItems: "center", padding: 24, gap: 6, backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.border }}>
      <Ionicons name="calendar-clear-outline" size={32} color={C.sub} />
      <Text style={{ color: C.sub, fontSize: 13, textAlign: "center" }}>Không có bản ghi nào cho ngày này.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  pickerBar: { height: 48, justifyContent: "center" },
  camChip: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, maxWidth: 180 },
  dateChip: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  errBox: { flexDirection: "row", gap: 6, alignItems: "center", padding: 10, borderRadius: 10 },
  recRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 10, borderWidth: 1 },
  eventCard: { width: "48.5%", borderRadius: 10, borderWidth: 1, overflow: "hidden" },
  eventThumbWrap: { aspectRatio: 16 / 9, backgroundColor: "#000", position: "relative" },
  eventThumb: { width: "100%", height: "100%" },
  eventThumbFallback: { alignItems: "center", justifyContent: "center", backgroundColor: "#1F2937" },
  eventPlay: { position: "absolute", top: "50%", left: "50%", transform: [{ translateX: -14 }, { translateY: -14 }], width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)" },
  hint: { flexDirection: "row", gap: 6, alignItems: "flex-start", padding: 10, borderRadius: 10 },
});
