import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTheme } from "@react-navigation/native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSelector } from "react-redux";

import {
  useIssueOsAuthTokenMutation,
  useLazyGetOAuthAuthorizeContextQuery,
} from "@/slices/usersApiSlice";

type LiveAuthParams = {
  continueUrl?: string | string[];
  targetUrl?: string | string[];
  callbackUri?: string | string[];
  client_id?: string | string[];
  redirect_uri?: string | string[];
  response_type?: string | string[];
  scope?: string | string[];
  state?: string | string[];
  code_challenge?: string | string[];
  code_challenge_method?: string | string[];
  nonce?: string | string[];
};

type OAuthAuthorizeRequest = {
  client_id: string;
  redirect_uri: string;
  response_type: string;
  scope: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
};

type OAuthAuthorizeContext = {
  authenticated?: boolean;
  canAuthorize?: boolean;
  message?: string;
  reason?: string;
  user?: {
    name?: string;
    nickname?: string;
    email?: string;
  };
  app?: {
    name?: string;
  };
  manageableTournaments?: {
    _id?: string;
    name?: string;
    status?: string;
  }[];
  roleSummary?: string;
};

type DirectOAuthParams = {
  client_id: string;
  redirect_uri: string;
  response_type: string;
  scope: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
  nonce: string;
};

type ParsedAuthorizeRequest =
  | {
      continueUrl: string;
      error: string;
      request: OAuthAuthorizeRequest | null;
      pending: true;
    }
  | {
      continueUrl: string;
      error: string;
      request: OAuthAuthorizeRequest | null;
      pending: false;
    };

function normalizeParam(value: string | string[] | undefined, fallback = "") {
  if (Array.isArray(value)) {
    return String(value[0] || fallback).trim();
  }
  return String(value || fallback).trim();
}

