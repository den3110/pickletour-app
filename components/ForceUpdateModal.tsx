// src/components/ForceUpdateModal.jsx
import React, { useEffect, useCallback, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  BackHandler,
  Linking,
  ActivityIndicator,
  AppState,
} from "react-native";
import { useSelector, useDispatch } from "react-redux";
import { forceClose } from "@/slices/versionUiSlice";

export default function ForceUpdateModal() {
  const dispatch = useDispatch();
  const data1= useSelector(s=> s.version)
  const open = useSelector((s) => s.version?.open);
  const data = useSelector((s) => s.version?.data || {});
  const [isOpening, setIsOpening] = useState(false);

  const openStore = useCallback(async () => {
    if (!data?.storeUrl || isOpening) return;
    try {
      setIsOpening(true);
      await Linking.openURL(data.storeUrl);
      // Khi rời app sang Store, state vẫn true; khi quay lại active sẽ reset.
    } catch {
      setIsOpening(false); // mở thất bại -> cho bấm lại
    }
  }, [data?.storeUrl, isOpening]);

  // Chặn hardware back khi đang force
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, [open]);

  // Khi app quay về foreground -> cho phép bấm lại (nếu cần)
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") setIsOpening(false);
    });
    return () => sub.remove();
  }, []);

  return (
    <Modal
      visible={!!open}
      transparent
      animationType="fade"
      onRequestClose={() => {}}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Cập nhật ứng dụng</Text>
          {data?.message ? (
            <Text style={styles.desc}>{data.message}</Text>
          ) : null}
          {data?.changelog ? (
            <Text style={[styles.desc, { marginTop: 6 }]}>
              {data.changelog}
            </Text>
          ) : null}
          {data?.latestVersion ? (
            <Text style={styles.meta}>Bản mới nhất: {data.latestVersion}</Text>
          ) : null}

          <TouchableOpacity
            style={[styles.btn, isOpening && styles.btnDisabled]}
            onPress={openStore}
            activeOpacity={0.8}
            disabled={isOpening}
          >
            {isOpening ? (
              <View style={styles.btnRow}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.btnText}> Đang mở...</Text>
              </View>
            ) : (
              <Text style={styles.btnText}>Cập nhật ngay</Text>
            )}
          </TouchableOpacity>

          {/* Dev-only:
          <TouchableOpacity onPress={() => dispatch(forceClose())}><Text>Đóng (dev)</Text></TouchableOpacity>
          */}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "#00000088",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
  },
  title: { fontSize: 18, fontWeight: "800", color: "#111827", marginBottom: 8 },
  desc: { color: "#111827" },
  meta: { color: "#6b7280", fontSize: 12, marginTop: 6 },
  btn: {
    marginTop: 14,
    backgroundColor: "#2563eb",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.7 },
  btnRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "700" },
});
