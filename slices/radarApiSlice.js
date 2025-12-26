// slices/radarApiSlice.js
import { apiSlice } from "./apiSlice";

function toQS(params = {}) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    sp.set(k, String(v));
  });
  return sp.toString();
}

export const radarApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getRadarExplore: builder.query({
      query: ({
        lng,
        lat,
        radiusKm = 5,
        playType = "any",
        types = "user,tournament,club",
      }) => {
        const qs = toQS({ lng, lat, radiusKm, playType, types });
        return { url: `/api/radar/explore?${qs}`, method: "GET" };
      },
      providesTags: (result) => [{ type: "Radar", id: "EXPLORE" }],
      keepUnusedDataFor: 10,
    }),

    upsertMyPresence: builder.mutation({
      query: ({ lng, lat, status, visibility, source, preferredRadiusKm }) => ({
        url: "/api/radar/presence",
        method: "POST",
        body: { lng, lat, status, visibility, source, preferredRadiusKm },
      }),
      invalidatesTags: [{ type: "Radar", id: "EXPLORE" }],
    }),
  }),
});

export const { useGetRadarExploreQuery, useUpsertMyPresenceMutation } =
  radarApiSlice;
