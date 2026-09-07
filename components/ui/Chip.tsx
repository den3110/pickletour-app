// components/ui/Chip.tsx
import {
  normalizeUrl } from "@/utils/normalizeUri";
import React, { useMemo } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  Modal as RNModal,
  View as ModalView,
  TouchableWithoutFeedback,
  SafeAreaView,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Image } from "expo-image";
import { useThemeTokens, type ThemeTokens } from "@/hooks/useThemeTokens";

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

export function Chip({ label, selected, onPress, style }: ChipProps) {
  const C = useThemeTokens();
  const styles = useMemo(() => mk_styles(C), [C]);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.chip, selected && styles.chipSelected, style]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const mk_styles = (C: ThemeTokens) => StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.field,
  },
  chipSelected: {
    backgroundColor: "#667eea",
    borderColor: "#667eea",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: C.text2,
  },
  chipTextSelected: {
    color: "#fff",
  },
});

// ===================================
// Card Component
// ===================================
interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function Card({ children, style }: CardProps) {
  const C = useThemeTokens();
  const cardStyles = useMemo(() => mk_cardStyles(C), [C]);
  return <View style={[cardStyles.card, style]}>{children}</View>;
}

const mk_cardStyles = (C: ThemeTokens) => StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
});

// ===================================
// Avatar Component
// ===================================

interface AvatarProps {
  source?: { uri?: string };
  size?: number;
  style?: ViewStyle;
}

export function Avatar({ source, size = 40, style }: AvatarProps) {
  const C = useThemeTokens();
  const uri = source?.uri ? normalizeUrl(source.uri) : undefined;

  return (
    <Image
      source={uri ? { uri } : require("../../assets/images/icon.png")}
      style={[
        { backgroundColor: C.line },
        { width: size, height: size, borderRadius: size / 2 },
        style,
      ]}
      contentFit="cover"
    />
  );
}

// ===================================
// Modal Component
// ===================================

interface ModalProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function Modal({ visible, onClose, children }: ModalProps) {
  const C = useThemeTokens();
  const modalStyles = useMemo(() => mk_modalStyles(C), [C]);
  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <ModalView style={modalStyles.overlay}>
          <TouchableWithoutFeedback>
            <SafeAreaView style={modalStyles.container}>
              <ModalView style={modalStyles.content}>{children}</ModalView>
            </SafeAreaView>
          </TouchableWithoutFeedback>
        </ModalView>
      </TouchableWithoutFeedback>
    </RNModal>
  );
}

const mk_modalStyles = (C: ThemeTokens) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: C.overlay,
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    width: "100%",
    paddingHorizontal: 20,
  },
  content: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 24,
    maxHeight: "90%",
  },
});
