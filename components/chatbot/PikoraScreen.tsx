import React from "react";

import { TAB_BAR_HEIGHT } from "@/components/tabbar/Customtabbar";
import { PikoraSurface } from "./PikoraSurface";

type PikoraScreenProps = {
  bottomPaddingOffset?: number;
  onBack?: (() => void) | null;
};

export default function PikoraScreen({
  bottomPaddingOffset = TAB_BAR_HEIGHT,
  onBack = null,
}: PikoraScreenProps) {
  return (
    <PikoraSurface
      presentation="screen"
      bottomPaddingOffset={bottomPaddingOffset}
      onBack={onBack}
    />
  );
}
