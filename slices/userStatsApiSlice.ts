import { apiSlice } from "./apiSlice";

export const userStatsApiSlice = apiSlice.injectEndpoints({
  endpoints: (b) => ({
    getUserOverview: b.query<any, { uid: string; from?: string; to?: string }>({
      query: ({ uid, ...params }) => ({ url: `/api/users/stats/${uid}/stats/overview`, params }),
    }),
    getUserSeries: b.query<any, { uid: string; from?: string; to?: string; tz?: string }>({
      query: ({ uid, ...params }) => ({ url: `/api/users/stats/${uid}/stats/series`, params }),
    }),
    getUserBreakdown: b.query<any, { uid: string; from?: string; to?: string }>({
      query: ({ uid, ...params }) => ({ url: `/api/users/stats/${uid}/stats/breakdown`, params }),
    }),
    getUserHeatmap: b.query<any, { uid: string; from?: string; to?: string; tz?: string }>({
      query: ({ uid, ...params }) => ({ url: `/api/users/stats/${uid}/stats/heatmap`, params }),
    }),
    getUserTop: b.query<any, { uid: string; from?: string; to?: string; limit?: number }>({
      query: ({ uid, ...params }) => ({ url: `/api/users/stats/${uid}/stats/top`, params }),
    }),
    getUserProfileEx: b.query<any, { uid: string }>({
      query: ({ uid }) => ({ url: `/api/users/stats/${uid}/stats/profile` }),
    }),
  }),
});

export const {
  useGetUserOverviewQuery,
  useGetUserSeriesQuery,
  useGetUserBreakdownQuery,
  useGetUserHeatmapQuery,
  useGetUserTopQuery,
  useGetUserProfileExQuery,
} = userStatsApiSlice;
