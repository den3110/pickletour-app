// ImouCaptcha.tsx — Geetest v4 modal that auto-binds to ImouNative's
// `captchaRequired` event. Drop-in component:
//
//   import { ImouCaptcha } from 'imou-rn-native';
//   ...
//   <ImouCaptcha />   // mount once at app root
//
// When ImouNative emits captchaRequired, the modal renders Geetest v4, the
// user solves, and we call ImouNative.submitCaptcha() to complete login.

import React, { useEffect, useState } from 'react';
import { Modal, View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import ImouNative, { CaptchaRequiredEvent } from './index';

interface GeetestSolution {
  lotNumber: string;
  passToken: string;
  genTime: string;
  captchaOutput: string;
}

interface Pending {
  challengeId: string;
  captchaId: string;
}

const HARNESS = (captchaId: string) => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body{margin:0;height:100%;background:transparent;display:flex;align-items:center;justify-content:center}</style>
<script src="https://static.geetest.com/v4/gt4.js"></script></head><body><div id="cap"></div>
<script>
function post(o){ if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
function boot(){
  if(typeof initGeetest4!=="function") return setTimeout(boot,200);
  initGeetest4({captchaId:${JSON.stringify(captchaId)}, product:"bind", riskType:"slide", hideSuccess:true}, function(c){
    c.appendTo("#cap");
    c.onReady(function(){ post({type:"ready"}); c.showCaptcha(); });
    c.onSuccess(function(){
      var v=c.getValidate();
      post({type:"success", data:{
        lotNumber:v.lot_number, passToken:v.pass_token,
        genTime:v.gen_time, captchaOutput:v.captcha_output }});
    });
    c.onError(function(e){ post({type:"error", error:e}); });
    c.onClose(function(){ post({type:"close"}); });
  });
}
boot();
</script></body></html>`;

export const ImouCaptcha: React.FC<{
  /** Override default modal styling — receives `children` to render the WebView. */
  renderModal?: (visible: boolean, children: React.ReactNode) => React.ReactNode;
}> = ({ renderModal }) => {
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    const sub = ImouNative.onCaptchaRequired((e: CaptchaRequiredEvent) => {
      setPending({ challengeId: e.challengeId, captchaId: e.captchaId });
    });
    return () => { sub.remove(); };
  }, []);

  if (!pending) {
    return renderModal ? <>{renderModal(false, null)}</> : null;
  }

  const onSolved = (sol: GeetestSolution) => {
    ImouNative.submitCaptcha({ challengeId: pending.challengeId, ...sol })
      .catch(() => { /* native side rejects login promise too */ })
      .finally(() => setPending(null));
  };

  const onClose = () => {
    // User dismissed → native module's login Promise is still suspended; we
    // resolve it with an error by calling submitCaptcha with garbage so the
    // native side fails and lets JS retry.
    ImouNative.submitCaptcha({
      challengeId: pending.challengeId,
      lotNumber: '', captchaOutput: '', passToken: '', genTime: '',
    }).catch(() => undefined).finally(() => setPending(null));
  };

  const webview = (
    <WebView
      originWhitelist={['*']}
      source={{ html: HARNESS(pending.captchaId), baseUrl: 'https://static.geetest.com/' }}
      javaScriptEnabled
      domStorageEnabled
      mixedContentMode="always"
      startInLoadingState
      renderLoading={() => <ActivityIndicator style={StyleSheet.absoluteFill} />}
      onMessage={(e) => {
        let msg: any;
        try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
        if (msg.type === 'success') onSolved(msg.data as GeetestSolution);
        else if (msg.type === 'close') onClose();
      }}
      style={{ backgroundColor: 'transparent' }}
    />
  );

  if (renderModal) return <>{renderModal(true, webview)}</>;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.box}>{webview}</View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
              justifyContent: 'center', alignItems: 'center' },
  box: { width: 340, height: 400, backgroundColor: '#fff',
         borderRadius: 12, overflow: 'hidden' },
});
