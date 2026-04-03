import React from "react";

import { TAB_BAR_HEIGHT } from "@/components/tabbar/Customtabbar";
import { PikoraSurface } from "./PikoraSurface";

export default function PikoraScreen() {
  return <PikoraSurface presentation="screen" bottomPaddingOffset={TAB_BAR_HEIGHT} />;
}
