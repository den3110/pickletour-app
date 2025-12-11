// components/clubs/ClubCreateModal.tsx
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Animated,
  StatusBar as RNStatusBar,
  Keyboard,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";

import TextInput from "@/components/ui/TextInput";
import { Chip } from "@/components/ui/Chip";
import Button from "@/components/ui/Button";

import {
  useCreateClubMutation,
  useUpdateClubMutation,
} from "@/slices/clubsApiSlice";
import { useUploadAvatarMutation } from "@/slices/uploadApiSlice";
import { VN_PROVINCES } from "@/constants/provinces";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { normalizeUrl } from "@/utils/normalizeUri";

type ClubCreateModalProps = {
  visible: boolean;
  onClose: (changed?: boolean) => void;
  onCreated?: (club: any) => void;
  initial?: any;
};

// ... (Giữ nguyên phần OPTIONS và Helpers ở trên, không thay đổi) ...
const VISIBILITY_OPTIONS = ["public", "private", "hidden"] as const;
const VISIBILITY_LABELS: Record<string, string> = {
  public: "Công khai",
  private: "Riêng tư",
  hidden: "Ẩn (không hiển thị)",
};
const VISIBILITY_HINTS: Record<string, string> = {
  public: "Ai cũng tìm thấy & xem trang CLB.",
  private: "Người lạ chỉ thấy thông tin cơ bản.",
  hidden: "Không hiển thị khi tìm kiếm.",
};
const JOIN_POLICY_OPTIONS = ["open", "approval", "invite_only"] as const;
const JOIN_POLICY_LABELS: Record<string, string> = {
  open: "Tự do",
  approval: "Duyệt tham gia",
  invite_only: "Chỉ mời",
};
const JOIN_POLICY_HINTS: Record<string, string> = {
  open: "Bất kỳ ai cũng có thể vào ngay.",
  approval: "Cần admin duyệt.",
  invite_only: "Chỉ admin mới mời được.",
};
const MEMBER_VIS_OPTIONS = [
  { value: "admins", label: "Chỉ quản trị" },
  { value: "members", label: "Thành viên" },
  { value: "public", label: "Mọi người" },
] as const;

function getAllowedJoinPolicies(visibility: string) {
  if (visibility === "hidden") return ["invite_only"] as const;
  if (visibility === "private") return ["approval", "invite_only"] as const;
  return ["open", "approval", "invite_only"] as const;
}

function getAllowedMemberVis(visibility: string) {
  if (visibility === "hidden") return ["admins"] as const;
  if (visibility === "private") return ["admins", "members"] as const;
  return ["admins", "members", "public"] as const;
}

const pickUrl = (res: any) =>
  res?.url || res?.secure_url || res?.data?.url || res?.path || "";

function extractErrorMessage(err: any) {
  if (!err) return "Lỗi không xác định";
  return (
    (err as any)?.data?.message || (err as any)?.message || "Đã xảy ra lỗi"
  );
}

// ================= CONFIG CHIỀU CAO =================
const HEADER_MAX_HEIGHT = 300; // ✅ Cao hơn để thoáng (theo yêu cầu)
// HEADER_MIN_HEIGHT sẽ được tính dynamic theo tai thỏ (inset.top)

