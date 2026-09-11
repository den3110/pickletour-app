// POS — bán hàng & tồn kho
import React, { useMemo, useState } from "react";
import PtInput from "@/components/ui/PtInput";
import { View, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert, Switch, Modal, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useTheme } from "@react-navigation/native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import {
  useListProductsQuery, useCreateProductMutation, useUpdateProductMutation, useDeleteProductMutation,
  useCreateSaleMutation, useListSalesQuery, useUpdateSaleMutation, useDeleteSaleMutation,
} from "@/slices/venueOwnerApiSlice";
import { useGetVenueQuery } from "@/slices/venuesApiSlice";
import { fmtVND, pal, toDateInput } from "@/utils/courtFormat";
import { saleReceiptHtml, salesReportHtml } from "@/utils/receiptHtml";

export default function ProductsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const { data: venue } = useGetVenueQuery(id, { skip: !id });
  const { data: products, isLoading } = useListProductsQuery(id, { skip: !id });
  const today = toDateInput();
  const { data: sales } = useListSalesQuery({ venueId: id, date: today }, { skip: !id });
  const [createProduct, { isLoading: creating }] = useCreateProductMutation();
  const [updateProduct] = useUpdateProductMutation();
  const [deleteProduct] = useDeleteProductMutation();
  const [createSale, { isLoading: selling }] = useCreateSaleMutation();
  const [updateSale] = useUpdateSaleMutation();
  const [deleteSale] = useDeleteSaleMutation();

  const [editing, setEditing] = useState<any>(null);
  const [editingSale, setEditingSale] = useState<any>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  // Dịch vụ / tiền sân (khách vãng lai) — gộp cùng bill bán hàng.
  const [services, setServices] = useState<Array<{ id: string; name: string; amount: number; qty: number }>>([]);
  const [customerName, setCustomerName] = useState("");
  const [svcModal, setSvcModal] = useState(false);

  const removeSale = (s: any) => {
    Alert.alert("Xoá đơn?", `Đơn ${s.code || ""} · ${fmtVND(s.total)} sẽ bị xoá và hoàn tồn kho.`, [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Xoá", style: "destructive",
        onPress: async () => {
          try { await deleteSale({ venueId: id, saleId: s._id }).unwrap(); }
          catch (e: any) { Alert.alert("Lỗi", e?.data?.message || "Không xoá được đơn"); }
        },
      },
    ]);
  };

  const list = (products || []).filter((p: any) => p.active);
  const cartItems = list.filter((p: any) => cart[p._id] > 0);
  const productTotal = cartItems.reduce((s: number, p: any) => s + p.price * cart[p._id], 0);
  const serviceTotal = services.reduce((s, x) => s + x.amount * x.qty, 0);
  const cartTotal = productTotal + serviceTotal;
  const hasAnything = cartItems.length > 0 || services.length > 0;

  const addService = (name: string, amount: number, qty: number) => {
    setServices((s) => [...s, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name, amount, qty }]);
  };
  const removeService = (sid: string) => setServices((s) => s.filter((x) => x.id !== sid));

  const add = (pid: string) => setCart((c) => ({ ...c, [pid]: (c[pid] || 0) + 1 }));
  const sub = (pid: string) => setCart((c) => { const n = (c[pid] || 0) - 1; const cc = { ...c }; if (n <= 0) delete cc[pid]; else cc[pid] = n; return cc; });

  const venueInfo = { name: venue?.name, address: venue?.address, province: venue?.province, phone: venue?.phone };

  const printReceipt = async (sale: any) => {
    try { await Print.printAsync({ html: saleReceiptHtml(venueInfo, sale) }); }
    catch (e: any) { if (!/cancel/i.test(String(e?.message))) Alert.alert("Lỗi in", e?.message || "Không in được."); }
  };
  const sharePdf = async (html: string, name: string) => {
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: name, UTI: "com.adobe.pdf" });
      else Alert.alert("Đã tạo PDF", uri);
    } catch (e: any) { Alert.alert("Lỗi PDF", e?.message || "Không tạo được PDF."); }
  };

  const checkout = async (method: "cash" | "transfer") => {
    try {
      const sale: any = await createSale({
        venueId: id,
        items: cartItems.map((p: any) => ({ productId: p._id, qty: cart[p._id] })),
        serviceItems: services.map((s) => ({ name: s.name, amount: s.amount, qty: s.qty })),
        customerName: customerName.trim(),
        paymentMethod: method,
      }).unwrap();
      setCart({});
      setServices([]);
      setCustomerName("");
      Alert.alert("Đã thu tiền", `Thu ${fmtVND(sale?.total ?? cartTotal)} (${method === "cash" ? "tiền mặt" : "chuyển khoản"})`, [
        { text: "In hoá đơn", onPress: () => printReceipt(sale) },
        { text: "Lưu PDF", onPress: () => sharePdf(saleReceiptHtml(venueInfo, sale), `HoaDon-${sale?.code || ""}`) },
        { text: "Xong", style: "cancel" },
      ]);
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Thanh toán thất bại");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: "Bán hàng & kho", headerRight: () => (
        <TouchableOpacity onPress={() => setEditing({ new: true })} hitSlop={8}><Ionicons name="add-circle" size={24} color={C.accent} /></TouchableOpacity>
      ) }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: hasAnything ? 210 : 40 }}>
        {sales ? (
          <View style={[styles.todayBar, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.sub, fontSize: 12 }}>Hôm nay</Text>
              <Text style={{ color: C.text, fontWeight: "800" }}>{sales.count} đơn · <Text style={{ color: C.success }}>{fmtVND(sales.total)}</Text></Text>
            </View>
            <TouchableOpacity onPress={() => sharePdf(salesReportHtml(venueInfo, today, sales.items || [], sales.total || 0), `BaoCao-${today}`)} style={[styles.reportBtn, { backgroundColor: C.accentSoft }]}>
              <Ionicons name="document-text-outline" size={15} color={C.accent} /><Text style={{ color: C.accent, fontWeight: "700", fontSize: 12.5 }}>Báo cáo PDF</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Tính tiền khách vãng lai: thêm tiền sân / dịch vụ vào bill */}
        <TouchableOpacity onPress={() => setSvcModal(true)} style={[styles.svcAddBtn, { borderColor: C.accent, backgroundColor: C.accentSoft }]}>
          <Ionicons name="add-circle-outline" size={18} color={C.accent} />
          <Text style={{ color: C.accent, fontWeight: "800" }}>Thêm tiền sân / dịch vụ (khách vãng lai)</Text>
        </TouchableOpacity>
        {services.length > 0 && (
          <View style={{ marginBottom: 12, gap: 6 }}>
            {services.map((s) => (
              <View key={s.id} style={[styles.svcRow, { backgroundColor: C.card, borderColor: C.border }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: C.text, fontWeight: "700" }} numberOfLines={1}>{s.name}</Text>
                  <Text style={{ color: C.sub, fontSize: 12 }}>{fmtVND(s.amount)}{s.qty > 1 ? ` × ${s.qty}` : ""} = {fmtVND(s.amount * s.qty)}</Text>
                </View>
                <TouchableOpacity onPress={() => removeService(s.id)} style={[styles.miniBtn, { backgroundColor: "rgba(239,68,68,0.12)" }]}><Ionicons name="trash-outline" size={16} color="#ef4444" /></TouchableOpacity>
              </View>
            ))}
          </View>
        )}
        {isLoading ? <ActivityIndicator color={C.accent} /> : list.length === 0 ? (
          <Text style={{ color: C.sub, textAlign: "center", marginTop: 20 }}>Chưa có sản phẩm. Bấm + để thêm.</Text>
        ) : list.map((p: any) => {
          const low = p.trackStock && p.stock <= p.lowStockThreshold;
          return (
            <View key={p._id} style={[styles.row, { backgroundColor: C.card, borderColor: C.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontWeight: "700" }}>{p.name}</Text>
                <Text style={{ color: C.sub, fontSize: 12 }}>
                  {fmtVND(p.price)}/{p.unit} · {p.category}
                  {p.trackStock ? ` · tồn ${p.stock}` : " · dịch vụ"}
                  {low ? "  ⚠ sắp hết" : ""}
                </Text>
              </View>
              {cart[p._id] > 0 ? (
                <View style={styles.qtyBox}>
                  <TouchableOpacity onPress={() => sub(p._id)} style={styles.qtyBtn}><Ionicons name="remove" size={16} color={C.text} /></TouchableOpacity>
                  <Text style={{ color: C.text, fontWeight: "800", minWidth: 22, textAlign: "center" }}>{cart[p._id]}</Text>
                  <TouchableOpacity onPress={() => add(p._id)} style={styles.qtyBtn}><Ionicons name="add" size={16} color={C.text} /></TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => add(p._id)} style={[styles.addBtn, { backgroundColor: C.accent }]} disabled={p.trackStock && p.stock <= 0}>
                  <Text style={{ color: C.onAccent, fontWeight: "700", opacity: p.trackStock && p.stock <= 0 ? 0.4 : 1 }}>Chọn</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setEditing(p)} style={{ marginLeft: 10 }}><Ionicons name="create-outline" size={20} color={C.sub} /></TouchableOpacity>
            </View>
          );
        })}

        {/* Lịch sử bán hôm nay */}
        {sales?.items?.length ? (
          <View style={{ marginTop: 18 }}>
            <Text style={{ color: C.sub, fontWeight: "800", fontSize: 12, letterSpacing: 0.6, marginBottom: 8 }}>ĐƠN HÔM NAY</Text>
            {sales.items.map((s: any) => (
              <View key={s._id} style={[styles.saleRow, { backgroundColor: C.card, borderColor: C.border }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: C.text, fontWeight: "700" }} numberOfLines={1}>
                    {s.code} · {fmtVND(s.total)}{s.customerName ? ` · ${s.customerName}` : ""}
                  </Text>
                  <Text style={{ color: C.sub, fontSize: 12 }} numberOfLines={1}>
                    {[
                      (s.items || []).length ? `${(s.items || []).reduce((a: number, b: any) => a + b.qty, 0)} món` : "",
                      (s.serviceItems || []).length ? `${(s.serviceItems || []).length} dịch vụ` : "",
                    ].filter(Boolean).join(" · ")} · {s.paymentMethod === "transfer" ? "CK" : "Tiền mặt"} · {new Date(s.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setEditingSale(s)} style={[styles.miniBtn, { backgroundColor: C.field }]}><Ionicons name="create-outline" size={16} color={C.text} /></TouchableOpacity>
                <TouchableOpacity onPress={() => printReceipt(s)} style={[styles.miniBtn, { backgroundColor: C.accentSoft }]}><Ionicons name="print-outline" size={16} color={C.accent} /></TouchableOpacity>
                <TouchableOpacity onPress={() => sharePdf(saleReceiptHtml(venueInfo, s), `HoaDon-${s.code}`)} style={[styles.miniBtn, { backgroundColor: C.field }]}><Ionicons name="share-outline" size={16} color={C.sub} /></TouchableOpacity>
                <TouchableOpacity onPress={() => removeSale(s)} style={[styles.miniBtn, { backgroundColor: "rgba(239,68,68,0.12)" }]}><Ionicons name="trash-outline" size={16} color="#ef4444" /></TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {/* Giỏ bán / tính tiền */}
      {hasAnything && (
        <View style={[styles.cart, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ color: C.text, fontWeight: "800" }} numberOfLines={1}>
              {cartItems.length > 0 ? `${cartItems.length} món` : ""}
              {cartItems.length > 0 && services.length > 0 ? " · " : ""}
              {services.length > 0 ? `${services.length} dịch vụ` : ""}
              {"  "}<Text style={{ color: C.success }}>{fmtVND(cartTotal)}</Text>
            </Text>
            <TouchableOpacity onPress={() => { setCart({}); setServices([]); setCustomerName(""); }}>
              <Text style={{ color: C.sub, fontWeight: "700", fontSize: 12 }}>Xoá hết</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={[styles.custInput, { backgroundColor: C.field, color: C.text }]}
            value={customerName}
            onChangeText={setCustomerName}
            placeholder="Tên khách vãng lai (tuỳ chọn)"
            placeholderTextColor={C.sub}
          />
          <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
            <TouchableOpacity style={[styles.payBtn, { backgroundColor: C.accent, opacity: selling ? 0.6 : 1 }]} disabled={selling} onPress={() => checkout("cash")}><Text style={{ color: C.onAccent, fontWeight: "800" }}>Thu tiền mặt</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.payBtn, { borderWidth: 1, borderColor: C.accent, opacity: selling ? 0.6 : 1 }]} disabled={selling} onPress={() => checkout("transfer")}><Text style={{ color: C.accent, fontWeight: "800" }}>Chuyển khoản</Text></TouchableOpacity>
          </View>
        </View>
      )}

      <ProductEditor C={C} venueId={id} editing={editing} onClose={() => setEditing(null)} create={createProduct} update={updateProduct} remove={deleteProduct} creating={creating} />
      <SaleEditor C={C} venueId={id} sale={editingSale} onClose={() => setEditingSale(null)} update={updateSale} />
      <ServiceModal C={C} visible={svcModal} onClose={() => setSvcModal(false)} onAdd={addService} />
    </View>
  );
}

// Sửa 1 đơn: chỉnh số lượng từng món (+/- / xoá món), đổi phương thức, ghi chú.
function SaleEditor({ C, venueId, sale, onClose, update }: any) {
  const [lines, setLines] = useState<any[]>([]);
  const [svcLines, setSvcLines] = useState<any[]>([]);
  const [method, setMethod] = useState<"cash" | "transfer">("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (!sale) return;
    setLines((sale.items || []).map((it: any) => ({
      productId: String(it.product),
      name: it.name,
      price: Number(it.price) || 0,
      qty: Number(it.qty) || 1,
    })));
    setSvcLines((sale.serviceItems || []).map((s: any, i: number) => ({
      key: `svc-${i}`,
      name: s.name,
      amount: Number(s.amount) || 0,
      qty: Number(s.qty) || 1,
    })));
    setMethod(sale.paymentMethod === "transfer" ? "transfer" : "cash");
    setNote(sale.note || "");
  }, [sale]);

  const setQty = (pid: string, delta: number) =>
    setLines((ls) =>
      ls
        .map((l) => (l.productId === pid ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0),
    );
  const setSvcQty = (key: string, delta: number) =>
    setSvcLines((ls) =>
      ls.map((l) => (l.key === key ? { ...l, qty: l.qty + delta } : l)).filter((l) => l.qty > 0),
    );
  const removeSvc = (key: string) => setSvcLines((ls) => ls.filter((l) => l.key !== key));

  const total =
    lines.reduce((s, l) => s + l.price * l.qty, 0) +
    svcLines.reduce((s, l) => s + l.amount * l.qty, 0);
  const canSave = lines.length > 0 || svcLines.length > 0;

  const onSave = async () => {
    if (!canSave) { Alert.alert("Đơn phải có ít nhất 1 món hoặc dịch vụ."); return; }
    setSaving(true);
    try {
      await update({
        venueId,
        saleId: sale._id,
        items: lines.map((l) => ({ productId: l.productId, qty: l.qty })),
        serviceItems: svcLines.map((l) => ({ name: l.name, amount: l.amount, qty: l.qty })),
        paymentMethod: method,
        note,
      }).unwrap();
      onClose();
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Không sửa được đơn");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={!!sale} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.modal, { backgroundColor: C.card, maxHeight: "88%" }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <Text style={{ color: C.text, fontWeight: "800", fontSize: 16 }}>Sửa đơn {sale?.code || ""}</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={C.sub} /></TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 320 }}>
            {lines.map((l) => (
              <View key={l.productId} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: C.text, fontWeight: "600" }} numberOfLines={1}>{l.name}</Text>
                  <Text style={{ color: C.sub, fontSize: 12 }}>{fmtVND(l.price)} · {fmtVND(l.price * l.qty)}</Text>
                </View>
                <TouchableOpacity onPress={() => setQty(l.productId, -1)} style={[styles.qtyBtn, { borderColor: C.border }]}><Ionicons name="remove" size={16} color={C.text} /></TouchableOpacity>
                <Text style={{ color: C.text, fontWeight: "800", minWidth: 22, textAlign: "center" }}>{l.qty}</Text>
                <TouchableOpacity onPress={() => setQty(l.productId, 1)} style={[styles.qtyBtn, { borderColor: C.border }]}><Ionicons name="add" size={16} color={C.text} /></TouchableOpacity>
              </View>
            ))}
            {svcLines.map((l) => (
              <View key={l.key} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: C.text, fontWeight: "600" }} numberOfLines={1}>{l.name} <Text style={{ color: C.accent, fontSize: 11 }}>· dịch vụ</Text></Text>
                  <Text style={{ color: C.sub, fontSize: 12 }}>{fmtVND(l.amount)} · {fmtVND(l.amount * l.qty)}</Text>
                </View>
                <TouchableOpacity onPress={() => setSvcQty(l.key, -1)} style={[styles.qtyBtn, { borderColor: C.border }]}><Ionicons name="remove" size={16} color={C.text} /></TouchableOpacity>
                <Text style={{ color: C.text, fontWeight: "800", minWidth: 22, textAlign: "center" }}>{l.qty}</Text>
                <TouchableOpacity onPress={() => setSvcQty(l.key, 1)} style={[styles.qtyBtn, { borderColor: C.border }]}><Ionicons name="add" size={16} color={C.text} /></TouchableOpacity>
                <TouchableOpacity onPress={() => removeSvc(l.key)} style={[styles.miniBtn, { backgroundColor: "rgba(239,68,68,0.12)" }]}><Ionicons name="trash-outline" size={15} color="#ef4444" /></TouchableOpacity>
              </View>
            ))}
            {!canSave && <Text style={{ color: C.sub, paddingVertical: 12 }}>Đã xoá hết — không thể lưu.</Text>}
          </ScrollView>

          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <TouchableOpacity onPress={() => setMethod("cash")} style={[styles.mBtn, { borderWidth: 1, borderColor: method === "cash" ? C.accent : C.border }]}>
              <Text style={{ color: method === "cash" ? C.accent : C.sub, fontWeight: "700" }}>Tiền mặt</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMethod("transfer")} style={[styles.mBtn, { borderWidth: 1, borderColor: method === "transfer" ? C.accent : C.border }]}>
              <Text style={{ color: method === "transfer" ? C.accent : C.sub, fontWeight: "700" }}>Chuyển khoản</Text>
            </TouchableOpacity>
          </View>
          <PtInput style={[styles.input, { backgroundColor: C.field, color: C.text, marginTop: 10 }]} value={note} onChangeText={setNote} placeholder="Ghi chú (tuỳ chọn)" placeholderTextColor={C.sub} />

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
            <Text style={{ color: C.text, fontWeight: "800" }}>Tổng: {fmtVND(total)}</Text>
            <TouchableOpacity onPress={onSave} disabled={saving || !canSave} style={[styles.mBtn, { flex: 0, paddingHorizontal: 28, backgroundColor: C.accent, opacity: saving || !canSave ? 0.6 : 1 }]}>
              <Text style={{ color: C.onAccent, fontWeight: "800" }}>{saving ? "Đang lưu…" : "Lưu"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ProductEditor({ C, venueId, editing, onClose, create, update, remove, creating }: any) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("nước");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("cái");
  const [trackStock, setTrackStock] = useState(true);
  const [stock, setStock] = useState("");

  React.useEffect(() => {
    if (editing && !editing.new) {
      setName(editing.name); setCategory(editing.category); setPrice(String(editing.price));
      setUnit(editing.unit); setTrackStock(editing.trackStock); setStock(String(editing.stock));
    } else if (editing?.new) {
      setName(""); setCategory("nước"); setPrice(""); setUnit("cái"); setTrackStock(true); setStock("");
    }
  }, [editing]);

  const save = async () => {
    if (!name.trim() || !Number(price)) return Alert.alert("Thiếu tên/giá");
    const body = { name: name.trim(), category: category.trim(), price: Number(price), unit: unit.trim(), trackStock, stock: Number(stock) || 0 };
    try {
      if (editing.new) await create({ venueId, ...body }).unwrap();
      else await update({ venueId, productId: editing._id, ...body }).unwrap();
      onClose();
    } catch (e: any) { Alert.alert("Lỗi", e?.data?.message || "Lưu thất bại"); }
  };

  return (
    <Modal visible={!!editing} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={[styles.modal, { backgroundColor: C.card }]} contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Text style={{ color: C.text, fontWeight: "800", fontSize: 16 }}>{editing?.new ? "Thêm sản phẩm" : "Sửa sản phẩm"}</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={C.sub} /></TouchableOpacity>
          </View>
          <PtInput style={[styles.input, { backgroundColor: C.field, color: C.text }]} value={name} onChangeText={setName} placeholder="Tên (vd: Nước suối)" placeholderTextColor={C.sub} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <PtInput style={[styles.input, { backgroundColor: C.field, color: C.text, flex: 1 }]} value={category} onChangeText={setCategory} placeholder="Loại (nước/bóng/thuê)" placeholderTextColor={C.sub} />
            <PtInput style={[styles.input, { backgroundColor: C.field, color: C.text, flex: 1 }]} value={unit} onChangeText={setUnit} placeholder="Đơn vị" placeholderTextColor={C.sub} />
          </View>
          <PtInput style={[styles.input, { backgroundColor: C.field, color: C.text }]} value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="Giá (đ)" placeholderTextColor={C.sub} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: 8 }}>
            <Text style={{ color: C.text }}>Quản lý tồn kho</Text>
            <Switch value={trackStock} onValueChange={setTrackStock} trackColor={{ true: C.accent, false: "#94a3b8" }} thumbColor="#fff" />
          </View>
          {trackStock && <PtInput style={[styles.input, { backgroundColor: C.field, color: C.text }]} value={stock} onChangeText={setStock} keyboardType="numeric" placeholder="Tồn kho hiện tại" placeholderTextColor={C.sub} />}
          <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
            {!editing?.new && <TouchableOpacity style={[styles.mBtn, { borderWidth: 1, borderColor: "#ef4444" }]} onPress={() => { remove({ venueId, productId: editing._id }); onClose(); }}><Text style={{ color: "#ef4444", fontWeight: "700" }}>Xoá</Text></TouchableOpacity>}
            <TouchableOpacity style={[styles.mBtn, { backgroundColor: C.accent, opacity: creating ? 0.6 : 1 }]} disabled={creating} onPress={save}><Text style={{ color: C.onAccent, fontWeight: "800" }}>Lưu</Text></TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Modal thêm dòng dịch vụ / tiền sân cho hoá đơn khách vãng lai.
function ServiceModal({ C, visible, onClose, onAdd }: any) {
  const [name, setName] = useState("Tiền sân");
  const [amount, setAmount] = useState("");
  const [qty, setQty] = useState("1");

  React.useEffect(() => {
    if (visible) { setName("Tiền sân"); setAmount(""); setQty("1"); }
  }, [visible]);

  const PRESETS = ["Tiền sân", "Thuê vợt", "Thuê bóng", "Dịch vụ khác"];

  const submit = () => {
    const a = Math.max(0, Number(String(amount).replace(/[^\d]/g, "")) || 0);
    const q = Math.max(1, Number(qty) || 1);
    if (a <= 0) { Alert.alert("Nhập số tiền dịch vụ (> 0)."); return; }
    onAdd(String(name || "Dịch vụ").trim(), a, q);
    onClose();
  };

  return (
    <Modal visible={!!visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.modal, { backgroundColor: C.card }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <Text style={{ color: C.text, fontWeight: "800", fontSize: 16 }}>Thêm tiền sân / dịch vụ</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={C.sub} /></TouchableOpacity>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {PRESETS.map((p) => (
              <TouchableOpacity key={p} onPress={() => setName(p)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: name === p ? C.accent : C.border }}>
                <Text style={{ color: name === p ? C.accent : C.sub, fontWeight: "700", fontSize: 12.5 }}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={[styles.input, { backgroundColor: C.field, color: C.text }]} value={name} onChangeText={setName} placeholder="Tên dịch vụ" placeholderTextColor={C.sub} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <PtInput style={[styles.input, { backgroundColor: C.field, color: C.text, flex: 2 }]} value={amount} onChangeText={setAmount} placeholder="Số tiền (đ)" placeholderTextColor={C.sub} keyboardType="numeric" />
            <PtInput style={[styles.input, { backgroundColor: C.field, color: C.text, flex: 1 }]} value={qty} onChangeText={setQty} placeholder="SL/giờ" placeholderTextColor={C.sub} keyboardType="numeric" />
          </View>
          <TouchableOpacity onPress={submit} style={[styles.mBtn, { backgroundColor: C.accent, marginTop: 4 }]}>
            <Text style={{ color: C.onAccent, fontWeight: "800" }}>Thêm vào bill</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  todayBar: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 12, marginBottom: 12 },
  svcAddBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderRadius: 14, paddingVertical: 12, marginBottom: 12 },
  svcRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 10 },
  custInput: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  reportBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  saleRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 12, marginBottom: 8 },
  miniBtn: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, marginBottom: 10 },
  addBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 },
  qtyBox: { flexDirection: "row", alignItems: "center", gap: 4 },
  qtyBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: "rgba(148,163,184,0.2)", alignItems: "center", justifyContent: "center" },
  cart: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 14, paddingBottom: 28, borderTopWidth: 1 },
  payBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: "center" },
  modalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(2,6,23,0.6)" },
  modal: { padding: 20, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingBottom: 36, maxHeight: "88%" },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 10 },
  mBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: "center" },
});
