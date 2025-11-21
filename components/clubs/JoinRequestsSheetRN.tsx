import React from "react";
import { View, Text, ActivityIndicator, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { GlassCard, EmptyState, SecondaryBtn } from "./ui";
import {
  useListJoinRequestsQuery,
  useAcceptJoinMutation,
  useRejectJoinMutation,
} from "@/slices/clubsApiSlice";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { normalizeUrl } from "@/utils/normalizeUri";

export default function JoinRequestsSheetRN({
  clubId,
  onClose,
}: {
  clubId: string;
  onClose: () => void;
}) {
  const { data, isFetching, refetch } = useListJoinRequestsQuery(
    { id: clubId, params: { status: "pending" } },
    { skip: !clubId }
  );
  const [accept] = useAcceptJoinMutation();
  const [reject] = useRejectJoinMutation();

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
      <Text style={{ color: "#d5e8ff", fontWeight: "800", fontSize: 16 }}>
        Yêu cầu gia nhập
      </Text>
      {isFetching && (
        <View style={{ paddingVertical: 12 }}>
          <ActivityIndicator />
        </View>
      )}
      {(data?.items || []).map((r: any) => (
        <GlassCard key={r._id} style={{ marginTop: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Image
              source={{ uri: normalizeUrl(r.user?.avatar) }}
              style={{ width: 40, height: 40, borderRadius: 20 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#dbeafe", fontWeight: "600" }}>
                {r.user?.fullName || r.user?.nickname || r.user?.email}
              </Text>
              {!!r.message && (
                <Text style={{ color: "#9fb4d3", marginTop: 2 }}>
                  {r.message}
                </Text>
              )}
            </View>
            <TouchableOpacity
              onPress={async () => {
                await accept({ id: clubId, reqId: r._id }).unwrap();
                refetch();
              }}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#34d399",
              }}
            >
              <MaterialCommunityIcons name="check" size={18} color="#0b1220" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => {
                await reject({ id: clubId, reqId: r._id }).unwrap();
                refetch();
              }}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#f87171",
              }}
            >
              <MaterialCommunityIcons name="close" size={18} color="#0b1220" />
            </TouchableOpacity>
          </View>
        </GlassCard>
      ))}
      {!isFetching && (!data?.items || data.items.length === 0) && (
        <EmptyState label="Không có yêu cầu nào" icon="account-off-outline" />
      )}
      <View style={{ height: 12 }} />
      <SecondaryBtn title="Đóng" onPress={onClose} />
      <View style={{ height: 8 }} />
    </View>
  );
}
