// /games/phom — chuyển hướng sang lobby thật /phom.
import { Redirect } from "expo-router";

export default function PhomRedirect() {
  return <Redirect href="/phom" />;
}
