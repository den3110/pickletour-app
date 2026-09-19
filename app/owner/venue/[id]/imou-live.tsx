// Owner: list cam Imou đã gắn của venue → tap để xem live full-screen.
import React, { useEffect, useMemo, useState } from "react";
import {
  View, ScrollView, TouchableOpacity, StyleSheet, RefreshControl,
  ActivityIndicator, Image,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { pal } from "@/utils/courtFormat";
import { useGetVenueQuery } from "@/slices/venuesApiSlice";
import { venueCams, type CourtCam } from "@/utils/imouCams";

interface ImouDevice { deviceId: string; name: string; productId?: string; online?: boolean }
type CamCourt = CourtCam & { online?: boolean };

function loadImouNative(): any | null {
  try { return require("imou-rn-native").default || require("imou-rn-native"); } catch { return null; }
}

export default function ImouLiveScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const { data: venue, refetch, isFetching } = useGetVenueQuery(id, { skip: !id });
  const ImouNative = loadImouNative();

  const [devices, setDevices] = useState<Record<string, ImouDevice>>({});
  const [loadingDevs, setLoadingDevs] = useState(false);
  const [errDevs, setErrDevs] = useState<string | null>(null);
  const [snaps, setSnaps] = useState<Record<string, string>>({});
  const [snapping, setSnapping] = useState(false);

  const cams: CamCourt[] = useMemo(() => {
    return venueCams(venue).map((cam) => {
      const dev = devices[cam.deviceId];
      return { ...cam, online: dev?.online, productId: cam.productId || dev?.productId };
    });
  }, [venue, devices]);

  const loadStatus = async () => {
    if (!ImouNative) return;
    setLoadingDevs(true); setErrDevs(null);
    try {
      const list: ImouDevice[] = await ImouNative.listDevices();
      const m: Record<string, ImouDevice> = {};
      (list || []).forEach((d) => { m[d.deviceId] = d; });
      setDevices(m);
    } catch (e: any) { setErrDevs(e?.message || "Không lấy được trạng thái cam"); }
    finally { setLoadingDevs(false); }
  };

  useEffect(() => { if (venue?.imouAccount?.phone) loadStatus(); }, [venue?.imouAccount?.phone]);

  useEffect(() => {
    if (!ImouNative || !cams.length || snapping) return;
    let cancelled = false;
    (async () => {
      setSnapping(true);
      for (const cam of cams) {
        if (snaps[cam.deviceId]) continue;
        try {
          const res: any = await ImouNative.snapshot(cam.deviceId, {});
          if (!cancelled && res?.uri) setSnaps((p) => ({ ...p, [cam.deviceId]: res.uri }));
        } catch { /* offline */ }
      }
      if (!cancelled) setSnapping(false);
    })();
    return () => { cancelled = true; };
  }, [cams.length]);

  const goLive = (cam: CamCourt) => {
    if (!ImouNative) return;
    router.push({
      pathname: "/owner/venue/[id]/imou-live-view" as any,
      params: { id, deviceId: cam.deviceId, courtId: cam.courtId, snap: snaps[cam.deviceId] || "" },
    });
  };

  const hasAccount = !!venue?.imouAccount?.phone;
  const anyCam = cams.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: "Camera trực tiếp" }} />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={loadingDevs || isFetching} onRefresh={() => { refetch(); loadStatus(); }} tintColor={C.accent} />}
      >
        <View style={[styles.summary, { backgroundColor: C.card, borderColor: C.border }]}>
          <Ionicons name="videocam" size={22} color={C.accent} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.summaryLabel, { color: C.sub }]}>Tài khoản Imou</Text>
            <Text style={[styles.summaryValue, { color: C.text }]} numberOfLines={1}>
              {venue?.imouAccount?.phone || "Chưa liên kết"}
            </Text>
          </View>
          <View style={[styles.countPill, { backgroundColor: C.accentSoft }]}>
            <Text style={{ color: C.accent, fontWeight: "800" }}>{cams.length} cam</Text>
          </View>
        </View>

        {!hasAccount ? (
          <EmptyBig
            C={C}
            icon="link"
            title="Chưa liên kết Imou"
            desc="Đăng nhập tài khoản Imou để gắn cam cho sân."
            btnLabel="Đăng nhập Imou"
            onPress={() => router.push({ pathname: "/owner/venue/[id]/imou-login" as any, params: { id } })}
          />
        ) : !anyCam ? (
          <EmptyBig
            C={C}
            icon="videocam-off"
            title="Chưa gắn cam nào"
            desc="Gắn từng cam Imou vào sân con để xem trực tiếp ở đây."
            btnLabel="Gắn cam vào sân"
            onPress={() => router.push({ pathname: "/owner/venue/[id]/imou-attach" as any, params: { id } })}
          />
        ) : (
          <>
            {errDevs ? (
              <View style={[styles.warn, { backgroundColor: "rgba(245,158,11,0.12)" }]}>
                <Ionicons name="warning" size={14} color={C.warning} />
                <Text style={{ color: C.warning, fontSize: 12, flex: 1 }}>{errDevs}</Text>
              </View>
            ) : null}

            <View style={styles.grid}>
              {cams.map((cam) => (
                <TouchableOpacity
                  key={cam.key}
                  activeOpacity={0.8}
                  onPress={() => goLive(cam)}
                  style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}
                >
                  <View style={styles.thumbWrap}>
                    {snaps[cam.deviceId] ? (
                      <Image source={{ uri: snaps[cam.deviceId] }} style={styles.thumb} resizeMode="cover" />
                    ) : (
                      <View style={[styles.thumb, styles.thumbPlaceholder]}>
                        <Ionicons name="videocam" size={28} color="rgba(255,255,255,0.5)" />
                      </View>
                    )}
                    <View style={styles.playPill}>
                      <Ionicons name="play" size={14} color="#fff" />
                      <Text style={styles.playText}>LIVE</Text>
                    </View>
                    <View style={[styles.statusDot, { backgroundColor: cam.online === false ? C.danger : C.success }]} />
                  </View>
                  <View style={{ padding: 10, gap: 2 }}>
                    <Text style={{ color: C.text, fontWeight: "800", fontSize: 13 }} numberOfLines={1}>{cam.courtName}</Text>
                    <Text style={{ color: C.sub, fontSize: 11 }} numberOfLines={1}>📷 {cam.camName}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <View style={[styles.hint, { backgroundColor: "rgba(56,189,248,0.10)" }]}>
              <Ionicons name="information-circle" size={14} color={C.info} />
              <Text style={{ color: C.info, fontSize: 12, flex: 1, lineHeight: 16 }}>
                Bấm 1 thẻ để xem live full-screen. Vuốt xuống để tải lại trạng thái + thumbnail.
              </Text>
            </View>
          </>
        )}

        {loadingDevs && !anyCam && (
          <ActivityIndicator color={C.accent} />
        )}
      </ScrollView>
    </View>
  );
}

