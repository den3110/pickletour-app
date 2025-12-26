import { Alert, Linking, Platform } from "react-native";

export async function openDirections({ lng, lat, label }) {
  try {
    const encodedLabel = encodeURIComponent(label || "PickleRadar");

    if (Platform.OS === "ios") {
      await Linking.openURL(
        `http://maps.apple.com/?daddr=${lat},${lng}&q=${encodedLabel}`
      );
      return;
    }

    const geoUrl = `geo:0,0?q=${lat},${lng}(${encodedLabel})`;
    const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;

    const canGeo = await Linking.canOpenURL(geoUrl);
    await Linking.openURL(canGeo ? geoUrl : googleUrl);
  } catch (e) {
    Alert.alert("Không mở được bản đồ", "Thử lại sau giúp mình ạ.");
  }
}
