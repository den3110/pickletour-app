// components/ui/PtInput.tsx — Drop-in thay <TextInput>. Nếu keyboardType là số/điện thoại
// → chặn bàn phím hệ thống và mở NumericKeypad của PickleTour (dấu "." luôn có, style thể thao).
// Các keyboardType khác → hoạt động y nguyên TextInput.
import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { TextInput, TextInputProps } from "react-native";
import NumericKeypad, { KeypadMode } from "./NumericKeypad";

const MODE_BY_KB: Record<string, KeypadMode> = {
  numeric: "decimal",
  "decimal-pad": "decimal",
  "number-pad": "integer",
  "phone-pad": "phone",
};

export type PtInputProps = TextInputProps & {
  /** Nhãn hiển thị trên keypad (mặc định lấy placeholder) */
  keypadLabel?: string;
  /** Ép dùng bàn phím hệ thống dù keyboardType là số */
  systemKeyboard?: boolean;
};

const PtInput = forwardRef<TextInput, PtInputProps>(function PtInput(props, ref) {
  const { keyboardType, keypadLabel, systemKeyboard, onFocus, onBlur, onChangeText, value, defaultValue, editable, placeholder, maxLength, onSubmitEditing, ...rest } = props;
  const kbStr = keyboardType ? String(keyboardType) : "";
  const mode = MODE_BY_KB[kbStr];
  // SĐT (phone-pad) LUÔN dùng bàn phím hệ thống — số điện thoại cần nhập được số 0 ở đầu,
  // keypad custom không cho. CCCD dùng systemKeyboard tại chỗ nhập.
  const useKeypad = !!mode && !systemKeyboard && kbStr !== "phone-pad";

  const inputRef = useRef<TextInput>(null);
  useImperativeHandle(ref, () => inputRef.current as TextInput);

  // Hỗ trợ cả controlled lẫn uncontrolled
  const [inner, setInner] = useState<string>(value != null ? String(value) : defaultValue != null ? String(defaultValue) : "");
  const controlled = value !== undefined;
  const current = controlled ? String(value ?? "") : inner;
  const [open, setOpen] = useState(false);

  const setText = useCallback((t: string) => {
    if (!controlled) setInner(t);
    onChangeText?.(t);
  }, [controlled, onChangeText]);

  // Sau khi bấm "Xong", Modal đóng → focus TỰ quay lại TextInput → onFocus lại mở
  // keypad → keypad "không bao giờ tắt". Cờ này chặn lần mở-do-focus ngay sau khi Done.
  const suppressFocusOpenRef = useRef(false);
  const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // fromPress = true khi user CHẠM thật vào ô → luôn mở (bỏ qua suppress).
  const openKeypad = useCallback((fromPress = false) => {
    if (editable === false) return;
    if (suppressFocusOpenRef.current && !fromPress) return;
    if (fromPress) suppressFocusOpenRef.current = false;
    setOpen(true);
  }, [editable]);

  const done = useCallback(() => {
    suppressFocusOpenRef.current = true;
    setOpen(false);
    inputRef.current?.blur();
    onSubmitEditing?.({ nativeEvent: { text: current } } as any);
    if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
    suppressTimerRef.current = setTimeout(() => {
      suppressFocusOpenRef.current = false;
    }, 500);
  }, [current, onSubmitEditing]);

  React.useEffect(
    () => () => {
      if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
    },
    [],
  );

  if (!useKeypad) {
    return (
      <TextInput
        ref={inputRef}
        keyboardType={keyboardType}
        onFocus={onFocus}
        onBlur={onBlur}
        onChangeText={onChangeText}
        value={value}
        defaultValue={defaultValue}
        editable={editable}
        placeholder={placeholder}
        maxLength={maxLength}
        onSubmitEditing={onSubmitEditing}
        {...rest}
      />
    );
  }

  return (
    <>
      <TextInput
        ref={inputRef}
        {...rest}
        value={current}
        placeholder={placeholder}
        editable={editable}
        maxLength={maxLength}
        keyboardType={keyboardType}
        showSoftInputOnFocus={false}
        contextMenuHidden
        onPressIn={(e) => { openKeypad(true); (rest as any).onPressIn?.(e); }}
        onFocus={(e) => { openKeypad(false); onFocus?.(e); }}
        onBlur={onBlur}
        onChangeText={setText}
      />
      <NumericKeypad
        visible={open}
        value={current}
        mode={mode!}
        label={keypadLabel || placeholder}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={setText}
        onDone={done}
      />
    </>
  );
});

export default PtInput;
