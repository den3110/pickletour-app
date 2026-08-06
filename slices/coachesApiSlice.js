// slices/coachesApiSlice.js — Huấn luyện viên (mobile).
import { apiSlice } from "./apiSlice";

export const coachesApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listCoaches: builder.query({
      query: ({ q, province, sort = "rating", cursor, limit = 20 } = {}) => {
        const p = new URLSearchParams();
        if (q) p.set("q", q);
        if (province) p.set("province", province);
        if (sort) p.set("sort", sort);
        if (cursor) p.set("cursor", cursor);
        if (limit) p.set("limit", String(limit));
        const qs = p.toString();
        return { url: `/api/coaches${qs ? `?${qs}` : ""}`, method: "GET" };
      },
      serializeQueryArgs: ({ queryArgs }) => {
        const { cursor: _c, ...rest } = queryArgs || {};
        return rest;
      },
      merge: (currentCache, newResponse, { arg }) => {
        if (!arg?.cursor) return newResponse;
        const existing = new Set(
          (currentCache?.items || []).map((i) => String(i._id))
        );
        const appended = (newResponse?.items || []).filter(
          (i) => !existing.has(String(i._id))
        );
        return {
          ...newResponse,
          items: [...(currentCache?.items || []), ...appended],
        };
      },
      forceRefetch({ currentArg, previousArg }) {
        return currentArg?.cursor !== previousArg?.cursor;
      },
    }),
    listCoachProvinces: builder.query({
      query: () => ({ url: `/api/coaches/provinces`, method: "GET" }),
    }),
    applyToBeCoach: builder.mutation({
      query: (body) => ({ url: `/api/coaches/apply`, method: "POST", body }),
    }),
    getMyCoachApplication: builder.query({
      query: () => ({ url: `/api/coaches/my-application`, method: "GET" }),
    }),
    cancelMyCoachApplication: builder.mutation({
      query: () => ({ url: `/api/coaches/my-application`, method: "DELETE" }),
    }),
    listCoachAchievements: builder.query({
      query: (userId) => ({
        url: `/api/coaches/${userId}/achievements`,
        method: "GET",
      }),
    }),
    createCoachAchievement: builder.mutation({
      query: (body) => ({
        url: `/api/coaches/achievements`,
        method: "POST",
        body,
      }),
    }),
    deleteCoachAchievement: builder.mutation({
      query: (id) => ({
        url: `/api/coaches/achievements/${id}`,
        method: "DELETE",
      }),
    }),
  }),
});

export const {
  useListCoachesQuery,
  useListCoachProvincesQuery,
  useApplyToBeCoachMutation,
  useGetMyCoachApplicationQuery,
  useCancelMyCoachApplicationMutation,
  useListCoachAchievementsQuery,
  useCreateCoachAchievementMutation,
  useDeleteCoachAchievementMutation,
} = coachesApiSlice;
