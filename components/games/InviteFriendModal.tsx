// Shared invite modal cho Poker/Phỏm/Sâm.
import {
  Ionicons } from "@expo/vector-icons";
import React,
  { useEffect,
  useMemo,
  useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { TextInput } from "@/components/ui/i18nTextInput";
import { Text } from "@/components/ui/i18nText";

import { useLazySearchUserQuery } from "@/slices/usersApiSlice";

export function InviteFriendModal({
  visible,
  onClose,
  onInvite,
  loading,
  color = "#7C3AED",
}: {
  visible: boolean;
  onClose: () => void;
  onInvite: (userIds: string[]) => Promise<void>;
  loading?: boolean;
  color?: string;
}) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<any[]>([]);
  const [triggerSearch, { data, isFetching }] = useLazySearchUserQuery();

  useEffect(() => {
    if (!visible) {
      setQ("");
      setSelected([]);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => {
      if (q.trim().length >= 1) triggerSearch(q.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [q, visible, triggerSearch]);

  const results = useMemo(() => {
    const raw: any = data;
    const arr: any[] = Array.isArray(raw)
      ? raw
      : raw?.items || raw?.data || raw?.users || [];
    const selIds = new Set(selected.map((u) => String(u._id)));
    return arr.filter((u) => !selIds.has(String(u._id))).slice(0, 20);
  }, [data, selected]);

  const toggle = (u: any) => {
    setSelected((prev) => {
      if (prev.some((x) => String(x._id) === String(u._id))) {
        return prev.filter((x) => String(x._id) !== String(u._id));
      }
      if (prev.length >= 10) {
        Alert.alert("Tối đa 10 người");
        return prev;
      }
      return [...prev, u];
    });
  };

  const doInvite = async () => {
    if (selected.length === 0) return;
    try {
      await onInvite(selected.map((u) => String(u._id)));
      Alert.alert("Đã mời", `Đã gửi lời mời cho ${selected.length} người.`);
      onClose();
    } catch (err: any) {
      Alert.alert("Lỗi", err?.data?.message || "Không mời được");
    }
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={["portrait", "landscape", "landscape-left", "landscape-right"]}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Mời bạn vào bàn</Text>
          <TextInput
            placeholder="Tìm theo tên/nickname/SĐT…"
            value={q}
            onChangeText={setQ}
            style={styles.input}
            autoFocus
          />
          {selected.length > 0 && (
            <View style={styles.selectedRow}>
              {selected.map((u) => (
                <Pressable
                  key={u._id}
                  onPress={() => toggle(u)}
                  style={[styles.chip, { backgroundColor: color + "22" }]}
                >
                  <Text style={{ color, fontWeight: "700", fontSize: 12 }}>
                    {u.nickname || u.name} ✕
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          <FlatList
            data={results}
            keyExtractor={(u: any) => String(u._id)}
            style={{ maxHeight: 260 }}
            ListEmptyComponent={
              <Text style={{ color: "#94A3B8", padding: 16, textAlign: "center" }}>
                {isFetching
                  ? "Đang tìm…"
                  : q.trim()
                  ? "Không tìm thấy ai"
                  : "Nhập tên bạn muốn mời"}
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable style={styles.row} onPress={() => toggle(item)}>
                {item.avatar ? (
                  <Image source={{ uri: item.avatar }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: "#CBD5E1" }]}>
                    <Text
                      style={{
                        fontWeight: "800",
                        color: "#0F172A",
                        textAlign: "center",
                        lineHeight: 32,
                      }}
                    >
                      {(item.nickname || item.name || "?")[0]?.toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>
                    {item.nickname || item.name}
                  </Text>
                  {item.name && item.nickname && (
                    <Text style={styles.rowSub}>{item.name}</Text>
                  )}
                </View>
                <Ionicons name="add-circle" size={22} color={color} />
              </Pressable>
            )}
          />
          <View style={styles.actions}>
            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <Text style={{ color: "#0F172A", fontWeight: "700" }}>Huỷ</Text>
            </Pressable>
            <Pressable
              style={[
                styles.sendBtn,
                { backgroundColor: color },
                (loading || selected.length === 0) && { opacity: 0.5 },
              ]}
              onPress={doInvite}
              disabled={loading || selected.length === 0}
            >
              <Text style={{ color: "#fff", fontWeight: "800" }}>
                {loading ? "Đang gửi…" : `Mời (${selected.length})`}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  sheet: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    width: "88%",
    maxWidth: 480,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 10,
  },
  input: {
    backgroundColor: "#F1F5F9",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 8,
  },
  selectedRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  rowName: { fontSize: 14, fontWeight: "700", color: "#0F172A" },
  rowSub: { fontSize: 11, color: "#64748B" },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  cancelBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
  },
  sendBtn: {
    flex: 2,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
});
