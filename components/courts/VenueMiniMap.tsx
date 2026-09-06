// Bản đồ nhỏ vị trí 1 cụm sân + nút chỉ đường (Mapbox)
import React from "react";
import { View, TouchableOpacity, StyleSheet, Linking, Platform } from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import MapboxGL, { mapboxAvailable } from "@/utils/mapbox";

export default function VenueMiniMap({ lat, lon, name, accent = "#4dd0e1", card = "#121829", sub = "#94a3b8" }: any) {
  const hasCoord = Number.isFinite(lat) && Number.isFinite(lon);
  if (!hasCoord) return null;

  const directions = () => {
    const url = Platform.OS === "ios"
      ? `http://maps.apple.com/?daddr=${lat},${lon}`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={styles.wrap}>
      {mapboxAvailable ? (
        <MapboxGL.MapView style={styles.map} styleURL={MapboxGL.StyleURL.Street} logoEnabled={false} attributionEnabled={false} scaleBarEnabled={false} scrollEnabled={false} zoomEnabled={false}>
          <MapboxGL.Camera defaultSettings={{ centerCoordinate: [lon, lat], zoomLevel: 14 }} />
          <MapboxGL.PointAnnotation id="venue" coordinate={[lon, lat]}>
            <View style={[styles.pin, { backgroundColor: accent }]}>
              <Ionicons name="location" size={16} color="#0a0e1a" />
            </View>
          </MapboxGL.PointAnnotation>
        </MapboxGL.MapView>
      ) : (
        <View style={[styles.map, { backgroundColor: card, alignItems: "center", justifyContent: "center" }]}>
          <Ionicons name="map-outline" size={30} color={sub} />
          <Text style={{ color: sub, fontSize: 12, marginTop: 6 }}>{name || "Vị trí sân"}</Text>
        </View>
      )}
      <TouchableOpacity style={[styles.dirBtn, { backgroundColor: accent }]} onPress={directions}>
        <Ionicons name="navigate" size={16} color="#0a0e1a" />
        <Text style={{ color: "#0a0e1a", fontWeight: "800", fontSize: 13 }}>Chỉ đường</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 14, overflow: "hidden", marginHorizontal: 14, marginTop: 4 },
  map: { width: "100%", height: 150 },
  pin: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
  dirBtn: { position: "absolute", right: 10, bottom: 10, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 },
});