function EmptyBig({ C, icon, title, desc, btnLabel, onPress }: any) {
  return (
    <View style={[styles.emptyBig, { backgroundColor: C.card, borderColor: C.border }]}>
      <Ionicons name={icon} size={40} color={C.sub} />
      <Text style={{ color: C.text, fontWeight: "800", fontSize: 16 }}>{title}</Text>
      <Text style={{ color: C.sub, textAlign: "center", fontSize: 13, marginBottom: 8 }}>{desc}</Text>
      <TouchableOpacity onPress={onPress} style={[styles.btn, { backgroundColor: C.accent }]}>
        <Text style={{ color: C.onAccent, fontWeight: "800" }}>{btnLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  summaryLabel: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  summaryValue: { fontSize: 15, fontWeight: "800", marginTop: 2 },
  countPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  emptyBig: { alignItems: "center", gap: 8, padding: 24, borderRadius: 16, borderWidth: 1 },
  btn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, marginTop: 4 },
  warn: { flexDirection: "row", gap: 6, alignItems: "center", padding: 10, borderRadius: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: { width: "48%", borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  thumbWrap: { position: "relative", aspectRatio: 16 / 9, backgroundColor: "#000" },
  thumb: { width: "100%", height: "100%" },
  thumbPlaceholder: { alignItems: "center", justifyContent: "center", backgroundColor: "#1F2937" },
  playPill: {
    position: "absolute", top: 8, left: 8, flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(220,38,38,0.9)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
  },
  playText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  statusDot: { position: "absolute", top: 8, right: 8, width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: "#fff" },
  hint: { flexDirection: "row", gap: 6, alignItems: "flex-start", padding: 10, borderRadius: 10 },
});
