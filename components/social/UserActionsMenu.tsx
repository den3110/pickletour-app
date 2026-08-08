// components/social/UserActionsMenu.tsx
// Nút 3 chấm cho public profile — chứa các hành động: Chặn user, Bỏ chặn user.
// Report bài viết/comment/tin nhắn xử lý ở chỗ tương ứng.
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Alert, Pressable, StyleSheet } from "react-native";
import { useSelector } from "react-redux";

import {
  useBlockUserMutation,
  useFriendStatusQuery,
  useUnblockUserMutation,
} from "@/slices/friendsApiSlice";
import { confirmBlock } from "@/utils/contentModeration";

export function UserActionsMenu({
  userId,
  userName,
}: {
  userId: string;
  userName?: string;
}) {
  const me = useSelector((s: any) => s.auth?.userInfo);
  const { data } = useFriendStatusQuery(userId, {
    skip: !me || !userId,
  });
  const [blockUser, { isLoading: blocking }] = useBlockUserMutation();
  const [unblockUser, { isLoading: unblocking }] = useUnblockUserMutation();

  if (!me || !userId) return null;
  if (data?.status === "self") return null;

  const isBlocked = data?.status === "blocked";
  const iBlocked =
    isBlocked && String((data as any)?.blockedBy || "") === String(me?._id);
  const displayName = userName || "user này";

  const doBlock = () => {
    confirmBlock(displayName, async () => {
      try {
        await blockUser(userId).unwrap();
        Alert.alert("Đã chặn", `${displayName} sẽ không xuất hiện nữa.`);
      } catch (err: any) {
        Alert.alert("Lỗi", err?.data?.message || "Không thực hiện được");
      }
    });
  };

  const doUnblock = async () => {
    try {
      await unblockUser(userId).unwrap();
      Alert.alert("Đã bỏ chặn", `Bạn có thể tương tác lại với ${displayName}.`);
    } catch (err: any) {
      Alert.alert("Lỗi", err?.data?.message || "Không thực hiện được");
    }
  };

  const openMenu = () => {
    const opts: any[] = [];
    if (iBlocked) {
      opts.push({ text: "Bỏ chặn", onPress: doUnblock });
    } else if (!isBlocked) {
      opts.push({
        text: "Chặn người này",
        style: "destructive" as const,
        onPress: doBlock,
      });
    }
    if (opts.length === 0) return;
    Alert.alert("Tuỳ chọn", undefined, [
      ...opts,
      { text: "Đóng", style: "cancel" as const },
    ]);
  };

  return (
    <Pressable
      onPress={openMenu}
      disabled={blocking || unblocking}
      style={styles.btn}
      hitSlop={10}
    >
      <Ionicons name="ellipsis-horizontal" size={20} color="#334155" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
});
