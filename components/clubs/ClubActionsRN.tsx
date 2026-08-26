import React from "react";
import { View, Linking, Share } from "react-native";
import { SecondaryBtn } from "./ui";
import ClubJoinButtonRN from "./ClubJoinButtonRN";

export default function ClubActionsRN({ club, my }: { club: any; my: any }) {
  const state = my?.isMember
    ? "member"
    : my?.pendingRequest
    ? "pending"
    : "not_member";
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
