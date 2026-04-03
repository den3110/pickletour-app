import React from "react";
import { Modal, StyleSheet, View } from "react-native";

import { usePikora } from "./PikoraProvider";
import { PikoraSurface } from "./PikoraSurface";

export function PikoraHost() {
  const { overlayOpen, closeOverlay } = usePikora();

  return (
    <>
      <Modal
        visible={overlayOpen}
        animationType="slide"
        presentationStyle="overFullScreen"
        transparent
        onRequestClose={closeOverlay}
      >
        <View style={styles.overlayBackdrop}>
          <PikoraSurface presentation="overlay" />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlayBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.48)",
  },
});
