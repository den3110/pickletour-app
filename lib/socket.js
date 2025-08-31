import { io } from "socket.io-client";

// URL API của bạn (ví dụ từ .env)
const API_URL = process.env.EXPO_PUBLIC_SOCKET_URL;

let authToken = null;
export function setSocketToken(token) {
  authToken = token || null;
  // Có thể cập nhật auth cho lần reconnect tiếp theo:
  if (socket) socket.auth = { token: authToken };
}

export const socket = io(API_URL, {
  path: "/socket.io", // khớp app.js
  withCredentials: true, // vì CORS dùng credentials
  autoConnect: false, // tự điều khiển connect
  transports: ["websocket"], // ưu tiên ws
  reconnection: true,
  auth: () => ({ token: authToken }),
});

// Một số log hữu ích khi dev
socket.on("connect", () => {
  console.log("⚡ socket connected:", socket.id);
});
socket.on("connect_error", (err) => {
  console.log("❌ connect_error:", err?.message || err);
});
socket.on("reconnect_attempt", (n) => {
  console.log("↻ reconnect_attempt:", n);
});
