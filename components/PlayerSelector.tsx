// components/PlayerSelector.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from "react-native";
import { useLazySearchUserQuery } from "@/slices/usersApiSlice";
import { normalizeUri } from "@/utils/normalizeUri";

type Props = {
  label: string;
  eventType?: "single" | "double";
  onChange?: (user: any | null) => void;
  style?: ViewStyle;
  placeholder?: string;
  /** Nếu BE nhận object { q, eventType } thì bật cái này */
  queryAsObject?: boolean;
};

function maskPhone(p?: string | number) {
  if (!p) return "";
  const s = String(p).replace(/\D/g, "");
  if (s.length <= 6) return s;
  return `${s.slice(0, 3)}****${s.slice(-3)}`;
}

const AVA_PLACE = "https://dummyimage.com/100x100/cccccc/ffffff&text=?";

export default function PlayerSelector({
  label,
  eventType = "double",
  onChange,
  style,
  placeholder,
  queryAsObject = false,
}: Props) {
  const [input, setInput] = useState("");
  const [value, setValue] = useState<any | null>(null);
  const [open, setOpen] = useState(false);

  const [trigger, { data = [], isFetching }] = useLazySearchUserQuery();

  // Debounce search
  useEffect(() => {
    const q = input.trim();
    if (!q) return;
    const id = setTimeout(() => {
      if (queryAsObject) trigger({ q, eventType });
      else trigger(q);
      setOpen(true);
    }, 350);
    return () => clearTimeout(id);
  }, [input, trigger, queryAsObject, eventType]);

  // báo lên parent
  useEffect(() => {
    onChange?.(value || null);
  }, [value, onChange]);

  const options = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const scoreKey = eventType === "double" ? "double" : "single";
  const scoreOf = (u: any) => u?.score?.[scoreKey] ?? 0;

  // Helpers hiển thị
  const getName = (o: any) =>
    o?.name || o?.fullName || o?.nickname || o?.phone || "";

  const selectUser = (u: any) => {
    setValue(u);
    setInput(getName(u));
    setOpen(false);
  };

  const clearAll = () => {
    setValue(null);
    setInput("");
    setOpen(false);
  };

  return (
    <View style={[styles.wrap, style]}>
      <Text style={styles.label}>
        {label} <Text style={{ color: "#6b7280" }}>(Tên / Nick / SĐT)</Text>
      </Text>

      <View style={styles.inputRow}>
        <TextInput
          value={input}
          onChangeText={(t) => {
            setInput(t);
            setOpen(!!t.trim());
          }}
          placeholder={placeholder || "gõ để tìm…"}
          placeholderTextColor="#9aa0a6"
          style={styles.input}
          onFocus={() => setOpen(!!input.trim())}
        />
        {isFetching ? (
          <ActivityIndicator size="small" />
        ) : input ? (
          <Pressable onPress={clearAll} hitSlop={10} style={styles.clearBtn}>
            <Text style={styles.clearText}>×</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Dropdown suggestions (đặt trong flow layout cho đơn giản & ổn định) */}
      {open && (
        <View style={styles.dropdown}>
          {isFetching && options.length === 0 ? (
            <View style={styles.ddLoading}>
              <ActivityIndicator />
            </View>
          ) : options.length === 0 ? (
            <View style={styles.ddEmpty}>
              <Text style={styles.ddEmptyText}>Không có kết quả</Text>
            </View>
          ) : (
            <FlatList
              keyboardShouldPersistTaps="handled"
              data={options}
              keyExtractor={(item, i) => String(item?._id || item?.phone || i)}
              renderItem={({ item }) => {
                const name =
                  item?.name || item?.fullName || item?.nickname || "—";
                const nick = item?.nickname ? `@${item.nickname}` : "";
                const phoneMasked = item?.phone
                  ? ` • ${maskPhone(item.phone)}`
                  : "";
                return (
                  <Pressable
                    onPress={() => selectUser(item)}
                    style={({ pressed }) => [
                      styles.optionRow,
                      pressed && { backgroundColor: "#f3f4f6" },
                    ]}
                  >
                    <Image
                      source={{ uri: normalizeUri(item?.avatar) || AVA_PLACE }}
                      style={styles.ava}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={styles.optName}>
                        {name}
                      </Text>
                      <Text numberOfLines={1} style={styles.optSub}>
                        {nick}
                        {phoneMasked}
                      </Text>
                    </View>
                  </Pressable>
                );
              }}
              style={{ maxHeight: 260 }}
            />
          )}
        </View>
      )}

      {/* Selected preview */}
      {value && (
        <View style={styles.selectedRow}>
          <Image
            source={{ uri: normalizeUri(value?.avatar) || AVA_PLACE }}
            style={[styles.ava, { width: 36, height: 36, borderRadius: 18 }]}
          />
          <Text numberOfLines={1} style={styles.selName}>
            {value?.name || value?.fullName || value?.nickname}
          </Text>
          <View style={styles.chip}>
            <Text style={styles.chipText}>
              Điểm {eventType === "double" ? "đôi" : "đơn"}: {scoreOf(value)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%" },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 6, color: "#111" },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  input: { flex: 1, fontSize: 16, color: "#111" },
  clearBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e5e7eb",
  },
  clearText: { fontSize: 16, lineHeight: 16, color: "#111", marginTop: -1 },

  dropdown: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
  },
  ddLoading: { padding: 12, alignItems: "center" },
  ddEmpty: { padding: 12, alignItems: "center" },
  ddEmptyText: { color: "#6b7280" },

  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#eee",
  },
  ava: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#eee",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  optName: { fontSize: 14, color: "#111", fontWeight: "600" },
  optSub: { fontSize: 12, color: "#6b7280" },

  selectedRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  selName: { flex: 1, color: "#111", fontWeight: "600" },

  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#eef2ff",
    borderRadius: 999,
  },
  chipText: { color: "#3730a3", fontWeight: "700", fontSize: 12 },
});
