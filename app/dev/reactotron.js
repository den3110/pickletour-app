// src/dev/reactotron.js
import Reactotron from "reactotron-react-native";

const config = { name: "MyExpoApp", host: "192.168.0.105" };
// Nếu máy không tự detect, set LAN IP của máy bạn:
// const config = { name: 'MyExpoApp', host: '192.168.1.23' };

Reactotron.configure(config)
  .useReactNative({
    networking: {
      // bật theo dõi fetch/XHR
      ignoreUrls: /symbolicate|logs/,
    },
  })
  .connect();

// Tuỳ chọn: gắn console.log vào Reactotron để xem chung
console.tron = Reactotron;
console.tron.log?.("Reactotron connected");
export default Reactotron;
