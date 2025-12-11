// components/ui/Chip.tsx
import { normalizeUrl } from "@/utils/normalizeUri";
import React from "react";
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  Modal as RNModal,
  View as ModalView,
  TouchableWithoutFeedback,
  SafeAreaView,
} from "react-native";
import { Image } from "expo-image";

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

export function Chip({ label, selected, onPress, style }: ChipProps) {
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

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#667eea",
    backgroundColor: "transparent",
  },
  chipSelected: {
    backgroundColor: "#667eea",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#667eea",
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
  return <View style={[cardStyles.card, style]}>{children}</View>;
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
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
  const uri = source?.uri ? normalizeUrl(source.uri) : undefined;

  return (
    <Image
      source={uri ? { uri } : require("../../assets/images/icon.png")}
      style={[
        avatarStyles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
        style,
      ]}
      contentFit="cover"
    />
  );
}

const avatarStyles = StyleSheet.create({
  avatar: {
    backgroundColor: "#e0e0e0",
  },
});

// ===================================
// Modal Component
// ===================================

interface ModalProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function Modal({ visible, onClose, children }: ModalProps) {
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

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    width: "100%",
    paddingHorizontal: 20,
  },
  content: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    maxHeight: "90%",
  },
});
