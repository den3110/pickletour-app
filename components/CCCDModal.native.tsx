// app/components/CCCDModal.native.jsx
import React, { useMemo } from "react";
import {
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  ScrollView,
} from "react-native";
import Ripple from "react-native-material-ripple";
import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { normalizeUrl } from "@/utils/normalizeUri";
// import { normalizeUrl } from "@/utils/normalizeUrl";

const textOf = (v) => {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    return String(v);
  if (typeof v === "object")
    return v.fullName || v.name || v.nickname || v.nick || "";
  return "";
};

const getCccd = (u) => u?.cccd || u?.user?.cccd || "";
const getCccdImages = (u) => {
  const img = u?.cccdImages || u?.user?.cccdImages || {};
  return {
    front: normalizeUrl(img?.front || ""),
    back: normalizeUrl(img?.back || ""),
  };
};

export default function CCCDModal({ visible, onClose, user }) {
  const name = textOf(user) || "Vận động viên";
  const cccd = getCccd(user);
  const imgs = useMemo(() => getCccdImages(user), [user]);
  const hasFront = !!imgs.front;
  const hasBack = !!imgs.back;

  return (
    <Modal
      visible={!!visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      supportedOrientations={[
        "portrait",
        "landscape-left",
        "landscape-right",
        "landscape",
      ]}
    >
      <SafeAreaView style={s.wrap}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>CCCD</Text>
          <Ripple
            onPress={onClose}
            style={s.iconBtn}
            rippleContainerBorderRadius={8}
          >
            <MaterialIcons name="close" size={22} color="#111827" />
          </Ripple>
        </View>

        <ScrollView contentContainerStyle={s.body}>
          <Text style={s.name}>{name}</Text>

          <View style={[s.row, { marginTop: 8 }]}>
            <MaterialIcons name="badge" size={18} color="#111827" />
            <Text style={s.cccdText}>
              {cccd ? `Số CCCD: ${cccd}` : "Không có số CCCD"}
            </Text>
          </View>

          {hasFront || hasBack ? (
            <View style={s.imgGrid}>
              {hasFront ? (
                <View style={s.imgCard}>
                  <Text style={s.label}>Mặt trước</Text>
                  <Image
                    source={{ uri: imgs.front }}
                    style={s.img}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                    transition={0}
                  />
                </View>
              ) : null}

              {hasBack ? (
                <View style={s.imgCard}>
                  <Text style={s.label}>Mặt sau</Text>
                  <Image
                    source={{ uri: imgs.back }}
                    style={s.img}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                    transition={0}
                  />
                </View>
              ) : null}
            </View>
          ) : (
            <View style={s.empty}>
              <MaterialIcons
                name="image-not-supported"
                size={22}
                color="#6b7280"
              />
              <Text style={s.emptyText}>Không có ảnh CCCD</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#fff" },
  header: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderColor: "#e5e7eb",
  },
  title: { fontSize: 18, fontWeight: "800", color: "#0f172a" },
  iconBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "#f8fafc",
  },
  body: { padding: 14 },
  name: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  cccdText: { marginLeft: 4, fontWeight: "700", color: "#0f172a" },

  imgGrid: { marginTop: 12, gap: 12 },
  imgCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  label: { fontWeight: "700", color: "#111827", marginBottom: 6 },
  img: {
    width: "100%",
    height: 260,
    borderRadius: 8,
    backgroundColor: "#f8fafc",
  },

  empty: {
    marginTop: 16,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  emptyText: { color: "#6b7280", fontWeight: "700" },
});
