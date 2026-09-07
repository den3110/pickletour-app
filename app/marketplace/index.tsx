// app/marketplace/index.tsx — Chợ PickleTour (mobile)
import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  Pressable,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
  Modal,
  RefreshControl,
} from "react-native";
import { TextInput } from "@/components/ui/i18nTextInput";
import { Text } from "@/components/ui/i18nText";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useSelector } from "react-redux";
import MarketCard from "@/components/market/MarketCard";
import { CATEGORIES, CONDITIONS, TYPES, SORTS } from "@/constants/market";
import {
  useListMarketQuery,
  useToggleSaveMarketMutation,
} from "@/slices/marketApiSlice";
import { useThemeTokens } from "@/hooks/useThemeTokens";

const BLUE = "#0d6efd";

export default function MarketplaceScreen() {
  const C = useThemeTokens();
  const { width } = useWindowDimensions();
  const { seller: sellerFilter } = useLocalSearchParams<{ seller?: string }>();
  const me = useSelector((s: any) => s.auth?.userInfo);
  const [searchText, setSearchText] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [condition, setCondition] = useState("");
  const [type, setType] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [filterOpen, setFilterOpen] = useState(false);

  const params = useMemo(() => {
    const p: any = { sort, page, limit: 20 };
    if (q) p.q = q;
    if (category) p.category = category;
    if (condition) p.condition = condition;
    if (type) p.type = type;
    if (sellerFilter) p.seller = sellerFilter;
    return p;
  }, [q, category, condition, type, sort, page, sellerFilter]);

  const { data, isFetching, isLoading, refetch } = useListMarketQuery(params, {
    refetchOnMountOrArgChange: true,
  });
  const [toggleSave] = useToggleSaveMarketMutation();
  const items = data?.items || [];
  const hasMore = data?.hasMore;

  // Làm mới danh sách mỗi khi màn được focus (VD: sau khi đăng tin mới quay lại)
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const cardW = (width - 12 * 3) / 2;

  const onToggleSave = async (item: any) => {
    if (!me) return router.push("/login" as any);
    try {
      await toggleSave(item._id).unwrap();
      refetch();
    } catch {}
  };

  const activeFilters = (condition ? 1 : 0) + (type ? 1 : 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={["top"]}>
      {/* Header */}
      <View
        style={{
          paddingHorizontal: 14,
          paddingBottom: 10,
          backgroundColor: C.card,
          borderBottomWidth: 1,
          borderBottomColor: C.border,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={26} color={C.text} />
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: "900", flex: 1, color: C.text }}>
            🛍️ Chợ Mua bán
          </Text>
          <TouchableOpacity onPress={() => router.push("/marketplace/offers" as any)} hitSlop={8}>
            <Ionicons name="pricetag-outline" size={22} color={C.text2} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/marketplace/saved" as any)} hitSlop={8}>
            <Ionicons name="bookmark-outline" size={22} color={C.text2} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/marketplace/mine" as any)} hitSlop={8}>
            <Ionicons name="cube-outline" size={22} color={C.text2} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: C.field,
            borderRadius: 12,
            paddingHorizontal: 12,
            marginTop: 10,
            height: 42,
          }}
        >
          <Ionicons name="search" size={18} color={C.muted} />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={() => {
              setQ(searchText.trim());
              setPage(1);
            }}
            returnKeyType="search"
            placeholder="Tìm giày, vợt, áo…"
            placeholderTextColor={C.muted}
            style={{ flex: 1, marginLeft: 8, fontSize: 15, color: C.text }}
          />
          {searchText ? (
            <TouchableOpacity
              onPress={() => {
                setSearchText("");
                setQ("");
                setPage(1);
              }}
            >
              <Ionicons name="close-circle" size={18} color={C.muted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Categories */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 10 }}
          contentContainerStyle={{ gap: 8, paddingRight: 12 }}
        >
          {[{ key: "", label: "Tất cả", emoji: "✨" }, ...CATEGORIES].map((c) => {
            const active = category === c.key;
            return (
              <TouchableOpacity
                key={c.key || "all"}
                onPress={() => {
                  setCategory(active ? "" : c.key);
                  setPage(1);
                }}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 999,
                  backgroundColor: active ? BLUE : C.field,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: active ? "#fff" : C.text2 }}>
                  {c.emoji} {c.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Sort + filter row */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
          <Text style={{ fontSize: 13, color: C.sub }}>
            {data?.total != null ? `${data.total} tin đăng` : "Đang tải…"}
          </Text>
          <TouchableOpacity
            onPress={() => setFilterOpen(true)}
            style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
          >
            <Ionicons name="options-outline" size={18} color={BLUE} />
            <Text style={{ color: BLUE, fontWeight: "700", fontSize: 13 }}>
              Bộ lọc{activeFilters ? ` (${activeFilters})` : ""}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Grid */}
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={BLUE} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => String(it._id)}
          numColumns={2}
          columnWrapperStyle={{ paddingHorizontal: 12, gap: 12 }}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 100 }}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && page === 1}
              onRefresh={() => {
                if (page !== 1) setPage(1);
                else refetch();
              }}
              tintColor={BLUE}
            />
          }
          renderItem={({ item }) => (
            <MarketCard
              item={item}
              width={cardW}
              onToggleSave={onToggleSave}
              canSave={!item.isOwner}
            />
          )}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (hasMore && !isFetching) setPage((p) => p + 1);
          }}
          ListFooterComponent={
            isFetching && page > 1 ? (
              <ActivityIndicator style={{ marginVertical: 16 }} color={BLUE} />
            ) : null
          }
          ListEmptyComponent={
            <View style={{ alignItems: "center", marginTop: 60 }}>
              <Text style={{ fontSize: 44 }}>🛍️</Text>
              <Text style={{ color: C.sub, marginTop: 8, fontWeight: "600" }}>
                Chưa có tin đăng phù hợp
              </Text>
            </View>
          }
        />
      )}

      {/* FAB đăng tin */}
      <TouchableOpacity
        onPress={() => router.push("/marketplace/new" as any)}
        style={{
          position: "absolute",
          right: 18,
          bottom: 26,
          backgroundColor: BLUE,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 18,
          height: 52,
          borderRadius: 26,
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }}
      >
        <Ionicons name="add" size={24} color="#fff" />
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Đăng tin</Text>
      </TouchableOpacity>

      {/* Filter modal */}
      <Modal visible={filterOpen} transparent animationType="slide" onRequestClose={() => setFilterOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: C.overlay }} onPress={() => setFilterOpen(false)} />
        <View style={{ backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 }}>
          <Text style={{ fontSize: 18, fontWeight: "900", marginBottom: 14, color: C.text }}>Bộ lọc</Text>

          <Text style={{ fontWeight: "700", marginBottom: 8, color: C.text }}>Hình thức</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {TYPES.map((t) => {
              const active = type === t.key;
              return (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => setType(active ? "" : t.key)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: active ? BLUE : C.field,
                  }}
                >
                  <Text style={{ fontWeight: "600", color: active ? "#fff" : C.text2 }}>
                    {t.emoji} {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={{ fontWeight: "700", marginBottom: 8, color: C.text }}>Tình trạng</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {CONDITIONS.map((c) => {
              const active = condition === c.key;
              return (
                <TouchableOpacity
                  key={c.key}
                  onPress={() => setCondition(active ? "" : c.key)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: active ? BLUE : C.field,
                  }}
                >
                  <Text style={{ fontWeight: "600", color: active ? "#fff" : C.text2 }}>{c.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={{ fontWeight: "700", marginBottom: 8, color: C.text }}>Sắp xếp</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
            {SORTS.map((s) => {
              const active = sort === s.key;
              return (
                <TouchableOpacity
                  key={s.key}
                  onPress={() => setSort(s.key)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: active ? BLUE : C.field,
                  }}
                >
                  <Text style={{ fontWeight: "600", color: active ? "#fff" : C.text2 }}>{s.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              onPress={() => {
                setCondition("");
                setType("");
                setSort("newest");
              }}
              style={{ flex: 1, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: C.field }}
            >
              <Text style={{ fontWeight: "700", color: C.text2 }}>Xoá lọc</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setPage(1);
                setFilterOpen(false);
              }}
              style={{ flex: 1, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: BLUE }}
            >
              <Text style={{ fontWeight: "800", color: "#fff" }}>Áp dụng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
