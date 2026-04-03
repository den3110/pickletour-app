import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { AppState, Platform } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useSelector } from "react-redux";
import {
  socket,
  setSocketDeviceContext,
  setSocketToken,
} from "../lib/socket";
import { getDeviceId, getDeviceName } from "@/slices/apiSlice";

const SocketContext = createContext(socket);

function detectClientType() {
  return "app";
}

export function SocketProvider({ children }) {
  const { userInfo } = useSelector((s) => s.auth || {});
  const token = userInfo?.token;
  const clientType = useMemo(detectClientType, []);
  const heartbeatRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const setupSocket = async () => {
      try {
        const [deviceId, deviceName] = await Promise.all([
          getDeviceId(),
          getDeviceName(),
        ]);
        if (cancelled) return;

        setSocketDeviceContext(deviceId, deviceName);
        socket.io.opts.query = {
          ...(socket.io.opts.query || {}),
          client: clientType,
          platform: Platform.OS,
        };

        if (!token) return;

        setSocketToken(token, { deviceId, deviceName });
        if (!socket.connected) socket.connect();
      } catch (e) {
        console.error("[SocketProvider] setup error:", e);
      }
    };

    void setupSocket();

    return () => {
      cancelled = true;
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [token, clientType]);

  useEffect(() => {
    const onConnect = () => {
      console.log("[socket] connected");
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(() => {
        try {
          socket.emit("presence:ping");
        } catch (e) {
          console.log("[socket] heartbeat error:", e);
        }
      }, 10000);
    };

    const onDisconnect = () => {
      console.log("[socket] disconnected");
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };

    const onConnectError = (err) =>
      console.error("[socket] connect_error:", err?.message || err);

    const onError = (err) =>
      console.error("[socket] error:", err?.message || err);

    try {
      socket.on("connect", onConnect);
      socket.on("disconnect", onDisconnect);
      socket.on("error", onError);
      socket.io.on("connect_error", onConnectError);
      socket.io.on("reconnect_error", onError);
    } catch (e) {
      console.error("[SocketProvider] bind listeners error:", e);
    }

    return () => {
      try {
        socket.off("connect", onConnect);
        socket.off("disconnect", onDisconnect);
        socket.off("error", onError);
        socket.io.off("connect_error", onConnectError);
        socket.io.off("reconnect_error", onError);
      } catch (e) {
        console.log(e);
      }
    };
  }, []);

  useEffect(() => {
    const subApp = AppState.addEventListener("change", (state) => {
      if (state === "active" && !socket.connected && token) {
        console.log("[socket] App active, reconnecting...");
        socket.connect();
      }
    });

    const subNet = NetInfo.addEventListener((state) => {
      if (state.isConnected && !socket.connected && token) {
        console.log("[socket] Network restored, reconnecting...");
        socket.connect();
      }
    });

    return () => {
      subApp.remove();
      subNet();
    };
  }, [token]);

  return (
    <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
  );
}

export const useSocket = () => {
  const ctx = useContext(SocketContext);
  if (ctx && typeof ctx.emit !== "function" && ctx?.socket) return ctx.socket;
  return ctx || socket;
};
