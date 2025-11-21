// app/slices/guidesApiSlice.ts
import { apiSlice } from "./apiSlice";

export const guidesApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // GET /api/system-settings/guide-link  (tuỳ bạn mount router)
    getGuideFeedUrl: builder.query<{ guideUrl: string }, void>({
      query: () => ({
        url: "/api/public/guide-link", // nếu BE là /api/system-settings/guide-link
        method: "GET",
      }),
      transformResponse: (res: any) => ({
        guideUrl: res?.guideUrl ?? "",
      }),
    }),
  }),
  overrideExisting: false,
});

export const { useGetGuideFeedUrlQuery } = guidesApiSlice;
