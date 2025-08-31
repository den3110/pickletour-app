// app/(app)/admin/tournament/[id]/ManageScreen.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert as RNAlert,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
  ScrollView,
} from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { useSelector } from "react-redux";
import { MaterialIcons } from "@expo/vector-icons";

import {
  useGetTournamentQuery,
  useAdminGetBracketsQuery,
  useAdminListMatchesByTournamentQuery,
  useAdminSetMatchLiveUrlMutation, // gửi { video }
} from "@/slices/tournamentsApiSlice";
import ResponsiveMatchViewer from "@/components/match/ResponsiveMatchViewer";

/* ---------------- helpers ---------------- */
const TYPE_LABEL = (t) => {
  const key = String(t || "").toLowerCase();
  if (key === "roundelim" || key === "round_elim") return "Round Elim";
  if (key === "group") return "Vòng bảng";
  if (key === "po" || key === "playoff") return "Playoff";
  if (key === "knockout" || key === "ko") return "Knockout";
  if (key === "double_elim" || key === "doubleelim") return "Double Elim";
  if (key === "swiss") return "Swiss";
  if (key === "gsl") return "GSL";
  return t || "Khác";
};
const playerName = (p) =>
  p?.fullName || p?.name || p?.nickName || p?.nickname || "—";
const pairLabel = (pair) => {
  if (!pair) return "—";
  if (pair.name) return pair.name;
  const ps = [pair.player1, pair.player2].filter(Boolean).map(playerName);
  return ps.join(" / ") || "—";
};
const matchCode = (m) => m?.code || `R${m?.round ?? "?"}-${m?.order ?? "?"}`;

const StatusPill = ({ status }) => {
  const map = {
    scheduled: { bg: "#e5e7eb", fg: "#111827", label: "Chưa xếp" },
    queued: { bg: "#e0f2fe", fg: "#075985", label: "Trong hàng chờ" },
    assigned: { bg: "#ede9fe", fg: "#5b21b6", label: "Đã gán sân" },
    live: { bg: "#fff7ed", fg: "#9a3412", label: "Đang thi đấu" },
    finished: { bg: "#dcfce7", fg: "#166534", label: "Đã kết thúc" },
  };
  const v = map[status] || {
    bg: "#e5e7eb",
    fg: "#111827",
    label: status || "—",
  };
  return (
    <View
      style={{
        backgroundColor: v.bg,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
      }}
    >
      <Text style={{ color: v.fg, fontSize: 12 }}>{v.label}</Text>
    </View>
  );
};
const typeOrderWeight = (t) => {
  const k = String(t || "").toLowerCase();
  if (k === "group") return 1;
  if (k === "po" || k === "playoff") return 2;
  if (k === "knockout" || k === "ko") return 3;
  return 9;
};

const IconBtn = ({ name, onPress, color = "#111", size = 18, style }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [style, pressed && { opacity: 0.8 }]}
  >
    <MaterialIcons name={name} size={size} color={color} />
  </Pressable>
);

