// components/clubs/ClubPollsRN.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from "react-native";
import { TextInput } from "@/components/ui/i18nTextInput";
import { Text } from "@/components/ui/i18nText";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Section, ProgressBar, EmptyState } from "./ui";
import {
  useListPollsQuery,
  useCreatePollMutation,
  useVotePollMutation,
  useClosePollMutation,
  useDeletePollMutation,
} from "@/slices/clubsApiSlice";

const getApiErrMsg = (e: any) =>
  e?.data?.message ||
  e?.error ||
  (typeof e?.data === "string" ? e.data : "Có lỗi xảy ra.");

/* ---------- Card nền sáng phủ gradient tím rất nhẹ ---------- */
function GradLightCard({
  children,
  style,
  pad = 12,
}: {
  children: React.ReactNode;
  style?: any;
  pad?: number;
}) {
  return (
    <View style={[styles.card, style]}>
      <LinearGradient
        colors={["rgba(102,126,234,0.06)", "rgba(118,75,162,0.06)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={{ padding: pad }}>{children}</View>
    </View>
  );
}

function SmallPrimaryGradBtn({
  title,
  onPress,
  loading,
}: {
  title: string;
  onPress?: () => void;
  loading?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      disabled={loading}
      style={styles.smallBtn}
    >
      <LinearGradient
        colors={["#667eea", "#764ba2"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <Text style={styles.smallBtnText}>{loading ? "Đang xử lý…" : title}</Text>
    </TouchableOpacity>
  );
}

function SmallLightBtn({
  title,
  onPress,
  loading,
}: {
  title: string;
  onPress?: () => void;
  loading?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      disabled={loading}
      style={styles.smallLightBtn}
    >
      <Text style={styles.smallLightText}>
        {loading ? "Đang xử lý…" : title}
      </Text>
    </TouchableOpacity>
  );
}

function SmallDangerGhostBtn({
  title,
  onPress,
  loading,
}: {
  title: string;
  onPress?: () => void;
  loading?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      disabled={loading}
      style={styles.smallDangerBtn}
    >
      <Text style={styles.smallDangerText}>
        {loading ? "Đang xử lý…" : title}
      </Text>
    </TouchableOpacity>
  );
}

/* ---------- 1 khảo sát ---------- */
function PollItem({
  clubId,
  poll,
  canManage,
  onRefetch,
}: {
  clubId: string;
  poll: any;
  canManage: boolean;
  onRefetch: () => void;
}) {
  const [vote, { isLoading: voting }] = useVotePollMutation();
  const [closePoll, { isLoading: closing }] = useClosePollMutation();
  const [deletePoll] = useDeletePollMutation();

  const closed = !!poll.closesAt && new Date(poll.closesAt) < new Date();
  const people = Number(poll.voterCount || 0);
  const myOptionIds: string[] = poll.myOptionIds || [];
  const voted = myOptionIds.length > 0;

  // lựa chọn cục bộ cho poll nhiều đáp án
  const [sel, setSel] = useState<Set<string>>(new Set(myOptionIds));
  useEffect(() => setSel(new Set(myOptionIds)), [poll.myOptionIds]);

  const submitVote = async (optionIds: string[]) => {
    if (!optionIds.length) return;
    try {
      await vote({ id: clubId, pollId: poll._id, optionIds }).unwrap();
      Haptics.selectionAsync();
      onRefetch();
    } catch (e) {
      Alert.alert("Lỗi", getApiErrMsg(e));
    }
  };

  const onTapOption = (oid: string) => {
    if (closed) return;
    if (poll.multiple) {
      setSel((prev) => {
        const next = new Set(prev);
        if (next.has(oid)) next.delete(oid);
        else next.add(oid);
        return next;
      });
    } else {
      submitVote([oid]);
    }
  };

  const confirmClose = () =>
    Alert.alert("Đóng khảo sát", "Đóng khảo sát này? Sẽ không nhận thêm phiếu.", [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Đóng",
        style: "destructive",
        onPress: async () => {
          try {
            await closePoll({ id: clubId, pollId: poll._id }).unwrap();
            Haptics.selectionAsync();
            onRefetch();
          } catch (e) {
            Alert.alert("Lỗi", getApiErrMsg(e));
          }
        },
      },
    ]);

  const confirmDelete = () =>
    Alert.alert("Xoá khảo sát", "Xoá khảo sát này? Toàn bộ phiếu sẽ bị xoá.", [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Xoá",
        style: "destructive",
        onPress: async () => {
          try {
            await deletePoll({ id: clubId, pollId: poll._id }).unwrap();
            Haptics.selectionAsync();
            onRefetch();
          } catch (e) {
            Alert.alert("Lỗi", getApiErrMsg(e));
          }
        },
      },
    ]);

  return (
    <GradLightCard style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={[styles.title, { flex: 1 }]}>
          {poll.question || poll.title}
        </Text>
        {poll.multiple && (
          <View style={styles.tag}>
            <Text style={styles.tagText}>Nhiều lựa chọn</Text>
          </View>
        )}
      </View>
      <Text style={styles.subMeta}>{people} người đã bình chọn</Text>

      {(poll.options || []).map((opt: any) => {
        const oid = opt.id || opt._id;
        const votes = poll.results?.[oid] ?? opt.votes ?? 0;
        const picked = poll.multiple ? sel.has(oid) : myOptionIds.includes(oid);
        const isMyVote = myOptionIds.includes(oid);

        return (
          <TouchableOpacity
            key={oid}
            activeOpacity={0.9}
            disabled={closed || voting}
            onPress={() => onTapOption(oid)}
            style={[styles.option, picked && styles.optionPicked]}
          >
            <View style={styles.optionHead}>
              <MaterialCommunityIcons
                name={
                  poll.multiple
                    ? picked
                      ? "checkbox-marked"
                      : "checkbox-blank-outline"
                    : picked
                      ? "radiobox-marked"
                      : "radiobox-blank"
                }
                size={18}
                color={picked ? "#667eea" : "#9AA3B2"}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.optionText,
                  isMyVote && { fontWeight: "800", color: "#2D3561" },
                ]}
              >
                {opt.text}
              </Text>
            </View>
            <ProgressBar progress={people ? votes / people : 0} />
            <Text style={styles.countText}>
              {people ? Math.round((votes / people) * 100) : 0}% • {votes} phiếu
            </Text>
          </TouchableOpacity>
        );
      })}

      {/* Nút gửi cho poll nhiều đáp án */}
      {poll.multiple && !closed && (
        <View style={{ marginTop: 10 }}>
          <SmallPrimaryGradBtn
            title={voted ? "Đổi phiếu" : "Gửi bình chọn"}
            loading={voting}
            onPress={() => submitVote([...sel])}
          />
        </View>
      )}

      {voted && !closed && (
        <Text style={styles.votedHint}>Bạn đã bình chọn</Text>
      )}

      {canManage && (
        <View style={styles.adminRow}>
          {!closed && (
            <SmallLightBtn
              title="Đóng"
              loading={closing}
              onPress={confirmClose}
            />
          )}
          <SmallDangerGhostBtn title="Xoá" onPress={confirmDelete} />
        </View>
      )}

      {closed && <Text style={styles.closedText}>ĐÃ KẾT THÚC</Text>}
    </GradLightCard>
  );
}

