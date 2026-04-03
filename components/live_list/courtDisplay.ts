import {
  getMatchCourtDisplayText,
  getMatchCourtParts,
} from "@/utils/matchDisplay";

export function getLiveMatchCourtParts(match: any = {}) {
  return getMatchCourtParts(match);
}

export function getLiveMatchCourtText(match: any = {}) {
  return getMatchCourtDisplayText(match);
}
