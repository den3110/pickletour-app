// components/clubs/ClubFinanceRN.tsx
import React, { useState } from "react";
import {
  View,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from "react-native";
import { TextInput } from "@/components/ui/i18nTextInput";
import { Text } from "@/components/ui/i18nText";
import dayjs from "dayjs";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { Section, EmptyState } from "./ui";
import {
  useListTransactionsQuery,
  useFinanceSummaryQuery,
  useCreateTransactionMutation,
  useUpdateTransactionMutation,
  useDeleteTransactionMutation,
  useGetDuesConfigQuery,
  useSetDuesConfigMutation,
  useGetDuesPeriodQuery,
  useGetMyDuesQuery,
  usePayDuesMutation,
  useUnpayDuesMutation,
} from "@/slices/clubsApiSlice";

const getApiErrMsg = (e: any) =>
  e?.data?.message ||
  e?.error ||
  (typeof e?.data === "string" ? e.data : "Có lỗi xảy ra.");
const fmtVnd = (n: any) => `${Number(n || 0).toLocaleString("vi-VN")} ₫`;
const INCOME_CATS = ["Phí thành viên", "Tài trợ", "Bán đồ", "Ủng hộ", "Khác"];
const EXPENSE_CATS = ["Thuê sân", "Mua bóng", "Mua dụng cụ", "Giải thưởng", "Ăn uống", "Di chuyển", "Sự kiện", "Khác"];
const METHODS: { k: string; l: string }[] = [
  { k: "cash", l: "Tiền mặt" },
  { k: "bank", l: "Ngân hàng" },
  { k: "transfer", l: "Chuyển khoản" },
  { k: "momo", l: "MoMo" },
  { k: "other", l: "Khác" },
];
const methodLabel = (m: string) => METHODS.find((x) => x.k === m)?.l || m;

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

/* ---------------- Dues (phí hội viên) ---------------- */
const PERIOD_OPTS = [
  { k: "monthly", l: "Theo tháng" },
  { k: "quarterly", l: "Theo quý" },
  { k: "yearly", l: "Theo năm" },
];
function duesPeriodKey(date: Date, period: string) {
  const y = date.getFullYear();
  if (period === "yearly") return `${y}`;
  if (period === "quarterly") return `${y}-Q${Math.floor(date.getMonth() / 3) + 1}`;
  return `${y}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function duesPeriodLabel(date: Date, period: string) {
  const y = date.getFullYear();
  if (period === "yearly") return `Năm ${y}`;
  if (period === "quarterly") return `Quý ${Math.floor(date.getMonth() / 3) + 1}/${y}`;
  return `Tháng ${String(date.getMonth() + 1).padStart(2, "0")}/${y}`;
}
function duesStep(date: Date, period: string, dir: number) {
  const d = new Date(date);
  if (period === "yearly") d.setFullYear(d.getFullYear() + dir);
  else if (period === "quarterly") d.setMonth(d.getMonth() + dir * 3);
  else d.setMonth(d.getMonth() + dir);
  return d;
}

function DuesView({ club, canManage }: { club: any; canManage: boolean }) {
  const id = club?._id;
  const { data: cfg } = useGetDuesConfigQuery({ id }, { skip: !id });
  const period = cfg?.period || "monthly";
  const [cursor, setCursor] = useState(new Date());
  const key = duesPeriodKey(cursor, period);

  const { data: periodData, isLoading } = useGetDuesPeriodQuery({ id, key }, { skip: !id || !canManage });
  const { data: mine } = useGetMyDuesQuery({ id }, { skip: !id || canManage });
  const [payDues] = usePayDuesMutation();
  const [unpayDues] = useUnpayDuesMutation();
  const [setCfg] = useSetDuesConfigMutation();

  const [cfgOpen, setCfgOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [cfgPeriod, setCfgPeriod] = useState("monthly");
  const [active, setActive] = useState(false);
  React.useEffect(() => {
    setAmount(String(cfg?.amount || ""));
    setCfgPeriod(cfg?.period || "monthly");
    setActive(!!cfg?.active);
  }, [cfg?.amount, cfg?.period, cfg?.active]);

  const saveCfg = async () => {
    try {
      await setCfg({ id, amount: Number(String(amount).replace(/[^\d]/g, "")) || 0, period: cfgPeriod, active }).unwrap();
      Haptics.selectionAsync();
      setCfgOpen(false);
    } catch (e) {
      Alert.alert("Lỗi", getApiErrMsg(e));
    }
  };

  const items = periodData?.items || [];
  const s = periodData?.summary;

  const Nav = (
    <View style={styles.navRow}>
      <TouchableOpacity onPress={() => setCursor((c) => duesStep(c, period, -1))} style={styles.navBtn}>
        <MaterialCommunityIcons name="chevron-left" size={22} color="#3B3F75" />
      </TouchableOpacity>
      <Text style={styles.navLabel}>{duesPeriodLabel(cursor, period)}</Text>
      <TouchableOpacity onPress={() => setCursor((c) => duesStep(c, period, 1))} style={styles.navBtn}>
        <MaterialCommunityIcons name="chevron-right" size={22} color="#3B3F75" />
      </TouchableOpacity>
    </View>
  );

  if (!canManage) {
    const paidKeys = new Set((mine?.payments || []).map((p: any) => p.periodKey));
    const myPaid = paidKeys.has(key);
    return (
      <View>
        <View style={styles.card}>
          <Text style={{ color: "#5C6285", fontSize: 13.5 }}>
            {cfg?.active
              ? `Phí hội viên: ${fmtVnd(cfg.amount)} / ${(PERIOD_OPTS.find((p) => p.k === cfg.period)?.l || "").replace("Theo ", "")}`
              : "CLB chưa thu phí hội viên."}
          </Text>
        </View>
        {cfg?.active && (
          <>
            {Nav}
            <View style={[styles.card, { alignItems: "center" }]}>
              <Text style={{ fontWeight: "700", color: myPaid ? "#1B7A46" : "#B4232D" }}>
                {myPaid ? `✓ Đã đóng phí ${duesPeriodLabel(cursor, period)}` : `Chưa đóng phí ${duesPeriodLabel(cursor, period)}`}
              </Text>
            </View>
          </>
        )}
      </View>
    );
  }

  return (
    <View>
      {/* Config */}
      <View style={styles.card}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: "#5C6285", fontSize: 13.5, flex: 1 }}>
            {cfg?.active
              ? `Phí: ${fmtVnd(cfg.amount)} / ${(PERIOD_OPTS.find((p) => p.k === cfg.period)?.l || "").replace("Theo ", "")}`
              : "Chưa bật thu phí hội viên"}
          </Text>
          <TouchableOpacity onPress={() => setCfgOpen((v) => !v)}>
            <Text style={{ color: "#667eea", fontWeight: "700" }}>{cfgOpen ? "Đóng" : "Cấu hình"}</Text>
          </TouchableOpacity>
        </View>
        {cfgOpen && (
          <View style={{ marginTop: 10 }}>
            <Text style={styles.label}>Mức phí (₫)</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={(t) => setAmount(t.replace(/[^\d]/g, ""))}
              keyboardType="numeric"
              placeholder="VD: 100000"
              placeholderTextColor="#8A90B2"
            />
            <Text style={styles.label}>Chu kỳ</Text>
            <View style={styles.chipsWrap}>
              {PERIOD_OPTS.map((p) => (
                <TouchableOpacity
                  key={p.k}
                  style={[styles.catChip, cfgPeriod === p.k && styles.catChipActive]}
                  onPress={() => setCfgPeriod(p.k)}
                >
                  <Text style={[styles.catChipText, cfgPeriod === p.k && { color: "#3B3F75" }]}>{p.l}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}
              onPress={() => setActive((v) => !v)}
            >
              <MaterialCommunityIcons
                name={active ? "checkbox-marked" : "checkbox-blank-outline"}
                size={20}
                color={active ? "#667eea" : "#9AA3B2"}
              />
              <Text style={{ color: "#4A5270" }}>Bật thu phí hội viên</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.primaryBtn, { marginTop: 12, alignSelf: "flex-start" }]} onPress={saveCfg}>
              <LinearGradient
                colors={["#667eea", "#764ba2"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <Text style={styles.primaryBtnText}>Lưu</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {!cfg?.active ? (
        <EmptyState label="Chưa bật thu phí hội viên" icon="cash-multiple" />
      ) : (
        <>
          {Nav}
          {s && (
            <View style={styles.statsRow}>
              <StatCard label="Đã đóng" value={`${s.paidCount}/${s.memberCount}`} color="#1B7A46" />
              <StatCard label="Còn nợ" value={`${s.unpaidCount}`} color="#B4232D" />
            </View>
          )}
          {!isLoading && (
            <View style={styles.card}>
              {items.map((it: any, i: number) => (
                <View
                  key={it.user._id}
                  style={[styles.duesRow, i > 0 && { borderTopWidth: 1, borderTopColor: "#EEF1F8" }]}
                >
                  <Text style={styles.duesName} numberOfLines={1}>
                    {it.user.nickname || it.user.fullName || "Người dùng"}
                  </Text>
                  {it.paid ? (
                    <TouchableOpacity
                      style={styles.paidBtn}
                      onPress={() => unpayDues({ id, member: it.user._id, periodKey: key })}
                    >
                      <Text style={styles.paidBtnText}>✓ Đã đóng</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.markBtn}
                      onPress={() =>
                        payDues({ id, member: it.user._id, periodKey: key, amount: cfg?.amount || 0, method: "cash" })
                      }
                    >
                      <Text style={styles.markBtnText}>Đánh dấu đóng</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {items.length === 0 && (
                <Text style={{ color: "#7780A1", fontSize: 13 }}>Chưa có thành viên.</Text>
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
}

function FinanceBookRN({
  club,
  canManage,
}: {
  club: any;
  canManage: boolean;
}) {
  const id = club?._id;
  const isMember = !!club?._my?.isMember;
  const [filterType, setFilterType] = useState("");

  const { data: sum } = useFinanceSummaryQuery({ id }, { skip: !id || !isMember });
  const { data: txData, isLoading } = useListTransactionsQuery(
    { id, limit: 100, type: filterType || undefined },
    { skip: !id || !isMember }
  );
  const [createTx, { isLoading: creating }] = useCreateTransactionMutation();
  const [updateTx, { isLoading: updating }] = useUpdateTransactionMutation();
  const [deleteTx] = useDeleteTransactionMutation();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [type, setType] = useState<"income" | "expense">("income");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState("cash");
  const [occurredAt, setOccurredAt] = useState<Date>(new Date());
  const [showDate, setShowDate] = useState(false);

  const items = txData?.items || [];
  const byCat = sum?.byCategory || [];
  const maxCat = Math.max(1, ...byCat.map((c: any) => c.sum));
  const cats = type === "income" ? INCOME_CATS : EXPENSE_CATS;

  const resetForm = () => {
    setEditId(null);
    setType("income");
    setAmount("");
    setCategory("");
    setDescription("");
    setMethod("cash");
    setOccurredAt(new Date());
    setShowForm(false);
  };
  const startEdit = (t: any) => {
    setEditId(t._id);
    setType(t.type);
    setAmount(String(t.amount || ""));
    setCategory(t.category || "");
    setDescription(t.description || "");
    setMethod(t.method || "cash");
    setOccurredAt(new Date(t.occurredAt));
    setShowForm(true);
  };
  const submit = async () => {
    const amt = Number(String(amount).replace(/[^\d]/g, ""));
    if (!amt || amt <= 0) {
      Alert.alert("Thiếu thông tin", "Nhập số tiền hợp lệ.");
      return;
    }
    const body = {
      type,
      amount: amt,
      category: category.trim(),
      description: description.trim(),
      occurredAt: occurredAt.toISOString(),
      method,
    };
    try {
      if (editId) await updateTx({ id, txId: editId, ...body }).unwrap();
      else await createTx({ id, ...body }).unwrap();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetForm();
    } catch (e) {
      Alert.alert("Lỗi", getApiErrMsg(e));
    }
  };
  const remove = (t: any) =>
    Alert.alert("Xoá giao dịch", "Xoá giao dịch này?", [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Xoá",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteTx({ id, txId: t._id }).unwrap();
          } catch (e) {
            Alert.alert("Lỗi", getApiErrMsg(e));
          }
        },
      },
    ]);

  if (!isMember) {
    return (
      <EmptyState
        label="Tham gia CLB để xem thu chi quỹ"
        icon="wallet-outline"
      />
    );
  }

  return (
    <Section title="Quỹ CLB">
      {/* Tổng quan */}
      <View style={styles.statsRow}>
        <StatCard
          label="Số dư quỹ"
          value={fmtVnd(sum?.balance)}
          color={Number(sum?.balance) < 0 ? "#B4232D" : "#1F2557"}
        />
      </View>
      <View style={styles.statsRow}>
        <StatCard label="Tổng thu" value={fmtVnd(sum?.totalIncome)} color="#1B7A46" />
        <StatCard label="Tổng chi" value={fmtVnd(sum?.totalExpense)} color="#B4232D" />
      </View>

      {/* Filter + thêm */}
      <View style={styles.toolbar}>
        {[
          { k: "", l: "Tất cả" },
          { k: "income", l: "Thu" },
          { k: "expense", l: "Chi" },
        ].map((f) => (
          <TouchableOpacity
            key={f.k}
            onPress={() => setFilterType(f.k)}
            style={[styles.filterChip, filterType === f.k && styles.filterChipActive]}
          >
            <Text style={[styles.filterChipText, filterType === f.k && { color: "#fff" }]}>
              {f.l}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={{ flex: 1 }} />
        {canManage && !showForm && (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => {
              resetForm();
              setShowForm(true);
            }}
          >
            <LinearGradient
              colors={["#667eea", "#764ba2"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <MaterialCommunityIcons name="plus" size={15} color="#fff" />
            <Text style={styles.addBtnText}>Ghi thu/chi</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Form thêm/sửa */}
      {canManage && showForm && (
        <View style={styles.card}>
          <View style={styles.typeToggle}>
            <TouchableOpacity
              style={[styles.typeBtn, type === "income" && { backgroundColor: "#3BA55D" }]}
              onPress={() => setType("income")}
            >
              <Text style={[styles.typeBtnText, type === "income" && { color: "#fff" }]}>+ Khoản thu</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeBtn, type === "expense" && { backgroundColor: "#E05353" }]}
              onPress={() => setType("expense")}
            >
              <Text style={[styles.typeBtnText, type === "expense" && { color: "#fff" }]}>− Khoản chi</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Số tiền (₫)</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^\d]/g, ""))}
            keyboardType="numeric"
            placeholder="VD: 200000"
            placeholderTextColor="#8A90B2"
          />

          <Text style={styles.label}>Ngày</Text>
          <TouchableOpacity style={styles.input} onPress={() => setShowDate(true)}>
            <Text style={{ color: "#1F2557", paddingVertical: 2 }}>
              {dayjs(occurredAt).format("DD/MM/YYYY")}
            </Text>
          </TouchableOpacity>
          <DateTimePickerModal
            isVisible={showDate}
            mode="date"
            date={occurredAt}
            onConfirm={(d) => {
              setOccurredAt(d);
              setShowDate(false);
            }}
            onCancel={() => setShowDate(false)}
          />

          <Text style={styles.label}>Danh mục</Text>
          <TextInput
            style={styles.input}
            value={category}
            onChangeText={setCategory}
            placeholder="Chọn hoặc nhập…"
            placeholderTextColor="#8A90B2"
          />
          <View style={styles.chipsWrap}>
            {cats.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.catChip, category === c && styles.catChipActive]}
                onPress={() => setCategory(c)}
              >
                <Text style={[styles.catChipText, category === c && { color: "#3B3F75" }]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Phương thức</Text>
          <View style={styles.chipsWrap}>
            {METHODS.map((m) => (
              <TouchableOpacity
                key={m.k}
                style={[styles.catChip, method === m.k && styles.catChipActive]}
                onPress={() => setMethod(m.k)}
              >
                <Text style={[styles.catChipText, method === m.k && { color: "#3B3F75" }]}>{m.l}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Mô tả</Text>
          <TextInput
            style={[styles.input, { minHeight: 54, textAlignVertical: "top" }]}
            value={description}
            onChangeText={setDescription}
            multiline
            placeholder="Ghi chú…"
            placeholderTextColor="#8A90B2"
          />

          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <TouchableOpacity style={styles.primaryBtn} onPress={submit} disabled={creating || updating}>
              <LinearGradient
                colors={["#667eea", "#764ba2"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <Text style={styles.primaryBtnText}>{editId ? "Lưu" : "Ghi"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.lightBtn} onPress={resetForm}>
              <Text style={styles.lightBtnText}>Huỷ</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Danh sách giao dịch */}
      {!isLoading && items.length === 0 ? (
        <EmptyState label="Chưa có giao dịch nào" icon="wallet-outline" />
      ) : (
        <View style={styles.card}>
          {items.map((t: any, i: number) => {
            const inc = t.type === "income";
            return (
              <View
                key={t._id}
                style={[styles.txRow, i > 0 && { borderTopWidth: 1, borderTopColor: "#EEF1F8" }]}
              >
                <View style={[styles.txIcon, { backgroundColor: inc ? "#E4F7EC" : "#FFE9EC" }]}>
                  <MaterialCommunityIcons
                    name={inc ? "arrow-up" : "arrow-down"}
                    size={16}
                    color={inc ? "#1B7A46" : "#B4232D"}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.txCat} numberOfLines={1}>
                    {t.category || "Khác"}
                  </Text>
                  <Text style={styles.txMeta} numberOfLines={1}>
                    {dayjs(t.occurredAt).format("DD/MM/YYYY")}
                    {` · ${methodLabel(t.method)}`}
                    {t.description ? ` · ${t.description}` : ""}
                  </Text>
                </View>
                <Text style={[styles.txAmount, { color: inc ? "#1B7A46" : "#B4232D" }]}>
                  {inc ? "+" : "−"}
                  {fmtVnd(t.amount)}
                </Text>
                {canManage && (
                  <View style={{ flexDirection: "row" }}>
                    <TouchableOpacity onPress={() => startEdit(t)} style={{ padding: 4 }}>
                      <MaterialCommunityIcons name="pencil" size={16} color="#9AA3B2" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => remove(t)} style={{ padding: 4 }}>
                      <MaterialCommunityIcons name="trash-can-outline" size={16} color="#B4232D" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Báo cáo theo danh mục */}
      {byCat.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.reportTitle}>Theo danh mục</Text>
          {byCat.slice(0, 10).map((c: any, i: number) => {
            const inc = c.type === "income";
            return (
              <View key={i} style={{ marginTop: 8 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={styles.reportCat}>
                    <Text style={{ color: inc ? "#1B7A46" : "#B4232D", fontWeight: "700" }}>
                      {inc ? "Thu" : "Chi"}
                    </Text>{" "}
                    · {c.category}
                  </Text>
                  <Text style={styles.reportSum}>{fmtVnd(c.sum)}</Text>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={{
                      height: "100%",
                      width: `${(c.sum / maxCat) * 100}%`,
                      backgroundColor: inc ? "#3BA55D" : "#E05353",
                      borderRadius: 999,
                    }}
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Section>
  );
}

export default function ClubFinanceRN({
  club,
  canManage,
}: {
  club: any;
  canManage: boolean;
}) {
  const [view, setView] = useState<"book" | "dues">("book");
  const isMember = !!club?._my?.isMember;
  if (!isMember) {
    return <EmptyState label="Tham gia CLB để xem thu chi quỹ" icon="wallet-outline" />;
  }
  return (
    <View>
      <View style={styles.viewToggle}>
        {[
          { k: "book", l: "Sổ quỹ" },
          { k: "dues", l: "Phí hội viên" },
        ].map((v) => (
          <TouchableOpacity
            key={v.k}
            style={[styles.viewBtn, view === v.k && styles.viewBtnActive]}
            onPress={() => setView(v.k as any)}
          >
            <Text style={[styles.viewBtnText, view === v.k && { color: "#fff" }]}>{v.l}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {view === "book" ? (
        <FinanceBookRN club={club} canManage={canManage} />
      ) : (
        <Section title="Phí hội viên">
          <DuesView club={club} canManage={canManage} />
        </Section>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  viewToggle: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginTop: 8, marginBottom: 4 },
  viewBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#F3F4FF",
    borderWidth: 1,
    borderColor: "#E6E8F5",
  },
  viewBtnActive: { backgroundColor: "#667eea", borderColor: "#667eea" },
  viewBtnText: { color: "#3B3F75", fontWeight: "800", fontSize: 13.5 },

  navRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 8 },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4FF",
    borderWidth: 1,
    borderColor: "#E6E8F5",
  },
  navLabel: { color: "#1F2557", fontWeight: "700", fontSize: 14.5, minWidth: 130, textAlign: "center" },

  duesRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11 },
  duesName: { flex: 1, color: "#1F2557", fontWeight: "600", fontSize: 14 },
  paidBtn: {
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E4F7EC",
    borderWidth: 1,
    borderColor: "#B5E6C9",
  },
  paidBtnText: { color: "#1B7A46", fontWeight: "800", fontSize: 12.5 },
  markBtn: {
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4FF",
    borderWidth: 1,
    borderColor: "#E6E8F5",
  },
  markBtnText: { color: "#3B3F75", fontWeight: "800", fontSize: 12.5 },
  statCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6E8F5",
    borderRadius: 14,
    padding: 12,
  },
  statLabel: { color: "#7780A1", fontSize: 12 },
  statValue: { color: "#1F2557", fontSize: 18, fontWeight: "800", marginTop: 4 },

  toolbar: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 4, marginBottom: 10, flexWrap: "wrap" },
  filterChip: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F3F4FF",
    borderWidth: 1,
    borderColor: "#E6E8F5",
  },
  filterChipActive: { backgroundColor: "#667eea", borderColor: "#667eea" },
  filterChipText: { color: "#3B3F75", fontWeight: "700", fontSize: 13 },
  addBtn: {
    flexDirection: "row",
    gap: 5,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  addBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6E8F5",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  typeToggle: { flexDirection: "row", gap: 8, marginBottom: 10 },
  typeBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#F3F4FF",
    borderWidth: 1,
    borderColor: "#E6E8F5",
  },
  typeBtnText: { color: "#3B3F75", fontWeight: "800", fontSize: 13 },

  label: { color: "#5C6285", fontSize: 12.5, fontWeight: "600", marginTop: 10, marginBottom: 5 },
  input: {
    padding: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E6E8F5",
    backgroundColor: "#F8F9FF",
    color: "#1F2557",
  },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  catChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#F3F4FF",
    borderWidth: 1,
    borderColor: "#E6E8F5",
  },
  catChipActive: { backgroundColor: "#EEF1FF", borderColor: "#667eea" },
  catChipText: { color: "#5C6285", fontSize: 12, fontWeight: "600" },

  primaryBtn: {
    height: 40,
    paddingHorizontal: 20,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  lightBtn: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4FF",
    borderWidth: 1,
    borderColor: "#E6E8F5",
  },
  lightBtnText: { color: "#3B3F75", fontWeight: "800", fontSize: 14 },

  txRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11 },
  txIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  txCat: { color: "#1F2557", fontWeight: "700", fontSize: 14 },
  txMeta: { color: "#7780A1", fontSize: 11.5, marginTop: 1 },
  txAmount: { fontWeight: "800", fontSize: 14 },

  reportTitle: { color: "#1F2557", fontWeight: "800", fontSize: 15 },
  reportCat: { color: "#5C6285", fontSize: 12.5 },
  reportSum: { color: "#3E4466", fontSize: 12.5, fontWeight: "700" },
  barTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: "#EEF1F8",
    overflow: "hidden",
    marginTop: 3,
  },
});
