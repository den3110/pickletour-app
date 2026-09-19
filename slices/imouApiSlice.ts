// slices/imouApiSlice.ts — RTK Query cho Imou owner endpoints (PickleTour).
import { apiSlice } from "./apiSlice";

export const imouApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    linkImouAccount: builder.mutation({
      query: ({ venueId, phone, areaCode }: { venueId: string; phone: string; areaCode?: string }) => ({
        url: `/api/imou/venues/${venueId}/account`,
        method: "POST",
        body: { phone, areaCode: areaCode || "84" },
      }),
      invalidatesTags: (r, e, { venueId }) => [{ type: "Venue" as any, id: venueId }],
    }),
    unlinkImouAccount: builder.mutation({
      query: (venueId: string) => ({
        url: `/api/imou/venues/${venueId}/account`,
        method: "DELETE",
      }),
      invalidatesTags: (r, e, venueId) => [{ type: "Venue" as any, id: venueId }],
    }),
    uploadImouSession: builder.mutation({
      query: ({ venueId, session }: any) => ({
        url: `/api/imou/venues/${venueId}/session`,
        method: "POST",
        body: session,
      }),
    }),
    uploadImouCreds: builder.mutation({
      query: ({ venueId, phone, password, areaCode }: any) => ({
        url: `/api/imou/venues/${venueId}/creds`,
        method: "POST",
        body: { phone, password, areaCode: areaCode || "84" },
      }),
    }),
    getImouSession: builder.query({
      query: (venueId: string) => ({ url: `/api/imou/venues/${venueId}/session` }),
    }),
    getImouCreds: builder.query({
      query: (venueId: string) => ({ url: `/api/imou/venues/${venueId}/creds` }),
    }),
    addImouCam: builder.mutation({
      query: ({ venueId, courtId, ...body }: any) => ({
        url: `/api/imou/venues/${venueId}/courts/${courtId}/cams`,
        method: "POST",
        body,
      }),
      invalidatesTags: (r, e, { venueId }) => [{ type: "Venue" as any, id: venueId }],
    }),
    renameImouCam: builder.mutation({
      query: ({ venueId, courtId, deviceId, name }: any) => ({
        url: `/api/imou/venues/${venueId}/courts/${courtId}/cams/${deviceId}`,
        method: "PATCH",
        body: { name },
      }),
      invalidatesTags: (r, e, { venueId }) => [{ type: "Venue" as any, id: venueId }],
    }),
    removeImouCam: builder.mutation({
      query: ({ venueId, courtId, deviceId }: any) => ({
        url: `/api/imou/venues/${venueId}/courts/${courtId}/cams/${deviceId}`,
        method: "DELETE",
      }),
      invalidatesTags: (r, e, { venueId }) => [{ type: "Venue" as any, id: venueId }],
    }),
  }),
});

export const {
  useLinkImouAccountMutation,
  useUnlinkImouAccountMutation,
  useUploadImouSessionMutation,
  useUploadImouCredsMutation,
  useLazyGetImouCredsQuery,
  useLazyGetImouSessionQuery,
  useAddImouCamMutation,
  useRenameImouCamMutation,
  useRemoveImouCamMutation,
} = imouApiSlice;
