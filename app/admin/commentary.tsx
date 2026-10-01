// Bình luận trực tiếp NGAY TRONG app (native WebRTC): mic điện thoại → luồng live
// + xem video 360p của luồng. Dùng chung backend aiortc (token-gated) như bản web.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, Redirect, router, useLocalSearchParams } from "expo-router";
import { useSelector } from "react-redux";
import { useTheme } from "@react-navigation/native";
import { MaterialIcons } from "@expo/vector-icons";
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCView,
  mediaDevices,
} from "react-native-webrtc";
import {
  useCreateCommentaryTokenMutation,
  useCommentaryOfferMutation,
} from "@/slices/liveControlApiSlice";

const ICE = [{ urls: "stun:stun.l.google.com:19302" }];

function waitIce(pc: any): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const check = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener?.("icegatheringstatechange", check);
        resolve();
      }
    };
    pc.addEventListener?.("icegatheringstatechange", check);
    setTimeout(resolve, 3000); // phòng hờ: gửi SDP đang có sau 3s
  });
}

export default function NativeCommentaryScreen() {
  const theme = useTheme();
  const isDark = theme.dark;
  const userInfo = useSelector((s: any) => s.auth?.userInfo);
  const isAdmin = !!(userInfo?.isAdmin || userInfo?.role === "admin" || userInfo?.isSuperAdmin);
  const isCommentator = !!userInfo?.isCommentator;
  const canAccess = isAdmin || isCommentator;
  const { machineId, sid, court } = useLocalSearchParams<{
    machineId: string;
    sid: string;
    court: string;
  }>();

  const C = useMemo(
    () => ({
      bg: isDark ? theme.colors.background : "#0B0B0F",
      card: isDark ? "#111827" : "#111827",
      text: "#FFFFFF",
      sub: "#94A3B8",
      primary: "#0EA5E9",
      danger: "#EF4444",
      ok: "#22C55E",
    }),
    [isDark, theme],
  );

  const [createToken] = useCreateCommentaryTokenMutation();
  const [sendOffer] = useCommentaryOfferMutation();

  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [err, setErr] = useState("");
  const [talking, setTalking] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);

  const pcRef = useRef<any>(null);
  const streamRef = useRef<any>(null);
  const trackRef = useRef<any>(null);
  const remoteRef = useRef<any>(null);

  const cleanup = useCallback(() => {
    try { trackRef.current && (trackRef.current.enabled = false); } catch {}
    try { streamRef.current?.getTracks?.().forEach((t: any) => t.stop()); } catch {}
    try { remoteRef.current?.getTracks?.().forEach((t: any) => t.stop()); } catch {}
    try { pcRef.current?.close?.(); } catch {}
    pcRef.current = null;
    streamRef.current = null;
    trackRef.current = null;
    remoteRef.current = null;
    setRemoteUrl(null);
    setTalking(false);
  }, []);

  const connect = useCallback(async () => {
    setErr("");
    setStatus("connecting");
    try {
      // 1) Token cho phiên này (BLV/admin đều tạo được).
      const tk: any = await createToken({ machineId: String(machineId), sid: String(sid), courtName: String(court || "") }).unwrap();
      const token = tk?.token;
      if (!token) throw new Error("Không tạo được token bình luận");

      // 2) Mic native.
      const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      const track = stream.getAudioTracks()[0];
      trackRef.current = track;
      track.enabled = false; // bắt đầu TẮT mic

      // 3) WebRTC: gửi mic (sendonly) + nhận video (recvonly).
      const pc: any = new RTCPeerConnection({ iceServers: ICE });
      pcRef.current = pc;
      pc.addTrack(track, stream);
      pc.addTransceiver("video", { direction: "recvonly" });
      pc.addEventListener("track", (e: any) => {
        if (e.track?.kind === "video") {
          const ms = e.streams?.[0];
          if (ms) {
            remoteRef.current = ms;
            setRemoteUrl(ms.toURL());
          }
        }
      });
      pc.addEventListener("connectionstatechange", () => {
        const st = pc.connectionState;
        if (st === "connected") setStatus("connected");
        else if (st === "failed" || st === "disconnected" || st === "closed") {
          setStatus("error");
          setErr("Mất kết nối. Hãy thử kết nối lại.");
        }
      });

      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);
      await waitIce(pc);

      const ans: any = await sendOffer({
        token,
        sdp: pc.localDescription.sdp,
        type: pc.localDescription.type,
      }).unwrap();
      await pc.setRemoteDescription(new RTCSessionDescription(ans));
    } catch (e: any) {
      setStatus("error");
      setErr(e?.data?.message || e?.message || "Lỗi kết nối");
    }
  }, [machineId, sid, court, createToken, sendOffer]);

  useEffect(() => {
    if (canAccess) connect();
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTalk = () => {
    const t = trackRef.current;
    if (!t) return;
    const on = !talking;
    t.enabled = on;
    setTalking(on);
  };

  const disconnect = () => {
    cleanup();
    router.back();
  };

  if (!canAccess) return <Redirect href="/(tabs)/more" />;

  const connected = status === "connected";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={disconnect} hitSlop={10}>
          <Text style={{ color: C.primary, fontSize: 16 }}>‹ Thoát</Text>
        </Pressable>
        <Text style={{ color: C.text, fontWeight: "800", fontSize: 16 }}>🎙️ Bình luận trực tiếp</Text>
        <View style={{ width: 54 }} />
      </View>

      <Text style={{ color: C.sub, textAlign: "center", marginTop: 4 }}>
        {court ? `Sân ${court}` : ""}
      </Text>

      {/* Khung video live */}
      <View style={styles.videoBox}>
        {remoteUrl ? (
          <RTCView streamURL={remoteUrl} style={{ flex: 1 }} objectFit="contain" />
        ) : (
          <View style={styles.videoPlaceholder}>
            {status === "connecting" ? (
              <>
                <ActivityIndicator color={C.primary} />
                <Text style={{ color: C.sub, marginTop: 8 }}>Đang kết nối…</Text>
              </>
            ) : (
              <Text style={{ color: C.sub }}>Chưa có hình</Text>
            )}
          </View>
        )}
      </View>

      <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        {connected ? (
          <Chip ok={connected} C={C} />
        ) : null}

        {(connected || status === "connecting") && (
          <Pressable
            onPress={toggleTalk}
            disabled={!connected}
            style={[
              styles.talkBtn,
              {
                backgroundColor: talking ? C.danger : "transparent",
                borderColor: talking ? C.danger : C.primary,
                opacity: connected ? 1 : 0.5,
              },
            ]}
          >
            <MaterialIcons name={talking ? "mic" : "mic-off"} size={22} color={talking ? "#fff" : C.primary} />
            <Text style={{ color: talking ? "#fff" : C.primary, fontWeight: "800", fontSize: 16 }}>
              {talking ? "Đang nói — bấm để TẮT" : "Bắt đầu nói"}
            </Text>
          </Pressable>
        )}

        {status === "error" && (
          <>
            <Text style={{ color: C.danger, textAlign: "center", marginVertical: 10 }}>{err}</Text>
            <Pressable onPress={connect} style={[styles.talkBtn, { borderColor: C.primary }]}>
              <Text style={{ color: C.primary, fontWeight: "800" }}>Kết nối lại</Text>
            </Pressable>
          </>
        )}

        <Text style={{ color: C.sub, fontSize: 12, textAlign: "center", marginTop: 12 }}>
          Tiếng của bạn được trộn vào luồng live (tự hạ tiếng sân khi bạn nói).
        </Text>
      </View>
    </SafeAreaView>
  );
}

function Chip({ ok, C }: any) {
  return (
    <View style={{ alignItems: "center", marginBottom: 12 }}>
      <View style={{ backgroundColor: ok ? C.ok : C.sub, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 }}>
        <Text style={{ color: "#06240f", fontWeight: "800", fontSize: 12 }}>Đã kết nối</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  videoBox: { flex: 1, margin: 16, borderRadius: 16, overflow: "hidden", backgroundColor: "#000" },
  videoPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  talkBtn: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", borderWidth: 2, borderRadius: 14, paddingVertical: 16, marginTop: 8 },
});
