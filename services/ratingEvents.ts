// src/services/ratingEvents.js

// Các loại event mà mình muốn cộng/trừ điểm "hài lòng"
export const RatingEvents = {
  TOURNAMENT_CREATED: "TOURNAMENT_CREATED",
  TOURNAMENT_FINISHED: "TOURNAMENT_FINISHED",
  MATCH_REFFED: "MATCH_REFFED",
  LIVE_STREAM_FINISHED: "LIVE_STREAM_FINISHED",
  LIVE_STREAM_DISCONNECTED: "LIVE_STREAM_DISCONNECTED",
  APP_CRASH: "APP_CRASH",
  API_ERROR: "API_ERROR",
  USER_VIEWED_RANKING: "USER_VIEWED_RANKING",
};

// Mỗi event tương ứng bao nhiêu điểm
export const EVENT_POINTS = {
  [RatingEvents.TOURNAMENT_CREATED]: +3,
  [RatingEvents.TOURNAMENT_FINISHED]: +2,
  [RatingEvents.MATCH_REFFED]: +1,
  [RatingEvents.LIVE_STREAM_FINISHED]: +2,
  [RatingEvents.LIVE_STREAM_DISCONNECTED]: -3,
  [RatingEvents.APP_CRASH]: -5,
  [RatingEvents.API_ERROR]: -2,
  [RatingEvents.USER_VIEWED_RANKING]: +1,
};
