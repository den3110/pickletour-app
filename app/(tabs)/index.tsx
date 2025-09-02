// app/index.jsx  (Home)
// Nếu bạn đang để Home ở file khác, dán phần ContactCard + dùng <ContactCard/> tương tự
import React, { useMemo } from "react";
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Platform,
  Linking,
  Alert,
  useColorScheme,
  TouchableOpacity,
} from "react-native";
import { Stack } from "expo-router";
import Hero from "@/components/Hero";
import { AntDesign, Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useGetContactContentQuery } from "@/slices/cmsApiSlice";

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

function openURL(url) {
  if (!url) return;
  Linking.canOpenURL(url)
    .then((ok) =>
      ok ? Linking.openURL(url) : Alert.alert("Lỗi", "Không mở được liên kết.")
    )
    .catch(() => Alert.alert("Lỗi", "Không mở được liên kết."));
}

function LinkText({ text, url, tint }) {
  if (!text) return <Text style={{ color: "#9aa0a6" }}>—</Text>;
  return (
    <Text
      style={{
        color: tint,
        fontWeight: Platform.select({ ios: "600", android: "700" }),
      }}
      onPress={() => openURL(url)}
      suppressHighlighting
    >
      {text}
    </Text>
  );
}

function InfoRow({ icon, label, children, color }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        marginVertical: 4,
      }}
    >
      <View style={{ width: 26, alignItems: "center", marginRight: 6 }}>
        {icon}
      </View>
      <Text style={{ fontWeight: "700", fontSize: 15, color }}>{label} </Text>
      {typeof children === "string" ? (
        <Text style={{ fontSize: 15, color }}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

function SocialButton({ onPress, children, bg }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        width: 42,
        height: 42,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bg,
      }}
    >
      {children}
    </TouchableOpacity>
  );
}

function ContactCard() {
  const scheme = useColorScheme() ?? "light";
  const isDark = scheme === "dark";
  const bg = isDark ? "#14171c" : "#ffffff";
  const border = isDark ? "#2a2e35" : "#e7eaf0";
  const text = isDark ? "#ffffff" : "#111111";
  const sub = isDark ? "#c9c9c9" : "#555555";
  const tint = isDark ? "#7cc0ff" : "#0a84ff";

  const { data, isLoading, isError } = useGetContactContentQuery();
  const info = useMemo(
    () => (isLoading ? null : isError ? FALLBACK : { ...FALLBACK, ...data }),
    [data, isLoading, isError]
  );

  return (
    <View style={[styles.card, { backgroundColor: bg, borderColor: border }]}>
      <Text
        style={{
          fontSize: 18,
          fontWeight: "700",
          color: text,
          marginBottom: 8,
        }}
      >
        Liên hệ & Hỗ trợ
      </Text>

      {info ? (
        <>
          <InfoRow
            color={text}
            label="Địa chỉ:"
            icon={<MaterialIcons name="location-on" size={22} color={sub} />}
          >
            <Text style={{ color: text }}>{info.address || "—"}</Text>
          </InfoRow>

          <InfoRow
            color={text}
            label="Điện thoại:"
            icon={<MaterialIcons name="phone" size={20} color={sub} />}
          >
            <LinkText
              text={info.phone}
              url={info.phone ? `tel:${info.phone}` : undefined}
              tint={tint}
            />
          </InfoRow>

          <InfoRow
            color={text}
            label="Email:"
            icon={<MaterialIcons name="email" size={20} color={sub} />}
          >
            <LinkText
              text={info.email}
              url={info.email ? `mailto:${info.email}` : undefined}
              tint={tint}
            />
          </InfoRow>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
            {info?.socials?.facebook ? (
              <SocialButton
                bg="#1877F2"
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
        </>
      ) : (
        <Text style={{ color: sub }}>Đang tải…</Text>
      )}
    </View>
  );
}

export default function HomeScreen() {
  return (
    <>
      <Stack.Screen
        options={{ title: "PickleTour", headerTitleAlign: "center" }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <Hero />
        <View style={{ height: 8 }} />
        {/* 👇 Card Liên hệ đặt ở trang chủ */}
        <View style={{ paddingHorizontal: 16 }}>
          <ContactCard />
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
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
});
