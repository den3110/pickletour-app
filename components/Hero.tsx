import { useGetLatestAssessmentQuery } from "@/slices/assessmentsApiSlice";
import { useGetHeroContentQuery } from "@/slices/cmsApiSlice";
import { normalizeUrl } from "@/utils/normalizeUri";
import { router } from "expo-router";
import React, { useMemo } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useSelector } from "react-redux";
import NativeTest from "./NativeTest";

const FALLBACK = {
  title: "Kết nối cộng đồng & quản lý giải đấu thể thao",
  lead: "PickleTour giúp bạn đăng ký, tổ chức, theo dõi điểm trình và cập nhật bảng xếp hạng cho mọi môn thể thao – ngay trên điện thoại.",
  imageAlt: "PickleTour — Kết nối cộng đồng & quản lý giải đấu",
};

const SkeletonBar = ({ w = "100%", h = 20, r = 8, style = {} }) => (
  <View
    style={[
      {
        width: w,
        height: h,
        borderRadius: r,
        backgroundColor: "rgba(0,0,0,0.08)",
      },
      style,
    ]}
  />
);

/** (Dev) Thay localhost -> LAN IP nếu bạn set EXPO_PUBLIC_LAN_IP */
function normalizeUri(url) {
  try {
    if (!url) return undefined;
    const lan = process.env.EXPO_PUBLIC_LAN_IP; // vd: "192.168.0.105"
    if (!lan) return url;
    return url.replace(/localhost(\:\d+)?/i, `${lan}$1`);
  } catch {
    return url;
  }
}

function CTAButton({
  title,
  to,
  variant = "primary",
  full = false,
  tint,
  softBg,
  softBorder,
  textPrimary,
}) {
  return (
    <Pressable
      onPress={() => router.push(to)}
      style={({ pressed }) => [
        styles.btn,
        full && styles.btnFull,
        variant === "primary"
          ? { backgroundColor: tint }
          : {
              backgroundColor: softBg,
              borderWidth: 1,
              borderColor: softBorder,
            },
        pressed && { opacity: 0.88 },
      ]}
    >
      <Text
        style={
          variant === "primary"
            ? styles.btnTextPrimary
            : [styles.btnTextOutline, { color: textPrimary }]
        }
      >
        {title}
      </Text>
    </Pressable>
  );
}

