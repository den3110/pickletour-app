// POS — bán hàng & tồn kho
import React, { useMemo, useState } from "react";
import { View, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert, Switch, Modal, ActivityIndicator } from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useTheme } from "@react-navigation/native";
import {
  useListProductsQuery, useCreateProductMutation, useUpdateProductMutation, useDeleteProductMutation,
  useCreateSaleMutation, useListSalesQuery,
} from "@/slices/venueOwnerApiSlice";
import { fmtVND, pal, toDateInput } from "@/utils/courtFormat";

export default function ProductsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const { data: products, isLoading } = useListProductsQuery(id, { skip: !id });
  const { data: sales } = useListSalesQuery({ venueId: id, date: toDateInput() }, { skip: !id });
  const [createProduct, { isLoading: creating }] = useCreateProductMutation();
  const [updateProduct] = useUpdateProductMutation();
  const [deleteProduct] = useDeleteProductMutation();
  const [createSale, { isLoading: selling }] = useCreateSaleMutation();

  const [editing, setEditing] = useState<any>(null);
  const [cart, setCart] = useState<Record<string, number>>({});

  const list = (products || []).filter((p: any) => p.active);
  const cartItems = list.filter((p: any) => cart[p._id] > 0);
  const cartTotal = cartItems.reduce((s: number, p: any) => s + p.price * cart[p._id], 0);

  const add = (pid: string) => setCart((c) => ({ ...c, [pid]: (c[pid] || 0) + 1 }));
  const sub = (pid: string) => setCart((c) => { const n = (c[pid] || 0) - 1; const cc = { ...c }; if (n <= 0) delete cc[pid]; else cc[pid] = n; return cc; });

  const checkout = async (method: "cash" | "transfer") => {
    try {
      await createSale({ venueId: id, items: cartItems.map((p: any) => ({ productId: p._id, qty: cart[p._id] })), paymentMethod: method }).unwrap();
      setCart({});
      Alert.alert("Đã bán", `Thu ${fmtVND(cartTotal)} (${method === "cash" ? "tiền mặt" : "chuyển khoản"})`);
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Bán hàng thất bại");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: "Bán hàng & kho", headerRight: () => (
        <TouchableOpacity onPress={() => setEditing({ new: true })} hitSlop={8}><Ionicons name="add-circle" size={24} color={C.accent} /></TouchableOpacity>
      ) }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: cartItems.length ? 130 : 40 }}>
        {sales ? <Text style={{ color: C.sub, marginBottom: 10 }}>Hôm nay: {sales.count} đơn · thu {fmtVND(sales.total)}</Text> : null}
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
      </ScrollView>

      {/* Giỏ bán */}
      {cartItems.length > 0 && (
        <View style={[styles.cart, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={{ color: C.text, fontWeight: "800", marginBottom: 8 }}>{cartItems.length} món · {fmtVND(cartTotal)}</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity style={[styles.payBtn, { borderWidth: 1, borderColor: C.border }]} onPress={() => setCart({})}><Text style={{ color: C.sub, fontWeight: "700" }}>Xoá</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.payBtn, { backgroundColor: C.accent, opacity: selling ? 0.6 : 1 }]} disabled={selling} onPress={() => checkout("cash")}><Text style={{ color: C.onAccent, fontWeight: "800" }}>Thu tiền mặt</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.payBtn, { borderWidth: 1, borderColor: C.accent, opacity: selling ? 0.6 : 1 }]} disabled={selling} onPress={() => checkout("transfer")}><Text style={{ color: C.accent, fontWeight: "800" }}>CK</Text></TouchableOpacity>
          </View>
        </View>
      )}

      <ProductEditor C={C} venueId={id} editing={editing} onClose={() => setEditing(null)} create={createProduct} update={updateProduct} remove={deleteProduct} creating={creating} />
    </View>
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
      <View style={styles.modalWrap}>
        <View style={[styles.modal, { backgroundColor: C.card }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Text style={{ color: C.text, fontWeight: "800", fontSize: 16 }}>{editing?.new ? "Thêm sản phẩm" : "Sửa sản phẩm"}</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={C.sub} /></TouchableOpacity>
          </View>
          <TextInput style={[styles.input, { backgroundColor: C.field, color: C.text }]} value={name} onChangeText={setName} placeholder="Tên (vd: Nước suối)" placeholderTextColor={C.sub} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TextInput style={[styles.input, { backgroundColor: C.field, color: C.text, flex: 1 }]} value={category} onChangeText={setCategory} placeholder="Loại (nước/bóng/thuê)" placeholderTextColor={C.sub} />
            <TextInput style={[styles.input, { backgroundColor: C.field, color: C.text, flex: 1 }]} value={unit} onChangeText={setUnit} placeholder="Đơn vị" placeholderTextColor={C.sub} />
          </View>
          <TextInput style={[styles.input, { backgroundColor: C.field, color: C.text }]} value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="Giá (đ)" placeholderTextColor={C.sub} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: 8 }}>
            <Text style={{ color: C.text }}>Quản lý tồn kho</Text>
            <Switch value={trackStock} onValueChange={setTrackStock} trackColor={{ true: C.accent, false: "#94a3b8" }} thumbColor="#fff" />
          </View>
          {trackStock && <TextInput style={[styles.input, { backgroundColor: C.field, color: C.text }]} value={stock} onChangeText={setStock} keyboardType="numeric" placeholder="Tồn kho hiện tại" placeholderTextColor={C.sub} />}
          <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
            {!editing?.new && <TouchableOpacity style={[styles.mBtn, { borderWidth: 1, borderColor: "#ef4444" }]} onPress={() => { remove({ venueId, productId: editing._id }); onClose(); }}><Text style={{ color: "#ef4444", fontWeight: "700" }}>Xoá</Text></TouchableOpacity>}
            <TouchableOpacity style={[styles.mBtn, { backgroundColor: C.accent, opacity: creating ? 0.6 : 1 }]} disabled={creating} onPress={save}><Text style={{ color: C.onAccent, fontWeight: "800" }}>Lưu</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, marginBottom: 10 },
  addBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 },
  qtyBox: { flexDirection: "row", alignItems: "center", gap: 4 },
  qtyBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: "rgba(148,163,184,0.2)", alignItems: "center", justifyContent: "center" },
  cart: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 14, paddingBottom: 28, borderTopWidth: 1 },
  payBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: "center" },
  modalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(2,6,23,0.6)" },
  modal: { padding: 20, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingBottom: 36 },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 10 },
  mBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: "center" },
});
