import React from "react";
import { View, Linking } from "react-native";
import { SecondaryBtn } from "./ui";
import ClubJoinButtonRN from "./ClubJoinButtonRN";

export default function ClubActionsRN({ club, my }: { club: any; my: any }) {
  const state = my?.isMember
    ? "member"
    : my?.pendingRequest
    ? "pending"
    : "not_member";
  return (
    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
      <ClubJoinButtonRN clubId={club?._id} state={state as any} />
      {!!club?.website && (
        <SecondaryBtn
          title="Website"
          onPress={() => Linking.openURL(club.website)}
        />
      )}
    </View>
  );
}
