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
  const mode = keyboardType ? MODE_BY_KB[String(keyboardType)] : undefined;
  const useKeypad = !!mode && !systemKeyboard;

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

  const openKeypad = useCallback(() => {
    if (editable === false) return;
    setOpen(true);
  }, [editable]);

  const done = useCallback(() => {
    setOpen(false);
    inputRef.current?.blur();
    onSubmitEditing?.({ nativeEvent: { text: current } } as any);
  }, [current, onSubmitEditing]);

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
        onPressIn={(e) => { openKeypad(); (rest as any).onPressIn?.(e); }}
        onFocus={(e) => { openKeypad(); onFocus?.(e); }}
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
