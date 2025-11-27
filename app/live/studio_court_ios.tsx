// app/live/studio_court.ios.tsx
import React, { useMemo } from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import { View, Text } from "react-native";

export default function StudioCourtIOS() {
  const p = useLocalSearchParams<{ courtId?: string }>();
  const courtId = (p.courtId ?? "").toString();

  const title = useMemo(
    () => `Live Studio (iOS) — Court ${courtId ? courtId.slice(-4) : ""}`,
    [courtId]
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title,
        }}
      />
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
      >
        <Text
          style={{
            fontSize: 16,
            textAlign: "center",
          }}
        >
          Live Studio native hiện mới được hỗ trợ trên Android (HaishinKit /
          RTMP bridge đang làm riêng).
          {"\n\n"}
          Bản iOS/Expo hiện tại chưa tích hợp native module, nên không thể quay
          live trực tiếp từ màn này. Sau khi bạn hoàn tất native module cho
          iOS, mình có thể cập nhật màn này để dùng component tương ứng.
        </Text>
      </View>
    </>
  );
}
