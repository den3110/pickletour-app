export const roundTo3 = (n: number): number => {
  if (!Number.isFinite(n)) return n;            // giữ nguyên NaN/±Infinity
  return Number(Math.round(Number(`${n}e3`)) + "e-3");
};
