// components/courts/ui.tsx — UI kit dùng chung cho module đặt sân (cao cấp, nhất quán)
import React from "react";
import { View, TouchableOpacity, StyleSheet, Platform, ViewStyle, StyleProp } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/components/ui/i18nText";
import { pal, WEEKDAYS_SHORT, weekdayOf } from "@/utils/courtFormat";

export type Pal = ReturnType<typeof pal>;

export const R = { sm: 12, md: 16, lg: 20, xl: 26 };
export const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };

export const shadow = (dark: boolean, level: 1 | 2 | 3 = 1): ViewStyle =>
  Platform.select<ViewStyle>({
    ios: {
      shadowColor: dark ? "#000" : "#0f172a",
      shadowOpacity: dark ? [0.35, 0.45, 0.55][level - 1] : [0.06, 0.1, 0.16][level - 1],
      shadowRadius: [8, 14, 24][level - 1],
      shadowOffset: { width: 0, height: [3, 6, 10][level - 1] },
    },
    android: { elevation: [2, 4, 8][level - 1] },
    default: {},
  })!;

/* ---------- Surface ---------- */
export function Card({ C, style, children, level = 1, pad = SP.lg }: { C: Pal; style?: StyleProp<ViewStyle>; children: React.ReactNode; level?: 1 | 2 | 3; pad?: number }) {
  return (
    <View style={[{ backgroundColor: C.card, borderRadius: R.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, padding: pad }, shadow(C.dark, level), style]}>
      {children}
    </View>
  );
}

/* ---------- Hero gradient ---------- */
export function Hero({ C, children, style, colors }: { C: Pal; children: React.ReactNode; style?: StyleProp<ViewStyle>; colors?: [string, string] }) {
  return (
    <LinearGradient colors={colors || C.heroGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, shadow(C.dark, 3), style]}>
      <View pointerEvents="none" style={styles.glowA} />
      <View pointerEvents="none" style={styles.glowB} />
      {children}
    </LinearGradient>
  );
}

