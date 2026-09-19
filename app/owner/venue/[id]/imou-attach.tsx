// Owner: gắn camera Imou vào từng court của venue.
import React, { useEffect, useMemo, useState } from "react";
import {
  View, ScrollView, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useTheme } from "@react-navigation/native";
import { pal } from "@/utils/courtFormat";
import { useGetVenueQuery } from "@/slices/venuesApiSlice";
import {
  useAddImouCamMutation,
  useRenameImouCamMutation,
  useRemoveImouCamMutation,
} from "@/slices/imouApiSlice";
import { courtCams, CAM_ANGLE_PRESETS, type ImouCam } from "@/utils/imouCams";

interface ImouDevice {
  deviceId: string;
  name: string;
  model?: string;
  productId?: string;
  online?: boolean;
}

function loadImouNative(): any | null {
  try { return require("imou-rn-native").default || require("imou-rn-native"); }
  catch { return null; }
}

export default function ImouAttachScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const C = useMemo(() => pal(!!theme.dark), [theme.dark]);
  const { data: venue, refetch } = useGetVenueQuery(id, { skip: !id });
  const [addCam] = useAddImouCamMutation();
  const [renameCam] = useRenameImouCamMutation();
  const [removeCam] = useRemoveImouCamMutation();
  const ImouNative = loadImouNative();

  const [devices, setDevices] = useState<ImouDevice[] | null>(null);
  const [loadingDevs, setLoadingDevs] = useState(false);
  const [errorDevs, setErrorDevs] = useState<string | null>(null);
  const [selectedCourt, setSelectedCourt] = useState<any | null>(null);
  const [namingDevice, setNamingDevice] = useState<ImouDevice | null>(null);
  const [renaming, setRenaming] = useState<{ court: any; cam: ImouCam } | null>(null);
  const [angleName, setAngleName] = useState("");

  const loadDevices = async () => {
    if (!ImouNative) { setErrorDevs("Module native chưa build vào app."); return; }
    setLoadingDevs(true); setErrorDevs(null);
    try {
      const cams = await ImouNative.listDevices();
      setDevices(cams || []);
    } catch (e: any) { setErrorDevs(e?.message || "Không lấy được danh sách cam"); }
    finally { setLoadingDevs(false); }
  };
  useEffect(() => { loadDevices(); }, []);

  const attachedMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of venue?.courts || []) {
      for (const cam of courtCams(c)) {
        const arr = map.get(cam.deviceId) || [];
        arr.push(c.name);
        map.set(cam.deviceId, arr);
      }
    }
    return map;
  }, [venue?.courts]);

  const confirmAdd = async () => {
    if (!namingDevice || !selectedCourt) return;
    try {
      await addCam({
        venueId: id,
        courtId: selectedCourt._id,
        deviceId: namingDevice.deviceId,
        name: angleName.trim() || namingDevice.name || namingDevice.deviceId,
        productId: namingDevice.productId,
      }).unwrap();
      setNamingDevice(null); setSelectedCourt(null); setAngleName("");
      refetch();
      Alert.alert("✓", "Đã gắn camera vào sân");
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || e?.message || "Không gắn được");
    }
  };

  const confirmRename = async () => {
    if (!renaming) return;
    try {
      await renameCam({
        venueId: id,
        courtId: renaming.court._id,
        deviceId: renaming.cam.deviceId,
        name: angleName.trim(),
      }).unwrap();
      setRenaming(null); setAngleName("");
      refetch();
    } catch (e: any) {
      Alert.alert("Lỗi", e?.data?.message || e?.message || "Không đổi được");
    }
  };

  const doRemove = (court: any, cam: ImouCam) => {
    Alert.alert("Gỡ camera?", `Gỡ "${cam.name || cam.deviceId}" khỏi "${court.name}"?`, [
      { text: "Huỷ" },
      { text: "Gỡ", style: "destructive", onPress: async () => {
        try {
          await removeCam({ venueId: id, courtId: court._id, deviceId: cam.deviceId }).unwrap();
          refetch();
        } catch (e: any) {
          Alert.alert("Lỗi", e?.data?.message || e?.message || "Không gỡ được");
        }
      }},
    ]);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: C.bg }}
    >
      <Stack.Screen options={{ title: "Gắn camera vào sân" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} automaticallyAdjustKeyboardInsets>
        {(!ImouNative) && (
          <View style={[styles.card, { backgroundColor: "#FEF3C7", borderColor: "#F59E0B" }]}>
            <Text style={{ color: "#92400E", fontWeight: "700" }}>
              Module Imou chưa build vào app. Cần bản 1.1.17+.
            </Text>
          </View>
        )}

        {/* Section 1: cameras đã gắn theo court */}
        <Text style={{ color: C.text, fontWeight: "800", fontSize: 16, marginTop: 4 }}>
          Camera đã gắn theo sân
        </Text>
        {(venue?.courts || []).length === 0 && (
          <Text style={{ color: C.sub }}>Cụm sân chưa có sân con nào.</Text>
        )}
        {(venue?.courts || []).map((c: any) => {
          const cams = courtCams(c);
          return (
            <View key={c._id} style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={{ color: C.text, fontWeight: "800" }}>{c.name}</Text>
              {cams.length === 0 ? (
                <Text style={{ color: C.sub, marginTop: 6 }}>Chưa gán camera nào.</Text>
              ) : (
                <View style={{ marginTop: 8, gap: 6 }}>
                  {cams.map((cam: ImouCam) => (
                    <View key={cam.deviceId} style={styles.rowBetween}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: C.text, fontWeight: "700" }} numberOfLines={1}>
                          {cam.name || cam.deviceId}
                        </Text>
                        <Text style={{ color: C.sub, fontSize: 12 }} numberOfLines={1}>{cam.deviceId}</Text>
                      </View>
                      <TouchableOpacity onPress={() => { setRenaming({ court: c, cam }); setAngleName(cam.name || ""); }} style={{ padding: 6 }}>
                        <Ionicons name="pencil" size={16} color={C.text} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => doRemove(c, cam)} style={{ padding: 6 }}>
                        <Ionicons name="trash" size={16} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        {/* Section 2: danh sách camera trong tài khoản Imou */}
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12 }}>
          <Text style={{ color: C.text, fontWeight: "800", fontSize: 16, flex: 1 }}>Camera trong tài khoản</Text>
          <TouchableOpacity onPress={loadDevices} style={{ padding: 6 }} disabled={loadingDevs}>
            <Ionicons name="refresh" size={18} color={C.text} />
          </TouchableOpacity>
        </View>
        {loadingDevs ? (
          <ActivityIndicator style={{ marginTop: 12 }} />
        ) : errorDevs ? (
          <View style={[styles.card, { backgroundColor: "#FEE2E2", borderColor: "#EF4444" }]}>
            <Text style={{ color: "#991B1B" }}>{errorDevs}</Text>
          </View>
        ) : (
          (devices || []).map((d) => {
            const attached = attachedMap.get(d.deviceId) || [];
            return (
              <View key={d.deviceId} style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontWeight: "700" }} numberOfLines={1}>
                      {d.name || d.deviceId}
                    </Text>
                    <Text style={{ color: C.sub, fontSize: 12 }} numberOfLines={1}>
                      {d.deviceId}{d.online === false ? " · offline" : ""}
                    </Text>
                    {attached.length > 0 && (
                      <Text style={{ color: "#10B981", fontSize: 12, marginTop: 2 }} numberOfLines={2}>
                        Đã gắn: {attached.join(", ")}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => setNamingDevice(d)}
                    style={[styles.btnSmall, { backgroundColor: "#0066FF" }]}
                  >
                    <Text style={styles.btnSmallText}>Gắn vào sân</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Modal chọn court + tên góc */}
      {(namingDevice) && (
        <View style={styles.modalWrap}>
          <View style={[styles.modalCard, { backgroundColor: C.card }]}>
            <Text style={{ color: C.text, fontWeight: "800", fontSize: 16, marginBottom: 8 }}>
              Gắn {namingDevice.name || namingDevice.deviceId}
            </Text>
            <Text style={{ color: C.sub, fontSize: 12 }}>1. Chọn sân:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
              {(venue?.courts || []).map((c: any) => (
                <TouchableOpacity
                  key={c._id}
                  onPress={() => setSelectedCourt(c)}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
                    marginRight: 8, borderWidth: 1,
                    borderColor: selectedCourt?._id === c._id ? "#0066FF" : C.border,
                    backgroundColor: selectedCourt?._id === c._id ? "#0066FF" : "transparent",
                  }}
                >
                  <Text style={{ color: selectedCourt?._id === c._id ? "#fff" : C.text, fontWeight: "700" }}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={{ color: C.sub, fontSize: 12, marginTop: 12 }}>2. Tên góc quay:</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
              {CAM_ANGLE_PRESETS.map((a) => (
                <TouchableOpacity key={a} onPress={() => setAngleName(a)} style={{
                  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                  backgroundColor: angleName === a ? "#0066FF" : C.field, borderWidth: 1, borderColor: C.border,
                }}>
                  <Text style={{ color: angleName === a ? "#fff" : C.text, fontSize: 12, fontWeight: "600" }}>{a}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              placeholder="Hoặc tự nhập tên góc..."
              placeholderTextColor={C.sub}
              value={angleName}
              onChangeText={setAngleName}
              style={[styles.input, { color: C.text, borderColor: C.border }]}
            />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <TouchableOpacity onPress={() => { setNamingDevice(null); setSelectedCourt(null); setAngleName(""); }} style={{ flex: 1, padding: 12, alignItems: "center" }}>
                <Text style={{ color: C.text, fontWeight: "700" }}>Huỷ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmAdd}
                disabled={!selectedCourt}
                style={[styles.btn, { backgroundColor: !selectedCourt ? "#94A3B8" : "#0066FF", flex: 1, marginTop: 0 }]}
              >
                <Text style={styles.btnText}>Gắn</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Modal rename */}
      {renaming && (
        <View style={styles.modalWrap}>
          <View style={[styles.modalCard, { backgroundColor: C.card }]}>
            <Text style={{ color: C.text, fontWeight: "800", fontSize: 16, marginBottom: 8 }}>
              Đổi tên góc quay
            </Text>
            <TextInput
              placeholder="Tên góc quay"
              placeholderTextColor={C.sub}
              value={angleName}
              onChangeText={setAngleName}
              style={[styles.input, { color: C.text, borderColor: C.border }]}
            />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <TouchableOpacity onPress={() => { setRenaming(null); setAngleName(""); }} style={{ flex: 1, padding: 12, alignItems: "center" }}>
                <Text style={{ color: C.text, fontWeight: "700" }}>Huỷ</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmRename} style={[styles.btn, { backgroundColor: "#0066FF", flex: 1, marginTop: 0 }]}>
                <Text style={styles.btnText}>Lưu</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 12 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 8, fontSize: 15 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 10, marginTop: 12 },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  btnSmall: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  btnSmallText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  rowBetween: { flexDirection: "row", alignItems: "center", gap: 8 },
  modalWrap: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center", justifyContent: "center", padding: 20,
  },
  modalCard: { borderRadius: 12, padding: 16, width: "100%", maxWidth: 480 },
});
