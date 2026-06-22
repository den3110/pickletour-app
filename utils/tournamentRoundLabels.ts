type RoundLabelOptions = {
  includeIndex?: boolean;
  index?: number | null;
  fallback?: string;
};

const isFinitePositive = (value: number) =>
  Number.isFinite(value) && value > 0;

const withIndex = (label: string, options: RoundLabelOptions = {}) => {
  const index = Number(options.index);
  if (options.includeIndex && isFinitePositive(index)) {
    return `${label} ${index}`;
  }
  return label;
};

export function formatKnockoutRoundLabelByMatchCount(
  matchCount: number,
  options: RoundLabelOptions = {},
) {
  const count = Number(matchCount);
  if (!isFinitePositive(count)) return options.fallback ?? "";
  if (count === 1) return "Chung kết";
  if (count === 2) return withIndex("Bán kết", options);
  if (count === 4) return withIndex("Tứ kết", options);
  if (count >= 8 && Number.isInteger(Math.log2(count))) {
    return `Vòng 1/${count}`;
  }
  return options.fallback ?? "";
}

export function formatKnockoutRoundLabelByTeamCount(
  teamCount: number,
  options: RoundLabelOptions = {},
) {
  const teams = Number(teamCount);
  if (!isFinitePositive(teams)) return options.fallback ?? "";
  return formatKnockoutRoundLabelByMatchCount(Math.max(1, teams / 2), options);
}
