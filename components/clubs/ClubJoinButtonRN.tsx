// components/clubs/ClubJoinButtonRN.tsx
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import {
  useRequestJoinMutation,
  useCancelJoinMutation,
  useLeaveClubMutation,
} from "@/slices/clubsApiSlice";

function PrimaryButton({
  title,
  onPress,
  disabled,
}: {
  title: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      disabled={disabled}
      style={[styles.btnBase, styles.btnPrimary]}
    >
      <LinearGradient
        colors={["#667eea", "#764ba2"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <Text style={[styles.btnText, styles.btnTextLight]} numberOfLines={1}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

function SecondaryButton({
  title,
  onPress,
  disabled,
}: {
  title: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      disabled={disabled}
      style={[styles.btnBase, styles.btnSecondary]}
    >
      <Text style={[styles.btnText, styles.btnTextDark]} numberOfLines={1}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

function DangerGhostButton({
  title,
  onPress,
  disabled,
}: {
  title: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      disabled={disabled}
      style={[styles.btnBase, styles.btnDangerGhost]}
    >
      <Text style={[styles.btnText, styles.btnTextDanger]} numberOfLines={1}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

export default function ClubJoinButtonRN({
  clubId,
  state,
}: {
  clubId: string;
  state: "member" | "pending" | "not_member";
}) {
  const [requestJoin, { isLoading: joining }] = useRequestJoinMutation();
  const [cancelJoin, { isLoading: canceling }] = useCancelJoinMutation();
  const [leaveClub, { isLoading: leaving }] = useLeaveClubMutation();

  if (state === "member") {
    return (
      <DangerGhostButton
        title={leaving ? "Đang rời…" : "Rời CLB"}
        onPress={async () => {
          try {
            await leaveClub({ id: clubId }).unwrap();
            Haptics.selectionAsync();
          } catch {}
        }}
        disabled={leaving}
      />
    );
  }

  if (state === "pending") {
    return (
      <View style={styles.row}>
        <SecondaryButton title="Đã gửi yêu cầu" disabled />
        <DangerGhostButton
          title={canceling ? "Huỷ…" : "Huỷ yêu cầu"}
          onPress={async () => {
            try {
              await cancelJoin({ id: clubId }).unwrap();
              Haptics.selectionAsync();
            } catch {}
          }}
          disabled={canceling}
        />
      </View>
    );
  }

  return (
    <PrimaryButton
      title={joining ? "Đang gửi…" : "Xin gia nhập"}
      onPress={async () => {
        try {
          await requestJoin({ id: clubId }).unwrap();
          Haptics.selectionAsync();
        } catch {}
      }}
      disabled={joining}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8 },
  btnBase: {
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 120,
  },

  // Primary: gradient tím cho nền sáng
  btnPrimary: {
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 3,
  },

  // Secondary: nền sáng, có viền nhạt
  btnSecondary: {
    backgroundColor: "#F6F7FF",
    borderWidth: 1,
    borderColor: "#E6E8F5",
  },

  // Danger ghost: nền trắng mờ, viền nhạt tông đỏ
  btnDangerGhost: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#F5C2C2",
  },

  btnText: { fontWeight: "800", fontSize: 15 },
  btnTextLight: { color: "#FFFFFF" },
  btnTextDark: { color: "#3D4470" },
  btnTextDanger: { color: "#B91C1C" },
});
