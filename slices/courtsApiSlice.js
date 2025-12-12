import { apiSlice } from "./apiSlice";

export const courtsApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    adminListCourtsByTournament: builder.query({
      query: ({ tid, bracketId }) => {
        const q = new URLSearchParams();
        if (bracketId) q.set("bracketId", bracketId);
        return {
          url: `/api/admin/tournaments/c/${tid}/courts?${q.toString()}`,
        };
      },
    }),

    adminGetCourtLiveConfig: builder.query({
      query: (courtId) => ({ url: `/api/admin/courts/${courtId}/live-config` }),
    }),
    adminSetCourtLiveConfig: builder.mutation({
      query: ({
        courtId,
        enabled,
        videoUrl,
        overrideExisting,
        // mới (đã rename)
        advancedSettingEnabled,
        pageMode,
        pageConnectionId,
        advancedSetting,
      }) => {
        const body = {
          enabled,
          videoUrl,
          overrideExisting,
          advancedSettingEnabled,
          pageMode,
          advancedSetting,
        };

        // chỉ gửi pageConnectionId khi dùng Page tự chọn
        if (pageMode === "custom" && pageConnectionId) {
          body.pageConnectionId = pageConnectionId;
        }

        // dọn key undefined cho sạch payload
        Object.keys(body).forEach((k) => {
          if (body[k] === undefined) delete body[k];
        });

        return {
          url: `/api/admin/courts/${courtId}/live-config`,
          method: "PATCH",
          body,
        };
      },
    }),

    adminBulkSetCourtLiveConfig: builder.mutation({
      query: ({ tid, items }) => ({
        url: `/api/admin/tournaments/${tid}/courts/live-config/bulk`,
        method: "PATCH",
        body: { items },
      }),
    }),
  }),
});

export const {
  useAdminListCourtsByTournamentQuery,
  useAdminGetCourtLiveConfigQuery,
  useAdminSetCourtLiveConfigMutation,
  useAdminBulkSetCourtLiveConfigMutation,
} = courtsApiSlice;
