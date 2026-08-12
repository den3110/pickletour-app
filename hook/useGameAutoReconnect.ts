// Shared auto-reconnect hook cho các game (Poker/Phỏm/Sâm/Caro/Chess/Xiangqi).
// Listen NetInfo + AppState + socket disconnect. Khi active/online lại → re-subscribe
// socket + force refetch room state.
import NetInfo from "@react-native-community/netinfo";
import { useEffect, useState } from "react";
import { AppState } from "react-native";

export type ConnStatus = "online" | "offline" | "reconnecting";

export function useGameAutoReconnect({
  socket,
  roomId,
  refetch,
  subscribeEvent,
}: {
  socket: any;
  roomId: string;
  refetch: () => any;
  subscribeEvent: string; // e.g. "phom:room:subscribe"
}): ConnStatus {
  const [connStatus, setConnStatus] = useState<ConnStatus>("online");

  useEffect(() => {
    if (!roomId) return;
    const reconnect = () => {
      setConnStatus("reconnecting");
      try {
        if (socket && !socket.connected) socket.connect?.();
        socket?.emit?.(subscribeEvent, { roomId });
      } catch {}
      const p = refetch();
      const promise = p?.unwrap?.() || p;
      Promise.resolve(promise)
        .then(() => setConnStatus("online"))
        .catch(() => setTimeout(reconnect, 2000));
    };

    const appSub = AppState.addEventListener("change", (state) => {
      if (state === "active") reconnect();
    });
    const netSub = NetInfo.addEventListener((s) => {
      if (s.isConnected === false) setConnStatus("offline");
      else if (s.isConnected && s.isInternetReachable !== false) reconnect();
    });
    const onDisc = () => setConnStatus("offline");
    const onConn = () => reconnect();
    socket?.on?.("disconnect", onDisc);
    socket?.on?.("connect", onConn);

    return () => {
      appSub.remove();
      netSub();
      socket?.off?.("disconnect", onDisc);
      socket?.off?.("connect", onConn);
    };
  }, [socket, roomId, refetch, subscribeEvent]);

  // Polling fallback khi mất mạng — refetch mỗi 5s
  useEffect(() => {
    if (connStatus === "online") return;
    const t = setInterval(() => {
      const p = refetch();
      const promise = p?.unwrap?.() || p;
      Promise.resolve(promise)
        .then(() => setConnStatus("online"))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [connStatus, refetch]);

  return connStatus;
}
