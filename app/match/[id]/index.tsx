// app/match/[id]/index.tsx — /match/:id (VD: link chia sẻ trận trên bảng tin)
// Chuyển hướng sang màn chi tiết trận "home" để không bị 404.
import { Redirect, useLocalSearchParams } from "expo-router";

export default function MatchIndexRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return <Redirect href="/feed" as any />;
  return <Redirect href={`/match/${id}/home` as any} />;
}
