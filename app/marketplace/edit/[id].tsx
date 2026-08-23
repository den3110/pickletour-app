import React from "react";
import { useLocalSearchParams } from "expo-router";
import ListingForm from "@/components/market/ListingForm";

export default function EditListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ListingForm existingId={id} />;
}