export default function Hero() {
  const scheme = useColorScheme() ?? "light";
  const tint = scheme === "dark" ? "#7cc0ff" : "#0a84ff";
  const textPrimary = scheme === "dark" ? "#fff" : "#111";
  const textSecondary = scheme === "dark" ? "#d1d1d1" : "#333";
  const cardBg = scheme === "dark" ? "#111214" : "#f5f7fa";
  const softBg = scheme === "dark" ? "#1e1f23" : "#eef1f6";
  const softBorder = scheme === "dark" ? "#3a3b40" : "#cfd6e4";

  const { userInfo } = useSelector((s) => s.auth);
  const isLoggedIn = !!userInfo;
  const userId = userInfo?._id || userInfo?.id;

  const { data: latest, isFetching } = useGetLatestAssessmentQuery(userId, {
    skip: !userId,
  });
  const {
    data: heroRes,
    isLoading: heroLoading,
    isError: heroError,
  } = useGetHeroContentQuery();

  const heroData = useMemo(() => {
    if (heroLoading) return null; // show skeleton
    const d = heroError ? {} : heroRes || {};
    return {
      title: d.title || FALLBACK.title,
      lead: d.lead || FALLBACK.lead,
      imageUrl: d.imageUrl || null,
      imageAlt: d.imageAlt || FALLBACK.imageAlt,
    };
  }, [heroLoading, heroError, heroRes]);

  const needSelfAssess = useMemo(() => {
    if (!isLoggedIn || isFetching) return false;
    if (!latest) return true;
    const s = Number(latest.singleLevel || 0);
    const d = Number(latest.doubleLevel || 0);
    return s === 0 || d === 0;
  }, [isLoggedIn, isFetching, latest]);

  const needKyc =
    isLoggedIn && (userInfo?.cccdStatus || "unverified") !== "verified";

  // Số CTA để quyết định full-width khi chỉ có 1 nút
  let ctaCount = 0;
  if (!isLoggedIn) ctaCount = 2;
  else {
    if (needSelfAssess) ctaCount++;
    if (needKyc) ctaCount++;
    if (!needSelfAssess && !needKyc) ctaCount++; // Khám phá giải đấu
  }
  const isSingleCta = ctaCount === 1;

  const uri = normalizeUri(heroData?.imageUrl);

  return (
    <View style={[styles.section, { backgroundColor: cardBg }]}>
      <View style={styles.container}>
        {/* <NativeTest /> */}
        {/* Text */}
        <View style={styles.left}>
          {heroData ? (
            <>
              <Text
                style={[
                  styles.title,
                  { color: textPrimary, textAlign: "center" },
                ]}
              >
                {String(heroData.title)
                  .split("\n")
                  .map((line, i) => (
                    <Text key={i}>
                      {line}
                      {i === 0 ? "\n" : ""}
                    </Text>
                  ))}
              </Text>
              <Text
                style={[
                  styles.lead,
                  { color: textSecondary, textAlign: "center" },
                ]}
              >
                {heroData.lead}
              </Text>
            </>
          ) : (
            <>
              <View style={{ marginBottom: 16, alignItems: "center" }}>
                <SkeletonBar w="85%" h={36} />
                <View style={{ height: 12 }} />
                <SkeletonBar w="70%" h={36} />
              </View>
              <View style={{ marginBottom: 16, alignItems: "center" }}>
                <SkeletonBar w="95%" h={16} />
                <View style={{ height: 8 }} />
                <SkeletonBar w="75%" h={16} />
              </View>
            </>
          )}

          {/* CTA */}
          <View style={[styles.actions, { justifyContent: "center" }]}>
            {!isLoggedIn ? (
              <>
                <CTAButton
                  title="Bắt đầu ngay"
                  to="/register"
                  variant="primary"
                  full={isSingleCta}
                  tint={tint}
                  softBg={softBg}
                  softBorder={softBorder}
                  textPrimary={textPrimary}
                />
                <CTAButton
                  title="Đăng nhập"
                  to="/login"
                  variant="soft"
                  full={isSingleCta}
                  tint={tint}
                  softBg={softBg}
                  softBorder={softBorder}
                  textPrimary={textPrimary}
                />
              </>
            ) : (
              <>
                {needSelfAssess && (
                  <CTAButton
                    title="Tự chấm trình"
                    to="/levelpoint"
                    variant="primary"
                    full={isSingleCta}
                    tint={tint}
                    softBg={softBg}
                    softBorder={softBorder}
                    textPrimary={textPrimary}
                  />
                )}

                {needKyc && (
                  <CTAButton
                    title="Xác minh ngay"
                    to="/profile"
                    variant={needSelfAssess ? "soft" : "primary"}
                    full={isSingleCta}
                    tint={tint}
                    softBg={softBg}
                    softBorder={softBorder}
                    textPrimary={textPrimary}
                  />
                )}

                {!needSelfAssess && !needKyc && (
                  <CTAButton
                    title="Khám phá giải đấu"
                    to="/tournaments"
                    variant="primary"
                    full
                    tint={tint}
                    softBg={softBg}
                    softBorder={softBorder}
                    textPrimary={textPrimary}
                  />
                )}
              </>
            )}
          </View>
        </View>

        {/* Image */}
        <View style={styles.right}>
          <View style={styles.imageWrap}>
            {heroData ? (
              uri ? (
                <ExpoImage
                  source={normalizeUrl(uri)}
                  accessibilityLabel={heroData.imageAlt?.replace(
                    "localhost",
                    "192.168.0.105"
                  )}
                  style={styles.image}
                  contentFit="cover"
                  transition={150}
                  cachePolicy="memory-disk"
                />
              ) : (
                <ExpoImage
                  source={require("@/assets/images/hero.jpg")}
                  accessibilityLabel={heroData.imageAlt}
                  style={styles.image}
                  contentFit="cover"
                  transition={150}
                  cachePolicy="memory-disk"
                />
              )
            ) : (
              <View style={styles.imageSkeleton} />
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingVertical: 24, paddingHorizontal: 16 },
  container: { flexDirection: "column", gap: 20, alignItems: "center" },
  left: { width: "100%", maxWidth: 720 },
  right: { width: "100%", maxWidth: 720 },
  title: { fontSize: 26, fontWeight: "800", lineHeight: 32, marginBottom: 10 },
  lead: { fontSize: 16, lineHeight: 22, marginBottom: 12 },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 8,
    width: "100%",
  },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    minWidth: 160,
    alignItems: "center",
  },
  btnFull: { width: "100%" }, // 1 CTA -> full width
  btnTextPrimary: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
    textAlign: "center",
  },
  btnTextOutline: { fontWeight: "700", fontSize: 16, textAlign: "center" },
  imageWrap: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  image: { width: "100%", height: "100%" },
  imageSkeleton: { flex: 1, backgroundColor: "rgba(0,0,0,0.08)" },
});
