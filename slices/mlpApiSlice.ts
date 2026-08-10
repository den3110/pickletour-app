// slices/mlpApiSlice.ts — Mobile RTK Query cho MLP tournament.
// Song song với slice web ở frontend/src/slices/mlpApiSlice.js, nhưng viết
// TypeScript nhẹ + chỉ các endpoint mobile cần.
import { apiSlice } from "./apiSlice";

export const mlpApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listMlpTeams: builder.query({
      query: ({ tourId, status }: { tourId: string; status?: string }) => {
        const p = new URLSearchParams();
        if (status) p.set("status", status);
        const qs = p.toString();
        return {
          url: `/api/mlp/tournaments/${tourId}/teams${qs ? `?${qs}` : ""}`,
        };
      },
      providesTags: (r, e, { tourId }) => [
        { type: "MlpTeam" as any, id: tourId },
      ],
    }),
    createMlpTeam: builder.mutation({
      query: ({ tourId, ...body }: any) => ({
        url: `/api/mlp/tournaments/${tourId}/teams`,
        method: "POST",
        body,
      }),
      invalidatesTags: (r, e, { tourId }) => [
        { type: "MlpTeam" as any, id: tourId },
      ],
    }),
    updateMlpTeam: builder.mutation({
      query: ({ teamId, ...body }: any) => ({
        url: `/api/mlp/teams/${teamId}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (r, e, { tourId }) =>
        tourId ? [{ type: "MlpTeam" as any, id: tourId }] : ["MlpTeam" as any],
    }),
    listMlpDuals: builder.query({
      query: ({ tourId, status }: { tourId: string; status?: string }) => {
        const p = new URLSearchParams();
        if (status) p.set("status", status);
        const qs = p.toString();
        return {
          url: `/api/mlp/tournaments/${tourId}/duals${qs ? `?${qs}` : ""}`,
        };
      },
      providesTags: (r, e, { tourId }) => [
        { type: "MlpDual" as any, id: tourId },
      ],
    }),
    getMlpDual: builder.query({
      query: (id: string) => ({ url: `/api/mlp/duals/${id}` }),
      providesTags: (r, e, id) => [{ type: "MlpDual" as any, id }],
    }),
    listMlpStandings: builder.query({
      query: (tid: string) => ({
        url: `/api/mlp/tournaments/${tid}/standings`,
      }),
      providesTags: (r, e, tid) => [
        { type: "MlpStandings" as any, id: tid },
      ],
    }),
    syncMlpSubMatch: builder.mutation({
      query: ({
        dualId,
        subId,
        scoreA,
        scoreB,
        status,
      }: {
        dualId: string;
        subId: string;
        scoreA: number;
        scoreB: number;
        status?: string;
      }) => ({
        url: `/api/mlp/duals/${dualId}/subs/${subId}/score`,
        method: "POST",
        body: { scoreA, scoreB, status },
      }),
      invalidatesTags: (r, e, { dualId }) => [
        { type: "MlpDual" as any, id: dualId },
      ],
    }),
    assignMlpLineup: builder.mutation({
      query: ({
        dualId,
        subId,
        playersA,
        playersB,
      }: {
        dualId: string;
        subId: string;
        playersA: string[];
        playersB: string[];
      }) => ({
        url: `/api/mlp/duals/${dualId}/subs/${subId}/lineup`,
        method: "PATCH",
        body: { playersA, playersB },
      }),
      invalidatesTags: (r, e, { dualId }) => [
        { type: "MlpDual" as any, id: dualId },
      ],
    }),
    startMlpDreamBreaker: builder.mutation({
      query: ({
        dualId,
        lineupA,
        lineupB,
      }: {
        dualId: string;
        lineupA: string[];
        lineupB: string[];
      }) => ({
        url: `/api/mlp/duals/${dualId}/dreambreaker/start`,
        method: "POST",
        body: { lineupA, lineupB },
      }),
      invalidatesTags: (r, e, { dualId }) => [
        { type: "MlpDual" as any, id: dualId },
      ],
    }),
    scoreMlpDbPoint: builder.mutation({
      query: ({ dualId, side }: { dualId: string; side: "A" | "B" }) => ({
        url: `/api/mlp/duals/${dualId}/dreambreaker/point`,
        method: "POST",
        body: { side },
      }),
      invalidatesTags: (r, e, { dualId }) => [
        { type: "MlpDual" as any, id: dualId },
      ],
    }),
    undoMlpDbPoint: builder.mutation({
      query: ({ dualId }: { dualId: string }) => ({
        url: `/api/mlp/duals/${dualId}/dreambreaker/undo`,
        method: "POST",
      }),
      invalidatesTags: (r, e, { dualId }) => [
        { type: "MlpDual" as any, id: dualId },
      ],
    }),
    checkInMlpDual: builder.mutation({
      query: ({ dualId, side }: { dualId: string; side: "A" | "B" }) => ({
        url: `/api/mlp/duals/${dualId}/check-in`,
        method: "POST",
        body: { side },
      }),
      invalidatesTags: (r, e, { dualId }) => [
        { type: "MlpDual" as any, id: dualId },
      ],
    }),
  }),
});

export const {
  useListMlpTeamsQuery,
  useCreateMlpTeamMutation,
  useUpdateMlpTeamMutation,
  useListMlpDualsQuery,
  useGetMlpDualQuery,
  useListMlpStandingsQuery,
  useSyncMlpSubMatchMutation,
  useAssignMlpLineupMutation,
  useStartMlpDreamBreakerMutation,
  useScoreMlpDbPointMutation,
  useUndoMlpDbPointMutation,
  useCheckInMlpDualMutation,
} = mlpApiSlice;
