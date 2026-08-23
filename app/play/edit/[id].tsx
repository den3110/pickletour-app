import React from "react";
import { useLocalSearchParams } from "expo-router";
import PlayForm from "@/components/play/PlayForm";

export default function EditInviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PlayForm existingId={id} />;
}
