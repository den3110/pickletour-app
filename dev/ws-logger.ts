// dev/ws-logger.ts
const _WS = global.WebSocket;

function preview(data: any, n = 500) {
  if (typeof data === "string") return data.length > n ? data.slice(0, n) + "…[truncated]" : data;
  try { return JSON.stringify(data).slice(0, n); } catch { return "[binary]"; }
}

global.WebSocket = function (url: any, protocols?: any) {
  const ws = new _WS(url, protocols);
  if (__DEV__) {
    const id = Math.random().toString(36).slice(2, 7);
    console.tron?.log?.(`🔌 WS[${id}] open → ${url}`) || console.log("WS open", id, url);

    const origSend = ws.send.bind(ws);
    ws.send = (data: any) => {
      console.tron?.log?.(`🛫 WS[${id}] send:`, preview(data)) || console.log("WS send", id, preview(data));
      return origSend(data);
    };

    ws.addEventListener("message", (evt: any) => {
      console.tron?.log?.(`🛬 WS[${id}] recv:`, preview(evt?.data)) || console.log("WS recv", id, preview(evt?.data));
    });
    ws.addEventListener("close", (e: any) => {
      console.tron?.log?.(`❎ WS[${id}] close:`, e?.code, e?.reason) || console.log("WS close", id, e?.code, e?.reason);
    });
    ws.addEventListener("error", (e: any) => {
      console.tron?.log?.(`⚠️ WS[${id}] error:`, e?.message || e?.type) || console.log("WS error", id, e?.message || e?.type);
    });
  }
  return ws;
} as any;

// giữ nguyên prototype để không phá API
(global.WebSocket as any).prototype = _WS.prototype;
