import PublicProfileScreen from "@/components/profile/Publicprofilescreen";
import { Stack } from "expo-router";
import React from "react";

const ProfilePublic = () => {
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false, // Hide header vì screen tự có design
        }}
      />
      <PublicProfileScreen />
    </>
  );
};

export default ProfilePublic;