function appendQuery(url: string, key: string, value: string) {
  try {
    const joiner = url.includes("?") ? "&" : "?";
    return `${url}${joiner}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  } catch {
    return url;
  }
}

function parseAuthorizeRequest(
  continueUrl: string,
  routeParams: DirectOAuthParams,
): ParsedAuthorizeRequest {
  const directParams = {
    client_id: normalizeParam(routeParams.client_id),
    redirect_uri: normalizeParam(routeParams.redirect_uri),
    response_type: normalizeParam(routeParams.response_type),
    scope: normalizeParam(routeParams.scope, "openid profile"),
    state: normalizeParam(routeParams.state),
    code_challenge: normalizeParam(routeParams.code_challenge),
    code_challenge_method: normalizeParam(
      routeParams.code_challenge_method,
      "S256",
    ),
    nonce: normalizeParam(routeParams.nonce),
  };

  const hasDirectOAuthParams = Boolean(
    directParams.client_id ||
      directParams.redirect_uri ||
      directParams.response_type ||
      directParams.state ||
      directParams.code_challenge ||
      directParams.nonce,
  );

  if (!continueUrl && !hasDirectOAuthParams) {
    return {
      continueUrl: "",
      error: "Thiếu yêu cầu xác thực từ PickleTour Live.",
      request: null as OAuthAuthorizeRequest | null,
      pending: false,
    };
  }

  try {
    const url = new URL(
      continueUrl || "https://pickletour.vn/api/api/oauth/authorize",
    );

    if (directParams.nonce) {
      url.searchParams.set("nonce", directParams.nonce);
    }
    if (directParams.response_type) {
      url.searchParams.set("response_type", directParams.response_type);
    }
    if (directParams.client_id) {
      url.searchParams.set("client_id", directParams.client_id);
    }
    if (directParams.redirect_uri) {
      url.searchParams.set("redirect_uri", directParams.redirect_uri);
    }
    if (directParams.scope) {
      url.searchParams.set("scope", directParams.scope);
    }
    if (directParams.state) {
      url.searchParams.set("state", directParams.state);
    }
    if (directParams.code_challenge) {
      url.searchParams.set("code_challenge", directParams.code_challenge);
    }
    if (directParams.code_challenge_method) {
      url.searchParams.set(
        "code_challenge_method",
        directParams.code_challenge_method,
      );
    }

    const params = url.searchParams;
    const request: OAuthAuthorizeRequest = {
      client_id: String(params.get("client_id") || "").trim(),
      redirect_uri: String(params.get("redirect_uri") || "").trim(),
      response_type: String(params.get("response_type") || "").trim(),
      scope: String(params.get("scope") || "openid profile").trim(),
      state: String(params.get("state") || "").trim(),
      code_challenge: String(params.get("code_challenge") || "").trim(),
      code_challenge_method: String(
        params.get("code_challenge_method") || "S256",
      ).trim(),
    };

    const missing = [
      "client_id",
      "redirect_uri",
      "response_type",
    ].filter((key) => {
      const value = request[key as keyof OAuthAuthorizeRequest];
      return !String(value || "").trim();
    });

    if (missing.length > 0) {
      return {
        continueUrl: url.toString(),
        error: `Yêu cầu cấp quyền không hợp lệ. Thiếu ${missing.join(", ")}.`,
        request: null as OAuthAuthorizeRequest | null,
        pending: false,
      };
    }

    if (request.response_type !== "code") {
      return {
        continueUrl: url.toString(),
        error: "Yêu cầu cấp quyền không hợp lệ. response_type phải là code.",
        request: null as OAuthAuthorizeRequest | null,
        pending: false,
      };
    }

    return { continueUrl: url.toString(), error: "", request, pending: false };
  } catch {
    return {
      continueUrl,
      error: "Không đọc được yêu cầu xác thực từ PickleTour Live.",
      request: null as OAuthAuthorizeRequest | null,
      pending: false,
    };
  }
}

function buildAuthorizeSearch(
  request: OAuthAuthorizeRequest,
  osAuthToken: string,
) {
  const search = new URLSearchParams();
  search.set("client_id", request.client_id);
  search.set("redirect_uri", request.redirect_uri);
  search.set("response_type", request.response_type);
  search.set("scope", request.scope || "openid profile");
  search.set("state", request.state);
  search.set("code_challenge", request.code_challenge);
  search.set("code_challenge_method", request.code_challenge_method || "S256");
  search.set("os_auth_token", osAuthToken);
  return search.toString();
}

export default function LiveAuthScreen() {
  const params = useLocalSearchParams<LiveAuthParams>();
  const hasContinueUrlParam = typeof params.continueUrl !== "undefined";

  const continueUrl = useMemo(
    () => normalizeParam(params.continueUrl),
    [params.continueUrl],
  );
  const directOAuthParams = useMemo<DirectOAuthParams>(
    () => ({
      client_id: normalizeParam(params.client_id),
      redirect_uri: normalizeParam(params.redirect_uri),
      response_type: normalizeParam(params.response_type),
      scope: normalizeParam(params.scope, "openid profile"),
      state: normalizeParam(params.state),
      code_challenge: normalizeParam(params.code_challenge),
      code_challenge_method: normalizeParam(
        params.code_challenge_method,
        "S256",
      ),
      nonce: normalizeParam(params.nonce),
    }),
    [
      params.client_id,
      params.redirect_uri,
      params.response_type,
      params.scope,
      params.state,
      params.code_challenge,
      params.code_challenge_method,
      params.nonce,
    ],
  );
  const targetUrl = useMemo(
    () => normalizeParam(params.targetUrl),
    [params.targetUrl],
  );
  const callbackUri = useMemo(
    () => normalizeParam(params.callbackUri, "pickletour-live://auth-init"),
    [params.callbackUri],
  );
  const [didWaitForInitialParams, setDidWaitForInitialParams] = useState(false);

  useEffect(() => {
    if (hasContinueUrlParam) {
      setDidWaitForInitialParams(true);
      return;
    }

    setDidWaitForInitialParams(false);
    const timer = setTimeout(() => {
      setDidWaitForInitialParams(true);
    }, 600);

    return () => clearTimeout(timer);
  }, [hasContinueUrlParam]);

  const isWaitingForInitialRequest =
    !hasContinueUrlParam && !didWaitForInitialParams;

  const authorizePayload = useMemo(
    () =>
      isWaitingForInitialRequest
        ? {
            continueUrl: "",
            error: "",
            request: null,
            pending: true,
          }
        : parseAuthorizeRequest(continueUrl, directOAuthParams),
    [continueUrl, directOAuthParams, isWaitingForInitialRequest],
  );
  const authorizeRequest = authorizePayload.request;
  const resolvedContinueUrl = authorizePayload.continueUrl;
  const { colors, dark } = useTheme();

  const userInfo = useSelector((state: any) => state.auth?.userInfo);
  const [issueOsAuthToken] = useIssueOsAuthTokenMutation();
  const [fetchAuthorizeContext] = useLazyGetOAuthAuthorizeContextQuery();

  const [isPreparing, setIsPreparing] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [message, setMessage] = useState(
    "Đang chuẩn bị màn cấp quyền cho PickleTour Live...",
  );
  const [error, setError] = useState("");
  const [contextData, setContextData] = useState<OAuthAuthorizeContext | null>(
    null,
  );
  const tokens = useMemo(
    () => ({
      bg: colors.background,
      card: colors.card,
      text: colors.text,
      subText: dark ? "#9ca3af" : "#64748b",
      border: colors.border,
      primary: colors.primary,
      primaryText: dark ? "#081018" : "#ffffff",
      tile: dark ? "#171a20" : "#f8fafc",
      tileBorder: dark ? "#262b33" : "#e2e8f0",
      badgeBg: dark ? "rgba(124,192,255,0.12)" : "rgba(25,118,210,0.08)",
      errorBg: dark ? "rgba(239,68,68,0.14)" : "#fee2e2",
      errorText: dark ? "#fca5a5" : "#b91c1c",
      secondaryText: dark ? "#d4d4d8" : "#334155",
      shadow: dark ? "#000000" : "#0f172a",
    }),
    [colors, dark],
  );

  const returnTo = useMemo(() => {
    if (!resolvedContinueUrl) return "/login";

    const nextParams = new URLSearchParams();
    nextParams.set("continueUrl", resolvedContinueUrl);
    nextParams.set("callbackUri", callbackUri);
    if (targetUrl) {
      nextParams.set("targetUrl", targetUrl);
    }
    return `/live-auth?${nextParams.toString()}`;
  }, [callbackUri, resolvedContinueUrl, targetUrl]);

  useEffect(() => {
    if (authorizePayload.pending) {
      setError("");
      setContextData(null);
      setIsPreparing(false);
      setMessage("Đang nhận yêu cầu xác thực từ PickleTour Live...");
      return;
    }

    if (authorizePayload.error) {
      setError(authorizePayload.error);
      setContextData(null);
      setIsPreparing(false);
      return;
    }

    if (!authorizeRequest) {
      return;
    }

    if (!userInfo?.token) {
      router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setError("");
        setContextData(null);
        setIsPreparing(true);
        setMessage("Đang kiểm tra quyền dùng PickleTour Live...");

        const tokenResponse = await issueOsAuthToken().unwrap();
        const osAuthToken = String(tokenResponse?.osAuthToken || "").trim();
        if (!osAuthToken) {
          throw new Error("Không lấy được phiên xác thực PickleTour.");
        }

        const context = await fetchAuthorizeContext(
          buildAuthorizeSearch(authorizeRequest, osAuthToken),
          false,
        ).unwrap();

        if (cancelled) return;

        setContextData(context);

        if (context?.canAuthorize) {
          setMessage("PickleTour Live đang chờ bạn cấp quyền.");
        } else {
          setMessage(
            context?.message ||
              "Tài khoản này hiện chưa thể cấp quyền cho PickleTour Live.",
          );
        }
      } catch (e: any) {
        if (cancelled) return;
        setError(
          String(
            e?.data?.message ||
              e?.message ||
              "Không thể tải thông tin cấp quyền PickleTour Live.",
          ),
        );
      } finally {
        if (!cancelled) {
          setIsPreparing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    authorizePayload.error,
    authorizePayload.pending,
    authorizeRequest,
    fetchAuthorizeContext,
    issueOsAuthToken,
    returnTo,
    userInfo?.token,
  ]);

  const manageableTournaments = contextData?.manageableTournaments || [];
  const canAuthorize = Boolean(contextData?.canAuthorize);
  const accountName =
    contextData?.user?.name ||
    contextData?.user?.nickname ||
    contextData?.user?.email ||
    "PickleTour User";

  const handleApprove = async () => {
    if (!authorizeRequest) {
      setError("Thiếu yêu cầu cấp quyền từ PickleTour Live.");
      return;
    }

    try {
      setError("");
      setIsAuthorizing(true);
      setMessage("Đang cấp quyền và quay lại PickleTour Live...");

      const tokenResponse = await issueOsAuthToken().unwrap();
      const osAuthToken = String(tokenResponse?.osAuthToken || "").trim();
      if (!osAuthToken) {
        throw new Error("Không lấy được phiên xác thực PickleTour.");
      }

      let callbackUrl = appendQuery(callbackUri, "osAuthToken", osAuthToken);
      if (targetUrl) {
        callbackUrl = appendQuery(callbackUrl, "targetUrl", targetUrl);
      }
      if (resolvedContinueUrl) {
        callbackUrl = appendQuery(
          callbackUrl,
          "continueUrl",
          resolvedContinueUrl,
        );
      }

      try {
        await Linking.openURL(callbackUrl);
        // Đóng màn hình sau khi chuyển về app live
        try { router.replace("/(tabs)" as any); } catch {}
      } catch {
        setError(
          "Không mở lại được PickleTour Live. Vui lòng quay lại app live và thử lại.",
        );
      }
    } catch (e: any) {
      setError(
        String(
          e?.data?.message ||
            e?.message ||
            "Không thể hoàn tất cấp quyền cho PickleTour Live.",
        ),
      );
    } finally {
      setIsAuthorizing(false);
    }
  };

  return (
    <SafeAreaView
      edges={["bottom"]}
      style={[styles.safeArea, { backgroundColor: tokens.bg }]}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={{ backgroundColor: tokens.bg }}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: tokens.card,
              borderColor: tokens.border,
              shadowColor: tokens.shadow,
            },
          ]}
        >
          <Text
            style={[
              styles.eyebrow,
              { color: tokens.primary, backgroundColor: tokens.badgeBg },
            ]}
          >
            PICKLETOUR
          </Text>
          <Text style={[styles.title, { color: tokens.text }]}>
            Ủy quyền PickleTour Live
          </Text>
          <Text style={[styles.body, { color: tokens.subText }]}>
            Xác nhận cho phép PickleTour Live dùng phiên đăng nhập hiện tại để
            vào app live và quản lý các giải bạn được cấp quyền.
          </Text>

          {error ? (
            <View
              style={[styles.alert, { backgroundColor: tokens.errorBg }]}
            >
              <Text style={[styles.alertText, { color: tokens.errorText }]}>
                {error}
              </Text>
            </View>
          ) : null}

          {authorizePayload.pending || isPreparing ? (
            <View style={styles.progressBlock}>
              <ActivityIndicator color={tokens.primary} />
              <Text style={[styles.body, { color: tokens.subText }]}>
                {message}
              </Text>
            </View>
          ) : null}

          {!isPreparing && contextData ? (
            <>
              <View style={styles.metaRow}>
                <View
                  style={[
                    styles.metaTile,
                    {
                      backgroundColor: tokens.tile,
                      borderColor: tokens.tileBorder,
                    },
                  ]}
                >
                  <Text style={[styles.metaLabel, { color: tokens.primary }]}>
                    Tài khoản
                  </Text>
                  <Text style={[styles.metaValue, { color: tokens.text }]}>
                    {accountName}
                  </Text>
                </View>
                <View
                  style={[
                    styles.metaTile,
                    {
                      backgroundColor: tokens.tile,
                      borderColor: tokens.tileBorder,
                    },
                  ]}
                >
                  <Text style={[styles.metaLabel, { color: tokens.primary }]}>
                    Quyền
                  </Text>
                  <Text style={[styles.metaValue, { color: tokens.text }]}>
                    {contextData?.roleSummary || "PickleTour Live"}
                  </Text>
                </View>
              </View>

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: tokens.text }]}>
                  Giải được phép live
                </Text>
                {manageableTournaments.length > 0 ? (
                  manageableTournaments.slice(0, 6).map((tournament) => (
                    <View
                      key={tournament._id || tournament.name}
                      style={[
                        styles.tournamentCard,
                        {
                          backgroundColor: tokens.tile,
                          borderColor: tokens.tileBorder,
                        },
                      ]}
                    >
                      <Text
                        style={[styles.tournamentName, { color: tokens.text }]}
                      >
                        {tournament.name || "Giải đấu"}
                      </Text>
                      <Text
                        style={[
                          styles.tournamentStatus,
                          { color: tokens.subText },
                        ]}
                      >
                        {tournament.status || "active"}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={[styles.body, { color: tokens.subText }]}>
                    {contextData?.message ||
                      "Tài khoản admin sẽ dùng danh sách giải hiện có của hệ thống."}
                  </Text>
                )}
              </View>

              {canAuthorize ? (
                <View style={styles.actionStack}>
                  <Pressable
                    onPress={handleApprove}
                    disabled={isAuthorizing}
                    style={[
                      styles.primaryButton,
                      { backgroundColor: tokens.primary },
                      isAuthorizing && styles.buttonDisabled,
                    ]}
                  >
                    {isAuthorizing ? (
                      <ActivityIndicator color={tokens.primaryText} />
                    ) : (
                      <Text
                        style={[
                          styles.primaryButtonText,
                          { color: tokens.primaryText },
                        ]}
                      >
                        Cho phép
                      </Text>
                    )}
                  </Pressable>

                  <Pressable
                    onPress={() => router.replace("/(tabs)")}
                    style={[
                      styles.ghostButton,
                      { borderColor: tokens.border, backgroundColor: tokens.bg },
                    ]}
                  >
                    <Text
                      style={[
                        styles.ghostButtonText,
                        { color: tokens.secondaryText },
                      ]}
                    >
                      Hủy
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.actionStack}>
                  <Text style={[styles.body, { color: tokens.subText }]}>
                    {contextData?.message ||
                      "Tài khoản này hiện chưa thể dùng PickleTour Live."}
                  </Text>
                  <Pressable
                    onPress={() => router.replace("/(tabs)")}
                    style={[
                      styles.ghostButton,
                      { borderColor: tokens.border, backgroundColor: tokens.bg },
                    ]}
                  >
                    <Text
                      style={[
                        styles.ghostButtonText,
                        { color: tokens.secondaryText },
                      ]}
                    >
                      Quay lại PickleTour
                    </Text>
                  </Pressable>
                </View>
              )}
            </>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 24,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    borderRadius: 22,
    padding: 20,
    gap: 18,
    borderWidth: 1,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  progressBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 48,
  },
  alert: {
    borderRadius: 16,
    padding: 14,
  },
  alertText: {
    fontSize: 14,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  metaTile: {
    flex: 1,
    minWidth: 140,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  metaValue: {
    fontSize: 15,
    fontWeight: "700",
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  tournamentCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  tournamentName: {
    fontSize: 15,
    fontWeight: "700",
  },
  tournamentStatus: {
    fontSize: 13,
    textTransform: "lowercase",
  },
  actionStack: {
    gap: 12,
  },
  primaryButton: {
    height: 52,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    fontWeight: "800",
    fontSize: 15,
  },
  ghostButton: {
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  ghostButtonText: {
    fontWeight: "700",
    fontSize: 15,
  },
});
