import React, { useState } from "react";
import { View, Text, Button } from "react-native";
import { NativeModules } from "react-native";

const { HelloModule } = NativeModules as {
  HelloModule: {
    ping(msg: string): Promise<string>;
    platform: string;
    openApp(packageName: string): Promise<boolean>;
    openAppOrStore(packageName: string): Promise<boolean>;
    openAppSettings(packageName: string): Promise<boolean>;
  };
};

export default function NativeTest() {
  const [res, setRes] = useState("");

  return (
    <View
      style={{
        flex: 1,
        gap: 12,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text>Platform: {HelloModule?.platform}</Text>

      <Button
        title="Ping native"
        onPress={async () => {
          setRes(String(await HelloModule.ping("xin chào")));
        }}
      />

      <Button
        title="Mở Facebook (openApp)"
        onPress={async () => {
          await HelloModule.openApp("com.facebook.katana");
        }}
      />

      <Button
        title="Mở Zalo, nếu chưa có thì vào Store (openAppOrStore)"
        onPress={async () => {
          await HelloModule.openAppOrStore("com.zing.zalo");
        }}
      />

      <Button
        title="Mở App Settings của PickleTour"
        onPress={async () => {
          await HelloModule.openAppSettings("com.pkt.pickletour");
        }}
      />

      <Text>Kết quả: {res}</Text>
    </View>
  );
}
