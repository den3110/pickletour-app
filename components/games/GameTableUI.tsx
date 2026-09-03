// Shared game table UI: WoodBackground, FeltOval, CardPro, SeatFrame,
// RoundIconBtn. Dùng cho Phỏm / Sâm (và có thể cả Poker sau).
import {
  Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React,
  { useEffect,
  useRef } from "react";
import { Animated,
  Image,
  Pressable,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { Text } from "@/components/ui/i18nText";

const SUIT_SYMBOL: Record<string, string> = {
  s: "♠",
  h: "♥",
  d: "♦",
  c: "♣",
};
const RED_SUITS = new Set(["h", "d"]);

/* -------- Wood background (multi-layer gradient) -------- */

export function WoodBackground({ children }: { children?: React.ReactNode }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Base tone */}
      <LinearGradient
        colors={["#4A2410", "#6B3418", "#4A2410"]}
        style={StyleSheet.absoluteFill}
      />
      {/* Vertical planks — subtle darker stripes */}
      <View style={StyleSheet.absoluteFill}>
        {Array.from({ length: 12 }).map((_, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${(i * 100) / 12}%`,
              width: 1,
              backgroundColor: "rgba(0,0,0,0.15)",
            }}
          />
        ))}
      </View>
      {/* Subtle diagonal grain */}
      <LinearGradient
        colors={["rgba(255,255,255,0.04)", "transparent", "rgba(0,0,0,0.15)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

/* -------- Green felt oval (bàn baize) -------- */

export function FeltOval({
  style,
  children,
}: {
  style?: ViewStyle;
  children?: React.ReactNode;
}) {
  return (
    <View style={[styles.feltOuter, style]}>
      {/* Wooden padded rim (outer) */}
      <LinearGradient
        colors={["#3D1F0C", "#5A2E14", "#3D1F0C"]}
        style={styles.feltRim}
      >
        {/* Highlight strip on top of rim */}
        <View style={styles.rimHighlight} />
        {/* Green felt (inner) */}
        <LinearGradient
          colors={["#1F5D2E", "#2E7D32", "#256729"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.feltInner}
        >
          {/* Vignette shadow inside */}
          <View style={styles.feltVignette} pointerEvents="none" />
          {children}
        </LinearGradient>
      </LinearGradient>
    </View>
  );
}

/* -------- Playing Card (elegant, rounded corners, corner indicators) -------- */

export function CardPro({
  card,
  size = 46,
  hidden = false,
  faceUp = true,
  selected = false,
  onPress,
}: {
  card?: string | null;
  size?: number;
  hidden?: boolean;
  faceUp?: boolean;
  selected?: boolean;
  onPress?: () => void;
}) {
  const w = size;
  const h = Math.round(size * 1.42);
  const isBack = hidden || !faceUp || !card;
  const wrap = (
    <View
      style={[
        cardStyles.card,
        {
          width: w,
          height: h,
          transform: selected ? [{ translateY: -12 }] : [{ translateY: 0 }],
        },
      ]}
    >
      {isBack ? (
        <LinearGradient
          colors={["#1E3A8A", "#2563EB", "#1E3A8A"]}
          style={cardStyles.cardInner}
        >
          {/* Diamond pattern */}
          <View style={cardStyles.backPattern}>
            {Array.from({ length: 5 }).map((_, r) => (
              <View key={r} style={cardStyles.backRow}>
                {Array.from({ length: 4 }).map((_, c) => (
                  <View key={c} style={cardStyles.backDot} />
                ))}
              </View>
            ))}
          </View>
          <View style={cardStyles.backBorder} />
        </LinearGradient>
      ) : (
        <View style={cardStyles.cardFace}>
          <CardFace card={card as string} size={size} />
        </View>
      )}
    </View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={cardStyles.pressWrap}>
        {wrap}
      </Pressable>
    );
  }
  return wrap;
}

function CardFace({ card, size }: { card: string; size: number }) {
  const rank = card[0];
  const suit = card[1];
  const red = RED_SUITS.has(suit);
  const color = red ? "#DC2626" : "#0F172A";
  const display = rank === "T" ? "10" : rank;
  const symbol = SUIT_SYMBOL[suit] || "?";
  return (
    <View style={cardStyles.faceInner}>
      {/* TL corner */}
      <View style={cardStyles.cornerTL}>
        <Text style={[cardStyles.cornerRank, { color, fontSize: size * 0.28 }]}>
          {display}
        </Text>
        <Text style={[cardStyles.cornerSuit, { color, fontSize: size * 0.26 }]}>
          {symbol}
        </Text>
      </View>
      {/* Center big suit */}
      <Text
        style={[
          cardStyles.centerSuit,
          { color, fontSize: size * 0.7 },
        ]}
      >
        {symbol}
      </Text>
      {/* BR corner (rotated) */}
      <View style={cardStyles.cornerBR}>
        <Text style={[cardStyles.cornerRank, { color, fontSize: size * 0.28 }]}>
          {display}
        </Text>
        <Text style={[cardStyles.cornerSuit, { color, fontSize: size * 0.26 }]}>
          {symbol}
        </Text>
      </View>
    </View>
  );
}

/* -------- Seat frame (gỗ, avatar, chip pill) -------- */

export function SeatFrame({
  user,
  chips,
  isMine,
  isTurn,
  showChips = true,
  compact = false,
  cardCount = 0,
  onPress,
}: {
  user?: any;
  chips?: number;
  isMine?: boolean;
  isTurn?: boolean;
  showChips?: boolean;
  compact?: boolean;
  cardCount?: number;
  onPress?: () => void;
}) {
  const size = compact ? 40 : 48;
  const wrap = (
    <View
      style={[
        seatStyles.container,
        isTurn && seatStyles.turn,
      ]}
    >
      <LinearGradient
        colors={
          isTurn
            ? ["#F59E0B", "#FBBF24", "#F59E0B"]
            : ["#78350F", "#92400E", "#78350F"]
        }
        style={seatStyles.frame}
      >
        <View style={seatStyles.inner}>
          {user?.avatar ? (
            <Image
              source={{ uri: user.avatar }}
              style={{ width: size, height: size, borderRadius: size / 2 }}
            />
          ) : (
            <View
              style={{
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: "#475569",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>
                {(user?.nickname || user?.name || "?")[0]?.toUpperCase()}
              </Text>
            </View>
          )}
        </View>
      </LinearGradient>
      <View style={seatStyles.namePlate}>
        <Text
          style={seatStyles.nameText}
          numberOfLines={1}
        >
          {user?.nickname || user?.name || "—"}
          {isMine ? " 👤" : ""}
        </Text>
      </View>
      {showChips && chips != null && (
        <View style={seatStyles.chipPill}>
          <Text style={seatStyles.chipText}>💰 {formatChips(chips)}</Text>
        </View>
      )}
      {cardCount > 0 && !isMine && (
        <View style={seatStyles.cardCountBadge}>
          <Text style={seatStyles.cardCountText}>{cardCount}</Text>
        </View>
      )}
    </View>
  );
  if (onPress) {
    return <Pressable onPress={onPress}>{wrap}</Pressable>;
  }
  return wrap;
}

function formatChips(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(n >= 10_000 ? 0 : 1) + "k";
  return String(n);
}

/* -------- Empty seat placeholder -------- */

export function EmptySeat({ onPress, label = "Ngồi" }: { onPress?: () => void; label?: string }) {
  return (
    <Pressable onPress={onPress} style={seatStyles.emptyContainer}>
      <View style={seatStyles.emptyCircle}>
        <Ionicons name="add" size={24} color="rgba(255,255,255,0.5)" />
      </View>
      <Text style={seatStyles.emptyText}>{label}</Text>
    </Pressable>
  );
}

/* -------- Speech bubble chat (bay lên avatar 4s) -------- */

export function SpeechBubble({ text }: { text: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.spring(anim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 20,
        bounciness: 8,
      }),
      Animated.delay(3400),
      Animated.timing(anim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  }, [anim, text]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        bubbleStyles.speech,
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [6, 0],
              }),
            },
            { scale: anim },
          ],
        },
      ]}
    >
      <Text numberOfLines={3} style={bubbleStyles.speechText}>
        {text}
      </Text>
      <View style={bubbleStyles.speechTail} />
    </Animated.View>
  );
}

/* -------- Connection status banner (offline/reconnecting) -------- */

export function ConnectionBanner({
  status,
  topOffset = 0,
}: {
  status: "online" | "offline" | "reconnecting";
  topOffset?: number;
}) {
  if (status === "online") return null;
  return (
    <View
      style={[
        connStyles.banner,
        { top: topOffset },
        status === "offline" && { backgroundColor: "#DC2626" },
      ]}
    >
      <Ionicons
        name={status === "offline" ? "cloud-offline" : "sync"}
        size={14}
        color="#fff"
      />
      <Text style={connStyles.text}>
        {status === "offline"
          ? "Mất kết nối — đang chờ mạng"
          : "Đang kết nối lại…"}
      </Text>
    </View>
  );
}

/* -------- Round purple button (like reference) -------- */

export function RoundIconBtn({
  icon,
  onPress,
  color = "#8B5CF6",
  badge,
  size = 44,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  color?: string;
  badge?: string | number;
  size?: number;
}) {
  return (
    <Pressable onPress={onPress} style={{ position: "relative" }}>
      <LinearGradient
        colors={[color, color + "CC"]}
        style={[
          btnStyles.round,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      >
        <Ionicons name={icon} size={size * 0.5} color="#fff" />
      </LinearGradient>
      {badge != null && (
        <View style={btnStyles.badge}>
          <Text style={btnStyles.badgeText}>{badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

/* -------- Styles -------- */

const styles = StyleSheet.create({
  feltOuter: {
    flex: 1,
    padding: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  feltRim: {
    width: "88%",
    height: "82%",
    borderRadius: 500,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  rimHighlight: {
    position: "absolute",
    top: 4,
    left: "10%",
    right: "10%",
    height: 6,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 3,
  },
  feltInner: {
    flex: 1,
    borderRadius: 500,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  feltVignette: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 500,
    borderWidth: 60,
    borderColor: "rgba(0,0,0,0.15)",
  },
});

const cardStyles = StyleSheet.create({
  pressWrap: {},
  card: {
    borderRadius: 6,
    backgroundColor: "#fff",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 4,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.2)",
  },
  cardInner: {
    ...StyleSheet.absoluteFillObject,
    padding: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  backPattern: {
    flex: 1,
    width: "100%",
    padding: 3,
    justifyContent: "space-between",
  },
  backRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  backDot: {
    width: 5,
    height: 5,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
    transform: [{ rotate: "45deg" }],
  },
  backBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.35)",
    borderRadius: 6,
    margin: 2,
  },
  cardFace: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#FAFAF7",
    padding: 3,
  },
  faceInner: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  cornerTL: {
    position: "absolute",
    top: 0,
    left: 2,
    alignItems: "center",
  },
  cornerBR: {
    position: "absolute",
    bottom: 0,
    right: 2,
    alignItems: "center",
    transform: [{ rotate: "180deg" }],
  },
  cornerRank: {
    fontWeight: "900",
    lineHeight: undefined,
  },
  cornerSuit: {
    fontWeight: "900",
    marginTop: -2,
  },
  centerSuit: {
    fontWeight: "900",
    opacity: 0.85,
  },
});

const seatStyles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 2,
  },
  turn: {
    // Golden aura around
  },
  frame: {
    padding: 3,
    borderRadius: 999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 5,
  },
  inner: {
    backgroundColor: "#0F172A",
    borderRadius: 999,
    padding: 2,
  },
  namePlate: {
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 2,
    maxWidth: 96,
  },
  nameText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  chipPill: {
    backgroundColor: "rgba(251,191,36,0.9)",
    paddingHorizontal: 8,
    paddingVertical: 1,
    borderRadius: 999,
    marginTop: 1,
  },
  chipText: {
    color: "#78350F",
    fontSize: 10,
    fontWeight: "800",
  },
  cardCountBadge: {
    position: "absolute",
    top: -4,
    right: -6,
    backgroundColor: "#DC2626",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  cardCountText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    paddingHorizontal: 4,
  },
  emptyContainer: {
    alignItems: "center",
    gap: 4,
    opacity: 0.7,
  },
  emptyCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  emptyText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    fontWeight: "700",
  },
});

const connStyles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 6,
    backgroundColor: "#F59E0B",
    zIndex: 100,
  },
  text: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
});

const bubbleStyles = StyleSheet.create({
  speech: {
    position: "absolute",
    top: -50,
    left: -50,
    right: -50,
    alignItems: "center",
    zIndex: 25,
  },
  speechText: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: "700",
    color: "#0F172A",
    maxWidth: 160,
    textAlign: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  speechTail: {
    width: 12,
    height: 12,
    backgroundColor: "#fff",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#E2E8F0",
    transform: [{ rotate: "45deg" }],
    marginTop: -6,
  },
});

const btnStyles = StyleSheet.create({
  round: {
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 5,
  },
  badge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    backgroundColor: "#DC2626",
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },
});
