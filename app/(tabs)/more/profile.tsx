import ProfileScreen from "@/screens/profile";
import { Redirect, Stack } from "expo-router";
import React from "react";
import { useSelector } from "react-redux";

import { buildLoginHref } from "@/services/authSession";

export default function MoreProfileScreen() {
  const userInfo = useSelector((state: any) => state.auth?.userInfo || null);
  const isAuthed = Boolean(userInfo?.token || userInfo?._id || userInfo?.email);

  if (!isAuthed) {
    return <Redirect href={buildLoginHref("/more/profile") as any} />;
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ProfileScreen isBack />
    </>
  );
}
