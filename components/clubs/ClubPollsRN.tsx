// components/clubs/ClubPollsRN.tsx
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  StyleSheet,
} from "react-native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Section, ProgressBar, EmptyState } from "./ui";
import {
  useListPollsQuery,
  useCreatePollMutation,
  useVotePollMutation,
  useClosePollMutation,
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

/* ---------- Buttons (phù hợp nền sáng) ---------- */
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
        {loading ? "Đang kết thúc…" : title}
      </Text>
    </TouchableOpacity>
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
  const [vote, { isLoading: voting }] = useVotePollMutation();
  const [closePoll, { isLoading: closing }] = useClosePollMutation();

  // ----- Tạo khảo sát -----
  const [title, setTitle] = useState<string>("");
  const [opts, setOpts] = useState<string[]>(["", ""]);

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
      await createPoll({ id: clubId, title: title.trim(), options }).unwrap();
      setTitle("");
      setOpts(["", ""]);
      Haptics.selectionAsync();
      Alert.alert("Thành công", "Đã tạo khảo sát.");
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
      {items.map((p: any) => {
        const total = (p.options || []).reduce(
          (a: number, b: any) => a + (p.results?.[b.id || b._id] || 0),
          0
        );
        const closed = !!p.closedAt;

        return (
          <GradLightCard key={p._id} style={{ marginBottom: 10 }}>
            <Text style={styles.title}>{p.title || p.question}</Text>

            {(p.options || []).map((opt: any) => {
              const oid = opt.id || opt._id;
              const votes = p.results?.[oid] || opt.votes || 0;

              return (
                <TouchableOpacity
                  key={oid}
                  activeOpacity={0.9}
                  disabled={closed || voting}
                  onPress={async () => {
                    try {
                      await vote({
                        id: clubId,
                        pollId: p._id,
                        optionIds: [oid],
                      }).unwrap();
                      Haptics.selectionAsync();
                      refetch();
                    } catch (e) {
                      Alert.alert("Lỗi", getApiErrMsg(e));
                    }
                  }}
                  style={styles.option}
                >
                  <Text style={styles.optionText}>{opt.text}</Text>
                  <ProgressBar progress={total ? votes / total : 0} />
                  <Text style={styles.countText}>
                    {votes} / {total}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {canManage && !closed && (
              <View style={{ marginTop: 8 }}>
                <SmallDangerGhostBtn
                  title="Kết thúc khảo sát"
                  loading={closing}
                  onPress={() => {
                    Alert.alert(
                      "Xác nhận",
                      "Kết thúc khảo sát này?",
                      [
                        { text: "Huỷ", style: "cancel" },
                        {
                          text: "Kết thúc",
                          style: "destructive",
                          onPress: async () => {
                            try {
                              await closePoll({
                                id: clubId,
                                pollId: p._id,
                              }).unwrap();
                              Haptics.selectionAsync();
                              refetch();
                            } catch (e) {
                              Alert.alert("Lỗi", getApiErrMsg(e));
                            }
                          },
                        },
                      ],
                      { cancelable: true }
                    );
                  }}
                />
              </View>
            )}

            {closed && <Text style={styles.closedText}>ĐÃ KẾT THÚC</Text>}
          </GradLightCard>
        );
      })}

      {!isLoading && !isFetching && items.length === 0 && (
        <EmptyState label="Chưa có khảo sát" icon="poll-off" />
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

  input: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E6E8F5",
    backgroundColor: "#F8F9FF",
    color: "#1F2557",
  },

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
  optionText: { color: "#3E4466", marginBottom: 6, fontWeight: "600" },
  countText: { color: "#5C6285", marginTop: 4, fontSize: 12 },

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