/* ---------- Main ---------- */
export default function ClubPollsRN({
  club,
  canManage,
}: {
  club: any;
  canManage: boolean;
}) {
  const clubId = club?._id;

  const { data, isLoading, isFetching, refetch } = useListPollsQuery(
    { id: clubId },
    { skip: !clubId }
  );

  const [createPoll, { isLoading: creating }] = useCreatePollMutation();

  // ----- Tạo khảo sát -----
  const [title, setTitle] = useState<string>("");
  const [opts, setOpts] = useState<string[]>(["", ""]);
  const [multiple, setMultiple] = useState<boolean>(false);

  const addOption = () => setOpts((o) => [...o, ""]);
  const changeOpt = (i: number, v: string) =>
    setOpts((o) => o.map((x, idx) => (idx === i ? v : x)));

  const submit = async () => {
    const options = opts.map((s) => s.trim()).filter(Boolean);
    if (!title.trim() || options.length < 2) {
      Alert.alert("Thiếu thông tin", "Nhập tiêu đề và ít nhất 2 lựa chọn.");
      return;
    }
    try {
      await createPoll({
        id: clubId,
        title: title.trim(),
        options,
        multiple,
      }).unwrap();
      setTitle("");
      setOpts(["", ""]);
      setMultiple(false);
      Haptics.selectionAsync();
      refetch();
    } catch (e) {
      Alert.alert("Lỗi", getApiErrMsg(e));
    }
  };

  const items = useMemo(() => data?.items || [], [data]);

  return (
    <Section title="Khảo sát" subtitle={isFetching ? "Đang tải…" : undefined}>
      {/* ====== Form tạo khảo sát (quyền quản lý) ====== */}
      {canManage && (
        <GradLightCard style={{ marginBottom: 10 }}>
          <Text style={styles.title}>Tạo khảo sát</Text>

          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Tiêu đề khảo sát"
            placeholderTextColor="#8A90B2"
            style={styles.input}
          />

          {opts.map((v, i) => (
            <TextInput
              key={i}
              value={v}
              onChangeText={(t) => changeOpt(i, t)}
              placeholder={`Lựa chọn #${i + 1}`}
              placeholderTextColor="#8A90B2"
              style={[styles.input, { marginTop: 8 }]}
            />
          ))}

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setMultiple((v) => !v)}
            style={styles.checkRow}
          >
            <MaterialCommunityIcons
              name={multiple ? "checkbox-marked" : "checkbox-blank-outline"}
              size={20}
              color={multiple ? "#667eea" : "#9AA3B2"}
            />
            <Text style={styles.checkLabel}>Cho phép chọn nhiều phương án</Text>
          </TouchableOpacity>

          <View style={styles.actionsRow}>
            <SmallLightBtn title="Thêm lựa chọn" onPress={addOption} />
            <SmallPrimaryGradBtn
              title={creating ? "Đang tạo…" : "Tạo khảo sát"}
              loading={creating}
              onPress={submit}
            />
          </View>
        </GradLightCard>
      )}

      {/* ====== Danh sách khảo sát ====== */}
      {items.map((p: any) => (
        <PollItem
          key={p._id}
          clubId={clubId}
          poll={p}
          canManage={canManage}
          onRefetch={refetch}
        />
      ))}

      {!isLoading && !isFetching && items.length === 0 && (
        <EmptyState label="Chưa có khảo sát" icon="poll" />
      )}
    </Section>
  );
}

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6E8F5",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 3,
  },

  title: { color: "#1F2557", fontWeight: "800", fontSize: 16 },
  subMeta: { color: "#7780A1", marginTop: 4, fontSize: 12 },

  input: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E6E8F5",
    backgroundColor: "#F8F9FF",
    color: "#1F2557",
  },

  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  checkLabel: { color: "#4A5270", fontWeight: "600" },

  actionsRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 12,
  },

  option: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E6E8F5",
    backgroundColor: "#F8F9FF",
  },
  optionPicked: {
    borderColor: "#667eea",
    backgroundColor: "#EEF1FF",
  },
  optionHead: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  optionText: { color: "#3E4466", fontWeight: "600", flex: 1 },
  countText: { color: "#5C6285", marginTop: 4, fontSize: 12 },

  votedHint: { color: "#7780A1", fontSize: 12, marginTop: 8 },

  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#EEF1FF",
    borderWidth: 1,
    borderColor: "#D6DCFB",
  },
  tagText: { color: "#4E56A6", fontSize: 11, fontWeight: "700" },

  adminRow: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },

  smallBtn: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  smallBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },

  smallLightBtn: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4FF",
    borderWidth: 1,
    borderColor: "#E6E8F5",
  },
  smallLightText: { color: "#3B3F75", fontWeight: "800", fontSize: 13 },

  smallDangerBtn: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFE9EC",
    borderWidth: 1,
    borderColor: "#FFD5DA",
  },
  smallDangerText: { color: "#B4232D", fontWeight: "800", fontSize: 13 },

  closedText: {
    color: "#6E728B",
    fontSize: 12,
    marginTop: 8,
    fontWeight: "700",
  },
});
