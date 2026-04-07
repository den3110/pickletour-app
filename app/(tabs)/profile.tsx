// app/(tabs)/profile.tsx
import { Redirect } from "expo-router";
import ProfileScreen from "@/screens/profile";
import React from "react";
import { useSelector } from "react-redux";

import { buildLoginHref } from "@/services/authSession";

export default function ProfileTab() {
  const userInfo = useSelector((state: any) => state.auth?.userInfo || null);
  const isAuthed = Boolean(userInfo?.token || userInfo?._id || userInfo?.email);

  if (!isAuthed) {
    return <Redirect href={buildLoginHref("/profile") as any} />;
  }

  return <ProfileScreen />;
}
