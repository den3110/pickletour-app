import { io } from "socket.io-client";

const API_URL = process.env.EXPO_PUBLIC_SOCKET_URL;

let authState = {
  token: null,
  deviceId: "",
  deviceName: "",
};

function applySocketAuth() {
  if (!socket) return;
  socket.auth = {
    token: authState.token,
    deviceId: authState.deviceId,
    deviceName: authState.deviceName,
  };
}

export function setSocketToken(token, options = {}) {
  authState = {
    ...authState,
    token: token || null,
    deviceId: options?.deviceId ?? authState.deviceId,
    deviceName: options?.deviceName ?? authState.deviceName,
  };
  applySocketAuth();
}

export function setSocketDeviceContext(deviceId, deviceName = "") {
  authState = {
    ...authState,
    deviceId: deviceId || authState.deviceId,
    deviceName: deviceName || authState.deviceName,
  };
  applySocketAuth();
}

export const socket = io(API_URL, {
  path: "/socket.io",
  withCredentials: true,
  autoConnect: false,
  transports: ["websocket"],
  reconnection: true,
  auth: () => ({ ...authState }),
});

socket.on("connect", () => {
  console.log("[socket] connected:", socket.id);
});

socket.on("connect_error", (err) => {
  console.log("[socket] connect_error:", err?.message || err);
});

socket.on("reconnect_attempt", (n) => {
  console.log("[socket] reconnect_attempt:", n);
});
