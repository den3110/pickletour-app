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
  SafeAreaView,
  ActivityIndicator,
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

// ====== Options ======
const SPORT_OPTIONS = ["pickleball"];

const VISIBILITY_OPTIONS = ["public", "private", "hidden"] as const;
const VISIBILITY_LABELS: Record<string, string> = {
  public: "Công khai",
  private: "Riêng tư",
  hidden: "Ẩn (không hiển thị)",
};
const VISIBILITY_HINTS: Record<string, string> = {
  public:
    "Ai cũng tìm thấy & xem trang CLB. Quyền tham gia phụ thuộc chính sách gia nhập.",
  private:
    "Người lạ không xem được chi tiết (chỉ thấy giới thiệu cơ bản). Thành viên xem đầy đủ.",
  hidden:
    "CLB không xuất hiện trong tìm kiếm/danh sách. Chỉ người được mời mới biết & tham gia.",
};

const JOIN_POLICY_OPTIONS = ["open", "approval", "invite_only"] as const;
const JOIN_POLICY_LABELS: Record<string, string> = {
  open: "Tự do (không cần duyệt)",
  approval: "Duyệt tham gia",
  invite_only: "Chỉ mời",
};
const JOIN_POLICY_HINTS: Record<string, string> = {
  open: "Bất kỳ ai cũng có thể vào CLB ngay.",
  approval: "Người xin gia nhập sẽ chờ quản trị duyệt.",
  invite_only: "Chỉ thành viên quản trị mời trực tiếp.",
};

const MEMBER_VIS_OPTIONS = [
  { value: "admins", label: "Chỉ quản trị (Owner/Admin)" },
  { value: "members", label: "Thành viên CLB" },
  { value: "public", label: "Mọi người" },
] as const;

// ====== Helpers ======
function extractErrorMessage(err: any) {
  if (!err) return "Đã xảy ra lỗi không xác định";
  if (typeof err === "string") return err;
  if ((err as any)?.data?.message) return (err as any).data.message;
  if (
    Array.isArray((err as any)?.data?.errors) &&
    (err as any).data.errors.length > 0
  ) {
    return (err as any).data.errors.map((e: any) => e.message || e).join(", ");
  }
  if ((err as any)?.error) return (err as any).error;
  if ((err as any)?.message) return (err as any).message;
  try {
    return JSON.stringify(err);
  } catch {
    return "Đã xảy ra lỗi";
  }
}

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
  res?.url ||
  res?.secure_url ||
  res?.data?.url ||
  res?.Location ||
  res?.path ||
  "";

// ==== Parallax / Collapse constants ====
const COVER_MAX = 200; // chiều cao cover khi ở đỉnh
const COVER_MIN = 84; // chiều cao cover khi thu gọn
const OVER_PULL = -60; // kéo vượt lên trên sẽ nở thêm
const COLLAPSE = COVER_MAX - COVER_MIN;

const LOGO_MAX = 72;
const LOGO_MIN = 44;

