// components/PlayerSelector.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
  useColorScheme,
  ScrollView,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useLazySearchUserQuery } from "@/slices/usersApiSlice";
import { normalizeUri } from "@/utils/normalizeUri";
import AppleLiquidGlassView from "@/components/ui/AppleLiquidGlassView";
import { IOS_26_LIQUID_GLASS_ENABLED } from "@/utils/nativeTabs";

type Props = {
  label: string;
  eventType?: "single" | "double";
  onChange?: (user: any | null) => void;
  style?: ViewStyle;
  placeholder?: string;
  /** Nếu BE nhận object { q, eventType } thì bật cái này */
  queryAsObject?: boolean;
};

function useThemeColors() {
  const scheme = useColorScheme() ?? "light";
  const tint = scheme === "dark" ? "#7cc0ff" : "#0a84ff";
  const cardBg = scheme === "dark" ? "#111214" : "#fff";
  const inputBg = scheme === "dark" ? "#1a1c21" : "#fff";
  const border = scheme === "dark" ? "#2f3136" : "#e5e7eb";
  const hairline = scheme === "dark" ? "#26282d" : "#eee";
  const textPrimary = scheme === "dark" ? "#ffffff" : "#111111";
  const muted = scheme === "dark" ? "#9aa0a6" : "#6b7280";
  const clearBg = scheme === "dark" ? "#2a2c31" : "#e5e7eb";
  const clearText = textPrimary;
  const rowPressed = scheme === "dark" ? "#1f2226" : "#f3f4f6";
  const dropBg = cardBg;
  const scoreChipBg = scheme === "dark" ? "#1f2937" : "#eef2ff";
  const scoreChipFg = scheme === "dark" ? "#93c5fd" : "#3730a3";

  return {
    scheme,
    tint,
    cardBg,
    inputBg,
    border,
    hairline,
    textPrimary,
    muted,
    clearBg,
    clearText,
    rowPressed,
    dropBg,
    scoreChipBg,
    scoreChipFg,
  };
}

const glassScheme = (C: ReturnType<typeof useThemeColors>) =>
  C.scheme === "dark" ? "dark" : "light";

const glassTint = (
  C: ReturnType<typeof useThemeColors>,
  light = 0.42,
  dark = 0.36
) =>
  C.scheme === "dark"
    ? `rgba(26,28,33,${dark})`
    : `rgba(255,255,255,${light})`;