/* ---------------- main ---------------- */
export default function ManageScreen() {
  const { id } = useLocalSearchParams();
  const scheme = useColorScheme() ?? "light";
  const { width } = useWindowDimensions();

  const tint = scheme === "dark" ? "#7cc0ff" : "#0a84ff";
  const bg = scheme === "dark" ? "#0b0d10" : "#f6f8fc";
  const cardBg = scheme === "dark" ? "#16181c" : "#ffffff";
  const border = scheme === "dark" ? "#2e2f33" : "#e4e8ef";
  const text = scheme === "dark" ? "#f7f7f7" : "#111";
  const subtext = scheme === "dark" ? "#c9c9c9" : "#444";

  const me = useSelector((s) => s.auth?.userInfo || null);

  // Queries
  const {
    data: tour,
    isLoading: tourLoading,
    isFetching: tourFetching,
    error: tourErr,
    refetch: refetchTour,
  } = useGetTournamentQuery(id, {
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const {
    data: bracketsData = [],
    isLoading: brLoading,
    isFetching: brFetching,
    error: brErr,
    refetch: refetchBrackets,
  } = useAdminGetBracketsQuery(id, {
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const {
    data: matchPage,
    isLoading: mLoading,
    isFetching: mFetching,
    error: mErr,
    refetch: refetchMatches,
  } = useAdminListMatchesByTournamentQuery(
    { tid: id, page: 1, pageSize: 1000 },
    { refetchOnFocus: true, refetchOnReconnect: true }
  );

  const [setLiveUrl, { isLoading: savingVideo }] =
    useAdminSetMatchLiveUrlMutation();

  // Quyền
  const isAdmin = !!(
    me?.isAdmin ||
    me?.role === "admin" ||
    (Array.isArray(me?.roles) && me.roles.includes("admin"))
  );
  const isManager = useMemo(() => {
    if (!me?._id || !tour) return false;
    if (String(tour.createdBy) === String(me._id)) return true;
    if (Array.isArray(tour.managers)) {
      return tour.managers.some((m) => String(m?.user ?? m) === String(me._id));
    }
    return !!tour?.isManager;
  }, [tour, me]);
  const canManage = isAdmin || isManager;

  // Tabs động theo type
  const typesAvailable = useMemo(() => {
    const uniq = new Map();
    (bracketsData || []).forEach((b) => {
      const t = (b?.type || "").toString().toLowerCase();
      if (!t) return;
      if (!uniq.has(t))
        uniq.set(t, {
          type: t,
          label: TYPE_LABEL(t),
          weight: typeOrderWeight(t),
        });
    });
    if (uniq.size === 0)
      uniq.set("group", { type: "group", label: "Vòng bảng", weight: 1 });
    return Array.from(uniq.values()).sort((a, b) => a.weight - b.weight);
  }, [bracketsData]);

  const [tab, setTab] = useState(typesAvailable[0]?.type || "group");
  useEffect(() => {
    if (!typesAvailable.find((t) => t.type === tab)) {
      setTab(typesAvailable[0]?.type || "group");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typesAvailable]);

  // Lọc/sort
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState("time"); // "round" | "order" | "time"
  const [sortDir, setSortDir] = useState("asc"); // ⬅️ mặc định TĂNG DẦN

  const allMatches = matchPage?.list || [];

  const filterSortMatches = useCallback(
    (list) => {
      const kw = q.trim().toLowerCase();
      const filtered = list
        .filter((m) => {
          if (!kw) return true;
          const text = [
            matchCode(m),
            pairLabel(m?.pairA),
            pairLabel(m?.pairB),
            m?.status,
            m?.video,
          ]
            .join(" ")
            .toLowerCase();
          return text.includes(kw);
        })
        .sort((a, b) => {
          const dir = sortDir === "asc" ? 1 : -1;
          if (sortKey === "order") {
            if ((a?.order ?? 0) !== (b?.order ?? 0))
              return ((a?.order ?? 0) - (b?.order ?? 0)) * dir;
            if ((a?.round ?? 0) !== (b?.round ?? 0))
              return ((a?.round ?? 0) - (b?.round ?? 0)) * dir;
            const ta = new Date(a?.scheduledAt || a?.createdAt || 0).getTime();
            const tb = new Date(b?.scheduledAt || b?.createdAt || 0).getTime();
            return (ta - tb) * dir;
          }
          if (sortKey === "time") {
            const ta = new Date(a?.scheduledAt || a?.createdAt || 0).getTime();
            const tb = new Date(b?.scheduledAt || b?.createdAt || 0).getTime();
            if (ta !== tb) return (ta - tb) * dir;
            if ((a?.round ?? 0) !== (b?.round ?? 0))
              return ((a?.round ?? 0) - (b?.round ?? 0)) * dir;
            return ((a?.order ?? 0) - (b?.order ?? 0)) * dir;
          }
          // default round
          if ((a?.round ?? 0) !== (b?.round ?? 0))
            return ((a?.round ?? 0) - (b?.round ?? 0)) * dir;
          if ((a?.order ?? 0) !== (b?.order ?? 0))
            return ((a?.order ?? 0) - (b?.order ?? 0)) * dir;
          const ta = new Date(a?.scheduledAt || a?.createdAt || 0).getTime();
          const tb = new Date(b?.scheduledAt || b?.createdAt || 0).getTime();
          return (ta - tb) * dir;
        });
      return filtered;
    },
    [q, sortKey, sortDir]
  );

  // Viewer
  const [viewer, setViewer] = useState({ open: false, matchId: null });
  const openMatch = (mid) => setViewer({ open: true, matchId: mid });
  const closeMatch = () => setViewer({ open: false, matchId: null });

  // Video dialog
  const [videoDlg, setVideoDlg] = useState({
    open: false,
    match: null,
    url: "",
  });
  const openVideoDlg = (m) =>
    setVideoDlg({ open: true, match: m, url: m?.video || "" });
  const closeVideoDlg = () =>
    setVideoDlg({ open: false, match: null, url: "" });

  const onSaveVideo = async () => {
    try {
      if (!videoDlg.match?._id) return;
      await setLiveUrl({
        matchId: videoDlg.match._id,
        video: videoDlg.url || "",
      }).unwrap();
      closeVideoDlg();
      RNAlert.alert(
        "Thành công",
        videoDlg.url ? "Đã gán link video" : "Đã xoá link video"
      );
      refetchMatches();
    } catch (e) {
      RNAlert.alert(
        "Lỗi",
        e?.data?.message || e?.error || "Không lưu được link video"
      );
    }
  };

  // Refresh
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await Promise.all([refetchTour(), refetchBrackets(), refetchMatches()]);
    } finally {
      setRefreshing(false);
    }
  };

  // Guards
  const isInitialLoading = tourLoading || brLoading || mLoading;
  const hasError = tourErr || brErr || mErr;

  // Brackets theo tab
  const bracketsOfTab = useMemo(() => {
    const list = (bracketsData || []).filter(
      (b) => String(b?.type || "").toLowerCase() === String(tab).toLowerCase()
    );
    return list.sort((a, b) => {
      if ((a?.stage ?? 0) !== (b?.stage ?? 0))
        return (a?.stage ?? 0) - (b?.stage ?? 0);
      if ((a?.order ?? 0) !== (b?.order ?? 0))
        return (a?.order ?? 0) - (b?.order ?? 0);
      return new Date(a?.createdAt || 0) - new Date(b?.createdAt || 0);
    });
  }, [bracketsData, tab]);

  /* ----------- small UI ----------- */
  const Pill = ({ label, kind = "default" }) => {
    const map = {
      default: { bg: "#eef2f7", fg: "#263238" },
      primary: { bg: "#e0f2fe", fg: "#075985" },
    };
    const st = map[kind] || map.default;
    return (
      <View
        style={{
          backgroundColor: st.bg,
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 8,
        }}
      >
        <Text style={{ color: st.fg, fontSize: 12 }}>{label}</Text>
      </View>
    );
  };

  const MiniChipBtn = ({ icon, label, onPress, color = tint }) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.miniBtn,
        { borderColor: color, paddingHorizontal: 10, paddingVertical: 6 },
        pressed && { opacity: 0.9 },
      ]}
    >
      <MaterialIcons name={icon} size={16} color={color} />
      <Text
        style={{ color, fontSize: 12, fontWeight: "700" }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );

  const VideoPill = ({ has }) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          backgroundColor: has ? "#dcfce7" : "#eef2f7",
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 999,
        }}
      >
        <MaterialIcons
          name="videocam"
          size={14}
          color={has ? "#166534" : "#263238"}
        />
        <Text style={{ color: has ? "#166534" : "#263238", fontSize: 12 }}>
          Video
        </Text>
      </View>
    </View>
  );

  const ActionButtons = ({ m }) => {
    const has = !!m?.video;
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.actionsWrap}
      >
        {has && (
          <MiniChipBtn
            icon="open-in-new"
            label="Mở"
            onPress={() =>
              Linking.openURL(m.video).catch(() =>
                RNAlert.alert("Lỗi", "Không mở được liên kết.")
              )
            }
          />
        )}
        <MiniChipBtn
          icon="edit"
          label={has ? "Sửa" : "Thêm"}
          onPress={() => openVideoDlg(m)}
        />
        {has && (
          <MiniChipBtn
            icon="link-off"
            label="Xoá"
            color="#ef4444"
            onPress={() => setVideoDlg({ open: true, match: m, url: "" })}
          />
        )}
      </ScrollView>
    );
  };

  /* ----------- row render ----------- */
  const renderMatchRow = ({ item: m }) => {
    const hasVideo = !!m?.video;
    return (
      <Pressable
        onPress={() => openMatch(m._id)}
        style={({ pressed }) => [
          styles.matchRow,
          { borderColor: border, backgroundColor: cardBg },
          pressed && { opacity: 0.95 },
        ]}
      >
        {/* HÀNG 1: Cụm action buttons (một hàng) */}
        <ActionButtons m={m} />

        {/* HÀNG 2: Nội dung trận */}
        <View style={styles.contentBlock}>
          <Text
            style={[styles.code, { color: text }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {matchCode(m)}
          </Text>
          <Text style={{ color: text }} numberOfLines={1} ellipsizeMode="tail">
            {pairLabel(m?.pairA)}
          </Text>
          <Text style={{ color: text }} numberOfLines={1} ellipsizeMode="tail">
            {pairLabel(m?.pairB)}
          </Text>

          <View style={styles.metaRow}>
            <StatusPill status={m?.status} />
            <Text style={{ color: subtext, fontSize: 12 }}>
              Vòng {m?.round ?? "—"} • Thứ tự {m?.order ?? "—"}
            </Text>
            <VideoPill has={hasVideo} />
          </View>
        </View>
      </Pressable>
    );
  };

  const renderBracket = ({ item: b }) => {
    const bid = String(b?._id);
    const matches = allMatches.filter((m) => {
      const mid = m?.bracket?._id || m?.bracket;
      return String(mid) === bid;
    });
    const list = filterSortMatches(matches);

    return (
      <View
        style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
            flexWrap: "wrap",
          }}
        >
          <Text
            style={[styles.bracketTitle, { color: text }]}
            numberOfLines={1}
          >
            {b?.name || "Bracket"}
          </Text>
          <Pill label={TYPE_LABEL(b?.type)} />
          {typeof b?.stage === "number" ? (
            <Pill label={`Stage ${b.stage}`} />
          ) : null}
          <Pill label={`${list.length} trận`} kind="primary" />
        </View>

        {list.length === 0 ? (
          <View style={[styles.emptyBox, { borderColor: border }]}>
            <Text style={{ color: subtext }}>Chưa có trận nào.</Text>
          </View>
        ) : (
          <FlatList
            data={list}
            keyExtractor={(m) => String(m._id)}
            renderItem={renderMatchRow}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            scrollEnabled={false}
            extraData={`${sortKey}|${sortDir}|${q}`}
          />
        )}
      </View>
    );
  };

  /* ----------- guards ----------- */
  if (isInitialLoading) {
    return (
      <>
        <Stack.Screen
          options={{ title: "Quản lý giải", headerTitleAlign: "center" }}
        />
        <View style={[styles.center, { backgroundColor: bg }]}>
          <ActivityIndicator size="large" color={tint} />
        </View>
      </>
    );
  }
  if (hasError) {
    return (
      <>
        <Stack.Screen
          options={{ title: "Quản lý giải", headerTitleAlign: "center" }}
        />
        <View style={[styles.screen, { backgroundColor: bg }]}>
          <View
            style={[
              styles.alert,
              { borderColor: "#ef4444", backgroundColor: "#fee2e2" },
            ]}
          >
            <Text style={{ color: "#991b1b" }}>
              {tourErr?.data?.message ||
                brErr?.data?.message ||
                mErr?.data?.message ||
                "Lỗi tải dữ liệu"}
            </Text>
          </View>
        </View>
      </>
    );
  }
  if (!canManage) {
    return (
      <>
        <Stack.Screen
          options={{
            title: `Quản lý giải: ${tour?.name || ""}`,
            headerTitleAlign: "center",
          }}
        />
        <View style={[styles.screen, { backgroundColor: bg }]}>
          <View
            style={[
              styles.alert,
              { borderColor: "#f59e0b", backgroundColor: "#fffbeb" },
            ]}
          >
            <Text style={{ color: "#92400e" }}>
              Bạn không có quyền truy cập trang này.
            </Text>
          </View>
          <View style={{ marginTop: 12 }}>
            <BtnOutline onPress={() => router.push(`/tournament/${id}`)}>
              Quay lại trang giải
            </BtnOutline>
          </View>
        </View>
      </>
    );
  }

  /* ----------- render ----------- */
  return (
    <>
      <Stack.Screen
        options={{
          title: `Quản lý giải: ${tour?.name || ""}`,
          headerTitleAlign: "center",
        }}
      />

      <View style={[styles.screen, { backgroundColor: bg }]}>
        {/* Action row */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <Text
            style={{ color: text, fontSize: 18, fontWeight: "700" }}
            numberOfLines={1}
          >
            {tour?.name || "Giải đấu"}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <BtnOutline onPress={() => router.push(`/tournament/${id}`)}>
              Trang giải
            </BtnOutline>
            <BtnPrimary onPress={() => router.push(`/tournament/${id}/draw`)}>
              Bốc thăm
            </BtnPrimary>
          </View>
        </View>

        {/* Controls */}
        <View
          style={[
            styles.toolbar,
            { borderColor: border, backgroundColor: cardBg },
          ]}
        >
          <View style={[styles.inputWrap, { borderColor: border }]}>
            <MaterialIcons name="search" size={18} color={subtext} />
            <TextInput
              style={[styles.input, { color: text }]}
              placeholder="Tìm trận, cặp đấu, link…"
              placeholderTextColor="#9aa0a6"
              value={q}
              onChangeText={setQ}
            />
          </View>

          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <PickerChip
              label={`Sắp xếp: ${
                sortKey === "time"
                  ? "Thời gian"
                  : sortKey === "order"
                  ? "Thứ tự"
                  : "Vòng"
              }`}
              onPress={() =>
                setSortKey((k) =>
                  k === "time" ? "round" : k === "round" ? "order" : "time"
                )
              }
              icon="sort"
            />
            <PickerChip
              label={`Chiều: ${sortDir === "asc" ? "Tăng" : "Giảm"}`}
              onPress={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              icon={sortDir === "asc" ? "arrow-upward" : "arrow-downward"}
            />
            <Pill
              label={`${bracketsOfTab.length} bracket • ${TYPE_LABEL(tab)}`}
            />
          </View>
        </View>

        {/* Tabs động */}
        <View style={[styles.tabs, { borderColor: border }]}>
          {typesAvailable.map((t) => {
            const active = t.type === tab;
            return (
              <Pressable
                key={t.type}
                onPress={() => setTab(t.type)}
                style={({ pressed }) => [
                  styles.tabItem,
                  {
                    backgroundColor: active ? tint : "transparent",
                    borderColor: active ? tint : border,
                  },
                  pressed && { opacity: 0.95 },
                ]}
              >
                <Text
                  style={{ color: active ? "#fff" : text, fontWeight: "700" }}
                >
                  {TYPE_LABEL(t.type)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* List brackets */}
        <FlatList
          data={bracketsOfTab}
          keyExtractor={(b) => String(b._id)}
          renderItem={renderBracket}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          refreshing={refreshing || tourFetching || brFetching || mFetching}
          onRefresh={onRefresh}
          contentContainerStyle={{ paddingBottom: 24 }}
          ListEmptyComponent={
            <View
              style={[
                styles.alert,
                { borderColor: "#0284c7", backgroundColor: "#e0f2fe" },
              ]}
            >
              <Text style={{ color: "#075985" }}>
                Chưa có bracket thuộc loại {TYPE_LABEL(tab)}.
              </Text>
            </View>
          }
        />
      </View>

      {/* Modal gán link video */}
      <Modal
        visible={videoDlg.open}
        transparent
        animationType="fade"
        onRequestClose={closeVideoDlg}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={{ flex: 1 }} onPress={closeVideoDlg} />
          <View
            style={[
              styles.modalCard,
              { backgroundColor: cardBg, borderColor: border },
            ]}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <Text style={{ color: text, fontWeight: "700", fontSize: 16 }}>
                {(videoDlg?.match &&
                  (videoDlg.match.code || matchCode(videoDlg.match))) ||
                  ""}{" "}
                — Link video
              </Text>
              <IconBtn
                name="close"
                color={text}
                size={20}
                onPress={closeVideoDlg}
              />
            </View>

            <View style={[styles.inputWrap, { borderColor: border }]}>
              <MaterialIcons name="link" size={18} color={subtext} />
              <TextInput
                style={[styles.input, { color: text }]}
                placeholder="URL video (YouTube/Facebook/TikTok/M3U8…)"
                placeholderTextColor="#9aa0a6"
                autoCapitalize="none"
                autoCorrect={false}
                value={videoDlg.url}
                onChangeText={(v) => setVideoDlg((s) => ({ ...s, url: v }))}
              />
            </View>
            <Text style={{ color: subtext, fontSize: 12, marginTop: 4 }}>
              Dán link live hoặc VOD. Để trống rồi Lưu để xoá link.
            </Text>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 12,
              }}
            >
              <BtnOutline onPress={closeVideoDlg}>Huỷ</BtnOutline>
              <BtnPrimary onPress={onSaveVideo} disabled={savingVideo}>
                {savingVideo
                  ? "Đang lưu…"
                  : videoDlg.url
                  ? "Lưu link"
                  : "Xoá link"}
              </BtnPrimary>
            </View>
          </View>
          <Pressable style={{ flex: 1 }} onPress={closeVideoDlg} />
        </View>
      </Modal>

      {/* Viewer */}
      {viewer.open && (
        <ResponsiveMatchViewer
          open={viewer.open}
          matchId={viewer.matchId}
          onClose={closeMatch}
        />
      )}
    </>
  );
}

/* ---------------- small UI ---------------- */
function BtnPrimary({ onPress, children, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: disabled ? "#94a3b8" : "#0a84ff" },
        pressed && !disabled && { opacity: 0.9 },
      ]}
    >
      <Text style={{ color: "#fff", fontWeight: "700" }}>{children}</Text>
    </Pressable>
  );
}
function BtnOutline({ onPress, children }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        styles.btnOutline,
        pressed && { opacity: 0.95 },
      ]}
    >
      <Text style={{ color: "#0a84ff", fontWeight: "700" }}>{children}</Text>
    </Pressable>
  );
}
function PickerChip({ label, onPress, icon }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          backgroundColor: "#eef2f7",
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 999,
        },
        pressed && { opacity: 0.9 },
      ]}
    >
      {icon ? <MaterialIcons name={icon} size={16} color="#263238" /> : null}
      <Text style={{ color: "#263238", fontSize: 12, fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );
}

/* ---------------- styles ---------------- */
const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  tabs: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 12,
    padding: 4,
    gap: 8,
    marginBottom: 12,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },

  toolbar: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    gap: 10,
  },
  inputWrap: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: Platform.select({ ios: 10, android: 8 }),
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: { flex: 1, fontSize: 15 },

  card: { borderWidth: 1, borderRadius: 14, padding: 12 },
  bracketTitle: { fontSize: 16, fontWeight: "700" },

  /* match row */
  matchRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  actionsWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 4,
  },
  contentBlock: {
    marginTop: 8,
    gap: 2,
  },
  metaRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginTop: 6,
    flexWrap: "wrap",
  },

  code: { fontWeight: "700", marginBottom: 4 },

  btn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  btnOutline: {
    borderWidth: 1,
    borderColor: "#0a84ff",
    backgroundColor: "transparent",
  },
  miniBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
  },

  alert: { borderWidth: 1, borderRadius: 12, padding: 12, marginVertical: 8 },
  emptyBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 560,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
});
