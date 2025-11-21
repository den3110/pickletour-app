// components/ui/Button.tsx
import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  gradient?: boolean;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
  size?: "small" | "medium" | "large";
}

export default function Button({
  title,
  onPress,
  variant = "primary",
  gradient = false,
  disabled = false,
  loading = false,
  icon,
  style,
  textStyle,
  size = "medium",
}: ButtonProps) {
  const sizeStyles = {
    small: { paddingVertical: 8, paddingHorizontal: 16 },
    medium: { paddingVertical: 12, paddingHorizontal: 24 },
    large: { paddingVertical: 16, paddingHorizontal: 32 },
  };

  const textSizes = {
    small: { fontSize: 13 },
    medium: { fontSize: 15 },
    large: { fontSize: 17 },
  };

  const content = (
    <View style={styles.content}>
      {loading ? (
        <ActivityIndicator
          size="small"
          color={
            variant === "outline" || variant === "ghost" ? "#667eea" : "#fff"
          }
        />
      ) : (
        <>
          {icon}
          <Text
            style={[
              styles.text,
              variant === "outline" && styles.textOutline,
              variant === "ghost" && styles.textGhost,
              textSizes[size],
              textStyle,
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </View>
  );

  if (gradient && variant === "primary" && !disabled) {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled || loading}
        activeOpacity={0.8}
        style={[styles.container, style]}
      >
        <LinearGradient
          colors={["#667eea", "#764ba2"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.gradient, sizeStyles[size]]}
        >
          {content}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        styles.container,
        styles.button,
        sizeStyles[size],
        variant === "primary" && styles.primary,
        variant === "secondary" && styles.secondary,
        variant === "outline" && styles.outline,
        variant === "ghost" && styles.ghost,
        disabled && styles.disabled,
        style,
      ]}
    >
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: "hidden",
  },
  button: {
    alignItems: "center",
    justifyContent: "center",
  },
  gradient: {
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  text: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  primary: {
    backgroundColor: "#667eea",
  },
  secondary: {
    backgroundColor: "#f5f5f5",
  },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: "#667eea",
  },
  ghost: {
    backgroundColor: "transparent",
  },
  textOutline: {
    color: "#667eea",
  },
  textGhost: {
    color: "#667eea",
  },
  disabled: {
    opacity: 0.5,
  },
});
