// useImouSessionSync — giữ session Imou dùng CHUNG giữa app chủ sân và server
// auto-live (Imou chỉ cho 1 phiên/tài khoản, login mới là phiên cũ bị đá).
//
// - sessionRenewed (native vừa tự relogin sau 12002) → upload session mới
//   lên backend để server dùng theo.
// - sessionExpired (12002) → thử lấy session mới nhất từ backend (server có
//   thể vừa relogin) và importSession thay vì login lại; nếu backend không có
//   gì mới hơn thì native tự relogin (sẽ bắn sessionRenewed → upload).
import { useEffect } from "react";
import { NativeEventEmitter, NativeModules } from "react-native";
import { store } from "../store.js";
import { imouApiSlice } from "@/slices/imouApiSlice";

function loadImouNative(): any | null {
  try { return require("imou-rn-native").default || require("imou-rn-native"); }
  catch { return null; }
}

async function uploadSession(venueId: string, sess: any) {
  if (!sess?.uuidUser || !sess?.sessionId) return;
  await store
    .dispatch(imouApiSlice.endpoints.uploadImouSession.initiate({ venueId, session: sess }))
    .unwrap()
    .catch((e: any) => console.warn("[Imou] uploadSession fail:", e?.message));
}

/** Đồng bộ session hiện tại của native lên backend (gọi sau login / mở app). */
export async function syncImouSessionToBackend(venueId: string) {
  const ImouNative = loadImouNative();
  if (!ImouNative?.getSessionInfo) return;
  try {
    const sess = await ImouNative.getSessionInfo();
    await uploadSession(venueId, sess);
  } catch (e: any) {
    console.warn("[Imou] getSessionInfo skip:", e?.message);
  }
}

export function useImouSessionSync(venueId?: string | null) {
  useEffect(() => {
    if (!venueId) return;
    const ImouNative = loadImouNative();
    if (!ImouNative || !NativeModules.ImouNative) return;
    const subs: any[] = [];
    try {
      const emitter = new NativeEventEmitter(NativeModules.ImouNative);
      subs.push(emitter.addListener("sessionRenewed", (sess: any) => {
        console.log("[Imou] sessionRenewed → upload backend");
        uploadSession(venueId, sess);
      }));
      subs.push(emitter.addListener("sessionExpired", async () => {
        console.log("[Imou] sessionExpired — thử lấy session từ backend");
        try {
          const res: any = await store
            .dispatch(imouApiSlice.endpoints.getImouSession.initiate(venueId, { forceRefetch: true }))
            .unwrap()
            .catch(() => null);
          const remote = res?.session;
          if (!remote?.sessionId || !ImouNative.importSession) return;
          let local: any = null;
          try { local = await ImouNative.getSessionInfo(); } catch {}
          if (local?.sessionId === remote.sessionId) return; // backend cũng cũ → native tự relogin
          await ImouNative.importSession(remote);
          console.log("[Imou] importSession từ backend OK");
        } catch (e: any) {
          console.warn("[Imou] importSession fail:", e?.message);
        }
      }));
    } catch (e: any) {
      console.warn("[Imou] listener setup fail:", e?.message);
    }
    return () => { for (const s of subs) { try { s?.remove?.(); } catch {} } };
  }, [venueId]);
}
