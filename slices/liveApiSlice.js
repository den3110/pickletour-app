import { apiSlice } from "./apiSlice";

const LIMIT = 12;

export const liveApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getLiveMatches: builder.query({
      query: ({
        statuses = "scheduled,queued,assigned,live",
        excludeFinished,
        windowMs = 8 * 3600 * 1000,
        keyword = "",
        q = "",
        tournamentId = "",
        page = 1,
        limit = LIMIT,
        all = false,
      } = {}) => {
        const params = new URLSearchParams();

        if (statuses) params.set("statuses", statuses);
        if (windowMs > 0) params.set("windowMs", String(windowMs));
        if (excludeFinished === false) params.set("excludeFinished", "false");
        if (keyword || q) params.set("q", String(q || keyword || "").trim());
        if (tournamentId) params.set("tournamentId", tournamentId);
        if (page) params.set("page", String(page));
        if (limit) params.set("limit", String(limit));
        if (all) params.set("all", "true");

        const queryString = params.toString();
        return `/api/live/matches${queryString ? `?${queryString}` : ""}`;
      },
      keepUnusedDataFor: 30,
      transformResponse: (resp, meta, arg) => {
        const requestPage = Math.max(1, Number(arg?.page || 1));
        const requestLimit = Math.max(1, Number(arg?.limit || LIMIT));
        const total = Number(resp?.count || 0);

        return {
          items: Array.isArray(resp?.items) ? resp.items : [],
          total,
          count: total,
          page: Number(resp?.page || requestPage),
          pages: Math.max(1, Number(resp?.pages || 1)),
          limit: Number(resp?.limit || requestLimit),
          meta: resp?.meta || {},
          tournaments: Array.isArray(resp?.tournaments) ? resp.tournaments : [],
          rawCount: total,
          countLive: Number(resp?.countLive || 0),
        };
      },
    }),
  }),
});

export const { useGetLiveMatchesQuery } = liveApiSlice;