export default function ClubCreateModal({
  visible,
  onClose,
  onCreated,
  initial,
}: ClubCreateModalProps) {
  const insets = useSafeAreaInsets();
  const topPad = insets.top || RNStatusBar.currentHeight || 0;
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

  // ==== Keyboard avoid + auto-scroll ====
  const scrollRef = useRef<Animated.ScrollView | null>(null);
  const ensureVisible = useCallback(() => {
    requestAnimationFrame(() => {
      // @ts-ignore getNode cho các phiên bản RN cũ của Animated.ScrollView
      scrollRef.current?.getNode?.()?.scrollToEnd?.({ animated: true });
    });
  }, []);

  // ==== Province picker ====
  const [showProvincePicker, setShowProvincePicker] = useState(false);

  // ==== Parallax / collapse on scroll ====
  const scrollY = useRef(new Animated.Value(0)).current;

  const coverHeight = scrollY.interpolate({
    inputRange: [OVER_PULL, 0, COLLAPSE],
    outputRange: [COVER_MAX - OVER_PULL, COVER_MAX, COVER_MIN],
    extrapolate: "clamp",
  });

  const logoSize = scrollY.interpolate({
    inputRange: [OVER_PULL, 0, COLLAPSE],
    outputRange: [LOGO_MAX + 10, LOGO_MAX, LOGO_MIN],
    extrapolate: "clamp",
  });

  const logoBottom = scrollY.interpolate({
    inputRange: [0, COLLAPSE],
    outputRange: [-28, 8],
    extrapolate: "clamp",
  });

  const headerRadius = scrollY.interpolate({
    inputRange: [0, COLLAPSE],
    outputRange: [22, 16],
    extrapolate: "clamp",
  });

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: false } // animate height/size => false
  );

  // ==== Anti-jitter: header absolute + đo chiều cao thật ====
  const [headerH, setHeaderH] = useState<number>(COVER_MAX + 120);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => onClose?.(false)}
    >
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <SafeAreaView style={styles.modalRoot}>
        {/* Header absolute để tránh reflow khi co/giãn */}
        <Animated.View
          pointerEvents="box-none"
          onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
          style={[
            styles.header,
            {
              borderBottomLeftRadius: headerRadius,
              borderBottomRightRadius: headerRadius,
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 10,
            },
          ]}
        >
          <LinearGradient
            colors={["#667eea", "#764ba2"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View
            style={[styles.headerBar, { paddingTop: topPad + 4 }]}
            pointerEvents="auto"
          >
            <TouchableOpacity
              onPress={() => onClose?.(false)}
              style={styles.iconBtn}
            >
              <MaterialCommunityIcons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>
              {isEdit ? "Sửa CLB" : "Tạo CLB"}
            </Text>
            <TouchableOpacity
              onPress={onSubmit}
              disabled={!canSubmit || creating || updating || uploading}
              style={[
                styles.iconBtn,
                {
                  opacity:
                    !canSubmit || creating || updating || uploading ? 0.5 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={isEdit ? "Lưu" : "Tạo CLB"}
              accessibilityHint="Lưu thông tin câu lạc bộ"
            >
              <MaterialCommunityIcons
                name="content-save"
                size={22}
                color="#fff"
              />
            </TouchableOpacity>
          </View>

          {/* Cover + Logo block (animated height) */}
          <View style={styles.coverBlock} pointerEvents="box-none">
            <Animated.View style={[styles.coverWrap, { height: coverHeight }]}>
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
                    size={26}
                    color="#ffffffb3"
                  />
                  <Text style={styles.coverHelp}>
                    Chạm để chọn ảnh bìa (16:9)
                  </Text>
                </View>
              )}
              {uploading && (
                <View style={styles.uploadMask}>
                  <ActivityIndicator size="small" color="#fff" />
                </View>
              )}

              {/* Tap overlay để chọn ảnh bìa */}
              <TouchableOpacity
                onPress={() => pickImage("coverUrl")}
                activeOpacity={0.9}
                style={StyleSheet.absoluteFill}
                pointerEvents="auto"
              />
            </Animated.View>

            {/* Logo (animated size/position) */}
            <Animated.View
              style={[
                styles.logoWrap,
                {
                  width: logoSize,
                  height: logoSize,
                  bottom: logoBottom,
                  borderRadius: 999,
                },
              ]}
              pointerEvents="auto"
            >
              <TouchableOpacity
                onPress={() => pickImage("logoUrl")}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
                      size={20}
                      color="#ffffffd0"
                    />
                  </View>
                )}
              </TouchableOpacity>
            </Animated.View>
          </View>
        </Animated.View>

        {/* Body */}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={topPad}
        >
          <Animated.ScrollView
            ref={scrollRef as any}
            onScroll={onScroll}
            // Vuốt để ẩn keyboard & không chặn scroll
            keyboardDismissMode={
              Platform.OS === "ios" ? "interactive" : "on-drag"
            }
            onTouchStart={Keyboard.dismiss}
            keyboardShouldPersistTaps="always"
            scrollEventThrottle={16}
            contentContainerStyle={[styles.body, { paddingTop: headerH + 8 }]}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={false}
            contentInset={{ bottom: 24 }}
            contentInsetAdjustmentBehavior="always"
          >
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

            {/* Visibility */}
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

            {/* Join policy */}
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

            {/* Member list visibility */}
            <FieldLabel title="Ai được xem danh sách thành viên" />
            <View style={styles.rowWrap}>
              {MEMBER_VIS_OPTIONS.map((opt) => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  disabled={!allowedMemberVis.includes(opt.value as any)}
                  selected={form.memberVisibility === opt.value}
                  onPress={() =>
                    allowedMemberVis.includes(opt.value as any) &&
                    setForm((f: any) => ({
                      ...f,
                      memberVisibility: opt.value,
                    }))
                  }
                  style={styles.chip}
                />
              ))}
            </View>

            {/* Show roles */}
            <View style={[styles.rowBetween, { marginBottom: 14 }]}>
              <Text style={styles.fieldTitle}>
                Hiện nhãn Admin/Owner cho thành viên
              </Text>
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

            {/* Location */}
            <FieldLabel title="Địa chỉ" />

            {/* Province selector */}
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
              placeholder="Quận/Huyện (VD: Quận 1, TP. Thủ Đức)"
              value={form.city}
              onChangeText={(v: string) =>
                setForm((f: any) => ({ ...f, city: v }))
              }
              returnKeyType="done"
              rightIcon={
                <MaterialCommunityIcons
                  name="city-variant-outline"
                  size={18}
                  color="#999"
                />
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

            {/* Short code */}
            <TextInput
              placeholder="Mã ngắn (VD: PBC, HN-PB…)"
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
              returnKeyType="done"
              containerStyle={[
                styles.inputContainer,
                focusField === "shortCode" && styles.inputFocus,
              ]}
            />

            {/* Save */}
            <Button
              title={isEdit ? "Lưu" : "Tạo CLB"}
              label={isEdit ? "Lưu" : "Tạo CLB"}
              onPress={onSubmit}
              disabled={!canSubmit || creating || updating || uploading}
              style={{ marginTop: 18, marginBottom: 24 }}
            />
          </Animated.ScrollView>
        </KeyboardAvoidingView>

        {/* Province picker bottom sheet */}
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
              <View className="sheetHandle" style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Chọn Tỉnh/Thành</Text>
              <Animated.ScrollView
                contentContainerStyle={{ paddingBottom: 12 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <TouchableOpacity
                  key="__none__"
                  style={styles.sheetItem}
                  onPress={() => {
                    setForm((f: any) => ({ ...f, province: "" }));
                    setShowProvincePicker(false);
                  }}
                >
                  <Text style={styles.sheetItemText}>— Chọn —</Text>
                </TouchableOpacity>

                {VN_PROVINCES.map((p) => {
                  const active = form.province === p;
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[
                        styles.sheetItem,
                        active && styles.sheetItemActive,
                      ]}
                      onPress={() => {
                        setForm((f: any) => ({ ...f, province: p }));
                        setShowProvincePicker(false);
                        requestAnimationFrame(ensureVisible);
                      }}
                    >
                      <Text
                        style={[
                          styles.sheetItemText,
                          active && styles.sheetItemTextActive,
                        ]}
                      >
                        {p}
                      </Text>
                      {active ? (
                        <MaterialCommunityIcons
                          name="check"
                          size={18}
                          color="#667eea"
                        />
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </Animated.ScrollView>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
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

  header: {
    paddingBottom: 14,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    overflow: "hidden",
  },
  headerBar: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  iconBtn: { padding: 8 },

  coverBlock: {
    paddingHorizontal: 12,
    marginBottom: 44,
    position: "relative",
  },
  coverWrap: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#ffffff30",
  },
  coverImg: { width: "100%", height: "100%" },
  coverPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  coverHelp: { color: "#fff", marginTop: 6 },
  uploadMask: {
    position: "absolute",
    inset: 0,
    backgroundColor: "#0006",
    alignItems: "center",
    justifyContent: "center",
  },

  logoWrap: {
    position: "absolute",
    left: 20,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "#ffffff40",
    zIndex: 5,
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  logoImg: { width: "100%", height: "100%" },
  logoPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  logoBadge: {
    position: "absolute",
    left: 6,
    right: 6,
    bottom: 6,
    backgroundColor: "#0007",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    alignItems: "center",
  },
  logoBadgeText: { color: "#fff", fontSize: 10, fontWeight: "600" },

  body: { paddingTop: 12, paddingHorizontal: 16, paddingBottom: 40 },

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

  /* Select-like input for province */
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

  /* Bottom sheet */
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

  // Input block (nổi hơn cả khi chưa focus)
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
