// /games/sam — chuyển hướng sang lobby thật /sam.
import { Redirect } from "expo-router";

export default function SamRedirect() {
  return <Redirect href="/sam" />;
}
