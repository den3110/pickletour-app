// Kiểu dữ liệu đồng bộ với CandleChartSkiaPro
export type Candle = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
};

/** RNG có seed để tái lập */
function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller -> phân phối chuẩn ~N(0,1) từ RNG [0,1) */
function randn(rng: () => number) {
  let u = 0,
    v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

type MakeOpts = {
  count?: number; // số nến
  tfSec?: number; // timeframe (giây)
  startAtSec?: number; // mốc thời gian cho cây đầu tiên (UNIX seconds)
  startPrice?: number; // giá khởi tạo
  volBase?: number; // volume cơ sở
  drift?: number; // xu hướng (tăng/giảm) theo % mỗi nến (0.0 = trung tính)
  volatility?: number; // độ biến động (đơn vị % mỗi nến, ví dụ 0.6 = 0.6%)
  seed?: number; // seed RNG
};

/** Sinh mảng OHLCV tăng dần theo thời gian (giống sàn) */
export function makeCandles(opts: MakeOpts = {}): Candle[] {
  const {
    count = 600,
    tfSec = 60, // 1 phút
    startAtSec = Math.floor(Date.now() / 1000) - count * tfSec,
    startPrice = 100,
    volBase = 1000,
    drift = 0.0, // 0%/bar
    volatility = 0.6, // 0.6%/bar (giữa 0.3–1.0 cho đẹp)
    seed = 42,
  } = opts;

  const rng = mulberry32(seed);
  const normal = () => randn(rng);

  const out: Candle[] = new Array(count);
  let prevClose = startPrice;

  for (let i = 0; i < count; i++) {
    const t = startAtSec + i * tfSec;

    // biến động phần trăm cho close (random walk với drift)
    const pctMove = drift / 100 + (volatility / 100) * normal();
    const c = Math.max(0.0001, prevClose * (1 + pctMove));

    // open = close trước (kiểu thị trường liên tục)
    const o = prevClose;

    // wick: dao động thêm dựa trên độ biến động
    const bodyHi = Math.max(o, c);
    const bodyLo = Math.min(o, c);
    const wickUpPct = Math.abs(normal()) * (volatility / 100) * 0.8; // lên tối đa ~0.8*volatility
    const wickDnPct = Math.abs(normal()) * (volatility / 100) * 0.8;

    const h = Math.max(bodyHi, bodyHi * (1 + wickUpPct));
    const l = Math.min(bodyLo, bodyLo * (1 - wickDnPct));

    // volume: dao động theo biên độ nến (thân dài -> vol cao hơn)
    const bodyPct = Math.abs((c - o) / o);
    const vNoise = 0.6 + rng() * 0.8; // 0.6–1.4
    const v = Math.max(1, volBase * (1 + 8 * bodyPct) * vNoise);

    out[i] = { t, o, h, l, c, v };
    prevClose = c;
  }
  return out;
}

/** Tạo streamer đẩy nến mới mỗi tfSec (demo) */
export function makeCandleStreamer(
  initial: Candle[],
  tfSec: number,
  seed = 777
) {
  const rng = mulberry32(seed);
  const normal = () => randn(rng);
  let data = initial.slice();
  return {
    get: () => data,
    tick: () => {
      const last = data[data.length - 1];
      const drift = 0.0,
        volatility = 0.6; // % mỗi nến
      const pctMove = drift / 100 + (volatility / 100) * normal();
      const o = last.c;
      const c = Math.max(0.0001, o * (1 + pctMove));
      const bodyHi = Math.max(o, c),
        bodyLo = Math.min(o, c);
      const h = Math.max(bodyHi, bodyHi * (1 + Math.abs(normal()) * 0.006));
      const l = Math.min(bodyLo, bodyLo * (1 - Math.abs(normal()) * 0.006));
      const v = Math.max(1, (last.v ?? 1000) * (0.8 + rng() * 0.6));
      const t = last.t + tfSec;
      data = [...data.slice(1), { t, o, h, l, c, v }];
      return data[data.length - 1];
    },
  };
}
