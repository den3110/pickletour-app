// components/ui/TextInput.tsx
import React, { useMemo } from 'react';
import {
  TextInput as RNTextInput,
  View,
  Text,
  StyleSheet,
  TextInputProps as RNTextInputProps,
  ViewStyle,
} from 'react-native';
// 1. Import Theme Hook
import { useTheme } from '@react-navigation/native';

interface TextInputProps extends RNTextInputProps {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export default function TextInput({
  label,
  error,
  leftIcon,
  rightIcon,
  containerStyle,
  style,
  ...props
}: TextInputProps) {
  // 2. Lấy theme hiện tại
  const { dark } = useTheme();

  // 3. Định nghĩa màu sắc dynamic
  const colors = useMemo(() => ({
    label: dark ? '#A0A0A0' : '#666', // Label sáng hơn chút ở dark mode
    inputBg: dark ? '#2C2C2E' : '#f5f5f5', // Nền input tối
    text: dark ? '#FFFFFF' : '#333', // Chữ trắng
    placeholder: dark ? '#666' : '#999', // Placeholder tối hơn
    border: dark ? '#333' : 'transparent', // Viền nhẹ ở dark mode để tách biệt
  }), [dark]);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Text style={[styles.label, { color: colors.label }]}>
          {label}
        </Text>
      )}
      
      <View
        style={[
          styles.inputContainer,
          { 
            backgroundColor: colors.inputBg,
            borderColor: colors.border,
          },
          error && styles.inputError,
        ]}
      >
        {leftIcon && <View style={styles.icon}>{leftIcon}</View>}
        
        <RNTextInput
          style={[styles.input, { color: colors.text }, style]}
          placeholderTextColor={colors.placeholder}
          {...props}
        />
        
        {rightIcon && <View style={styles.icon}>{rightIcon}</View>}
      </View>
      
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    // BackgroundColor & BorderColor handled inline via theme
  },
  inputError: {
    borderColor: '#f44336',
    borderWidth: 1, // Đảm bảo hiện viền đỏ cả khi ở light mode
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    // Color handled inline via theme
  },
  icon: {
    marginHorizontal: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#f44336',
    marginTop: 4,
  },
});