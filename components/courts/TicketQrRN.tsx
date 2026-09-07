// components/courts/TicketQrRN.tsx — QR vé vào sân (react-native-svg)
import React, { useMemo } from "react";
import Svg, { Path, Rect } from "react-native-svg";
import qrcode from "qrcode-generator";

export const ticketQrPayload = (token: string) => `ptbk:${token}`;

export default function TicketQrRN({ token, size = 220, prefix = "ptbk:" }: { token?: string; size?: number; prefix?: string }) {
  const d = useMemo(() => {
    if (!token) return "";
    const qr = qrcode(0, "M");
    qr.addData(`${prefix}${token}`);
    qr.make();
    const n = qr.getModuleCount();
    const cell = size / (n + 8);
    const pad = cell * 4;
    let path = "";
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) {
        if (qr.isDark(r, c)) {
          path += `M${(pad + c * cell).toFixed(2)} ${(pad + r * cell).toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}z`;
        }
      }
    }
    return path;
  }, [token, size, prefix]);

  if (!d) return null;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Rect x={0} y={0} width={size} height={size} rx={12} fill="#fff" />
      <Path d={d} fill="#000" />
    </Svg>
  );
}
