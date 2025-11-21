// src/dev/reactotron.js
import Reactotron from "reactotron-react-native";

console.log("========================================");
console.log("🔧 Đang khởi tạo Reactotron...");

const host = process.env.EXPO_PUBLIC_LAN_IP || "192.168.0.100";
const config = { name: "MyExpoApp", host };

console.log("📍 Host IP:", host);
console.log("📦 Config:", JSON.stringify(config));
console.log("========================================");

try {
  Reactotron.configure(config)
    .useReactNative({
      networking: {
        ignoreUrls: /symbolicate|logs/,
      },
    })
    .connect();

  console.log("✅ Reactotron.connect() đã được gọi");

  // Test log ngay
  setTimeout(() => {
    Reactotron.log?.("🎉 Test log từ Reactotron");
    console.log("📱 Test log từ console.log");
  }, 1000);
} catch (error) {
  console.error("❌ Lỗi khi khởi tạo Reactotron:", error);
}

console.tron = Reactotron;

export default Reactotron;
