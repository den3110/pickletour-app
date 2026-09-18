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
  useGetTournamentQuery,
  useAddPairToGroupMutation,
  useMovePairBetweenGroupsMutation,
} from "@/slices/tournamentsApiSlice";
import {
  useListMlpTeamsQuery,
  usePatchMlpTeamPoolMutation,
  useGenerateMlpDualsMutation,
} from "@/slices/mlpApiSlice";

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

  const { data: tournament } = useGetTournamentQuery(id, { skip: !id });
  const isMlpTour =
    String((tournament as any)?.tournamentMode || "").toLowerCase() === "mlp";
  const { data: brackets = [], refetch } = useAdminGetBracketsQuery(id, {
    skip: !id || isMlpTour,
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
      <Stack.Screen options={{ title: t(isMlpTour ? "Thêm / Chuyển đội" : "Thêm / Chuyển cặp") }} />
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
        {isMlpTour ? (
          <MlpTeamPoolsSection tourId={id} C={C} />
        ) : groupBrackets.length === 0 ? (
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


/* ================== MLP Teams Pool Section ================== */
function MlpTeamPoolsSection({ tourId, C }: { tourId: string; C: any }) {
  const { data: teamsResp, refetch } = useListMlpTeamsQuery(
    { tourId, status: "approved" },
    { skip: !tourId },
  );
  const teams: any[] = Array.isArray((teamsResp as any)?.items)
    ? (teamsResp as any).items
    : [];
  const [patchPool, { isLoading: patching }] = usePatchMlpTeamPoolMutation();
  const [genDuals, { isLoading: genning }] = useGenerateMlpDualsMutation();

  const poolMap = React.useMemo(() => {
    const m: Record<string, any[]> = {};
    for (const t of teams) {
      const k = t.poolKey || "__none__";
      (m[k] = m[k] || []).push(t);
    }
    return m;
  }, [teams]);
  const poolKeys = Object.keys(poolMap)
    .filter((k) => k !== "__none__")
    .sort();
  const unassigned = poolMap["__none__"] || [];

  const [target, setTarget] = useState<{ teamId: string; fromKey: string | null } | null>(null);
  const [genDirty, setGenDirty] = useState(false);

  const doMove = async (teamId: string, poolKey: string | null) => {
    try {
      await patchPool({ tourId, teamId, poolKey }).unwrap();
      setTarget(null);
      setGenDirty(true);
      refetch();
      Alert.alert("Đã chuyển", poolKey ? `Đội đã vào Bảng ${poolKey}.` : "Đội đã rời bảng.");
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Chuyển bảng thất bại.");
    }
  };
  const doGen = async () => {
    try {
      await genDuals(tourId).unwrap();
      setGenDirty(false);
      Alert.alert("OK", "Đã sinh lại lịch dual matches.");
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Sinh lại dual thất bại.");
    }
  };

  const nextPoolKey =
    poolKeys.length === 0
      ? "A"
      : String.fromCharCode(65 + poolKeys.length);
  const allChoices: string[] = poolKeys.includes(nextPoolKey)
    ? poolKeys
    : [...poolKeys, nextPoolKey];

  return (
    <View style={{ gap: 12 }}>
      {genDirty ? (
        <Pressable
          onPress={doGen}
          disabled={genning}
          style={{
            padding: 12,
            borderRadius: 10,
            backgroundColor: "#F59E0B",
            alignItems: "center",
          }}
        >
          {genning ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontWeight: "800" }}>
              Sinh lại lịch dual matches (áp dụng thay đổi)
            </Text>
          )}
        </Pressable>
      ) : null}

      {poolKeys.map((k) => {
        const list = poolMap[k] || [];
        return (
          <View
            key={k}
            style={{
              backgroundColor: C.card,
              borderRadius: 12,
              padding: 12,
              borderWidth: 1,
              borderColor: C.border,
            }}
          >
            <Text style={{ color: C.text, fontWeight: "800", marginBottom: 8 }}>
              Bảng {k} ({list.length})
            </Text>
            {list.map((tm: any) => (
              <View
                key={tm._id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: C.border,
                }}
              >
                <Text style={{ flex: 1, color: C.text }} numberOfLines={1}>
                  {tm.name}
                </Text>
                <Pressable
                  onPress={() => setTarget({ teamId: tm._id, fromKey: k })}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 8,
                    backgroundColor: "#0066FF",
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>
                    Chuyển
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        );
      })}

      {/* Unassigned teams */}
      <View
        style={{
          backgroundColor: C.card,
          borderRadius: 12,
          padding: 12,
          borderWidth: 1,
          borderColor: C.border,
        }}
      >
        <Text style={{ color: C.text, fontWeight: "800", marginBottom: 8 }}>
          Chưa gán bảng ({unassigned.length})
        </Text>
        {unassigned.length === 0 ? (
          <Text style={{ color: C.text, opacity: 0.6 }}>
            Tất cả đội đã có bảng.
          </Text>
        ) : (
          unassigned.map((tm: any) => (
            <View
              key={tm._id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 8,
                borderBottomWidth: 1,
                borderBottomColor: C.border,
              }}
            >
              <Text style={{ flex: 1, color: C.text }} numberOfLines={1}>
                {tm.name}
              </Text>
              <Pressable
                onPress={() => setTarget({ teamId: tm._id, fromKey: null })}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 8,
                  backgroundColor: "#10B981",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>
                  Thêm vào bảng
                </Text>
              </Pressable>
            </View>
          ))
        )}
      </View>

      {/* Modal chọn bảng đích */}
      <Modal
        visible={!!target}
        transparent
        animationType="fade"
        onRequestClose={() => setTarget(null)}
      >
        <Pressable
          onPress={() => setTarget(null)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{ backgroundColor: C.card, borderRadius: 12, padding: 16, gap: 8 }}
          >
            <Text style={{ color: C.text, fontWeight: "800", fontSize: 15, marginBottom: 4 }}>
              Chọn bảng đích
            </Text>
            {allChoices.map((k) => (
              <Pressable
                key={k}
                onPress={() => target && doMove(target.teamId, k)}
                disabled={patching || target?.fromKey === k}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: target?.fromKey === k ? C.border : "#0066FF",
                  alignItems: "center",
                  opacity: target?.fromKey === k ? 0.5 : 1,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "800" }}>
                  {k === nextPoolKey && !poolKeys.includes(k)
                    ? `Tạo Bảng ${k} mới`
                    : `Bảng ${k}`}
                  {target?.fromKey === k ? " (hiện tại)" : ""}
                </Text>
              </Pressable>
            ))}
            {target?.fromKey ? (
              <Pressable
                onPress={() => target && doMove(target.teamId, null)}
                disabled={patching}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: "#EF4444",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#EF4444", fontWeight: "800" }}>
                  Rời bảng (Chưa gán)
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => setTarget(null)}
              style={{ padding: 10, alignItems: "center" }}
            >
              <Text style={{ color: C.text }}>Đóng</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
