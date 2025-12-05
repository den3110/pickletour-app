// src/constants/chatTheme.js

export const CHAT_COLORS = {
  // Primary Gradient
  gradientStart: "#667eea",
  gradientEnd: "#764ba2",

  // Background
  bgLight: "#f8f9fd",
  bgWhite: "#ffffff",
  bgGray: "#f7f8fc",

  // Text
  textPrimary: "#1a1a1a",
  textSecondary: "#666",
  textTertiary: "#999",
  textWhite: "#fff",

  // Border
  borderLight: "#f0f0f0",
  borderMedium: "#e0e0e0",
  borderGray: "#e8eaf0",

  // Status
  online: "#4CAF50",
  error: "#f44336",
  warning: "#ff9800",
  success: "#4CAF50",

  // Message Bubbles
  userBubbleGradient: ["#667eea", "#764ba2"],
  botBubble: "#fff",

  // Shadows
  shadowDark: "#000",
  shadowPrimary: "#667eea",
};

export const CHAT_SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const CHAT_SIZES = {
  // Avatar
  avatarSmall: 36,
  avatarMedium: 44,
  avatarLarge: 96,

  // Button
  buttonHeight: 40,
  buttonRadius: 20,

  // Input
  inputMinHeight: 44,
  inputMaxHeight: 120,
  inputRadius: 24,

  // Bubble
  bubbleRadius: 20,
  bubbleCornerRadius: 4,

  // Icon
  iconSmall: 14,
  iconMedium: 20,
  iconLarge: 24,
  iconXLarge: 48,
};

export const CHAT_FONTS = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",

  sizeXS: 11,
  sizeSM: 13,
  sizeMD: 15,
  sizeLG: 17,
  sizeXL: 22,
};

export const CHAT_ANIMATIONS = {
  durationFast: 200,
  durationNormal: 400,
  durationSlow: 600,

  springConfig: {
    friction: 3,
    tension: 40,
  },
};