function PlayerSelectorGlassSurface({
  children,
  C,
  style,
  interactive = false,
}: {
  children?: React.ReactNode;
  C: ReturnType<typeof useThemeColors>;
  style?: any;
  interactive?: boolean;
}) {
  return (
    <AppleLiquidGlassView
      fallback="view"
      glassColorScheme={glassScheme(C)}
      glassEffectStyle="clear"
      glassTintColor={glassTint(C)}
      isInteractive={interactive}
      style={style}
    >
      {children}
    </AppleLiquidGlassView>
  );
}

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
  const C = useThemeColors();
  const [input, setInput] = useState("");
  const [value, setValue] = useState<any | null>(null);
  const [open, setOpen] = useState(false);

  const [trigger, { data = [], isFetching }] = useLazySearchUserQuery();

  // Ref để không kích hoạt search ngay sau khi chọn item (setInput programmatic)
  const ignoreNextSearchRef = useRef(false);

  // Đảm bảo onChange không gây vòng lặp do identity thay đổi
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Debounce search
  useEffect(() => {
    const q = input.trim();

    // Nếu vừa setInput khi chọn item → bỏ qua 1 lần search
    if (ignoreNextSearchRef.current) {
      ignoreNextSearchRef.current = false;
      return;
    }

    if (!q) {
      setOpen(false);
      return;
    }

    const id = setTimeout(() => {
      if (queryAsObject) trigger({ q, eventType });
      else trigger(q);
      setOpen(true);
    }, 300);

    return () => clearTimeout(id);
  }, [input, trigger, queryAsObject, eventType]);

  // Báo giá trị đã chọn lên parent (ổn định, tránh loop do onChange identity)
  useEffect(() => {
    onChangeRef.current?.(value || null);
  }, [value]);

  const options = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const scoreKey = eventType === "double" ? "double" : "single";
  const scoreOf = (u: any) => u?.score?.[scoreKey] ?? 0;

  const getName = (o: any) =>
    o?.name || o?.fullName || o?.nickname || o?.phone || "";

  const selectUser = (u: any) => {
    setValue(u);
    ignoreNextSearchRef.current = true; // chặn debounce mở lại
    setInput(getName(u));
    setOpen(false);
    Keyboard.dismiss();
  };

  const clearAll = () => {
    setValue(null);
    ignoreNextSearchRef.current = true; // chặn debounce
    setInput("");
    setOpen(false);
  };

  return (
    <View style={[styles.wrap, style]}>
      <Text style={[styles.label, { color: C.textPrimary }]}>
        {label} <Text style={{ color: C.muted }}>(Tên / Nick / SĐT)</Text>
      </Text>

      <PlayerSelectorGlassSurface
        C={C}
        interactive
        style={[
          styles.inputRow,
          { backgroundColor: C.inputBg, borderColor: C.border },
          IOS_26_LIQUID_GLASS_ENABLED && styles.glassInputRow,
        ]}
      >
        <TextInput
          value={input}
          onChangeText={(t) => {
            setInput(t);
            setOpen(!!t.trim());
          }}
          placeholder={placeholder || "gõ để tìm…"}
          placeholderTextColor={C.muted}
          style={[styles.input, { color: C.textPrimary }]}
          selectionColor={C.tint}
          onFocus={() => setOpen(!!input.trim())}
          // onBlur không đóng ngay để không “ăn” mất sự kiện chọn; đã đóng khi select
        />
        {isFetching ? (
          <ActivityIndicator size="small" color={C.tint} />
        ) : input ? (
          <Pressable
            onPress={clearAll}
            hitSlop={10}
            style={[styles.clearBtn, { backgroundColor: C.clearBg }]}
          >
            <Text style={[styles.clearText, { color: C.clearText }]}>×</Text>
          </Pressable>
        ) : null}
      </PlayerSelectorGlassSurface>

      {/* Dropdown suggestions — dùng ScrollView để tránh nested VirtualizedList */}
      {open && (
        <PlayerSelectorGlassSurface
          C={C}
          style={[
            styles.dropdown,
            { backgroundColor: C.dropBg, borderColor: C.border },
            IOS_26_LIQUID_GLASS_ENABLED && styles.glassDropdown,
          ]}
        >
          {isFetching && options.length === 0 ? (
            <View style={styles.ddLoading}>
              <ActivityIndicator color={C.tint} />
            </View>
          ) : options.length === 0 ? (
            <View style={styles.ddEmpty}>
              <Text style={{ color: C.muted }}>Không có kết quả</Text>
            </View>
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 260 }}
            >
              {options.map((item: any, i: number) => {
                const name =
                  item?.name || item?.fullName || item?.nickname || "—";
                const nick = item?.nickname ? `@${item.nickname}` : "";
                const phoneMasked = item?.phone
                  ? ` • ${maskPhone(item.phone)}`
                  : "";
                return (
                  <Pressable
                    key={String(item?._id || item?.phone || i)}
                    onPress={() => selectUser(item)}
                    style={({ pressed }) => [
                      styles.optionRow,
                      { borderColor: C.hairline },
                      pressed && { backgroundColor: C.rowPressed },
                    ]}
                  >
                    <ExpoImage
                      source={normalizeUri(item?.avatar) || AVA_PLACE}
                      style={[styles.ava, { borderColor: C.border }]}
                      contentFit="cover"
                      transition={150}
                      cachePolicy="memory-disk"
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        numberOfLines={1}
                        style={[styles.optName, { color: C.textPrimary }]}
                      >
                        {name}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[styles.optSub, { color: C.muted }]}
                      >
                        {nick}
                        {phoneMasked}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </PlayerSelectorGlassSurface>
      )}

      {/* Selected preview */}
      {value && (
        <PlayerSelectorGlassSurface
          C={C}
          style={[
            styles.selectedRow,
            { backgroundColor: C.inputBg, borderColor: C.border },
            IOS_26_LIQUID_GLASS_ENABLED && styles.glassSelectedRow,
          ]}
        >
          <ExpoImage
            source={normalizeUri(value?.avatar) || AVA_PLACE}
            style={[
              styles.ava,
              {
                width: 36,
                height: 36,
                borderRadius: 18,
                borderColor: C.border,
              },
            ]}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
          />
          <Text
            numberOfLines={1}
            style={[styles.selName, { color: C.textPrimary }]}
          >
            {value?.name || value?.fullName || value?.nickname}
          </Text>
          <View style={[styles.chip, { backgroundColor: C.scoreChipBg }]}>
            <Text style={[styles.chipText, { color: C.scoreChipFg }]}>
              Điểm {eventType === "double" ? "đôi" : "đơn"}: {scoreOf(value)}
            </Text>
          </View>
        </PlayerSelectorGlassSurface>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%" },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 6 },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  glassInputRow: {
    borderColor: "rgba(255,255,255,0.28)",
    shadowColor: "#0a84ff",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  input: { flex: 1, fontSize: 16 },
  clearBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  clearText: { fontSize: 16, lineHeight: 16, marginTop: -1 },

  dropdown: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  glassDropdown: {
    borderColor: "rgba(255,255,255,0.26)",
    shadowColor: "#0a84ff",
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  ddLoading: { padding: 12, alignItems: "center" },
  ddEmpty: { padding: 12, alignItems: "center" },

  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  ava: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#eee",
    borderWidth: 1,
  },
  optName: { fontSize: 14, fontWeight: "600" },
  optSub: { fontSize: 12 },

  selectedRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 8,
  },
  glassSelectedRow: {
    borderColor: "rgba(255,255,255,0.24)",
  },
  selName: { flex: 1, fontWeight: "600" },

  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chipText: { fontWeight: "700", fontSize: 12 },
});
