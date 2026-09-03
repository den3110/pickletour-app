import React from "react";
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { TextInput } from "@/components/ui/i18nTextInput";
import { Text } from "@/components/ui/i18nText";
import { useTheme } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDispatch, useSelector } from "react-redux";

import { apiSlice } from "@/slices/apiSlice";
import { setCredentials } from "@/slices/authSlice";
import { clearForcedCheckpoint } from "@/slices/checkpointUiSlice";
import {
  useGetActiveCheckpointRequirementQuery,
  useGetCheckpointQuery,
  useResendCheckpointMutation,
  useStartActiveCheckpointMutation,
  useStartCheckpointOtpMutation,
  useUploadCheckpointEvidenceMutation,
  useVerifyCheckpointOtpMutation,
} from "@/slices/checkpointApiSlice";
import { buildLoginHref } from "@/services/authSession";

const ACTIVE_POLLING_INTERVAL_MS = 15000;
const CHECKPOINT_POLLING_INTERVAL_MS = 8000;

const EXCLUDED_ACTIVE_PATH_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-otp",
  "/logout",
];

const FACTOR_LABELS: Record<string, string> = {
  phone_otp: "Xác minh số điện thoại",
  email_otp: "Xác minh email",
  cccd_upload: "Gửi ảnh CCCD",
  face_video: "Gửi video khuôn mặt",
};

const FACTOR_DESCRIPTIONS: Record<string, string> = {
  phone_otp: "Nhập mã xác minh đã được gửi tới số điện thoại của bạn.",
  email_otp: "Nhập mã xác minh đã được gửi tới email của bạn.",
  cccd_upload: "Tải lên ảnh mặt trước và mặt sau CCCD để chúng tôi kiểm tra.",
  face_video: "Gửi video khuôn mặt rõ nét để hoàn tất hồ sơ xác minh.",
};

const STATUS_LABELS: Record<string, string> = {
  required: "Chưa thực hiện",
  sent: "Đang thực hiện",
  passed: "Hoàn tất",
  submitted: "Đã gửi, chờ duyệt",
  failed: "Không đạt",
};

const isLoggedIn = (userInfo: any) =>
  Boolean(userInfo?._id || userInfo?.id || userInfo?.token || userInfo?.email);

const getMandateId = (payload: any = {}) =>
  String(
    payload?.mandate?.id ||
      payload?.mandate?._id ||
      payload?.mandateId ||
      "",
  );

const isExcludedActivePath = (pathname = "") =>
  EXCLUDED_ACTIVE_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));

const getCurrentFactor = (checkpoint: any) =>
  (checkpoint?.factors || []).find((factor: any) =>
    ["required", "sent"].includes(factor?.status),
  );

const getActiveStep = (factors: any[] = []) => {
  if (!factors.length) return 0;
  const index = factors.findIndex((factor) => factor?.status !== "passed");
  return index === -1 ? factors.length - 1 : index;
};

const getContactLabel = (checkpoint: any) => {
  const method = checkpoint?.delivery?.method || checkpoint?.deliveryMethod;
  return method === "email_otp" ? "email" : "số điện thoại";
};

const errorMessage = (error: any, fallback: string) =>
  String(error?.data?.message || error?.error || fallback);

const extensionFromAsset = (asset: any, fallback = "jpg") => {
  const uri = String(asset?.uri || "");
  const ext = uri.split("?")[0].split(".").pop();
  if (ext && ext.length <= 5) return ext.toLowerCase();
  const mime = String(asset?.mimeType || "");
  if (mime.includes("png")) return "png";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("mov") || mime.includes("quicktime")) return "mov";
  return fallback;
};

const uploadFileFromAsset = (asset: any, fallbackName: string) => {
  if (!asset?.uri) return null;
  const ext = extensionFromAsset(asset);
  const name = asset.fileName || `${fallbackName}.${ext}`;
  const type =
    asset.mimeType ||
    (ext === "mp4" || ext === "mov" ? `video/${ext}` : `image/${ext}`);

  return {
    uri: asset.uri,
    name,
    type,
  } as any;
};

