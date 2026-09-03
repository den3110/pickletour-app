// components/ui/i18nTextInput.tsx
// TextInput drop-in: tự dịch prop `placeholder` sang EN khi bật tiếng Anh.
// Giữ nguyên mọi props/ref/behaviour của react-native TextInput.
import React from "react";
import { TextInput as RNTextInput, TextInputProps } from "react-native";
import { useLang, translate } from "@/utils/i18n";

export const TextInput = React.forwardRef<RNTextInput, TextInputProps>(
  function I18nTextInput({ placeholder, ...rest }, ref) {
    useLang(); // re-render khi đổi ngôn ngữ
    const ph =
      typeof placeholder === "string" ? translate(placeholder) : placeholder;
    return <RNTextInput ref={ref} placeholder={ph} {...rest} />;
  },
);

// Cho phép dùng `TextInput` ở vị trí type (vd useRef<TextInput>()).
export type TextInput = RNTextInput;

export default TextInput;
