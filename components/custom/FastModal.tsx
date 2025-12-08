import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions, TouchableWithoutFeedback, BackHandler } from 'react-native';

const { height } = Dimensions.get('window');

const FastModal = ({ visible, children, onBackdropPress }) => {
  const [showView, setShowView] = useState(visible);
  const animValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setShowView(true); // Hiện View
      Animated.timing(animValue, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      // Đóng: Vẫn giữ View hiển thị để chạy animation
      Animated.timing(animValue, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setShowView(false); // Animation xong mới ẩn hẳn khỏi DOM
      });
    }
  }, [visible]);

  // Xử lý nút Back cứng của Android (vì không dùng Modal native nên phải tự handle)
  useEffect(() => {
    if (visible) {
      const backAction = () => {
        if (onBackdropPress) onBackdropPress();
        return true; // Chặn thoát app
      };
      const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
      return () => backHandler.remove();
    }
  }, [visible, onBackdropPress]);

  if (!showView) return null;

  const backdropOpacity = animValue.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] });
  const contentTranslateY = animValue.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });

  return (
    <View 
      style={styles.absoluteContainer} 
      // Kỹ thuật này quan trọng: 
      // Nếu đang visible (tức là animation value = 1) -> 'auto' (chặn touch để bấm backdrop)
      // Nếu đang đóng (visible = false nhưng view chưa unmount) -> 'box-none' (cho phép bấm xuyên qua xuống dưới)
      pointerEvents={visible ? 'auto' : 'box-none'} 
    >
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={onBackdropPress}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
      </TouchableWithoutFeedback>

      {/* Content */}
      <Animated.View style={[styles.content, { transform: [{ translateY: contentTranslateY }] }]}>
        {children}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  absoluteContainer: {
    ...StyleSheet.absoluteFillObject, // Phủ kín màn hình cha
    zIndex: 9999, // Đảm bảo nổi lên trên cùng
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'black',
  },
  content: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    minWidth: 300,
  }
});

export default FastModal;