import { apiSlice } from "./apiSlice";

export const courtClustersAdminApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getTournamentCourtClusterOptions: builder.query({
      query: (tournamentId) =>
        `/api/admin/tournaments/${tournamentId}/allowed-court-clusters/options`,
      keepUnusedDataFor: 0,
      extraOptions: { skip404Redirect: true },
    }),
    getTournamentCourtClusterRuntime: builder.query({
      query: ({ tournamentId, clusterId }) =>
        `/api/admin/tournaments/${tournamentId}/court-clusters/${clusterId}/runtime`,
      keepUnusedDataFor: 0,
      extraOptions: { skip404Redirect: true },
    }),
    updateAdminCourtStation: builder.mutation({
      query: ({ clusterId, stationId, ...body }) => ({
        url: `/api/admin/court-clusters/${clusterId}/courts/${stationId}`,
        method: "PUT",
        body,
      }),
    }),
    assignTournamentMatchToCourtStation: builder.mutation({
      query: ({ tournamentId, stationId, matchId }) => ({
        url: `/api/admin/tournaments/${tournamentId}/court-stations/${stationId}/assign-match`,
        method: "POST",
        body: { matchId },
      }),
    }),
    updateTournamentCourtStationAssignmentConfig: builder.mutation({
      query: ({ tournamentId, stationId, assignmentMode, queueMatchIds }) => ({
        url: `/api/admin/tournaments/${tournamentId}/court-stations/${stationId}/assignment-config`,
        method: "PUT",
        body: { assignmentMode, queueMatchIds },
      }),
    }),
    appendTournamentCourtStationQueueItem: builder.mutation({
      query: ({ tournamentId, stationId, matchId }) => ({
        url: `/api/admin/tournaments/${tournamentId}/court-stations/${stationId}/queue/items`,
        method: "POST",
        body: { matchId },
      }),
    }),
    removeTournamentCourtStationQueueItem: builder.mutation({
      query: ({ tournamentId, stationId, matchId }) => ({
        url: `/api/admin/tournaments/${tournamentId}/court-stations/${stationId}/queue/items/${matchId}`,
        method: "DELETE",
      }),
    }),
    freeTournamentCourtStation: builder.mutation({
      query: ({ tournamentId, stationId }) => ({
        url: `/api/admin/tournaments/${tournamentId}/court-stations/${stationId}/free`,
        method: "POST",
      }),
    }),
  }),
  overrideExisting: true,
});

export const {
  useGetTournamentCourtClusterOptionsQuery,
  useGetTournamentCourtClusterRuntimeQuery,
  useUpdateAdminCourtStationMutation,
  useAssignTournamentMatchToCourtStationMutation,
  useUpdateTournamentCourtStationAssignmentConfigMutation,
  useAppendTournamentCourtStationQueueItemMutation,
  useRemoveTournamentCourtStationQueueItemMutation,
  useFreeTournamentCourtStationMutation,
} = courtClustersAdminApiSlice;
