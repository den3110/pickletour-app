// components/clubs/ClubJoinButton.tsx
import React from "react";
import { View, StyleSheet, Alert, ActivityIndicator, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from "react-native-reanimated";
import {
  useRequestJoinMutation,
  useCancelJoinMutation,
  useLeaveClubMutation,
} from "@/slices/clubsApiSlice";
import Button from "../ui/Button";
import type { Club } from "@/types/club.types";

interface ClubJoinButtonProps {
  club: Club;
  onChanged?: () => void;
}

export default function ClubJoinButton({
  club,
  onChanged,
}: ClubJoinButtonProps) {
  const [requestJoin, { isLoading: joining }] = useRequestJoinMutation();
  const [cancelJoin, { isLoading: canceling }] = useCancelJoinMutation();
  const [leaveClub, { isLoading: leaving }] = useLeaveClubMutation();

  const scale = useSharedValue(1);

  const my = club._my;
  const isMember =
    my?.isMember ||
    my?.membershipRole === "owner" ||
    my?.membershipRole === "admin";
  const isPending = my?.pendingRequest;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSpring(0.95, {}, () => {
      scale.value = withSpring(1);
    });
  };

  const handleRequestJoin = async () => {
    handlePress();
    try {
      const res = await requestJoin({ id: club._id }).unwrap();
      if (res?.joined) {
        Alert.alert("Thành công", "Bạn đã tham gia CLB!");
      } else {
        Alert.alert(
          "Đã gửi",
          "Yêu cầu gia nhập đã được gửi đến quản trị viên."
        );
      }
      onChanged?.();
    } catch (err: any) {
      Alert.alert("Lỗi", err?.data?.message || "Không thể gửi yêu cầu");
    }
  };

  const handleCancelJoin = async () => {
    handlePress();
    try {
      await cancelJoin({ id: club._id }).unwrap();
      Alert.alert("Đã hủy", "Yêu cầu gia nhập đã được hủy.");
      onChanged?.();
    } catch (err: any) {
      Alert.alert("Lỗi", err?.data?.message || "Không thể hủy yêu cầu");
    }
  };

  const handleLeave = async () => {
    Alert.alert(
      "Rời khỏi CLB",
      "Bạn có chắc chắn muốn rời khỏi câu lạc bộ này?",
      [
        { text: "Hủy", style: "cancel" },
        {
          text: "Rời CLB",
          style: "destructive",
          onPress: async () => {
            handlePress();
            try {
              await leaveClub({ id: club._id }).unwrap();
              Alert.alert("Đã rời", "Bạn đã rời khỏi câu lạc bộ.");
              onChanged?.();
            } catch (err: any) {
              Alert.alert("Lỗi", err?.data?.message || "Không thể rời CLB");
            }
          },
        },
      ]
    );
  };

  if (isMember) {
    return (
      <Animated.View style={[styles.container, animatedStyle]}>
        <Button
          title={leaving ? "Đang xử lý..." : "Đã tham gia"}
          onPress={handleLeave}
          variant="outline"
          disabled={leaving}
          loading={leaving}
          icon={
            !leaving && (
              <MaterialCommunityIcons
                name="check-circle"
                size={20}
                color="#4CAF50"
              />
            )
          }
        />
      </Animated.View>
    );
  }

  if (isPending) {
    return (
      <Animated.View style={[styles.container, animatedStyle]}>
        <View style={styles.buttonRow}>
          <View style={[styles.pendingButton, { flex: 1 }]}>
            <MaterialCommunityIcons
              name="clock-outline"
              size={20}
              color="#FF9800"
            />
            <Text style={styles.pendingText}>Đang chờ duyệt</Text>
          </View>

          <Button
            title="Hủy"
            onPress={handleCancelJoin}
            variant="outline"
            disabled={canceling}
            loading={canceling}
            size="medium"
          />
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <Button
        title="Xin gia nhập"
        onPress={handleRequestJoin}
        gradient
        disabled={joining}
        loading={joining}
        icon={
          !joining && (
            <MaterialCommunityIcons
              name="account-plus"
              size={20}
              color="#fff"
            />
          )
        }
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
  },
  pendingButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#f0f0f0",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#FF9800",
  },
  pendingText: {
    color: "#FF9800",
    fontSize: 14,
    fontWeight: "600",
  },
});
