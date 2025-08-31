// app/contact/index.jsx  (hoặc src/screens/ContactScreen.jsx)
import { useGetContactContentQuery } from "@/slices/cmsApiSlice";
import { AntDesign, Ionicons, MaterialIcons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import React, { useMemo } from "react";
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";

const FALLBACK = {
  address: "Abcd, abcd, abcd",
  phone: "012345678",
  email: "support@pickletour.vn",
  support: {
    generalEmail: "support@pickletour.vn",
    generalPhone: "0123456789",
    scoringEmail: "support@pickletour.vn",
    scoringPhone: "0123456789",
    salesEmail: "support@pickletour.vn",
  },
  socials: {
    facebook: "https://facebook.com",
    youtube: "https://youtube.com",
    zalo: "#",
  },
};

function SkeletonBar({ w = "100%", h = 18, r = 8, mt = 6, bg }) {
  return (
    <View
      style={{
        width: w,
        height: h,
        borderRadius: r,
        backgroundColor: bg,
        marginTop: mt,
      }}
    />
  );
}

function openURL(url) {
  if (!url) return;
  Linking.canOpenURL(url)
    .then((ok) => (ok ? Linking.openURL(url) : Alert.alert("Lỗi", "Không mở được liên kết.")))
    .catch(() => Alert.alert("Lỗi", "Không mở được liên kết."));
}

function InfoRow({ icon, label, children, color, tint }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.iconWrap}>
        {icon}
      </View>
      <Text style={[styles.infoText, { color }]}>{label} </Text>
      {typeof children === "string" ? (
        <Text style={[styles.linkText, { color: tint }]}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

function LinkText({ text, url, tint }) {
  if (!text) return <Text style={{ color: "#9aa0a6" }}>—</Text>;
  return (
    <Text
      style={[styles.linkText, { color: tint }]}
      onPress={() => openURL(url)}
      suppressHighlighting
    >
      {text}
    </Text>
  );
}

function SocialButton({ onPress, children, bg }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.socialBtn, { backgroundColor: bg }]}
    >
      {children}
    </TouchableOpacity>
  );
}

