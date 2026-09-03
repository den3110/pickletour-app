// components/ui/i18nText.tsx
// Text tự dịch: nếu ngôn ngữ = EN và child là chuỗi có trong từ điển -> hiển thị
// tiếng Anh; ngược lại giữ nguyên (tiếng Việt). Dùng thay cho Text của react-native.
import React from "react";
import { Text as RNText, TextProps } from "react-native";
import { useLang, translate } from "@/utils/i18n";

function mapChild(c: React.ReactNode): React.ReactNode {
  if (typeof c === "string") return translate(c);
  if (typeof c === "number") return c;
  if (Array.isArray(c)) return c.map(mapChild);
  return c;
}

export function Text({ children, ...rest }: TextProps) {
  useLang(); // re-render khi đổi ngôn ngữ
  return <RNText {...rest}>{mapChild(children)}</RNText>;
}

export default Text;
