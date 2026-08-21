/* eslint-disable react/prop-types */
// rnModalSheet.tsx
// Shim API-tương thích @gorhom/bottom-sheet, nhưng render bằng RN <Modal>.
//
// LÝ DO: các sheet mở TỪ menu "Chức năng" (bản thân là RN Modal) không hiện
// khi dùng gorhom BottomSheetModal — gorhom present() vào Portal ở gốc cây
// view, nằm DƯỚI native modal của menu (iOS) → bị che; và không đáng tin khi
// chuyển tiếp giữa 2 lớp modal. Ngược lại, RN Modal → RN Modal hoạt động hoàn
// hảo trên đúng màn này (Xuất PDF/Word trong menu đều mở RN Modal và chạy tốt).
//
// Chỉ cần đổi dòng import trong mỗi sheet từ "@gorhom/bottom-sheet" sang file
// này — API present()/dismiss() + BottomSheetScrollView/FlatList/Backdrop giữ
// nguyên, không phải viết lại nội dung sheet.

import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useState,
} from "react";
import {
  Modal,
  View,
  ScrollView,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  useColorScheme,
} from "react-native";

export type BottomSheetModalRef = {
  present: () => void;
  dismiss: () => void;
  close: () => void;
  forceClose: () => void;
  snapToIndex: () => void;
  snapToPosition: () => void;
  expand: () => void;
  collapse: () => void;
};

type AnyStyle = any;

/**
 * Thay thế BottomSheetModal: forwardRef expose present()/dismiss() như gorhom,
 * nội dung render trong RN <Modal> trượt từ đáy lên (giống bottom sheet).
 */
export const BottomSheetModal = forwardRef<BottomSheetModalRef, any>(
  function RNModalSheet(
    {
      children,
      onDismiss,
      onChange,
      backgroundStyle,
      handleIndicatorStyle,
      // Các prop gorhom không áp dụng cho RN Modal — nhận rồi bỏ qua:
      snapPoints, // eslint-disable-line @typescript-eslint/no-unused-vars
      backdropComponent, // eslint-disable-line @typescript-eslint/no-unused-vars
      containerStyle, // eslint-disable-line @typescript-eslint/no-unused-vars
      enablePanDownToClose, // eslint-disable-line @typescript-eslint/no-unused-vars
      enableDynamicSizing, // eslint-disable-line @typescript-eslint/no-unused-vars
      keyboardBehavior, // eslint-disable-line @typescript-eslint/no-unused-vars
      keyboardBlurBehavior, // eslint-disable-line @typescript-eslint/no-unused-vars
      android_keyboardInputMode, // eslint-disable-line @typescript-eslint/no-unused-vars
      index, // eslint-disable-line @typescript-eslint/no-unused-vars
      topInset, // eslint-disable-line @typescript-eslint/no-unused-vars
      bottomInset, // eslint-disable-line @typescript-eslint/no-unused-vars
      onPresent,
      ...rest
    }: any,
    ref,
  ) {
    const scheme = useColorScheme() ?? "light";
    const [visible, setVisible] = useState(false);

    const present = useCallback(() => {
      setVisible(true);
      onPresent?.();
      onChange?.(0);
    }, [onPresent, onChange]);

    const dismiss = useCallback(() => {
      setVisible((v) => {
        if (v) onChange?.(-1);
        return false;
      });
    }, [onChange]);

    useImperativeHandle(
      ref,
      () => ({
        present,
        dismiss,
        close: dismiss,
        forceClose: dismiss,
        snapToIndex: () => {},
        snapToPosition: () => {},
        expand: () => {},
        collapse: dismiss,
      }),
      [present, dismiss],
    );

    // Backdrop tap / nút back / swipe close → đóng + báo onDismiss (giống gorhom).
    const handleClose = useCallback(() => {
      setVisible(false);
      onChange?.(-1);
      onDismiss?.();
    }, [onDismiss, onChange]);

    const sheetBg =
      (backgroundStyle && backgroundStyle.backgroundColor) ||
      (scheme === "dark" ? "#1e293b" : "#ffffff");

    return (
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={handleClose}
        {...rest}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <View style={styles.root}>
            <Pressable style={styles.backdrop} onPress={handleClose} />
            <View
              style={[
                styles.sheet,
                { backgroundColor: sheetBg },
                backgroundStyle,
              ]}
            >
              <View style={styles.handleWrap}>
                <View
                  style={[
                    styles.handle,
                    handleIndicatorStyle,
                  ]}
                />
              </View>
              <View style={styles.body}>{children}</View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  },
);

/* ScrollView/FlatList/TextInput/View/Backdrop tương thích — bản RN thuần.
   flexShrink:1 để scrollable co vừa maxHeight của sheet và cuộn được. */
export const BottomSheetScrollView = forwardRef<any, any>(
  function BottomSheetScrollView({ style, ...props }, ref) {
    return <ScrollView ref={ref} style={[styles.scrollable, style]} {...props} />;
  },
);

const AnyFlatList = FlatList as any;
export const BottomSheetFlatList = forwardRef<any, any>(
  function BottomSheetFlatList({ style, ...props }, ref) {
    return (
      <AnyFlatList ref={ref} style={[styles.scrollable, style]} {...props} />
    );
  },
);

export const BottomSheetView = forwardRef<any, any>(
  function BottomSheetView(props, ref) {
    return <View ref={ref} {...props} />;
  },
);

export const BottomSheetTextInput = forwardRef<any, any>(
  function BottomSheetTextInput(props, ref) {
    return <TextInput ref={ref} {...props} />;
  },
);

// gorhom Backdrop được RN Modal thay bằng backdrop nội bộ → no-op.
export const BottomSheetBackdrop = () => null;

// Provider không cần thiết với RN Modal — export no-op để tương thích nếu ai import.
export const BottomSheetModalProvider = ({ children }: any) => <>{children}</>;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    maxHeight: "90%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  handleWrap: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 2,
  },
  handle: {
    width: 42,
    height: 5,
    borderRadius: 99,
    backgroundColor: "#cbd5e1",
  },
  body: {
    flexShrink: 1,
  },
  scrollable: {
    flexGrow: 0,
    flexShrink: 1,
  },
});
