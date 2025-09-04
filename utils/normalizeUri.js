export const normalizeUri = (url) => {
  return url?.replace("localhost", process.env.EXPO_PUBLIC_LAN_IP);
};

export const normalizeUrl = (u) => {
  if (!u) return u;
  let s = u.trim();
  // ép https (ATS của iOS chặn http)
  if (process.env.EXPO_PUBLIC_LAN_IP?.length > 0) {
    s = s.replace("https:", "http:");
  } else {
    s = s.replace("http:", "https:");
  }
  s = s.replace("http:", "https:");

  // thay mọi backslash thành slash
  s = s.replace(/\\/g, "/");
  s = s.replace("localhost", process.env.EXPO_PUBLIC_LAN_IP);
  // tránh double slash sau domain
  // s = s.replace(/([^:]\/)\/+/g, "$1");
  // mã hoá ký tự lạ trong path
  const [base, query = ""] = s.split("?");
  return encodeURI(base) + (query ? `?${query}` : "");
};