export default function ClubCreateModal({
  visible,
  onClose,
  onCreated,
  initial,
}: ClubCreateModalProps) {
  const insets = useSafeAreaInsets();
  // Tính toán vùng an toàn phía trên:
  // Nếu có tai thỏ (insets.top > 20), ta cộng thêm chút padding cho thoáng
  const topPad = Math.max(insets.top, RNStatusBar.currentHeight || 20);

  // Chiều cao khi thu gọn = Padding trên + Chiều cao Navbar (khoảng 60px)
  const HEADER_MIN_HEIGHT = topPad + 60;
  const SCROLL_DISTANCE = HEADER_MAX_HEIGHT - HEADER_MIN_HEIGHT;

  const isEdit = !!initial?._id;
  const [focusField, setFocusField] = useState<string | null>(null);
  const [form, setForm] = useState<any>(() => ({
    name: initial?.name || "",
    description: initial?.description || "",
    sportTypes: initial?.sportTypes || ["pickleball"],
    visibility: initial?.visibility || "public",
    joinPolicy: initial?.joinPolicy || "approval",
    memberVisibility: initial?.memberVisibility || "admins",
    showRolesToMembers: !!initial?.showRolesToMembers,
    province: initial?.province || "",
    city: initial?.city || "",
    shortCode: initial?.shortCode || "",
    logoUrl: initial?.logoUrl || "",
    coverUrl: initial?.coverUrl || "",
  }));

  useEffect(() => {
    if (!visible) return;
    setForm({
      name: initial?.name || "",
      description: initial?.description || "",
      sportTypes: initial?.sportTypes || ["pickleball"],
      visibility: initial?.visibility || "public",
      joinPolicy: initial?.joinPolicy || "approval",
      memberVisibility: initial?.memberVisibility || "admins",
      showRolesToMembers: !!initial?.showRolesToMembers,
      province: initial?.province || "",
      city: initial?.city || "",
      shortCode: initial?.shortCode || "",
      logoUrl: initial?.logoUrl || "",
      coverUrl: initial?.coverUrl || "",
    });
  }, [visible, initial]);

  const [createClub, { isLoading: creating }] = useCreateClubMutation();
  const [updateClub, { isLoading: updating }] = useUpdateClubMutation();
  const [uploadAvatar, { isLoading: uploading }] = useUploadAvatarMutation();

  const canSubmit = useMemo(
    () => (form.name || "").trim().length >= 3,
    [form.name]
  );

  const allowedJoinPolicies = useMemo(
    () => getAllowedJoinPolicies(form.visibility),
    [form.visibility]
  );
  useEffect(() => {
    if (!allowedJoinPolicies.includes(form.joinPolicy)) {
      setForm((f: any) => ({ ...f, joinPolicy: allowedJoinPolicies[0] }));
    }
  }, [allowedJoinPolicies, form.joinPolicy]);

  const allowedMemberVis = useMemo(
    () => getAllowedMemberVis(form.visibility),
    [form.visibility]
  );
  useEffect(() => {
    if (!allowedMemberVis.includes(form.memberVisibility)) {
      setForm((f: any) => ({ ...f, memberVisibility: allowedMemberVis[0] }));
    }
  }, [allowedMemberVis, form.memberVisibility]);

  const pickImage = async (field: "logoUrl" | "coverUrl") => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const rs = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsMultipleSelection: false,
    });
    if (rs.canceled || !rs.assets?.[0]) return;
    const asset = rs.assets[0];
    const file: any = {
      uri: asset.uri,
      name: (asset as any).fileName || `${field}-${Date.now()}.jpg`,
      type: asset.mimeType || "image/jpeg",
    };
    try {
      const res: any = await uploadAvatar(file).unwrap();
      const url = pickUrl(res);
      if (!url) throw new Error("Server không trả URL ảnh");
      setForm((f: any) => ({ ...f, [field]: url }));
    } catch (e) {
      console.warn("Upload error", e);
    }
  };

  const onSubmit = async () => {
    if (!canSubmit || uploading) return;
    const body = { ...form };
    try {
      const res: any = isEdit
        ? await updateClub({ id: initial._id, ...body }).unwrap()
        : await createClub(body).unwrap();
      onCreated?.(res);
      onClose?.(true);
    } catch (err) {
      console.warn("Save club error", extractErrorMessage(err));
    }
  };

  // ==== Province picker ====
  const [showProvincePicker, setShowProvincePicker] = useState(false);

  // ==========================================
  // ==== 🚀 ANIMATION LOGIC (UPDATED) ====
  // ==========================================
  const scrollY = useRef(new Animated.Value(0)).current;

  // 1. Header dịch chuyển lên trên
  const headerTranslateY = scrollY.interpolate({
    inputRange: [0, SCROLL_DISTANCE],
    outputRange: [0, -SCROLL_DISTANCE],
    extrapolate: "clamp",
  });

  // 2. Navbar dịch chuyển xuống dưới để GHIM lại
  const navbarTranslateY = scrollY.interpolate({
    inputRange: [0, SCROLL_DISTANCE],
    outputRange: [0, SCROLL_DISTANCE],
    extrapolate: "clamp",
  });

  // 3. Logo Fade Out: ✅ NÉ NAVBAR
  // Khi scroll được 80% quãng đường, logo sẽ mờ dần về 0 để không đè chữ
  const logoOpacity = scrollY.interpolate({
    inputRange: [0, SCROLL_DISTANCE * 0.6, SCROLL_DISTANCE],
    outputRange: [1, 0.5, 0],
    extrapolate: "clamp",
  });

  // 4. Logo Scale nhẹ
  const logoScale = scrollY.interpolate({
    inputRange: [0, SCROLL_DISTANCE],
    outputRange: [1, 0.8],
    extrapolate: "clamp",
  });

  // 5. Parallax Cover
  const coverTranslateY = scrollY.interpolate({
    inputRange: [0, SCROLL_DISTANCE],
    outputRange: [0, SCROLL_DISTANCE * 0.5],
    extrapolate: "clamp",
  });
  const coverScale = scrollY.interpolate({
    inputRange: [-100, 0],
    outputRange: [2, 1],
    extrapolate: "clamp",
  });

  // 6. Bo góc
  const headerRadius = scrollY.interpolate({
    inputRange: [0, SCROLL_DISTANCE],
    outputRange: [24, 0],
    extrapolate: "clamp",
  });

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: true }
  );

  // Keyboard scroll helper
  const scrollRef = useRef<Animated.ScrollView | null>(null);
  const ensureVisible = useCallback(() => {
    // @ts-ignore
    scrollRef.current?.getNode?.()?.scrollToEnd?.({ animated: true });
  }, []);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => onClose?.(false)}
    >
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <View style={styles.modalRoot}>
        {/* === ANIMATED HEADER === */}
        <Animated.View
          style={[
            styles.headerContainer,
            {
              height: HEADER_MAX_HEIGHT,
              transform: [{ translateY: headerTranslateY }],
              borderBottomLeftRadius: headerRadius,
              borderBottomRightRadius: headerRadius,
            },
          ]}
        >
          {/* Background Gradient */}
          <LinearGradient
            colors={["#667eea", "#764ba2"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          {/* Cover Image Parallax */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                transform: [
                  { translateY: coverTranslateY },
                  { scale: coverScale },
                ],
              },
            ]}
          >
            {form.coverUrl ? (
              <Image
                source={{ uri: normalizeUrl(form.coverUrl) }}
                style={styles.coverImg}
                contentFit="cover"
              />
            ) : (
              <View style={styles.coverPlaceholder}>
                <MaterialCommunityIcons
                  name="image-plus"
                  size={40}
                  color="#ffffff80"
                />
                <Text style={styles.coverHelp}>Ảnh bìa (16:9)</Text>
              </View>
            )}
            <TouchableOpacity
              onPress={() => pickImage("coverUrl")}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>

          {/* Mask loading */}
          {uploading && (
            <View style={styles.uploadMask}>
              <View
                style={{
                  backgroundColor: "rgba(0,0,0,0.6)",
                  padding: 12,
                  borderRadius: 10,
                }}
              >
                <Text style={{ color: "#fff" }}>Đang tải...</Text>
              </View>
            </View>
          )}

          {/* NAVBAR: Buttons & Title (Fixed) */}
          <Animated.View
            style={[
              styles.navBar,
              {
                height: HEADER_MIN_HEIGHT,
                paddingTop: topPad, // ✅ Né tai thỏ
                transform: [{ translateY: navbarTranslateY }],
              },
            ]}
            pointerEvents="box-none"
          >
            <TouchableOpacity
              onPress={() => onClose?.(false)}
              style={styles.iconBtn}
            >
              <MaterialCommunityIcons name="close" size={24} color="#fff" />
            </TouchableOpacity>

            <Text style={styles.headerTitle} numberOfLines={1}>
              {isEdit ? "Sửa CLB" : "Tạo CLB"}
            </Text>

            <TouchableOpacity
              onPress={onSubmit}
              disabled={!canSubmit || creating || updating || uploading}
              style={[
                styles.iconBtn,
                { opacity: !canSubmit || uploading ? 0.5 : 1 },
              ]}
            >
              <MaterialCommunityIcons
                name="content-save"
                size={24}
                color="#fff"
              />
            </TouchableOpacity>
          </Animated.View>

          {/* LOGO: ✅ Fade out khi scroll để né Navbar */}
          <Animated.View
            style={[
              styles.logoWrap,
              {
                opacity: logoOpacity, // Mờ dần
                transform: [{ scale: logoScale }],
              },
            ]}
          >
            <TouchableOpacity
              onPress={() => pickImage("logoUrl")}
              activeOpacity={0.9}
              style={{ flex: 1 }}
            >
              {form.logoUrl ? (
                <Image
                  source={{ uri: normalizeUrl(form.logoUrl) }}
                  style={styles.logoImg}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.logoPlaceholder}>
                  <MaterialCommunityIcons
                    name="camera-plus"
                    size={24}
                    color="#fff"
                  />
                </View>
              )}
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>

        {/* === BODY CONTENT === */}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Animated.ScrollView
            ref={scrollRef as any}
            onScroll={onScroll}
            scrollEventThrottle={16}
            contentContainerStyle={{
              paddingTop: HEADER_MAX_HEIGHT + 20, // Đẩy nội dung xuống dưới Header
              paddingHorizontal: 16,
              paddingBottom: 40,
            }}
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            {/* ... Form inputs ... */}
            <TextInput
              placeholder="Tên CLB *"
              value={form.name}
              onChangeText={(v: string) =>
                setForm((f: any) => ({ ...f, name: v }))
              }
              onFocus={() => setFocusField("name")}
              onBlur={() => setFocusField(null)}
              containerStyle={[
                styles.inputContainer,
                focusField === "name" && styles.inputFocus,
                { marginBottom: 12 },
              ]}
            />
            <TextInput
              placeholder="Mô tả"
              value={form.description}
              onChangeText={(v: string) =>
                setForm((f: any) => ({ ...f, description: v }))
              }
              multiline
              numberOfLines={4}
              onFocus={() => setFocusField("description")}
              onBlur={() => setFocusField(null)}
              containerStyle={[
                styles.inputContainer,
                focusField === "description" && styles.inputFocus,
                { marginBottom: 12 },
              ]}
            />

            {/* Configs */}
            <FieldLabel
              title="Hiển thị"
              subtitle={VISIBILITY_HINTS[form.visibility]}
            />
            <View style={styles.rowWrap}>
              {VISIBILITY_OPTIONS.map((v) => (
                <Chip
                  key={v}
                  label={VISIBILITY_LABELS[v]}
                  selected={form.visibility === v}
                  onPress={() => setForm((f: any) => ({ ...f, visibility: v }))}
                  style={styles.chip}
                />
              ))}
            </View>

            <FieldLabel
              title="Chính sách gia nhập"
              subtitle={JOIN_POLICY_HINTS[form.joinPolicy]}
            />
            <View style={styles.rowWrap}>
              {JOIN_POLICY_OPTIONS.map((jp) => (
                <Chip
                  key={jp}
                  label={JOIN_POLICY_LABELS[jp]}
                  disabled={!allowedJoinPolicies.includes(jp as any)}
                  selected={form.joinPolicy === jp}
                  onPress={() =>
                    allowedJoinPolicies.includes(jp as any) &&
                    setForm((f: any) => ({ ...f, joinPolicy: jp }))
                  }
                  style={styles.chip}
                />
              ))}
            </View>

            <FieldLabel title="Ai được xem thành viên" />
            <View style={styles.rowWrap}>
              {MEMBER_VIS_OPTIONS.map((opt) => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  disabled={!allowedMemberVis.includes(opt.value as any)}
                  selected={form.memberVisibility === opt.value}
                  onPress={() =>
                    allowedMemberVis.includes(opt.value as any) &&
                    setForm((f: any) => ({ ...f, memberVisibility: opt.value }))
                  }
                  style={styles.chip}
                />
              ))}
            </View>

            <View style={[styles.rowBetween, { marginBottom: 14 }]}>
              <Text style={styles.fieldTitle}>Hiện nhãn Admin/Owner</Text>
              <TouchableOpacity
                onPress={() =>
                  setForm((f: any) => ({
                    ...f,
                    showRolesToMembers: !f.showRolesToMembers,
                  }))
                }
                style={[
                  styles.switchBtn,
                  form.showRolesToMembers && styles.switchOn,
                ]}
              >
                <View
                  style={[
                    styles.switchDot,
                    form.showRolesToMembers && styles.switchDotOn,
                  ]}
                />
              </TouchableOpacity>
            </View>

            {/* Address */}
            <FieldLabel title="Địa chỉ" />
            <TouchableOpacity
              onPress={() => setShowProvincePicker(true)}
              activeOpacity={0.8}
              style={{ marginBottom: 10 }}
            >
              <View style={styles.selectInput}>
                <Text
                  style={
                    form.province
                      ? styles.selectValue
                      : styles.selectPlaceholder
                  }
                >
                  {form.province || "Tỉnh/Thành"}
                </Text>
                <MaterialCommunityIcons
                  name="chevron-down"
                  size={20}
                  color="#999"
                />
              </View>
            </TouchableOpacity>
            <TextInput
              placeholder="Quận/Huyện"
              value={form.city}
              onChangeText={(v: string) =>
                setForm((f: any) => ({ ...f, city: v }))
              }
              onFocus={() => {
                setFocusField("city");
                ensureVisible();
              }}
              onBlur={() => setFocusField(null)}
              containerStyle={[
                styles.inputContainer,
                focusField === "city" && styles.inputFocus,
                { marginBottom: 12 },
              ]}
            />
            <TextInput
              placeholder="Mã ngắn (VD: PBC)"
              value={form.shortCode}
              onChangeText={(v: string) =>
                setForm((f: any) => ({ ...f, shortCode: v }))
              }
              onFocus={() => {
                setFocusField("shortCode");
                ensureVisible();
              }}
              onBlur={() => setFocusField(null)}
              autoCapitalize="characters"
              containerStyle={[
                styles.inputContainer,
                focusField === "shortCode" && styles.inputFocus,
              ]}
            />

            <Button
              title={isEdit ? "Lưu" : "Tạo CLB"}
              label={isEdit ? "Lưu" : "Tạo CLB"}
              onPress={onSubmit}
              disabled={!canSubmit || creating || updating || uploading}
              style={{ marginTop: 18, marginBottom: 24 }}
            />
          </Animated.ScrollView>
        </KeyboardAvoidingView>

        {/* Modal Province (Giữ nguyên) */}
        <Modal
          visible={showProvincePicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowProvincePicker(false)}
        >
          <View style={styles.sheetRoot}>
            <TouchableOpacity
              style={styles.sheetBackdrop}
              onPress={() => setShowProvincePicker(false)}
            />
            <View style={styles.sheetCard}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Chọn Tỉnh/Thành</Text>
              <Animated.ScrollView
                contentContainerStyle={{ paddingBottom: 12 }}
              >
                <TouchableOpacity
                  style={styles.sheetItem}
                  onPress={() => {
                    setForm((f: any) => ({ ...f, province: "" }));
                    setShowProvincePicker(false);
                  }}
                >
                  <Text style={styles.sheetItemText}>— Chọn —</Text>
                </TouchableOpacity>
                {VN_PROVINCES.map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.sheetItem,
                      form.province === p && styles.sheetItemActive,
                    ]}
                    onPress={() => {
                      setForm((f: any) => ({ ...f, province: p }));
                      setShowProvincePicker(false);
                      ensureVisible();
                    }}
                  >
                    <Text
                      style={[
                        styles.sheetItemText,
                        form.province === p && styles.sheetItemTextActive,
                      ]}
                    >
                      {p}
                    </Text>
                    {form.province === p && (
                      <MaterialCommunityIcons
                        name="check"
                        size={18}
                        color="#667eea"
                      />
                    )}
                  </TouchableOpacity>
                ))}
              </Animated.ScrollView>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

