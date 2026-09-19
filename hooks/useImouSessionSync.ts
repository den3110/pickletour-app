// useImouSessionSync — subscribe native event `sessionExpired` (12002) →
// auto relogin bằng creds cached trong native Keychain, hoặc fetch từ backend.
import { useEffect } from "react";
import { NativeEventEmitter, NativeModules } from "react-native";
import { store } from "../store.js";
import { imouApiSlice } from "@/slices/imouApiSlice";

function loadImouNative(): any | null {
  try { return require("imou-rn-native").default || require("imou-rn-native"); }
  catch { return null; }
}

export function useImouSessionSync(venueId?: string | null) {
  useEffect(() => {
    if (!venueId) return;
    const ImouNative = loadImouNative();
    if (!ImouNative || !NativeModules.ImouNative) return;
    let sub: any;
    try {
      const emitter = new NativeEventEmitter(NativeModules.ImouNative);
      sub = emitter.addListener("sessionExpired", async () => {
        console.log("[Imou] sessionExpired — attempt auto relogin");
        try {
          // Step 1: native tự relogin từ Keychain
          const stillLogged = await ImouNative.isLoggedIn();
          if (stillLogged) {
            const sess = await ImouNative.getSessionInfo();
            await store
              .dispatch(
                imouApiSlice.endpoints.uploadImouSession.initiate({ venueId, session: sess }),
              )
              .unwrap()
              .catch(() => {});
            console.log("[Imou] auto-relogin OK");
            return;
          }
          // Step 2: fallback fetch creds encrypted từ backend + login lại
          const credsRes: any = await store
            .dispatch(imouApiSlice.endpoints.getImouCreds.initiate(venueId, { forceRefetch: true }))
            .unwrap();
          const creds = credsRes?.creds;
          if (!creds?.phone || !creds?.password) throw new Error("No backend creds");
          await ImouNative.login({
            phone: creds.phone,
            password: creds.password,
            areaCode: creds.areaCode || "84",
            captchaSolver: { mode: "webview" },
          });
          const sess = await ImouNative.getSessionInfo();
          await store
            .dispatch(
              imouApiSlice.endpoints.uploadImouSession.initiate({ venueId, session: sess }),
            )
            .unwrap()
            .catch(() => {});
          console.log("[Imou] relogin from backend creds OK");
        } catch (e) {
          console.warn("[Imou] auto-relogin FAIL:", (e as any)?.message);
        }
      });
    } catch (e) {
      console.warn("[Imou] listener setup fail:", (e as any)?.message);
    }
    return () => { try { sub?.remove?.(); } catch {} };
  }, [venueId]);
}
