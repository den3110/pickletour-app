import { apiSlice } from "./apiSlice";

export const overlayApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getOverlayConfig: builder.query({
      query: (params) => ({
        url: "/api/public/overlay/config",
        params, // { limit, featured, tier }
      }),
      // Cho phép cache-busting theo sponsor
      providesTags: (res) => {
        const base = [{ type: "Sponsors", id: "PUBLIC" }];
        if (!res?.sponsors?.length) return base;
        return [
          ...base,
          ...res.sponsors.map((x) => ({ type: "Sponsor", id: x._id })),
        ];
      },
    }),
  }),
});

export const { useGetOverlayConfigQuery, useLazyGetOverlayConfigQuery } =
  overlayApiSlice;