export default function ContactScreen() {
  const scheme = useColorScheme() ?? "light";
  const isDark = scheme === "dark";

  const bg = isDark ? "#0f1115" : "#ffffff";
  const cardBg = isDark ? "#14171c" : "#ffffff";
  const border = isDark ? "#2a2e35" : "#e7eaf0";
  const textPrimary = isDark ? "#ffffff" : "#111111";
  const textSecondary = isDark ? "#c9c9c9" : "#555555";
  const muted = isDark ? "#1a1e24" : "#f6f8fb";
  const skeleton = isDark ? "#262a31" : "rgba(0,0,0,0.08)";
  const tint = isDark ? "#7cc0ff" : "#0a84ff";

  const { data, isLoading, isError } = useGetContactContentQuery();
  const info = useMemo(
    () => (isLoading ? null : isError ? FALLBACK : { ...FALLBACK, ...data }),
    [data, isLoading, isError]
  );

  return (
    <>
      <Stack.Screen options={{ title: "Liên hệ", headerTitleAlign: "center" }} />
      <ScrollView contentContainerStyle={[styles.scroll, { backgroundColor: bg }]}>
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
          <Text style={[styles.title, { color: textPrimary }]}>Liên hệ.</Text>

          {info ? (
            <>
              {/* Địa chỉ */}
              <InfoRow
                color={textPrimary}
                tint={tint}
                label="Địa chỉ:"
                icon={<MaterialIcons name="location-on" size={22} color={textSecondary} />}
              >
                <Text style={{ color: textPrimary }}>{info.address || "—"}</Text>
              </InfoRow>

              {/* Điện thoại */}
              <InfoRow
                color={textPrimary}
                tint={tint}
                label="Điện thoại:"
                icon={<MaterialIcons name="phone" size={20} color={textSecondary} />}
              >
                <LinkText
                  text={info.phone}
                  url={info.phone ? `tel:${info.phone}` : undefined}
                  tint={tint}
                />
              </InfoRow>

              {/* Email */}
              <InfoRow
                color={textPrimary}
                tint={tint}
                label="Email:"
                icon={<MaterialIcons name="email" size={20} color={textSecondary} />}
              >
                <LinkText
                  text={info.email}
                  url={info.email ? `mailto:${info.email}` : undefined}
                  tint={tint}
                />
              </InfoRow>

              {/* Socials */}
              <View style={styles.socialRow}>
                {info?.socials?.facebook ? (
                  <SocialButton
                    bg={Platform.select({ ios: "#1877F2", android: "#1877F2", default: "#1877F2" })}
                    onPress={() => openURL(info.socials.facebook)}
                  >
                    <AntDesign name="facebook-square" size={22} color="#fff" />
                  </SocialButton>
                ) : null}
                {info?.socials?.youtube ? (
                  <SocialButton
                    bg="#FF0000"
                    onPress={() => openURL(info.socials.youtube)}
                  >
                    <AntDesign name="youtube" size={22} color="#fff" />
                  </SocialButton>
                ) : null}
                {info?.socials?.zalo ? (
                  <SocialButton
                    bg={tint}
                    onPress={() => openURL(info.socials.zalo)}
                  >
                    <Ionicons name="chatbubble-ellipses" size={20} color="#fff" />
                  </SocialButton>
                ) : null}
              </View>

              {/* Hỗ trợ */}
              <View style={[styles.section, { borderTopColor: border }]}>
                <Text style={[styles.sectionTitle, { color: textPrimary }]}>Hỗ trợ</Text>

                <View style={styles.line}>
                  <Text style={[styles.labelStrong, { color: textPrimary }]}>
                    Chung:&nbsp;
                  </Text>
                  <LinkText
                    text={info.support?.generalEmail}
                    url={
                      info.support?.generalEmail
                        ? `mailto:${info.support.generalEmail}`
                        : undefined
                    }
                    tint={tint}
                  />
                  <Text style={{ color: textPrimary }}> – </Text>
                  <LinkText
                    text={info.support?.generalPhone}
                    url={
                      info.support?.generalPhone
                        ? `tel:${info.support.generalPhone}`
                        : undefined
                    }
                    tint={tint}
                  />
                </View>

                <View style={styles.line}>
                  <Text style={[styles.labelStrong, { color: textPrimary }]}>
                    Điểm trình:&nbsp;
                  </Text>
                  <LinkText
                    text={info.support?.scoringEmail}
                    url={
                      info.support?.scoringEmail
                        ? `mailto:${info.support.scoringEmail}`
                        : undefined
                    }
                    tint={tint}
                  />
                  <Text style={{ color: textPrimary }}> – </Text>
                  <LinkText
                    text={info.support?.scoringPhone}
                    url={
                      info.support?.scoringPhone
                        ? `tel:${info.support.scoringPhone}`
                        : undefined
                    }
                    tint={tint}
                  />
                </View>

                <View style={styles.line}>
                  <Text style={[styles.labelStrong, { color: textPrimary }]}>
                    Bán hàng:&nbsp;
                  </Text>
                  <LinkText
                    text={info.support?.salesEmail}
                    url={
                      info.support?.salesEmail
                        ? `mailto:${info.support.salesEmail}`
                        : undefined
                    }
                    tint={tint}
                  />
                </View>
              </View>
            </>
          ) : (
            // Skeleton khi loading
            <View style={{ marginTop: 8 }}>
              <SkeletonBar w="60%" h={26} mt={0} bg={skeleton} />
              <SkeletonBar w="45%" bg={skeleton} />
              <SkeletonBar w="70%" bg={skeleton} />
              <SkeletonBar w="30%" bg={skeleton} />
              <SkeletonBar w="65%" bg={skeleton} />
            </View>
          )}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, padding: 16 },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  title: { fontSize: 22, fontWeight: "700", textAlign: "center", marginBottom: 10 },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginVertical: 4,
  },
  iconWrap: { width: 26, alignItems: "center", marginRight: 6 },
  infoText: { fontWeight: "700", fontSize: 15 },
  linkText: { fontSize: 15, fontWeight: Platform.select({ ios: "600", android: "700" }) },
  socialRow: { flexDirection: "row", gap: 10, marginTop: 8, marginBottom: 4 },
  socialBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
  line: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginVertical: 2 },
  labelStrong: { fontWeight: "700" },
});
