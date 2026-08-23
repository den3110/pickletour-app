// components/market/MarketCard.tsx — thẻ sản phẩm Chợ (mobile)
import React from "react";
import { View, Text, Image, Pressable, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  CATEGORY_MAP,
  CONDITION_MAP,
  TYPE_MAP,
  STATUS_MAP,
  formatPrice,
  timeAgo,
  firstImage,
} from "@/constants/market";

export default function MarketCard({
  item,
  width,
  onToggleSave,
  canSave = true,
}: {
  item: any;
  width: number;
  onToggleSave?: (item: any) => void;
  canSave?: boolean;
}) {
  if (!item) return null;
  const cond = CONDITION_MAP[item.condition];
  const cat = CATEGORY_MAP[item.category];
  const type = TYPE_MAP[item.type];
  const status = STATUS_MAP[item.status];
  const img = firstImage(item);
  const isSold = item.status === "sold";
  const notAvailable = item.status !== "available";

  return (
    <Pressable
      onPress={() => router.push(`/marketplace/${item._id}` as any)}
      style={{
        width,
        backgroundColor: "#fff",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#EAECEF",
        overflow: "hidden",
        marginBottom: 12,
      }}
    >
      <View style={{ width: "100%", aspectRatio: 1, backgroundColor: "#F1F5F9" }}>
        {img ? (
          <Image
            source={{ uri: img }}
            style={{
              width: "100%",
              height: "100%",
              opacity: isSold ? 0.6 : 1,
            }}
            resizeMode="cover"
          />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 40 }}>{cat?.emoji || "📦"}</Text>
          </View>
        )}

        {type && item.type !== "sell" && (
          <View
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              backgroundColor: type.color,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 999,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 11, fontWeight: "800" }}>
              {type.emoji} {type.label}
            </Text>
          </View>
        )}

        {canSave && onToggleSave && (
          <TouchableOpacity
            onPress={() => onToggleSave(item)}
            hitSlop={8}
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              backgroundColor: "rgba(255,255,255,0.92)",
              width: 30,
              height: 30,
              borderRadius: 15,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name={item.saved ? "heart" : "heart-outline"}
              size={17}
              color={item.saved ? "#e11d48" : "#334155"}
            />
          </TouchableOpacity>
        )}

        {notAvailable && (
          <View
            style={{
              position: "absolute",
              bottom: 8,
              left: 8,
              backgroundColor: status?.color || "#6b7280",
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 8,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 11, fontWeight: "800" }}>
              {status?.label}
            </Text>
          </View>
        )}
      </View>

      <View style={{ padding: 10, gap: 4 }}>
        <Text style={{ fontSize: 15, fontWeight: "900", color: "#0d6efd" }}>
          {formatPrice(item.price, item.type)}
        </Text>
        <Text numberOfLines={2} style={{ fontSize: 13, fontWeight: "600", minHeight: 34, color: "#111827" }}>
          {item.title}
        </Text>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {cond && (
            <View
              style={{
                backgroundColor: `${cond.color}18`,
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 6,
              }}
            >
              <Text style={{ color: cond.color, fontSize: 10, fontWeight: "700" }}>
                {cond.label}
              </Text>
            </View>
          )}
          {!!item.brand && (
            <Text style={{ fontSize: 11, color: "#64748B" }}>{item.brand}</Text>
          )}
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3, flex: 1 }}>
            <Ionicons name="location-outline" size={12} color="#94A3B8" />
            <Text numberOfLines={1} style={{ fontSize: 10, color: "#94A3B8", flex: 1 }}>
              {item.location?.province || "—"} · {timeAgo(item.createdAt)}
            </Text>
          </View>
          {item.seller?.verified && (
            <Ionicons name="checkmark-circle" size={13} color="#2563eb" />
          )}
        </View>
      </View>
    </Pressable>
  );
}
