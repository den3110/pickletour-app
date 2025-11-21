// components/clubs/EmptyState.tsx
import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, BounceIn } from 'react-native-reanimated';
import Button from '../ui/Button';

interface EmptyStateProps {
  icon: string;
  title: string;
  subtitle: string;
  onAction?: () => void;
  actionText?: string;
}

export default function EmptyState({
  icon,
  title,
  subtitle,
  onAction,
  actionText = 'Tạo mới',
}: EmptyStateProps) {
  return (
    <Animated.View entering={FadeIn.duration(500)} style={styles.container}>
      <Animated.View entering={BounceIn.delay(200).duration(600)}>
        <LinearGradient
          colors={['rgba(102, 126, 234, 0.1)', 'rgba(118, 75, 162, 0.1)']}
          style={styles.iconContainer}
        >
          <MaterialCommunityIcons name={icon as any} size={64} color="#667eea" />
        </LinearGradient>
      </Animated.View>

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      {onAction && (
        <Button title={actionText} onPress={onAction} gradient size="medium" />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
});