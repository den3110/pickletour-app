import React from "react";
import { View, Linking, Share, Alert } from "react-native";
import { router } from "expo-router";
import { PrimaryBtn, SecondaryBtn } from "./ui";
import ClubJoinButtonRN from "./ClubJoinButtonRN";
import { useOpenClubChatMutation } from "@/slices/messagesApiSlice";

export default function ClubActionsRN({ club, my }: { club: any; my: any }) {
  const [openClubChat, { isLoading: openingChat }] = useOpenClubChatMutation();
  const state = my?.isMember
    ? "member"
    : my?.pendingRequest
    ? "pending"
    : "not_member";
  const openChat = async () => {
    try {
      const conv: any = await openClubChat(club._id).unwrap();
      router.push(`/messages/${conv._id}` as any);
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || "Không mở được chat nhóm");
    }
  };
  const onShare = async () => {
    const url = `https://pickletour.vn/clubs/${club?._id}`;
    const name = club?.name || "Câu lạc bộ";
    try {
      await Share.share({
        title: name,
        message: `Tham gia CLB ${name} trên PickleTour: ${url}`,
        url,
      });
    } catch {
      /* user huỷ share */
    }
  };
  return (
    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
      <ClubJoinButtonRN clubId={club?._id} state={state as any} />
      {!!my?.isMember && (
        <PrimaryBtn
          title="Chat nhóm"
          onPress={openChat}
          disabled={openingChat}
        />
      )}
      <SecondaryBtn title="Chia sẻ" onPress={onShare} />
      {!!club?.website && (
        <SecondaryBtn
          title="Website"
          onPress={() => Linking.openURL(club.website)}
        />
      )}
    </View>
  );
}