function FieldLabel({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ marginBottom: subtitle ? 6 : 10 }}>
      <Text style={styles.fieldTitle}>{title}</Text>
      {subtitle ? <Text style={styles.fieldHint}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, backgroundColor: "#f6f7fb" },

  headerContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    overflow: "hidden",
    zIndex: 10,
    backgroundColor: "#667eea",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },

  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    zIndex: 20, // Cao hơn cover
  },

  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.2)", // Nền mờ cho nút để không bị chìm
  },

  coverImg: { width: "100%", height: "100%" },
  coverPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  coverHelp: { color: "#fff", marginTop: 8, fontWeight: "500" },
  uploadMask: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 15,
  },

  logoWrap: {
    position: "absolute",
    left: 20,
    bottom: 20, // Neo ở đáy header
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: "#fff",
    backgroundColor: "#e0e7ff",
    zIndex: 25,
    overflow: "hidden",
    // Shadow cho logo
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  logoImg: { width: "100%", height: "100%" },
  logoPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#667eea",
  },

  // ... (Các styles khác giữ nguyên) ...
  fieldTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#222",
    marginBottom: 6,
  },
  fieldHint: { fontSize: 12, color: "#666" },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: { marginRight: 6, marginBottom: 6 },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  switchBtn: {
    width: 46,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#d1d5db",
    padding: 3,
    alignItems: "flex-start",
  },
  switchOn: { backgroundColor: "#667eea" },
  switchDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  switchDotOn: { alignSelf: "flex-end" },
  selectInput: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#94a3b8",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  selectPlaceholder: { color: "#999" },
  selectValue: { color: "#111", fontWeight: "600" },
  sheetRoot: { flex: 1, justifyContent: "flex-end" },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "#0008" },
  sheetCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "70%",
    paddingBottom: 8,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e5e7eb",
    marginTop: 8,
    marginBottom: 6,
  },
  sheetTitle: {
    textAlign: "center",
    fontWeight: "700",
    fontSize: 16,
    paddingVertical: 8,
    color: "#111",
  },
  sheetItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetItemActive: { backgroundColor: "#eef2ff" },
  sheetItemText: { fontSize: 14, color: "#111" },
  sheetItemTextActive: { color: "#4f46e5", fontWeight: "700" },
  inputContainer: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#94a3b8",
    paddingHorizontal: 12,
    minHeight: 48,
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  inputFocus: {
    borderColor: "#667eea",
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 4,
  },
});
