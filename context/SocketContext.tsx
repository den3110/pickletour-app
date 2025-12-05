// context/SocketContext.js
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { AppState, Platform } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { socket, setSocketToken } from "../lib/socket";
import { useSelector } from "react-redux";

const SocketContext = createContext(socket);

/** Suy luận loại client cho mobile app */
function detectClientType() {
  try {
    // Có thể dựa vào navigation state hoặc screen name hiện tại
    // Tạm thời return "app" để phân biệt với web
    return "app"; // hoặc "mobile"
  } catch {
    return "app";
  }
}

export function SocketProvider({ children }) {
  const { userInfo } = useSelector((s) => s.auth || {});
  const token = userInfo?.token;
  const clientType = useMemo(detectClientType, []);
  const heartbeatRef = useRef(null);

  // Kết nối khi có token (tránh Unauthorized)
  useEffect(() => {
    // inject opts TRƯỚC khi connect
    try {
      socket.auth = { ...(socket.auth || {}), token };
      socket.io.opts.query = {
        ...(socket.io.opts.query || {}),
        client: clientType,
        platform: Platform.OS, // thêm info platform: ios/android
      };

      // Mobile app nên dùng websocket để tối ưu
      // Nếu muốn cho phép cả polling: bỏ comment dòng dưới
      // socket.io.opts.transports = ["websocket", "polling"];
    } catch (e) {
      console.error("[SocketProvider] set opts error:", e);
    }

    if (!token) {
      // Không connect nếu chưa có token (server đang yêu cầu JWT)
      return;
    }

    try {
      setSocketToken(token);
      if (!socket.connected) socket.connect();
    } catch (e) {
      console.error("[SocketProvider] connect error:", e);
    }

    return () => {
      // Giữ kết nối xuyên app: không disconnect ở đây
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [token, clientType]);

  // Heartbeat + listeners (giống web)
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
      }, 10000); // ping mỗi 10s
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

  // Auto-reconnect khi app active hoặc có network (giữ logic cũ của mobile)
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

  // GIỮ NGUYÊN value = socket để code cũ vẫn dùng được
  return (
    <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
  );
}

/** BACK-COMPAT: trả trực tiếp instance socket (giống code cũ) */
export const useSocket = () => {
  const ctx = useContext(SocketContext);
  // nếu ai đó đã lỡ cung cấp {socket} thì vẫn cố gắng lấy ra
  if (ctx && typeof ctx.emit !== "function" && ctx?.socket) return ctx.socket;
  return ctx || socket;
};
