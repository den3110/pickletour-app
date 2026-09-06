// app/owner/scan.tsx — Quét vé QR để check-in khách
import React, { useMemo, useRef, useState } from "react";
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useTheme } from "@react-navigation/native";
import { useCheckInBookingMutation } from "@/slices/bookingsApiSlice";
import { fmtVND, pal, dtLabel, tLabel } from "@/utils/courtFormat";

export default function OwnerScanScreen() {
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const [perm, requestPermission] = useCameraPermissions();
  const [checkIn] = useCheckInBookingMutation();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null); // { ok, already, booking } | { error }
  const lockRef = useRef(false);

  const onScanned = async ({ data }: { data: string }) => {
    if (lockRef.current || busy) return;
    const token = String(data || "").trim();
    if (!token) return;
    lockRef.current = true;
    setBusy(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      const res: any = await checkIn({ token }).unwrap();
      setResult(res);
    } catch (e: any) {
      setResult({ error: e?.data?.message || "Vé không hợp lệ", booking: e?.data?.booking });
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setResult(null);
    lockRef.current = false;
  };

  if (!perm) {
    return <View style={{ flex: 1, backgroundColor: "#000" }}><Stack.Screen options={{ title: "Quét vé" }} /></View>;
  }
  if (!perm.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Stack.Screen options={{ title: "Quét vé" }} />
        <View style={styles.center}>
          <Ionicons name="camera-outline" size={54} color={C.sub} />
          <Text style={{ color: C.text, fontWeight: "700", marginTop: 12, textAlign: "center" }}>
            Cần quyền camera để quét vé QR
          </Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: C.accent, marginTop: 16 }]} onPress={() => requestPermission()}>
            <Text style={{ color: "#0a0e1a", fontWeight: "800" }}>Cho phép camera</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <Stack.Screen options={{ title: "Quét vé QR", headerTransparent: true, headerTintColor: "#fff" }} />
      {!result && (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          onBarcodeScanned={onScanned}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        />
      )}
      {!result && (
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.frame} />
          <Text style={styles.hint}>Đưa mã QR trên vé của khách vào khung</Text>
        </View>
      )}
      {busy && (
        <View style={styles.overlay}><ActivityIndicator color="#fff" size="large" /></View>
      )}

      {result && (
        <View style={[styles.resultWrap, { backgroundColor: C.bg }]}>
          {result.error ? (
            <>
              <Ionicons name="close-circle" size={64} color="#ef4444" />
              <Text style={{ color: "#ef4444", fontSize: 18, fontWeight: "800", marginTop: 10 }}>{result.error}</Text>
              {result.booking && <BookingInfo b={result.booking} C={C} />}
            </>
          ) : (
            <>
              <Ionicons name={result.already ? "information-circle" : "checkmark-circle"} size={64} color={result.already ? "#f59e0b" : "#22c55e"} />
              <Text style={{ color: result.already ? "#f59e0b" : "#22c55e", fontSize: 20, fontWeight: "800", marginTop: 10 }}>
                {result.already ? "Vé đã check-in trước đó" : "Check-in thành công"}
              </Text>
              <BookingInfo b={result.booking} C={C} />
            </>
          )}
          <TouchableOpacity style={[styles.btn, { backgroundColor: C.accent, marginTop: 24 }]} onPress={reset}>
            <Text style={{ color: "#0a0e1a", fontWeight: "800" }}>Quét vé tiếp theo</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function BookingInfo({ b, C }: any) {
  if (!b) return null;
  return (
    <View style={[styles.info, { backgroundColor: C.card, borderColor: C.border }]}>
      <Text style={{ color: C.text, fontWeight: "800", fontSize: 16 }}>{b.customerName || "Khách"} · #{b.code}</Text>
      <Text style={{ color: C.sub, marginTop: 4 }}>{b.venueName} · {b.courtName}</Text>
      <Text style={{ color: C.text, marginTop: 4 }}>{tLabel(b.startAt)} → {tLabel(b.endAt)} · {fmtVND(b.totalPrice)}</Text>
      {b.customerPhone ? <Text style={{ color: C.sub, marginTop: 2 }}>{b.customerPhone}</Text> : null}
      {b.checkedInAt ? <Text style={{ color: C.sub, fontSize: 12, marginTop: 4 }}>Check-in: {dtLabel(b.checkedInAt)}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  btn: { paddingHorizontal: 24, paddingVertical: 13, borderRadius: 12 },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  frame: { width: 240, height: 240, borderRadius: 24, borderWidth: 3, borderColor: "rgba(255,255,255,0.9)" },
  hint: { color: "#fff", marginTop: 20, fontSize: 15, fontWeight: "600", textShadowColor: "#000", textShadowRadius: 4 },
  resultWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  info: { marginTop: 18, padding: 16, borderRadius: 14, borderWidth: 1, width: "100%" },
});
