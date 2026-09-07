// components/courts/BankPicker.tsx — Ô chọn ngân hàng dạng dropdown + tìm kiếm + logo
import React, { useMemo, useState } from "react";
import { View, Modal, TextInput, FlatList, TouchableOpacity, StyleSheet, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/components/ui/i18nText";
import { BANKS, BANK_LOGOS, findBank } from "@/constants/banks";
import type { Pal } from "@/components/courts/ui";
import { R, SP, shadow } from "@/components/courts/ui";

const norm = (s: string) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();

export function BankLogo({ code, size = 34 }: { code?: string; size?: number }) {
  const src = code ? BANK_LOGOS[code] : null;
  if (!src) {
    return (
      <View style={{ width: size, height: size, borderRadius: 8, backgroundColor: "rgba(148,163,184,0.2)", alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="card-outline" size={size * 0.55} color="#94a3b8" />
      </View>
    );
  }
  return <Image source={src} style={{ width: size, height: size, borderRadius: 8 }} resizeMode="contain" />;
}

export default function BankPicker({
  C,
  code,
  onSelect,
  label = "Ngân hàng",
}: {
  C: Pal;
  code?: string;
  onSelect: (bank: { code: string; name: string }) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = findBank(code);

  const list = useMemo(() => {
    const query = norm(q.trim());
    if (!query) return BANKS;
    return BANKS.filter(
      (b) =>
        norm(b.name).includes(query) ||
        norm(b.subtitle).includes(query) ||
        norm(b.code).includes(query),
    );
  }, [q]);

  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: C.sub, fontSize: 13, marginBottom: 6 }}>{label}</Text>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => { setQ(""); setOpen(true); }}
        style={[styles.field, { backgroundColor: C.field, borderColor: C.border }]}
      >
        {selected ? (
          <>
            <BankLogo code={selected.code} size={30} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: C.text, fontWeight: "700" }} numberOfLines={1}>{selected.name}</Text>
              <Text style={{ color: C.sub, fontSize: 11 }} numberOfLines={1}>{selected.subtitle}</Text>
            </View>
          </>
        ) : (
          <Text style={{ color: C.muted, flex: 1 }}>Chọn ngân hàng…</Text>
        )}
        <Ionicons name="chevron-down" size={18} color={C.sub} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.wrap}>
          <View style={[styles.sheet, { backgroundColor: C.card }, shadow(C.dark, 3)]}>
            <View style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, marginBottom: 12 }} />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <Text style={{ color: C.text, fontWeight: "900", fontSize: 17 }}>Chọn ngân hàng</Text>
              <TouchableOpacity onPress={() => setOpen(false)} style={{ padding: 4 }}><Ionicons name="close" size={22} color={C.sub} /></TouchableOpacity>
            </View>
            <View style={[styles.search, { backgroundColor: C.field, borderColor: C.border }]}>
              <Ionicons name="search" size={17} color={C.muted} />
              <TextInput
                style={{ flex: 1, color: C.text, fontSize: 15, paddingVertical: 0 }}
                placeholder="Tìm tên ngân hàng…"
                placeholderTextColor={C.muted}
                value={q}
                onChangeText={setQ}
                autoFocus
              />
              {q ? <TouchableOpacity onPress={() => setQ("")}><Ionicons name="close-circle" size={17} color={C.muted} /></TouchableOpacity> : null}
            </View>
            <FlatList
              data={list}
              keyExtractor={(b) => b.code}
              keyboardShouldPersistTaps="handled"
              style={{ marginTop: 10 }}
              ListEmptyComponent={<Text style={{ color: C.sub, textAlign: "center", marginTop: 24 }}>Không tìm thấy ngân hàng.</Text>}
              renderItem={({ item }) => {
                const on = item.code === code;
                return (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => { onSelect({ code: item.code, name: item.name }); setOpen(false); }}
                    style={[styles.row, { borderColor: C.border }, on && { backgroundColor: C.accentSoft }]}
                  >
                    <BankLogo code={item.code} size={38} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: C.text, fontWeight: "700" }} numberOfLines={1}>{item.name}</Text>
                      <Text style={{ color: C.sub, fontSize: 12 }} numberOfLines={1}>{item.subtitle}</Text>
                    </View>
                    {on ? <Ionicons name="checkmark-circle" size={20} color={C.accent} /> : null}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: R.sm, paddingHorizontal: 12, paddingVertical: 10, minHeight: 52 },
  wrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(2,6,23,0.6)" },
  sheet: { padding: SP.lg, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, height: "82%" },
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: R.sm, paddingHorizontal: 12, height: 46 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 8, borderRadius: R.sm, borderBottomWidth: StyleSheet.hairlineWidth },
});
