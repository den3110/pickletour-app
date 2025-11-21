// context/SocketContext.js
import React, { createContext, useContext, useEffect } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { socket, setSocketToken } from "../lib/socket";
import { useSelector } from "react-redux";

const SocketContext = createContext(socket);

export function SocketProvider({ children }) {
  const token = useSelector((s) => s.auth?.userInfo?.token); // tuỳ theo bạn lưu ở đâu

  useEffect(() => {
    setSocketToken(token);
    if (!socket.connected) socket.connect();
  }, [token]);

  useEffect(() => {
    const subApp = AppState.addEventListener("change", (state) => {
      if (state === "active" && !socket.connected) socket.connect();
    });
    const subNet = NetInfo.addEventListener((state) => {
      if (state.isConnected && !socket.connected) socket.connect();
    });
    return () => {
      subApp.remove();
      subNet();
    };
  }, []);

  return (
    <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
  );
}
export const useSocket = () => useContext(SocketContext);
