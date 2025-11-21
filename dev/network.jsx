// app/dev/network.jsx
import React from "react";
import { NetworkLogger } from "react-native-network-logger";

export default function NetworkScreen() {
  if (!__DEV__) return null; // chỉ hiện khi dev
  return <NetworkLogger />;
}
