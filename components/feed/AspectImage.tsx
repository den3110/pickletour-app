// components/feed/AspectImage.tsx — Ảnh feed tự đo aspect ratio thực để không
// crop mất nội dung. Backend upload không lưu width/height nên fallback aspect=1
// khiến ảnh panorama bị nén vào ô vuông + resizeMode cover cắt trung tâm — user
// chỉ thấy zoom vào giữa. Dùng Image.getSize ở runtime + cache theo URL để lần
// sau render tức thì.
import React, { useEffect, useMemo, useState } from "react";
import { Image, Pressable, StyleProp, ImageStyle } from "react-native";

const aspectCache = new Map<string, number>();

export function useImageAspect(
  url?: string | null,
  initialAspect?: number | null
): number {
  const initial = useMemo(() => {
    if (!url) return null;
    const cached = aspectCache.get(url);
    if (cached && cached > 0) return cached;
    if (initialAspect && initialAspect > 0) return initialAspect;
    return null;
  }, [url, initialAspect]);
  const [aspect, setAspect] = useState<number | null>(initial);

  useEffect(() => {
    if (!url) return;
    const cached = aspectCache.get(url);
    if (cached && cached > 0) {
      setAspect(cached);
      return;
    }
    if (aspect && aspect > 0) return;
    let cancelled = false;
    Image.getSize(
      url,
      (w, h) => {
        if (cancelled) return;
        if (w > 0 && h > 0) {
          const a = w / h;
          aspectCache.set(url, a);
          setAspect(a);
        }
      },
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [url, aspect]);

  return aspect && aspect > 0 ? aspect : initialAspect && initialAspect > 0 ? initialAspect : 1;
}

export function AspectImage({
  url,
  width,
  maxHeight = 480,
  minHeight = 120,
  initialAspect,
  borderRadius = 10,
  onPress,
  style,
}: {
  url: string;
  width: number;
  maxHeight?: number;
  minHeight?: number;
  initialAspect?: number | null;
  borderRadius?: number;
  onPress?: () => void;
  style?: StyleProp<ImageStyle>;
}) {
  const aspect = useImageAspect(url, initialAspect);
  const rawH = width / aspect;
  const h = Math.max(minHeight, Math.min(maxHeight, rawH));
  const img = (
    <Image
      source={{ uri: url }}
      style={[
        { width, height: h, borderRadius, backgroundColor: "#0b1220" },
        style,
      ]}
      resizeMode="contain"
    />
  );
  if (onPress) {
    return <Pressable onPress={onPress}>{img}</Pressable>;
  }
  return img;
}
