// Bản đồ danh sách sân (markers) — tái dùng pattern Mapbox từ Radar
import React from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import MapboxGL, { mapboxAvailable } from "@/utils/mapbox";

const DEFAULT_CENTER = [105.8342, 21.0278]; // Hà Nội

export default function CourtsMapView({ venues = [], myLocation, onPick, C }: any) {
  if (!mapboxAvailable) {
    return (
      <View style={[styles.fallback, { backgroundColor: C.card }]}>
        <Ionicons name="map-outline" size={40} color={C.sub} />
        <Text style={{ color: C.sub, marginTop: 10, textAlign: "center", paddingHorizontal: 24 }}>
          Bản đồ chỉ hiển thị trên bản cài đặt (không có trong Expo Go). Hãy dùng chế độ danh sách.
        </Text>
      </View>
    );
  }
  const withCoord = venues.filter((v: any) => v.locationGeo?.lat && v.locationGeo?.lon);
  const center = myLocation || (withCoord[0] ? [withCoord[0].locationGeo.lon, withCoord[0].locationGeo.lat] : DEFAULT_CENTER);

  return (
    <MapboxGL.MapView style={StyleSheet.absoluteFill} styleURL={C.dark ? MapboxGL.StyleURL.Dark : MapboxGL.StyleURL.Street} logoEnabled={false} attributionEnabled={false}>
      <MapboxGL.Camera defaultSettings={{ centerCoordinate: center, zoomLevel: myLocation ? 12 : 10 }} />
      {myLocation ? (
        <MapboxGL.PointAnnotation id="me" coordinate={myLocation}>
          <View style={styles.me} />
        </MapboxGL.PointAnnotation>
      ) : null}
      {withCoord.map((v: any) => (
        <MapboxGL.PointAnnotation
          key={String(v._id)}
          id={String(v._id)}
          coordinate={[v.locationGeo.lon, v.locationGeo.lat]}
          onSelected={() => onPick?.(v)}
        >
          <View style={styles.pin}>
            <Ionicons name="tennisball" size={14} color="#0a0e1a" />
          </View>
        </MapboxGL.PointAnnotation>
      ))}
    </MapboxGL.MapView>
  );
}

const styles = StyleSheet.create({
  fallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  pin: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#4dd0e1", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
  me: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#3b82f6", borderWidth: 3, borderColor: "#fff" },
});
