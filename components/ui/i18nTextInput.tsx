// components/ui/i18nTextInput.tsx
// TextInput drop-in: tự dịch prop `placeholder` sang EN khi bật tiếng Anh.
// Render qua PtInput → mọi ô nhập số/điện thoại (keyboardType numeric/decimal-pad/number-pad/phone-pad)
// tự dùng bàn phím số riêng của PickleTour (NumericKeypad); các loại khác giữ nguyên hành vi TextInput.
import React from "react";
import { TextInput as RNTextInput } from "react-native";
import { useLang, translate } from "@/utils/i18n";
import PtInput, { PtInputProps } from "./PtInput";

export const TextInput = React.forwardRef<RNTextInput, PtInputProps>(
  function I18nTextInput({ placeholder, ...rest }, ref) {
    useLang(); // re-render khi đổi ngôn ngữ
    const ph =
      typeof placeholder === "string" ? translate(placeholder) : placeholder;
    return <PtInput ref={ref} placeholder={ph} {...rest} />;
  },
);

// Cho phép dùng `TextInput` ở vị trí type (vd useRef<TextInput>()).
export type TextInput = RNTextInput;

export default TextInput;
