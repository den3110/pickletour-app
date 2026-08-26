// components/clubs/ClubGalleryRN.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Modal,
  Dimensions,
  Platform,
} from "react-native";
import { useSelector } from "react-redux";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Image as ExpoImage } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Section, EmptyState } from "./ui";
import { normalizeUrl } from "@/utils/normalizeUri";
import { useUploadAvatarMutation } from "@/slices/uploadApiSlice";
import {
  useListPhotosQuery,
  useAddPhotosMutation,
  useDeletePhotoMutation,
} from "@/slices/clubsApiSlice";

const getApiErrMsg = (e: any) =>
  e?.data?.message ||
  e?.error ||
  (typeof e?.data === "string" ? e.data : "Có lỗi xảy ra.");
const pickUrl = (res: any) =>
  res?.url || res?.secure_url || res?.data?.url || res?.path || "";

const GAP = 6;
const COLS = 3;
const winW = Dimensions.get("window").width;
const cell = Math.floor((winW - 32 - GAP * (COLS - 1)) / COLS);

export default function ClubGalleryRN({
  club,
  canManage,
}: {
  club: any;
  canManage: boolean;
}) {
  const clubId = club?._id;
  const isMember = !!club?._my?.isMember;
  const authUserId = useSelector((s: any) => s.auth?.userInfo?._id);

  const { data, isLoading, isFetching } = useListPhotosQuery(
    { id: clubId },
    { skip: !clubId }
  );
  const [uploadAvatar, { isLoading: uploading }] = useUploadAvatarMutation();
  const [addPhotos] = useAddPhotosMutation();
  const [deletePhoto] = useDeletePhotoMutation();
  const [preview, setPreview] = useState<string | null>(null);

  const items = data?.items || [];

  const pickAndUpload = async () => {
    if (Platform.OS !== "android") {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
    }
    const rs = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsMultipleSelection: true,
      selectionLimit: 10,
    });
    if (rs.canceled || !rs.assets?.length) return;
    try {
      const urls: string[] = [];
      for (const asset of rs.assets) {
        const file: any = {
          uri: asset.uri,
          name: (asset as any).fileName || `photo-${Date.now()}.jpg`,
          type: asset.mimeType || "image/jpeg",
        };
        const res: any = await uploadAvatar(file).unwrap();
        const url = pickUrl(res);
        if (url) urls.push(url);
      }
      if (urls.length) {
        await addPhotos({ id: clubId, photos: urls.map((u) => ({ url: u })) }).unwrap();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else Alert.alert("Lỗi", "Tải ảnh thất bại.");
    } catch (e) {
      Alert.alert("Lỗi", getApiErrMsg(e));
    }
  };

  const remove = (p: any) =>
    Alert.alert("Xoá ảnh", "Xoá ảnh này?", [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Xoá",
        style: "destructive",
        onPress: async () => {
          try {
            await deletePhoto({ id: clubId, photoId: p._id }).unwrap();
          } catch (e) {
            Alert.alert("Lỗi", getApiErrMsg(e));
          }
        },
      },
    ]);

  return (
    <Section title="Thư viện ảnh" subtitle={isFetching ? "Đang tải…" : undefined}>
      {isMember && (
        <TouchableOpacity
          style={styles.addBtn}
          onPress={pickAndUpload}
          disabled={uploading}
        >
          <LinearGradient
            colors={["#667eea", "#764ba2"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <MaterialCommunityIcons name="image-plus" size={16} color="#fff" />
          <Text style={styles.addBtnText}>
            {uploading ? "Đang tải…" : "Thêm ảnh"}
          </Text>
        </TouchableOpacity>
      )}

      {!isLoading && items.length === 0 ? (
        <EmptyState label="Chưa có ảnh nào" icon="image-multiple-outline" />
      ) : (
        <View style={styles.grid}>
          {items.map((p: any) => {
            const canDel =
              String(p.uploadedBy?._id) === String(authUserId) || canManage;
            return (
              <View key={p._id} style={{ width: cell, height: cell }}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => setPreview(p.url)}
                  style={{ flex: 1 }}
                >
                  <ExpoImage
                    source={{ uri: normalizeUrl(p.url) }}
                    style={styles.thumb}
                    contentFit="cover"
                  />
                </TouchableOpacity>
                {canDel && (
                  <TouchableOpacity
                    style={styles.delBtn}
                    onPress={() => remove(p)}
                  >
                    <MaterialCommunityIcons name="close" size={13} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      )}

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <View style={styles.lightbox}>
          <TouchableOpacity style={styles.lightboxClose} onPress={() => setPreview(null)}>
            <MaterialCommunityIcons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          {!!preview && (
            <ExpoImage
              source={{ uri: normalizeUrl(preview) }}
              style={styles.lightboxImg}
              contentFit="contain"
            />
          )}
        </View>
      </Modal>
    </Section>
  );
}

const styles = StyleSheet.create({
  addBtn: {
    flexDirection: "row",
    gap: 6,
    alignSelf: "flex-start",
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 12,
  },
  addBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  thumb: {
    width: "100%",
    height: "100%",
    borderRadius: 10,
    backgroundColor: "#E0E7FF",
  },
  delBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  lightbox: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  lightboxClose: {
    position: "absolute",
    top: 44,
    right: 20,
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  lightboxImg: { width: "94%", height: "80%" },
});
