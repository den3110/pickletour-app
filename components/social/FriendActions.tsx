// components/social/FriendActions.tsx
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useSelector } from "react-redux";

import {
  useAcceptFriendMutation,
  useDeclineFriendMutation,
  useFriendStatusQuery,
  useRemoveFriendMutation,
  useSendFriendRequestMutation,
} from "@/slices/friendsApiSlice";

export function FriendActions({
  userId,
  compact = false,
}: {
  userId: string;
  compact?: boolean;
}) {
  const me = useSelector((s: any) => s.auth?.userInfo);
  const { data, isFetching } = useFriendStatusQuery(userId, {
    skip: !me || !userId,
  });
  const [sendReq, { isLoading: sending }] = useSendFriendRequestMutation();
  const [accept, { isLoading: accepting }] = useAcceptFriendMutation();
  const [decline] = useDeclineFriendMutation();
  const [remove, { isLoading: removing }] = useRemoveFriendMutation();

  if (!me || !userId) return null;
  if (data?.status === "self") return null;

  const status = data?.status || "none";

  const doErr = (err: any) =>
    Alert.alert("Lỗi", err?.data?.message || "Không thực hiện được");

  const doSend = async () => {
    try {
      await sendReq(userId).unwrap();
    } catch (err: any) {
      doErr(err);
    }
  };
  const doCancel = async () => {
    try {
      await remove((data as any).edgeId).unwrap();
    } catch (err: any) {
      doErr(err);
    }
  };
  const doAccept = async () => {
    try {
      await accept((data as any).edgeId).unwrap();
    } catch (err: any) {
      doErr(err);
    }
  };
  const doDecline = async () => {
    try {
      await decline((data as any).edgeId).unwrap();
    } catch (err: any) {
      doErr(err);
    }
  };
  const doUnfriend = async () => {
    Alert.alert("Huỷ kết bạn?", undefined, [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Huỷ kết bạn",
        style: "destructive",
        onPress: async () => {
          try {
            await remove((data as any).edgeId).unwrap();
          } catch (err: any) {
            doErr(err);
          }
        },
      },
    ]);
  };

  if (isFetching && !data) {
    return <ActivityIndicator size="small" />;
  }

  if (status === "none" || status === "declined") {
    return (
      <Pressable
        onPress={doSend}
        disabled={sending}
        style={[styles.btn, styles.btnPrimary, compact && styles.btnCompact]}
      >
        <Ionicons name="person-add-outline" size={16} color="#fff" />
        {!compact && <Text style={styles.btnPrimaryText}>Kết bạn</Text>}
      </Pressable>
    );
  }
  if (status === "pending_outgoing") {
    return (
      <Pressable
        onPress={doCancel}
        disabled={removing}
        style={[styles.btn, styles.btnOutline, compact && styles.btnCompact]}
      >
        <Ionicons name="hourglass-outline" size={16} color="#64748B" />
        {!compact && <Text style={styles.btnOutlineText}>Huỷ lời mời</Text>}
      </Pressable>
    );
  }
  if (status === "pending_incoming") {
    return (
      <View style={{ flexDirection: "row", gap: 6 }}>
        <Pressable
          onPress={doAccept}
          disabled={accepting}
          style={[styles.btn, { backgroundColor: "#10B981" }, compact && styles.btnCompact]}
        >
          <Ionicons name="checkmark" size={16} color="#fff" />
          {!compact && <Text style={styles.btnPrimaryText}>Chấp nhận</Text>}
        </Pressable>
        {!compact && (
          <Pressable
            onPress={doDecline}
            style={[styles.btn, styles.btnOutline]}
          >
            <Text style={styles.btnOutlineText}>Từ chối</Text>
          </Pressable>
        )}
      </View>
    );
  }
  if (status === "accepted") {
    return (
      <Pressable
        onPress={doUnfriend}
        style={[styles.btn, styles.btnOutline, compact && styles.btnCompact]}
      >
        <Ionicons name="people" size={16} color="#0066FF" />
        {!compact && <Text style={styles.btnOutlineText}>Bạn bè</Text>}
      </Pressable>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  btnCompact: {
    width: 34,
    height: 34,
    padding: 0,
    justifyContent: "center",
  },
  btnPrimary: { backgroundColor: "#0066FF" },
  btnPrimaryText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  btnOutline: {
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  btnOutlineText: { color: "#334155", fontWeight: "600", fontSize: 13 },
});