export default function CheckpointRealtimeGate() {
  const dispatch = useDispatch();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const isDark = Boolean(theme.dark);
  const userInfo = useSelector((state: any) => state.auth?.userInfo || null);
  const forced = useSelector(
    (state: any) => state.checkpointUi?.forcedCheckpoint || null,
  );
  const forcedNonce = useSelector((state: any) => state.checkpointUi?.nonce || 0);

  const [token, setToken] = React.useState("");
  const [code, setCode] = React.useState("");
  const [cooldown, setCooldown] = React.useState(0);
  const [frontAsset, setFrontAsset] = React.useState<any>(null);
  const [backAsset, setBackAsset] = React.useState<any>(null);
  const [faceVideoAsset, setFaceVideoAsset] = React.useState<any>(null);
  const [notice, setNotice] = React.useState("");
  const [localError, setLocalError] = React.useState("");

  const startingRef = React.useRef(false);
  const handledMandateRef = React.useRef("");

  const loggedIn = isLoggedIn(userInfo);
  const forcedToken = String(forced?.checkpoint?.token || "").trim();
  const skipActive =
    (!loggedIn || isExcludedActivePath(pathname || "")) && !forcedToken;

  const {
    data: activeRequirement,
    refetch: refetchActiveRequirement,
  } = useGetActiveCheckpointRequirementQuery(undefined, {
    skip: skipActive,
    pollingInterval: skipActive ? 0 : ACTIVE_POLLING_INTERVAL_MS,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const {
    data: checkpoint,
    isFetching: checkpointFetching,
    isError: checkpointError,
    refetch: refetchCheckpoint,
  } = useGetCheckpointQuery(token, {
    skip: !token,
    pollingInterval: token ? CHECKPOINT_POLLING_INTERVAL_MS : 0,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const [startActiveCheckpoint, { isLoading: startingActive }] =
    useStartActiveCheckpointMutation();
  const [startCheckpointOtp, { isLoading: startingOtp }] =
    useStartCheckpointOtpMutation();
  const [resendCheckpoint, { isLoading: resending }] =
    useResendCheckpointMutation();
  const [verifyOtp, { isLoading: verifying }] = useVerifyCheckpointOtpMutation();
  const [uploadEvidence, { isLoading: uploading }] =
    useUploadCheckpointEvidenceMutation();

  const factors = checkpoint?.factors || [];
  const currentFactor = getCurrentFactor(checkpoint);
  const activeStep = getActiveStep(factors);
  const waitingForReview = checkpoint?.status === "review_required";
  const failed = ["failed", "expired", "cancelled"].includes(
    String(checkpoint?.status || ""),
  );
  const showIntro = checkpoint?.status === "pending" && !checkpoint?.started;
  const showSteps = checkpoint?.status === "pending" && checkpoint?.started;
  const visible = Boolean(
    token ||
      forced?.required ||
      activeRequirement?.required ||
      startingRef.current ||
      startingActive,
  );

  const colors = React.useMemo(
    () => ({
      backdrop: isDark ? "#07080b" : "#f6f8fb",
      card: isDark ? "#151821" : "#ffffff",
      text: isDark ? "#f8fafc" : "#0f172a",
      muted: isDark ? "#a7b0c0" : "#64748b",
      border: isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.1)",
      soft: isDark ? "rgba(124,192,255,0.12)" : "rgba(24,119,242,0.1)",
      primary: isDark ? "#7cc0ff" : "#1877f2",
      danger: "#ef4444",
      warningBg: isDark ? "rgba(245,158,11,0.14)" : "#fff7ed",
      warningText: isDark ? "#fbbf24" : "#9a3412",
      infoBg: isDark ? "rgba(56,189,248,0.14)" : "#eff6ff",
      infoText: isDark ? "#7dd3fc" : "#1d4ed8",
    }),
    [isDark],
  );

  const resetLocalFields = React.useCallback(() => {
    setCode("");
    setCooldown(0);
    setFrontAsset(null);
    setBackAsset(null);
    setFaceVideoAsset(null);
    setNotice("");
    setLocalError("");
  }, []);

  const clearGate = React.useCallback(() => {
    startingRef.current = false;
    handledMandateRef.current = "";
    setToken("");
    resetLocalFields();
    dispatch(clearForcedCheckpoint());
  }, [dispatch, resetLocalFields]);

  const completeCheckpoint = React.useCallback(
    (user?: any) => {
      if (user) {
        dispatch(setCredentials({ ...user }));
      }
      clearGate();
      dispatch(apiSlice.util.resetApiState());
    },
    [clearGate, dispatch],
  );

  React.useEffect(() => {
    if (pathname?.startsWith("/logout")) {
      clearGate();
    }
  }, [clearGate, pathname]);

  React.useEffect(() => {
    if (!loggedIn && !forcedToken && token) {
      clearGate();
    }
  }, [clearGate, forcedToken, loggedIn, token]);

  React.useEffect(() => {
    if (!forcedToken) return;
    setToken(forcedToken);
    setLocalError("");
    setNotice("");
    const mandateId = getMandateId(forced);
    if (mandateId) handledMandateRef.current = mandateId;
  }, [forced, forcedNonce, forcedToken]);

  React.useEffect(() => {
    if (skipActive) return;

    if (activeRequirement?.required === false) {
      if (!token) clearGate();
      return;
    }

    if (!activeRequirement?.required) return;

    const mandateId = getMandateId(activeRequirement);
    const activeToken = String(activeRequirement?.checkpoint?.token || "").trim();

    if (activeToken) {
      if (mandateId) handledMandateRef.current = mandateId;
      setToken(activeToken);
      return;
    }

    if (mandateId && handledMandateRef.current === mandateId) return;
    if (startingRef.current) return;

    startingRef.current = true;
    if (mandateId) handledMandateRef.current = mandateId;

    startActiveCheckpoint(undefined)
      .unwrap()
      .then((result: any) => {
        const nextToken = String(result?.checkpoint?.token || "").trim();
        if (result?.required && nextToken) {
          setToken(nextToken);
          setLocalError("");
          return;
        }

        if (result?.required === false) {
          clearGate();
        }
      })
      .catch((error: any) => {
        handledMandateRef.current = "";
        setLocalError(
          errorMessage(error, "Không khởi tạo được checkpoint. Vui lòng thử lại."),
        );
      })
      .finally(() => {
        startingRef.current = false;
      });
  }, [
    activeRequirement,
    clearGate,
    skipActive,
    startActiveCheckpoint,
    token,
  ]);

  React.useEffect(() => {
    if (!cooldown) return undefined;
    const timer = setInterval(() => {
      setCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  React.useEffect(() => {
    if (checkpoint?.cooldown != null) {
      setCooldown(Number(checkpoint.cooldown || 0));
    }
  }, [checkpoint?.cooldown]);

  React.useEffect(() => {
    if (checkpoint?.authenticated && checkpoint?.user) {
      completeCheckpoint(checkpoint.user);
      return;
    }

    if (checkpoint?.status === "passed" && !checkpoint?.authenticated) {
      completeCheckpoint();
    }
  }, [
    checkpoint?.authenticated,
    checkpoint?.status,
    checkpoint?.user,
    completeCheckpoint,
  ]);

  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      if (!skipActive) {
        refetchActiveRequirement().catch(() => {});
      }
      if (token) {
        refetchCheckpoint().catch(() => {});
      }
    });

    return () => sub.remove();
  }, [refetchActiveRequirement, refetchCheckpoint, skipActive, token]);

  const handleStartVerification = React.useCallback(async () => {
    if (!token) return;
    try {
      setLocalError("");
      const result = await startCheckpointOtp(token).unwrap();
      setCooldown(Number(result?.cooldown || 0));
      setNotice("Mã xác minh đã được gửi.");
      await refetchCheckpoint();
    } catch (error: any) {
      const remaining = Number(error?.data?.remainingTime || 0);
      if (remaining > 0) setCooldown(remaining);
      setNotice("");
      setLocalError(
        errorMessage(error, "Không gửi được mã xác minh. Vui lòng thử lại."),
      );
    }
  }, [refetchCheckpoint, startCheckpointOtp, token]);

  const handleResend = React.useCallback(async () => {
    if (!token || cooldown > 0) return;
    try {
      setLocalError("");
      const result = await resendCheckpoint(token).unwrap();
      setCooldown(Number(result?.cooldown || 60));
      setNotice("Đã gửi lại mã xác minh.");
      await refetchCheckpoint();
    } catch (error: any) {
      const remaining = Number(error?.data?.remainingTime || 0);
      if (remaining > 0) setCooldown(remaining);
      setNotice("");
      setLocalError(errorMessage(error, "Không gửi lại được mã."));
    }
  }, [cooldown, refetchCheckpoint, resendCheckpoint, token]);

  const handleVerifyCode = React.useCallback(async () => {
    const clean = String(code || "").replace(/\D/g, "").slice(0, 6);
    if (clean.length < 4) {
      setLocalError("Mã checkpoint không hợp lệ.");
      return;
    }

    try {
      setLocalError("");
      const result = await verifyOtp({ token, code: clean }).unwrap();
      if (result?.authenticated && result?.user) {
        completeCheckpoint(result.user);
        return;
      }
      setCode("");
      setNotice("Đã xác minh mã. Đang cập nhật trạng thái.");
      await refetchCheckpoint();
    } catch (error: any) {
      setNotice("");
      setLocalError(errorMessage(error, "Xác minh thất bại."));
    }
  }, [code, completeCheckpoint, refetchCheckpoint, token, verifyOtp]);

  const pickImage = React.useCallback(async (kind: "front" | "back") => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setLocalError("Cần quyền thư viện ảnh để chọn ảnh CCCD.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.86,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets?.[0]) return;
    if (kind === "front") setFrontAsset(result.assets[0]);
    else setBackAsset(result.assets[0]);
    setLocalError("");
  }, []);

  const pickFaceVideo = React.useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setLocalError("Cần quyền thư viện để chọn video khuôn mặt.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      videoMaxDuration: 14,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets?.[0]) return;
    setFaceVideoAsset(result.assets[0]);
    setLocalError("");
  }, []);

  const captureFaceVideo = React.useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setLocalError("Cần quyền camera để quay video khuôn mặt.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      videoMaxDuration: 14,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets?.[0]) return;
    setFaceVideoAsset(result.assets[0]);
    setLocalError("");
  }, []);

  const handleUploadCccd = React.useCallback(async () => {
    const front = uploadFileFromAsset(frontAsset, "cccd-front");
    const back = uploadFileFromAsset(backAsset, "cccd-back");

    if (!front || !back) {
      setLocalError("Vui lòng chọn đủ mặt trước và mặt sau CCCD.");
      return;
    }

    try {
      setLocalError("");
      await uploadEvidence({
        token,
        factor: "cccd_upload",
        files: { front, back },
      }).unwrap();
      setFrontAsset(null);
      setBackAsset(null);
      setNotice("Đã gửi ảnh CCCD. Đang cập nhật trạng thái.");
      await refetchCheckpoint();
    } catch (error: any) {
      setNotice("");
      setLocalError(errorMessage(error, "Upload CCCD thất bại."));
    }
  }, [backAsset, frontAsset, refetchCheckpoint, token, uploadEvidence]);

  const handleUploadFaceVideo = React.useCallback(async () => {
    const video = uploadFileFromAsset(faceVideoAsset, "face-liveness");
    if (!video) {
      setLocalError("Vui lòng chọn hoặc quay video khuôn mặt.");
      return;
    }

    try {
      setLocalError("");
      await uploadEvidence({
        token,
        factor: "face_video",
        files: { video },
      }).unwrap();
      setFaceVideoAsset(null);
      setNotice("Đã gửi video. Đang cập nhật trạng thái.");
      await refetchCheckpoint();
    } catch (error: any) {
      setNotice("");
      setLocalError(errorMessage(error, "Upload video thất bại."));
    }
  }, [faceVideoAsset, refetchCheckpoint, token, uploadEvidence]);

  const handleStartFreshCheckpoint = React.useCallback(async () => {
    if (!loggedIn) {
      clearGate();
      router.replace(buildLoginHref("/") as any);
      return;
    }

    try {
      setLocalError("");
      const result = await startActiveCheckpoint(undefined).unwrap();
      const nextToken = String(result?.checkpoint?.token || "").trim();
      if (result?.required && nextToken) {
        resetLocalFields();
        setToken(nextToken);
        return;
      }
      clearGate();
    } catch (error: any) {
      setLocalError(
        errorMessage(error, "Không tạo lại được checkpoint. Vui lòng thử lại."),
      );
    }
  }, [clearGate, loggedIn, resetLocalFields, startActiveCheckpoint]);

  const handleLogout = React.useCallback(() => {
    clearGate();
    router.replace("/logout");
  }, [clearGate]);

  const renderSteps = () => {
    if (!factors.length) return null;

    return (
      <View style={styles.steps}>
        {factors.map((factor: any, index: number) => {
          const completed = factor?.status === "passed";
          const active = index === activeStep && !completed;
          const dotColor = completed
            ? "#22c55e"
            : active
            ? colors.primary
            : colors.border;

          return (
            <View key={`${factor?.key || index}`} style={styles.stepRow}>
              <View style={styles.stepRail}>
                <View style={[styles.stepDot, { backgroundColor: dotColor }]}>
                  {completed ? (
                    <Ionicons name="checkmark" size={13} color="#ffffff" />
                  ) : null}
                </View>
                {index < factors.length - 1 ? (
                  <View
                    style={[
                      styles.stepLine,
                      { backgroundColor: colors.border },
                    ]}
                  />
                ) : null}
              </View>
              <View style={styles.stepTextWrap}>
                <Text style={[styles.stepTitle, { color: colors.text }]}>
                  {FACTOR_LABELS[factor?.key] || factor?.key || "Xác minh"}
                </Text>
                <Text style={[styles.stepMeta, { color: colors.muted }]}>
                  {STATUS_LABELS[factor?.status] ||
                    FACTOR_DESCRIPTIONS[factor?.key] ||
                    "Hoàn tất bước xác minh này."}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  const renderOtpControls = () => (
    <View style={styles.controlGroup}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        {FACTOR_LABELS[currentFactor?.key] || "Xác minh OTP"}
      </Text>
      <Text style={[styles.copy, { color: colors.muted }]}>
        Mã đã được gửi tới {getContactLabel(checkpoint)}{" "}
        {checkpoint?.targetMasked || checkpoint?.delivery?.targetMasked || "của bạn"}.
      </Text>
      <TextInput
        value={code}
        onChangeText={(value) =>
          setCode(String(value || "").replace(/\D/g, "").slice(0, 6))
        }
        placeholder="Mã xác minh"
        placeholderTextColor={isDark ? "#667085" : "#94a3b8"}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={6}
        style={[
          styles.input,
          {
            color: colors.text,
            borderColor: colors.border,
            backgroundColor: isDark ? "#10131a" : "#f8fafc",
          },
        ]}
      />
      <PrimaryButton
        label={verifying ? "Đang xác minh..." : "Xác minh"}
        icon="shield-checkmark"
        disabled={verifying}
        loading={verifying}
        color={colors.primary}
        onPress={handleVerifyCode}
      />
      <SecondaryButton
        label={cooldown > 0 ? `Gửi lại mã (${cooldown}s)` : "Gửi lại mã"}
        disabled={resending || cooldown > 0}
        loading={resending}
        color={colors.primary}
        borderColor={colors.border}
        onPress={handleResend}
      />
      {checkpoint?.attemptsRemaining != null ? (
        <Text style={[styles.hint, { color: colors.muted }]}>
          Còn {checkpoint.attemptsRemaining} lần thử.
        </Text>
      ) : null}
    </View>
  );

  const renderCccdControls = () => (
    <View style={styles.controlGroup}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        {FACTOR_LABELS.cccd_upload}
      </Text>
      <Text style={[styles.copy, { color: colors.muted }]}>
        {FACTOR_DESCRIPTIONS.cccd_upload}
      </Text>
      <SecondaryButton
        label={frontAsset ? "Đã chọn mặt trước" : "Chọn ảnh mặt trước"}
        icon="image"
        color={colors.primary}
        borderColor={colors.border}
        onPress={() => pickImage("front")}
      />
      {frontAsset?.fileName ? (
        <Text style={[styles.hint, { color: colors.muted }]}>
          {frontAsset.fileName}
        </Text>
      ) : null}
      <SecondaryButton
        label={backAsset ? "Đã chọn mặt sau" : "Chọn ảnh mặt sau"}
        icon="image"
        color={colors.primary}
        borderColor={colors.border}
        onPress={() => pickImage("back")}
      />
      {backAsset?.fileName ? (
        <Text style={[styles.hint, { color: colors.muted }]}>
          {backAsset.fileName}
        </Text>
      ) : null}
      <PrimaryButton
        label={uploading ? "Đang gửi..." : "Gửi CCCD"}
        disabled={uploading}
        loading={uploading}
        color={colors.primary}
        onPress={handleUploadCccd}
      />
    </View>
  );

  const renderFaceVideoControls = () => (
    <View style={styles.controlGroup}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        {FACTOR_LABELS.face_video}
      </Text>
      <Text style={[styles.copy, { color: colors.muted }]}>
        Video nên dài 6-14 giây, khuôn mặt rõ nét và đủ sáng.
      </Text>
      <View style={styles.splitActions}>
        <SecondaryButton
          label="Quay video"
          icon="videocam"
          color={colors.primary}
          borderColor={colors.border}
          style={styles.splitAction}
          onPress={captureFaceVideo}
        />
        <SecondaryButton
          label="Chọn video"
          icon="folder-open"
          color={colors.primary}
          borderColor={colors.border}
          style={styles.splitAction}
          onPress={pickFaceVideo}
        />
      </View>
      {faceVideoAsset?.fileName ? (
        <Text style={[styles.hint, { color: colors.muted }]}>
          {faceVideoAsset.fileName}
        </Text>
      ) : faceVideoAsset?.uri ? (
        <Text style={[styles.hint, { color: colors.muted }]}>
          Đã chọn video khuôn mặt.
        </Text>
      ) : null}
      <PrimaryButton
        label={uploading ? "Đang gửi..." : "Gửi video"}
        disabled={uploading}
        loading={uploading}
        color={colors.primary}
        onPress={handleUploadFaceVideo}
      />
    </View>
  );

  const renderStepControls = () => {
    if (!currentFactor) return null;
    if (currentFactor.key === "phone_otp" || currentFactor.key === "email_otp") {
      return renderOtpControls();
    }
    if (currentFactor.key === "cccd_upload") {
      return renderCccdControls();
    }
    if (currentFactor.key === "face_video") {
      return renderFaceVideoControls();
    }
    return null;
  };

  const renderBody = () => {
    if (!token || (checkpointFetching && !checkpoint)) {
      return (
        <View style={styles.loadingBlock}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.copy, { color: colors.muted, marginTop: 12 }]}>
            Đang kiểm tra checkpoint...
          </Text>
        </View>
      );
    }

    if (checkpointError) {
      return (
        <View style={styles.controlGroup}>
          <InlineNotice
            icon="warning"
            message="Checkpoint không tồn tại hoặc đã hết hạn."
            bg={colors.warningBg}
            color={colors.warningText}
          />
          <PrimaryButton
            label={loggedIn ? "Tạo lại checkpoint" : "Đăng nhập lại"}
            icon="refresh"
            color={colors.primary}
            loading={startingActive}
            disabled={startingActive}
            onPress={handleStartFreshCheckpoint}
          />
          <SecondaryButton
            label="Đăng xuất"
            icon="log-out-outline"
            color={colors.danger}
            borderColor={colors.border}
            onPress={handleLogout}
          />
        </View>
      );
    }

    if (waitingForReview) {
      return (
        <View style={styles.controlGroup}>
          {renderSteps()}
          <InlineNotice
            icon="time"
            message="Chúng tôi đã nhận được thông tin xác minh của bạn. Đội ngũ kiểm duyệt sẽ phản hồi sớm nhất có thể."
            bg={colors.infoBg}
            color={colors.infoText}
          />
        </View>
      );
    }

    if (failed) {
      return (
        <View style={styles.controlGroup}>
          {renderSteps()}
          <InlineNotice
            icon="warning"
            message="Checkpoint này không còn hiệu lực hoặc hồ sơ xác minh chưa được chấp nhận."
            bg={colors.warningBg}
            color={colors.warningText}
          />
          <PrimaryButton
            label={loggedIn ? "Tạo lại checkpoint" : "Đăng nhập lại"}
            icon="refresh"
            color={colors.primary}
            loading={startingActive}
            disabled={startingActive}
            onPress={handleStartFreshCheckpoint}
          />
          <SecondaryButton
            label="Đăng xuất"
            icon="log-out-outline"
            color={colors.danger}
            borderColor={colors.border}
            onPress={handleLogout}
          />
        </View>
      );
    }

    if (showIntro) {
      return (
        <View style={styles.controlGroup}>
          <InlineNotice
            icon="shield"
            message="Chúng tôi phát hiện hoạt động bất thường từ tài khoản của bạn. Vui lòng hoàn tất xác minh để tiếp tục."
            bg={colors.warningBg}
            color={colors.warningText}
          />
          {renderSteps()}
          <PrimaryButton
            label={startingOtp ? "Đang bắt đầu..." : "Bắt đầu xác minh"}
            icon="shield-checkmark"
            color={colors.primary}
            loading={startingOtp}
            disabled={startingOtp}
            onPress={handleStartVerification}
          />
        </View>
      );
    }

    if (showSteps) {
      return (
        <View style={styles.controlGroup}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Bước {Math.min(activeStep + 1, factors.length)}/{factors.length}
            </Text>
            <Text style={[styles.copy, { color: colors.muted }]}>
              Hoàn tất từng bước theo đúng thứ tự để gỡ hạn chế tài khoản.
            </Text>
          </View>
          {renderSteps()}
          {renderStepControls()}
        </View>
      );
    }

    return (
      <View style={styles.loadingBlock}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  };

  if (!visible) return null;

  return (
    <View
      pointerEvents="auto"
      style={[
        StyleSheet.absoluteFillObject,
        styles.overlay,
        {
          backgroundColor: colors.backdrop,
          paddingTop: Math.max(insets.top, 10),
          paddingBottom: Math.max(insets.bottom, 10),
        },
      ]}
    >
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", android: undefined })}
        style={styles.flex}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.header}>
              <View
                style={[
                  styles.lockIcon,
                  { backgroundColor: colors.primary },
                ]}
              >
                <Ionicons name="lock-closed" size={24} color="#ffffff" />
              </View>
              <View style={styles.headerText}>
                <Text style={[styles.title, { color: colors.text }]}>
                  Kiểm tra bảo mật
                </Text>
                <Text style={[styles.subtitle, { color: colors.muted }]}>
                  Hoàn tất checkpoint để tiếp tục sử dụng tài khoản.
                </Text>
              </View>
            </View>

            {notice ? (
              <InlineNotice
                icon="checkmark-circle"
                message={notice}
                bg={colors.infoBg}
                color={colors.infoText}
              />
            ) : null}

            {localError ? (
              <InlineNotice
                icon="alert-circle"
                message={localError}
                bg={colors.warningBg}
                color={colors.warningText}
              />
            ) : null}

            {renderBody()}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function InlineNotice({
  icon,
  message,
  bg,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  message: string;
  bg: string;
  color: string;
}) {
  return (
    <View style={[styles.notice, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.noticeText, { color }]}>{message}</Text>
    </View>
  );
}

function PrimaryButton({
  label,
  icon,
  color,
  loading,
  disabled,
  onPress,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  color: string;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        styles.primaryButton,
        { backgroundColor: color, opacity: disabled || loading ? 0.72 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#ffffff" />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color="#ffffff" /> : null}
          <Text style={styles.primaryButtonText}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

function SecondaryButton({
  label,
  icon,
  color,
  borderColor,
  loading,
  disabled,
  style,
  onPress,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  color: string;
  borderColor: string;
  loading?: boolean;
  disabled?: boolean;
  style?: any;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        styles.secondaryButton,
        {
          borderColor,
          opacity: disabled || loading ? 0.52 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={color} /> : null}
          <Text style={[styles.secondaryButtonText, { color }]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  overlay: {
    zIndex: 20000,
    elevation: 20000,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 18,
  },
  card: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 20,
    gap: 16,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  lockIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
  },
  loadingBlock: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
  },
  controlGroup: {
    gap: 14,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  copy: {
    fontSize: 14,
    lineHeight: 20,
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
  },
  notice: {
    flexDirection: "row",
    gap: 9,
    padding: 12,
    borderRadius: 12,
    alignItems: "flex-start",
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  steps: {
    gap: 0,
  },
  stepRow: {
    flexDirection: "row",
    minHeight: 56,
  },
  stepRail: {
    width: 28,
    alignItems: "center",
  },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  stepLine: {
    flex: 1,
    width: 2,
    marginVertical: 4,
  },
  stepTextWrap: {
    flex: 1,
    paddingBottom: 14,
    minWidth: 0,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  stepMeta: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.select({ ios: 13, android: 10 }),
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "800",
  },
  splitActions: {
    flexDirection: "row",
    gap: 10,
  },
  splitAction: {
    flex: 1,
  },
});