/* ---------- Section header ---------- */
export function SectionHeader({ C, title, right, style }: { C: Pal; title: string; right?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.sectionRow, style]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
        <View style={{ width: 4, height: 16, borderRadius: 2, backgroundColor: C.accent }} />
        <Text style={{ color: C.text, fontWeight: "800", fontSize: 15, letterSpacing: 0.2 }}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

/* ---------- Tile (menu) ---------- */
export function Tile({ C, icon, label, onPress, tint, badge }: { C: Pal; icon: any; label: string; onPress: () => void; tint?: string; badge?: number }) {
  const color = tint || C.accent;
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[styles.tile, { backgroundColor: C.card, borderColor: C.border }, shadow(C.dark, 1)]}>
      <View style={[styles.tileIcon, { backgroundColor: `${color}1f` }]}>
        <Ionicons name={icon} size={22} color={color} />
        {!!badge && (
          <View style={styles.tileBadge}><Text style={styles.tileBadgeText}>{badge > 99 ? "99+" : badge}</Text></View>
        )}
      </View>
      <Text style={{ color: C.text, fontSize: 12.5, fontWeight: "700", marginTop: 8, textAlign: "center" }} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

/* ---------- Stat ---------- */
export function Stat({ C, icon, label, value, color, style }: { C: Pal; icon?: any; label: string; value: string; color?: string; style?: StyleProp<ViewStyle> }) {
  const c = color || C.accent;
  return (
    <View style={[styles.stat, { backgroundColor: C.card, borderColor: C.border }, shadow(C.dark, 1), style]}>
      {icon ? <View style={[styles.statIcon, { backgroundColor: `${c}1f` }]}><Ionicons name={icon} size={16} color={c} /></View> : null}
      <Text style={{ color: C.text, fontWeight: "900", fontSize: 17, marginTop: icon ? 8 : 0, letterSpacing: -0.3 }} numberOfLines={1}>{value}</Text>
      <Text style={{ color: C.sub, fontSize: 11.5, marginTop: 2 }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/* ---------- Chips / pills ---------- */
export function Chip({ C, label, color, style, small }: { C: Pal; label: string; color?: string; style?: StyleProp<ViewStyle>; small?: boolean }) {
  const c = color || C.accent;
  return (
    <View style={[{ backgroundColor: `${c}22`, paddingHorizontal: small ? 8 : 10, paddingVertical: small ? 3 : 5, borderRadius: 999 }, style]}>
      <Text style={{ color: c, fontWeight: "700", fontSize: small ? 11 : 12 }}>{label}</Text>
    </View>
  );
}

/* ---------- Buttons ---------- */
export function PrimaryButton({ C, label, onPress, icon, disabled, style, color }: { C: Pal; label: string; onPress: () => void; icon?: any; disabled?: boolean; style?: StyleProp<ViewStyle>; color?: string }) {
  const bg = color || C.accent;
  return (
    <TouchableOpacity activeOpacity={0.85} disabled={disabled} onPress={onPress} style={[styles.btn, { backgroundColor: bg, opacity: disabled ? 0.55 : 1 }, shadow(C.dark, 2), style]}>
      {icon ? <Ionicons name={icon} size={18} color={C.onAccent} /> : null}
      <Text style={{ color: C.onAccent, fontWeight: "800", fontSize: 15 }}>{label}</Text>
    </TouchableOpacity>
  );
}
export function GhostButton({ C, label, onPress, icon, disabled, style, color }: { C: Pal; label: string; onPress: () => void; icon?: any; disabled?: boolean; style?: StyleProp<ViewStyle>; color?: string }) {
  const c = color || C.text;
  return (
    <TouchableOpacity activeOpacity={0.85} disabled={disabled} onPress={onPress} style={[styles.btn, { backgroundColor: "transparent", borderWidth: 1, borderColor: C.border, opacity: disabled ? 0.55 : 1 }, style]}>
      {icon ? <Ionicons name={icon} size={18} color={c} /> : null}
      <Text style={{ color: c, fontWeight: "700", fontSize: 15 }}>{label}</Text>
    </TouchableOpacity>
  );
}

/* ---------- Empty state ---------- */
export function Empty({ C, icon = "calendar-outline", title, subtitle, action }: { C: Pal; icon?: any; title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 36, paddingHorizontal: 24 }}>
      <View style={[styles.emptyIcon, { backgroundColor: C.accentSoft }]}>
        <Ionicons name={icon} size={30} color={C.accent} />
      </View>
      <Text style={{ color: C.text, fontWeight: "800", fontSize: 15, marginTop: 14, textAlign: "center" }}>{title}</Text>
      {!!subtitle && <Text style={{ color: C.sub, fontSize: 13, marginTop: 6, textAlign: "center", lineHeight: 19 }}>{subtitle}</Text>}
      {action ? <View style={{ marginTop: 16 }}>{action}</View> : null}
    </View>
  );
}

/* ---------- Date strip ---------- */
export function DateStrip({ C, dates, value, onChange }: { C: Pal; dates: string[]; value: string; onChange: (d: string) => void }) {
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {dates.map((d) => {
        const on = d === value;
        const [, m, dd] = d.split("-");
        return (
          <TouchableOpacity key={d} activeOpacity={0.85} onPress={() => onChange(d)} style={[styles.day, { backgroundColor: on ? C.accent : C.card, borderColor: on ? C.accent : C.border }, on ? shadow(C.dark, 2) : null]}>
            <Text style={{ color: on ? C.onAccent : C.sub, fontSize: 10.5, fontWeight: "700", letterSpacing: 0.4 }}>{WEEKDAYS_SHORT[weekdayOf(d)]}</Text>
            <Text style={{ color: on ? C.onAccent : C.text, fontSize: 15, fontWeight: "900", marginTop: 1 }}>{dd}/{m}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/* ---------- Sheet handle ---------- */
export function SheetHandle({ C }: { C: Pal }) {
  return <View style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, marginBottom: 12 }} />;
}

const styles = StyleSheet.create({
  hero: { borderRadius: R.xl, padding: SP.xl, overflow: "hidden" },
  glowA: { position: "absolute", width: 220, height: 220, borderRadius: 110, backgroundColor: "rgba(34,193,214,0.22)", top: -90, right: -60 },
  glowB: { position: "absolute", width: 160, height: 160, borderRadius: 80, backgroundColor: "rgba(245,179,1,0.10)", bottom: -70, left: -40 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: SP.xl, marginBottom: SP.md },
  tile: { width: "31.2%", borderRadius: R.lg, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 14, alignItems: "center" },
  tileIcon: { width: 46, height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  tileBadge: { position: "absolute", top: -6, right: -8, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
  tileBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  stat: { flex: 1, borderRadius: R.md, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  statIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, paddingHorizontal: 18, borderRadius: R.md },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  day: { width: 60, paddingVertical: 9, borderRadius: R.md, borderWidth: StyleSheet.hairlineWidth, alignItems: "center" },
});
