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
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useSelector } from "react-redux";

import {
  useIssueOsAuthTokenMutation,
  useLazyGetOAuthAuthorizeContextQuery,
} from "@/slices/usersApiSlice";

type LiveAuthParams = {
  continueUrl?: string | string[];
  targetUrl?: string | string[];
  callbackUri?: string | string[];
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

function parseAuthorizeRequest(continueUrl: string) {
  if (!continueUrl) {
    return {
      error: "Thiếu yêu cầu xác thực từ PickleTour Live.",
      request: null as OAuthAuthorizeRequest | null,
    };
  }

  try {
    const url = new URL(continueUrl);
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
      "state",
      "code_challenge",
      "code_challenge_method",
    ].filter((key) => {
      const value = request[key as keyof OAuthAuthorizeRequest];
      return !String(value || "").trim();
    });

    if (missing.length > 0) {
      return {
        error: `Yêu cầu cấp quyền không hợp lệ. Thiếu ${missing.join(", ")}.`,
        request: null as OAuthAuthorizeRequest | null,
      };
    }

    if (request.response_type !== "code") {
      return {
        error: "Yêu cầu cấp quyền không hợp lệ. response_type phải là code.",
        request: null as OAuthAuthorizeRequest | null,
      };
    }

    return { error: "", request };
  } catch {
    return {
      error: "Không đọc được yêu cầu xác thực từ PickleTour Live.",
      request: null as OAuthAuthorizeRequest | null,
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

  const continueUrl = useMemo(
    () => normalizeParam(params.continueUrl),
    [params.continueUrl],
  );
  const targetUrl = useMemo(
    () => normalizeParam(params.targetUrl),
    [params.targetUrl],
  );
  const callbackUri = useMemo(
    () => normalizeParam(params.callbackUri, "pickletour-live://auth-init"),
    [params.callbackUri],
  );

  const authorizePayload = useMemo(
    () => parseAuthorizeRequest(continueUrl),
    [continueUrl],
  );
  const authorizeRequest = authorizePayload.request;

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

  const returnTo = useMemo(() => {
    if (!continueUrl) return "/login";

    const nextParams = new URLSearchParams();
    nextParams.set("continueUrl", continueUrl);
    nextParams.set("callbackUri", callbackUri);
    if (targetUrl) {
      nextParams.set("targetUrl", targetUrl);
    }
    return `/live-auth?${nextParams.toString()}`;
  }, [callbackUri, continueUrl, targetUrl]);

  const openWebFallback = async (fallbackMessage?: string) => {
    if (!continueUrl) {
      setError("Không thể mở luồng xác thực web.");
      return;
    }

    if (fallbackMessage) {
      setMessage(fallbackMessage);
    }

    try {
      await Linking.openURL(continueUrl);
    } catch {
      setError("Không thể mở luồng xác thực web.");
    }
  };

  useEffect(() => {
    if (authorizePayload.error) {
      setError(authorizePayload.error);
      setContextData(null);
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
      if (continueUrl) {
        callbackUrl = appendQuery(callbackUrl, "continueUrl", continueUrl);
      }

      try {
        await Linking.openURL(callbackUrl);
      } catch {
        await openWebFallback(
          "Không mở lại được PickleTour Live. Chuyển sang xác thực web...",
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
    <View style={styles.page}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.eyebrow}>PICKLETOUR</Text>
          <Text style={styles.title}>Ủy quyền PickleTour Live</Text>
          <Text style={styles.body}>
            Xác nhận cho phép PickleTour Live dùng phiên đăng nhập hiện tại để
            vào app live và quản lý các giải bạn được cấp quyền.
          </Text>

          {error ? (
            <View style={styles.alert}>
              <Text style={styles.alertText}>{error}</Text>
            </View>
          ) : null}

          {isPreparing ? (
            <View style={styles.progressBlock}>
              <ActivityIndicator color="#25c2a0" />
              <Text style={styles.body}>{message}</Text>
            </View>
          ) : null}

          {!isPreparing && contextData ? (
            <>
              <View style={styles.metaRow}>
                <View style={styles.metaTile}>
                  <Text style={styles.metaLabel}>Tài khoản</Text>
                  <Text style={styles.metaValue}>{accountName}</Text>
                </View>
                <View style={styles.metaTile}>
                  <Text style={styles.metaLabel}>Quyền</Text>
                  <Text style={styles.metaValue}>
                    {contextData?.roleSummary || "PickleTour Live"}
                  </Text>
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Giải được phép live</Text>
                {manageableTournaments.length > 0 ? (
                  manageableTournaments.slice(0, 6).map((tournament) => (
                    <View key={tournament._id || tournament.name} style={styles.tournamentCard}>
                      <Text style={styles.tournamentName}>
                        {tournament.name || "Giải đấu"}
                      </Text>
                      <Text style={styles.tournamentStatus}>
                        {tournament.status || "active"}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.body}>
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
                      isAuthorizing && styles.buttonDisabled,
                    ]}
                  >
                    {isAuthorizing ? (
                      <ActivityIndicator color="#04110b" />
                    ) : (
                      <Text style={styles.primaryButtonText}>Cho phép</Text>
                    )}
                  </Pressable>

                  <Pressable
                    onPress={() => router.replace("/(tabs)")}
                    style={styles.ghostButton}
                  >
                    <Text style={styles.ghostButtonText}>Hủy</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.actionStack}>
                  <Text style={styles.body}>
                    {contextData?.message ||
                      "Tài khoản này hiện chưa thể dùng PickleTour Live."}
                  </Text>
                  <Pressable
                    onPress={() => router.replace("/(tabs)")}
                    style={styles.ghostButton}
                  >
                    <Text style={styles.ghostButtonText}>Quay lại PickleTour</Text>
                  </Pressable>
                </View>
              )}
            </>
          ) : null}

          <Pressable
            onPress={() => openWebFallback()}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Mở web thay thế</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#071018",
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    borderRadius: 28,
    backgroundColor: "#101820",
    padding: 24,
    gap: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  eyebrow: {
    color: "#7cc0ff",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  title: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "800",
  },
  body: {
    color: "rgba(255,255,255,0.72)",
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
    borderRadius: 18,
    backgroundColor: "rgba(255,107,107,0.14)",
    padding: 14,
  },
  alertText: {
    color: "#ff8b8b",
    fontSize: 14,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: "row",
    gap: 12,
  },
  metaTile: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: "#13202a",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 14,
    gap: 6,
  },
  metaLabel: {
    color: "#7cc0ff",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  metaValue: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "800",
  },
  tournamentCard: {
    borderRadius: 16,
    backgroundColor: "#13202a",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 14,
    gap: 4,
  },
  tournamentName: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  tournamentStatus: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 13,
  },
  actionStack: {
    gap: 12,
  },
  primaryButton: {
    height: 52,
    borderRadius: 999,
    backgroundColor: "#25c2a0",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: "#04110b",
    fontWeight: "800",
    fontSize: 15,
  },
  secondaryButton: {
    height: 52,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(37,194,160,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: "#25c2a0",
    fontWeight: "800",
    fontSize: 15,
  },
  ghostButton: {
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  ghostButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});
