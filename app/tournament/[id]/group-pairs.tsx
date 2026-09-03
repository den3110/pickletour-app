import { t } from "@/utils/i18n";
// Quản lý cặp trong bảng SAU bốc thăm (mobile) — thêm cặp / chuyển bảng.
import React, { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  View,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Stack, useLocalSearchParams } from "expo-router";
import { useTheme } from "@react-navigation/native";
import {
  useAdminGetBracketsQuery,
  useGetRegistrationsQuery,
  useAddPairToGroupMutation,
  useMovePairBetweenGroupsMutation,
} from "@/slices/tournamentsApiSlice";

const nameOf = (p: any) =>
  (p?.nickName && String(p.nickName).trim()) ||
  (p?.fullName && String(p.fullName).trim()) ||
  "—";
const pairText = (r: any) => {
  if (!r) return "—";
  const a = nameOf(r.player1);
  const b = r.player2 ? nameOf(r.player2) : "";
  return b ? `${a} & ${b}` : a;
};

export default function GroupPairsMobile() {
  const params = useLocalSearchParams();
  const id = String(Array.isArray(params.id) ? params.id[0] : params.id || "");
  const theme: any = useTheme();
  const C = theme.colors;

  const { data: brackets = [], refetch } = useAdminGetBracketsQuery(id, {
    skip: !id,
  });
  const { data: regs = [] } = useGetRegistrationsQuery(id, { skip: !id });
  const [addPair, { isLoading: adding }] = useAddPairToGroupMutation();
  const [movePair, { isLoading: moving }] = useMovePairBetweenGroupsMutation();

  const groupBrackets = useMemo(
    () =>
      (brackets || []).filter((b: any) =>
        ["group", "round_robin", "gsl"].includes(b?.type),
      ),
    [brackets],
  );
  const [bIdx, setBIdx] = useState(0);
  const bracket = groupBrackets[bIdx];
  const groups = bracket?.groups || [];

  const regById = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of regs) m.set(String(r._id), r);
    return m;
  }, [regs]);

  const placed = useMemo(() => {
    const s = new Set<string>();
    for (const g of groups) for (const rid of g.regIds || []) s.add(String(rid));
    return s;
  }, [groups]);
  const unassigned = useMemo(
    () =>
      regs.filter(
        (r: any) =>
          !placed.has(String(r._id)) && (!r.status || r.status === "approved"),
      ),
    [regs, placed],
  );

  const [addFor, setAddFor] = useState<string | null>(null); // groupId
  const [moveFor, setMoveFor] = useState<{ regId: string; from: string } | null>(
    null,
  );

  const doAdd = async (groupId: string, regId: string) => {
    try {
      const res: any = await addPair({
        bracketId: bracket._id,
        groupId,
        regId,
      }).unwrap();
      setAddFor(null);
      refetch();
      Alert.alert("Đã thêm", `Thêm cặp + tạo ${res.created} trận.`);
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Thêm cặp thất bại.");
    }
  };
  const doMove = async (regId: string, toGroupId: string) => {
    try {
      const res: any = await movePair({
        bracketId: bracket._id,
        regId,
        toGroupId,
      }).unwrap();
      setMoveFor(null);
      refetch();
      Alert.alert("Đã chuyển", `Chuyển bảng + tạo ${res.created} trận.`);
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Chuyển bảng thất bại.");
    }
  };

  const busy = adding || moving;

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <Stack.Screen options={{ title: t("Thêm / Chuyển cặp") }} />
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
        {groupBrackets.length === 0 ? (
          <Text style={{ color: C.text, padding: 20, textAlign: "center" }}>
            Giải này không có vòng bảng.
          </Text>
        ) : (
          <>
            {groupBrackets.length > 1 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {groupBrackets.map((b: any, i: number) => {
                  const active = i === bIdx;
                  return (
                    <Pressable
                      key={b._id}
                      onPress={() => setBIdx(i)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        borderRadius: 999,
                        backgroundColor: active ? C.primary : C.card,
                        borderWidth: 1,
                        borderColor: C.border,
                      }}
                    >
                      <Text
                        style={{
                          color: active ? "#fff" : C.text,
                          fontWeight: "700",
                          fontSize: 12,
                        }}
                      >
                        {b.name || `Bracket ${i + 1}`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {busy && <ActivityIndicator color={C.primary} />}

            {groups.map((g: any, gi: number) => (
              <View
                key={g._id}
                style={{
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: C.border,
                  backgroundColor: C.card,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    backgroundColor: "#2563EB",
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "800" }}>
                    {g.name || `Bảng ${gi + 1}`} · {(g.regIds || []).length} cặp
                  </Text>
                  <Pressable
                    onPress={() => setAddFor(String(g._id))}
                    style={{
                      backgroundColor: "rgba(255,255,255,0.2)",
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 8,
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>
                      + Thêm cặp
                    </Text>
                  </Pressable>
                </View>
                <View style={{ padding: 10, gap: 8 }}>
                  {(g.regIds || []).length === 0 && (
                    <Text style={{ color: C.text, opacity: 0.5 }}>(trống)</Text>
                  )}
                  {(g.regIds || []).map((rid: any) => (
                    <View
                      key={String(rid)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Text
                        style={{ flex: 1, color: C.text, fontWeight: "600" }}
                        numberOfLines={1}
                      >
                        {pairText(regById.get(String(rid)))}
                      </Text>
                      <Pressable
                        onPress={() =>
                          setMoveFor({ regId: String(rid), from: String(g._id) })
                        }
                        style={{
                          borderWidth: 1,
                          borderColor: C.border,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 8,
                        }}
                      >
                        <Text style={{ color: C.primary, fontWeight: "700", fontSize: 12 }}>
                          Chuyển bảng
                        </Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* Modal thêm cặp */}
      <PickerModal
        visible={!!addFor}
        title="Chọn cặp chưa gán bảng"
        onClose={() => setAddFor(null)}
        C={C}
        empty="Không còn cặp chưa gán."
        items={unassigned.map((r: any) => ({
          key: String(r._id),
          label: `${pairText(r)}${r?.code ? ` · #${r.code}` : ""}`,
        }))}
        onPick={(key) => addFor && doAdd(addFor, key)}
      />
      {/* Modal chuyển bảng */}
      <PickerModal
        visible={!!moveFor}
        title="Chuyển sang bảng"
        onClose={() => setMoveFor(null)}
        C={C}
        empty="Không có bảng khác."
        items={groups
          .filter((g: any) => String(g._id) !== String(moveFor?.from))
          .map((g: any, i: number) => ({
            key: String(g._id),
            label: `→ ${g.name || `Bảng ${i + 1}`}`,
          }))}
        onPick={(key) => moveFor && doMove(moveFor.regId, key)}
      />
    </View>
  );
}

function PickerModal({
  visible,
  title,
  items,
  onPick,
  onClose,
  empty,
  C,
}: {
  visible: boolean;
  title: string;
  items: { key: string; label: string }[];
  onPick: (key: string) => void;
  onClose: () => void;
  empty: string;
  C: any;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: C.card,
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            maxHeight: "70%",
            paddingBottom: 24,
          }}
        >
          <Text
            style={{
              fontWeight: "800",
              fontSize: 16,
              color: C.text,
              padding: 16,
            }}
          >
            {title}
          </Text>
          <ScrollView>
            {items.length === 0 ? (
              <Text style={{ color: C.text, opacity: 0.6, padding: 16 }}>
                {empty}
              </Text>
            ) : (
              items.map((it) => (
                <Pressable
                  key={it.key}
                  onPress={() => onPick(it.key)}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    borderTopWidth: 1,
                    borderTopColor: C.border,
                  }}
                >
                  <Text style={{ color: C.text, fontWeight: "600" }}>
                    {it.label}
                  </Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
