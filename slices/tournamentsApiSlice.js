// src/slices/tournamentsApiSlice.js
import { apiSlice } from "./apiSlice";

const normalizeListResponse = (res) =>
  Array.isArray(res) ? { items: res } : res || { items: [] };

export const tournamentsApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    /* ========= DANH SÁCH GIẢI (mới) ========= */
    listTournaments: builder.query({
      // ví dụ: /api/tournaments?limit=50&sort=-updatedAt
      query: ({ limit = 50, sort = "-updatedAt" } = {}) => ({
        url: `/api/tournaments`,
        params: { limit, sort },
      }),
      // Chuẩn hoá về mảng mà KHÔNG dùng toArray
      transformResponse: (res) => {
        if (Array.isArray(res)) return res;
        if (Array.isArray(res?.items)) return res.items;
        if (Array.isArray(res?.tournaments)) return res.tournaments;
        if (Array.isArray(res?.list)) return res.list;
        if (Array.isArray(res?.data)) return res.data;
        return [];
      },
      providesTags: (result) =>
        result && result.length
          ? [
              ...result.map((t) => ({
                type: "Tournaments",
                id: t?._id || t?.id,
              })),
              { type: "Tournaments", id: "LIST" },
            ]
          : [{ type: "Tournaments", id: "LIST" }],
      keepUnusedDataFor: 0,
    }),

    /* ========= TÌM KIẾM GIẢI (mới) ========= */
    searchTournaments: builder.query({
      // ví dụ: /api/tournaments?keyword=abc&limit=20
      query: ({ q = "", limit = 20 } = {}) => ({
        url: `/api/tournaments`,
        params: { keyword: q, limit },
      }),
      transformResponse: (res) => {
        if (Array.isArray(res)) return res;
        if (Array.isArray(res?.items)) return res.items;
        if (Array.isArray(res?.tournaments)) return res.tournaments;
        if (Array.isArray(res?.list)) return res.list;
        if (Array.isArray(res?.data)) return res.data;
        return [];
      },
      keepUnusedDataFor: 0,
    }),

    /* ========= OVERLAY PATCH (mới) ========= */
    updateOverlay: builder.mutation({
      // PATCH /api/tournaments/:id/overlay  body = { ...overlayConfig }
      query: ({ id, body }) => ({
        url: `/api/tournaments/${id}/overlay`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (res, err, { id }) => [
        { type: "Tournaments", id },
        { type: "Tournaments", id: "LIST" },
      ],
    }),

    /* ========= ĐÃ CÓ TỪ TRƯỚC (giữ nguyên) ========= */
    getTournaments: builder.query({
      query: ({ sportType, groupId }) =>
        `/api/tournaments?sportType=${sportType}&groupId=${groupId}`,
      providesTags: ["Tournaments"],
    }),

    /* ---------------------------------- REG LIST ---------------------------------- */
    getRegistrations: builder.query({
      query: (tourId) => `/api/tournaments/${tourId}/registrations`,
      keepUnusedDataFor: 0,
    }),

    /* ---------------------------- CREATE REGISTRATION ----------------------------- */
    createRegistration: builder.mutation({
      query: ({ tourId, ...payload }) => ({
        url: `/api/tournaments/${tourId}/registrations`,
        method: "POST",
        body: payload,
        headers: {
          "Content-Type": "application/json",
        },
      }),
      invalidatesTags: (result, error, { tourId }) => [
        { type: "Registrations", id: tourId },
        { type: "Tournaments", id: tourId },
      ],
    }),

    /* --------------------------- UPDATE PAYMENT STATUS --------------------------- */
    updatePayment: builder.mutation({
      query: ({ regId, status }) => ({
        url: `/api/registrations/${regId}/payment`,
        method: "PATCH",
        body: { status },
      }),
      invalidatesTags: (r, e, arg) => [
        { type: "Registrations", id: arg.regId },
      ],
    }),

    /* ----------------------------- CHECK-IN REGISTRATION ----------------------------- */
    checkin: builder.mutation({
      query: ({ regId }) => ({
        url: `/api/registrations/${regId}/checkin`,
        method: "PATCH",
      }),
      invalidatesTags: (r, e, arg) => [
        { type: "Registrations", id: arg.regId },
      ],
    }),

    getTournament: builder.query({
      query: (id) => `/api/tournaments/${id}`,
      keepUnusedDataFor: 0,
      providesTags: (res, err, id) => [{ type: "Tournaments", id }],
    }),

    // ✨ LẤY DANH SÁCH TRẬN ĐẤU (bracket + check-in page)
    getMatches: builder.query({
      query: (tourId) => `/api/tournaments/${tourId}/matches`,
      providesTags: (r, e, id) => [{ type: "Matches", id }],
    }),

    getTournamentMatchesForCheckin: builder.query({
      query: (tournamentId) =>
        `/api/tournaments/${tournamentId}/checkin-matches`,
    }),

    searchUserMatches: builder.query({
      query: ({ tournamentId, q }) => ({
        url: `/api/tournaments/checkin/search`,
        params: { tournamentId, q },
      }),
    }),

    userCheckinRegistration: builder.mutation({
      query: (body) => ({
        url: `/api/tournaments/checkin`,
        method: "POST",
        body, // { tournamentId, q, regId }
      }),
    }),

    // GET /api/tournaments/:id/brackets  (user route)
    listTournamentBrackets: builder.query({
      query: (tournamentId) => ({
        url: `/api/tournaments/${tournamentId}/brackets`,
        method: "GET",
      }),
      transformResponse: (res) => {
        if (Array.isArray(res)) return res;
        if (res?.list && Array.isArray(res.list)) return res.list;
        return [];
      },
      keepUnusedDataFor: 0,
    }),

    // GET /api/tournaments/:id/matches  (user route)
    listTournamentMatches: builder.query({
      query: ({ tournamentId, ...params }) => ({
        url: `/api/tournaments/${tournamentId}/matches`,
        method: "GET",
        params,
      }),
      transformResponse: (res) => {
        if (Array.isArray(res)) return res;
        if (res?.list && Array.isArray(res.list)) return res.list;
        return [];
      },
      keepUnusedDataFor: 0,
    }),

    getMatchPublic: builder.query({
      query: (matchId) => `/api/tournaments/matches/${matchId}`,
      providesTags: (res, err, id) => [{ type: "Match", id }],
    }),

    cancelRegistration: builder.mutation({
      query: (regId) => ({
        url: `/api/registrations/${regId}/cancel`,
        method: "POST",
      }),
      invalidatesTags: () => [{ type: "Registrations", id: "LIST" }],
    }),

    // NEW: tạo lời mời đăng ký
    createRegInvite: builder.mutation({
      query: ({ tourId, message, player1Id, player2Id }) => ({
        url: `/api/tournaments/${tourId}/registration-invites`,
        method: "POST",
        body: { message, player1Id, player2Id },
      }),
      invalidatesTags: (res) =>
        res?.invite?.status === "finalized" ? ["Registrations"] : [],
    }),

    // NEW: list lời mời mình còn pending (theo từng giải)
    listMyRegInvites: builder.query({
      query: () => `/api/tournaments/get/registration-invites`,
      providesTags: ["RegInvites"],
    }),

    // NEW: phản hồi lời mời
    respondRegInvite: builder.mutation({
      query: ({ inviteId, action }) => ({
        url: `/api/tournaments/registration-invites/${inviteId}/respond`,
        method: "POST",
        body: { action },
      }),
      invalidatesTags: ["RegInvites"],
    }),

    // ✅ Manager toggle trạng thái thanh toán
    managerSetRegPaymentStatus: builder.mutation({
      query: ({ regId, status }) => ({
        url: `/api/registrations/${regId}/payment`,
        method: "PATCH",
        body: { status },
      }),
      invalidatesTags: ["Registrations"],
    }),

    // ✅ Manager huỷ (xoá) đăng ký
    managerDeleteRegistration: builder.mutation({
      query: (regId) => ({
        url: `/api/registrations/${regId}/admin`,
        method: "DELETE",
      }),
      invalidatesTags: ["Registrations"],
    }),

    /* ========= SNAPSHOT OVERLAY (giữ) ========= */
    getOverlaySnapshot: builder.query({
      // Nếu BE của bạn khác, sửa route này cho khớp
      query: (matchId) => `/api/overlay/match/${matchId}`,
      providesTags: (res, err, id) => [{ type: "Match", id }],
    }),

    /* ========= DRAW API (giữ) ========= */
    getDrawStatus: builder.query({
      query: (bracketId) => ({
        url: `/api/draw/brackets/${bracketId}/draw/status`,
        method: "GET",
      }),
      keepUnusedDataFor: 0,
    }),

    initDraw: builder.mutation({
      query: ({ bracketId, mode, config }) => ({
        url: `/api/brackets/${bracketId}/draw/init`,
        method: "POST",
        body: { mode, config },
      }),
      invalidatesTags: (_res, _err, { bracketId }) => [
        { type: "Draw", id: bracketId },
      ],
    }),

    revealDraw: builder.mutation({
      query: (bracketId) => ({
        url: `/api/brackets/${bracketId}/draw/reveal`,
        method: "POST",
      }),
      invalidatesTags: (_res, _err, bracketId) => [
        { type: "Draw", id: bracketId },
      ],
    }),

    undoDraw: builder.mutation({
      query: (bracketId) => ({
        url: `/api/brackets/${bracketId}/draw/undo`,
        method: "POST",
      }),
      invalidatesTags: (_res, _err, bracketId) => [
        { type: "Draw", id: bracketId },
      ],
    }),

    finalizeKo: builder.mutation({
      query: (bracketId) => ({
        url: `/api/brackets/${bracketId}/draw/finalize-ko`,
        method: "POST",
      }),
      invalidatesTags: (_res, _err, bracketId) => [
        { type: "Draw", id: bracketId },
      ],
    }),

    startDraw: builder.mutation({
      query: ({ bracketId, body }) => ({
        url: `/api/draw/${bracketId}/start`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_res, _err, arg) => [
        { type: "Draw", id: arg.bracketId },
      ],
    }),

    drawNext: builder.mutation({
      query: ({ drawId, body }) => ({
        url: `/api/draw/${drawId}/next`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_res, _err, arg) => [{ type: "Draw", id: arg.drawId }],
    }),

    drawCommit: builder.mutation({
      query: ({ drawId }) => ({
        url: `/api/draw/${drawId}/commit`,
        method: "POST",
      }),
      invalidatesTags: (_res, _err, arg) => [{ type: "Draw", id: arg.drawId }],
    }),

    cancelDraw: builder.mutation({
      query: (bracketId) => ({
        url: `/api/brackets/${bracketId}/draw/cancel`,
        method: "POST",
      }),
      invalidatesTags: (_res, _err, bracketId) => [
        { type: "Draw", id: bracketId },
      ],
    }),

    drawCancel: builder.mutation({
      query: ({ drawId }) => ({
        url: `/api/draw/${drawId}/cancel`,
        method: "POST",
      }),
      invalidatesTags: (_res, _err, arg) => [{ type: "Draw", id: arg.drawId }],
    }),

    getBracket: builder.query({
      query: (bracketId) => `/api/brackets/${bracketId}`,
      keepUnusedDataFor: 0,
    }),

    generateGroupMatches: builder.mutation({
      query: ({ bracketId, mode, matches, rules }) => ({
        url: `/api/draw/brackets/${bracketId}/group/generate-matches`,
        method: "POST",
        body: { mode, matches, rules },
      }),
      invalidatesTags: (r, e, arg) => [{ type: "Matches", id: arg.bracketId }],
    }),

    managerReplaceRegPlayer: builder.mutation({
      query: ({ regId, slot, userId }) => ({
        url: `/api/registrations/${regId}/manager/replace-player`,
        method: "PATCH",
        body: { slot, userId },
      }),
      invalidatesTags: (r, e, { regId }) => [
        { type: "Registration", id: regId },
        { type: "Registrations", id: "LIST" },
      ],
    }),
    listPublicMatchesByTournament: builder.query({
      query: ({ tid, params }) => {
        // backend nên trả danh sách đã tối ưu cho hiển thị (simple fields)
        const search = new URLSearchParams({
          ...(params || {}),
          public: 1,
          pageSize: 500,
        }).toString();
        return `/api/tournaments/${tid}/matches?${search}`;
      },
      providesTags: (r, e, { tid }) => [{ type: "TournamentMatches", id: tid }],
    }),
    adminGetBrackets: builder.query({
      query: (tournamentId) => ({
        url: `/api/tournaments/${tournamentId}/brackets`,
        method: "GET",
      }),
      transformResponse: (res) => res?.list || res || [],
      providesTags: ["ADMIN_BRACKETS"],
    }),
    adminListMatchesByTournament: builder.query({
      // args: { tid, page, pageSize, status, bracketId, q }
      query: ({ tid, ...params }) => {
        const qs = new URLSearchParams(params).toString();
        return {
          url: `/api/tournaments/${tid}/matches${qs ? `?${qs}` : ""}`,
          method: "GET",
        };
      },
      // expect: { total, page, limit, list: [...] }
      transformResponse: (res) =>
        res ?? { total: 0, page: 1, limit: 200, list: [] },
      providesTags: ["ADMIN_MATCHES"],
    }),
    adminSetMatchLiveUrl: builder.mutation({
      query: ({ matchId, video }) => ({
        url: `/api/matches/${matchId}/live`,
        method: "PATCH",
        body: { video: video || null },
      }),
      invalidatesTags: ["ADMIN_MATCHES"],
    }),
    // GET /me/tournaments?role=player&page&limit&status
    listMyTournaments: builder.query({
      query: ({
        page = 1,
        limit = 50,
        status,
        withMatches = 1,
        matchLimit = 200,
      } = {}) => ({
        url: "/api/users/tournaments",
        params: { page, limit, status, withMatches, matchLimit },
      }),
      providesTags: (res) =>
        res?.items
          ? [
              ...res.items.map((t) => ({ type: "MyTournaments", id: t._id })),
              { type: "MyTournaments", id: "LIST" },
            ]
          : [{ type: "MyTournaments", id: "LIST" }],
    }),
    createComplaint: builder.mutation({
      // Backend A (mặc định): POST /api/tournaments/:tournamentId/registrations/:regId/complaints  { content }
      query: ({ tournamentId, regId, content }) => ({
        url: `/api/tournaments/${tournamentId}/registrations/${regId}/complaints`,
        method: "POST",
        body: { content },
      }),

      // Nếu backend của bạn là dạng B:
      // query: ({ regId, content }) => ({
      //   url: `/api/registrations/${regId}/complaints`,
      //   method: 'POST',
      //   body: { content },
      // }),

      // hoặc dạng C:
      // query: ({ registrationId, message }) => ({
      //   url: `/api/complaints`,
      //   method: 'POST',
      //   body: { registrationId, message },
      // }),

      invalidatesTags: (result, error, { regId, tournamentId }) => [
        { type: "Registration", id: regId },
        { type: "Tournament", id: tournamentId },
        { type: "Complaints", id: "LIST" },
      ],
    }),
    // Search server-side theo tên VĐV / SĐT / mã đăng ký
    searchRegistrations: builder.query({
      query: ({ id, q, limit = 500 }) => ({
        url: `/api/registrations/${id}/registrations/search`,
        params: { q, limit },
      }),
      // cache riêng theo id+q
      serializeQueryArgs: ({ endpointName, queryArgs }) =>
        `${endpointName}|${queryArgs.id}|${queryArgs.q}|${queryArgs.limit}`,
    }),

    // 3) referee cộng/trừ điểm (delta: +1|-1)
    refereeIncPoint: builder.mutation({
      query: ({ matchId, side, delta }) => ({
        url: `/api/referee/matches/${matchId}/score`,
        method: "PATCH",
        body: { op: "inc", side, delta },
      }),

      // ✅ Optimistic update chi tiết trận
      async onQueryStarted(
        { matchId, side, delta },
        { dispatch, queryFulfilled }
      ) {
        const s = (side || "A").toUpperCase(); // chuẩn hoá
        const patch = dispatch(
          tournamentsApiSlice.util.updateQueryData(
            "getMatch",
            matchId,
            (draft) => {
              if (!draft.gameScores || !draft.gameScores.length) {
                draft.gameScores = [{ a: 0, b: 0 }];
              }
              const i = Math.max(0, draft.gameScores.length - 1);
              if (s === "A") {
                const next = (draft.gameScores[i].a || 0) + delta;
                draft.gameScores[i].a = Math.max(0, next); // tránh âm
              } else {
                const next = (draft.gameScores[i].b || 0) + delta;
                draft.gameScores[i].b = Math.max(0, next);
              }
            }
          )
        );
        try {
          await queryFulfilled; // giữ patch nếu OK
        } catch {
          patch.undo(); // rollback nếu lỗi
        }
      },

      // ✅ Refetch lại getMatch(matchId) để đồng bộ với server
      invalidatesTags: (_res, _err, { matchId }) => [
        { type: "Match", id: matchId },
      ],
    }),

    // (tuỳ chọn) set điểm tuyệt đối cho ván hiện tại
    refereeSetGameScore: builder.mutation({
      query: ({ matchId, gameIndex, a, b }) => ({
        url: `/api/referee/matches/${matchId}/score`,
        method: "PATCH",
        body: { op: "setGame", gameIndex, a, b },
      }),
      async onQueryStarted(
        { matchId, gameIndex, a, b },
        { dispatch, queryFulfilled }
      ) {
        const patch = dispatch(
          tournamentsApiSlice.util.updateQueryData(
            "getMatch",
            matchId,
            (draft) => {
              if (!draft.gameScores) draft.gameScores = [];
              draft.gameScores[gameIndex] = { a, b };
            }
          )
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
    }),

    // 4) set status
    refereeSetStatus: builder.mutation({
      query: ({ matchId, status }) => ({
        url: `/api/referee/matches/${matchId}/status`,
        method: "PATCH",
        body: { status },
      }),
      invalidatesTags: (_r, _e, { matchId }) => [
        { type: "Match", id: matchId },
      ],
    }),

    // 5) set winner (A|B|"")
    refereeSetWinner: builder.mutation({
      query: ({ matchId, winner }) => ({
        url: `/api/referee/matches/${matchId}/winner`,
        method: "PATCH",
        body: { winner },
      }),
      invalidatesTags: (_r, _e, { matchId }) => [
        { type: "Match", id: matchId },
      ],
    }),

    refereeNextGame: builder.mutation({
      query: ({ matchId, autoNext }) => ({
        url: `/api/referee/matches/${matchId}/score`,
        method: "PATCH",
        body: { op: "nextGame", autoNext },
      }),
    }),
    // GET /api/referee/matches/:matchId/courts  (cùng tournament+bracket với match)
    getCourtsForMatch: builder.query({
      query: ({ matchId, includeBusy = false, cluster, status } = {}) => {
        if (!matchId) throw new Error("matchId is required");
        const params = new URLSearchParams();
        if (includeBusy) params.set("includeBusy", "1");
        if (cluster) params.set("cluster", cluster);
        if (status) params.set("status", status);
        const q = params.toString() ? `?${params.toString()}` : "";
        return `/api/referee/matches/${matchId}/courts${q}`;
      },
      transformResponse: normalizeListResponse,
      keepUnusedDataFor: 0,
    }),

    // POST /api/referee/matches/:matchId/assign-court
    refereeAssignCourt: builder.mutation({
      query: ({
        matchId,
        courtId,
        force = false,
        allowReassignLive = false,
      }) => ({
        url: `/api/referee/matches/${matchId}/assign-court`,
        method: "POST",
        body: { courtId, force, allowReassignLive },
      }),
      invalidatesTags: (_res, _err, { matchId }) => [
        { type: "Match", id: matchId },
        { type: "Court", id: "LIST" },
      ],
    }),

    // POST /api/referee/matches/:matchId/unassign-court
    refereeUnassignCourt: builder.mutation({
      query: ({ matchId, toStatus }) => ({
        url: `/api/referee/matches/${matchId}/unassign-court`,
        method: "POST",
        body: { toStatus },
      }),
      invalidatesTags: (_res, _err, { matchId }) => [
        { type: "Match", id: matchId },
        { type: "Court", id: "LIST" },
      ],
    }),

    getMatch: builder.query({
      query: (matchId) => `/api/admin/matches/${matchId}`,
      providesTags: (r, e, id) => [{ type: "Match", id }],
    }),
    adminSearchReferees: builder.query({
      query: ({ tid, q = "", limit = 50 } = {}) => {
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        if (limit) params.set("limit", String(limit));
        if (tid) params.set("tid", String(tid));
        return {
          url: `/api/admin/referees/search?${params.toString()}`,
          method: "GET",
        };
      },
      // Giữ cache ngắn để search mượt
      keepUnusedDataFor: 30,
      // Đảm bảo cache key phụ thuộc đúng tham số
      serializeQueryArgs: ({ endpointName, queryArgs }) => {
        const { tid = "", q = "", limit = 50 } = queryArgs || {};
        return `${endpointName}:${tid}:${q}:${limit}`;
      },
      // Response là mảng user → trả thẳng
      transformResponse: (res) => (Array.isArray(res) ? res : res?.data || []),
      providesTags: (result) =>
        result
          ? [
              { type: "RefereeSearch", id: "LIST" },
              ...result.map((u) => ({ type: "RefereeSearch", id: u._id })),
            ]
          : [{ type: "RefereeSearch", id: "LIST" }],
    }),
    adminAssignMatchToCourt: builder.mutation({
      /**
       * @param {{ tid: string, matchId: string, courtId: string }} args
       */
      async queryFn(args, _api, _extra, baseQuery) {
        const { tid, matchId, courtId } = args || {};
        if (!tid || !matchId || !courtId) {
          return {
            error: {
              status: 400,
              data: { message: "tid, matchId và courtId là bắt buộc" },
            },
          };
        }
        const result = await baseQuery({
          url: `/api/admin/tournaments/${tid}/matches/${matchId}/court`,
          method: "POST",
          body: { courtId },
        });
        if (result.error) return { error: result.error };
        return { data: result.data };
      },
      invalidatesTags: (result, error, { tid, matchId }) => {
        const tags = [];
        if (tid) tags.push({ type: "MatchesByTournament", id: tid });
        if (tid) tags.push({ type: "Courts", id: tid });
        if (matchId) tags.push({ type: "Match", id: matchId });
        return tags;
      },
    }),

    /* ================== BỎ GÁN SÂN CỦA TRẬN ================== */
    adminClearMatchCourt: builder.mutation({
      /**
       * @param {{ tid: string, matchId: string }} args
       */
      async queryFn(args, _api, _extra, baseQuery) {
        const { tid, matchId } = args || {};
        if (!tid || !matchId) {
          return {
            error: {
              status: 400,
              data: { message: "tid và matchId là bắt buộc" },
            },
          };
        }
        const result = await baseQuery({
          url: `/api/admin/tournaments/${tid}/matches/${matchId}/court`,
          method: "DELETE",
        });
        if (result.error) return { error: result.error };
        return { data: result.data };
      },
      invalidatesTags: (result, error, { tid, matchId }) => {
        const tags = [];
        if (tid) tags.push({ type: "MatchesByTournament", id: tid });
        if (tid) tags.push({ type: "Courts", id: tid });
        if (matchId) tags.push({ type: "Match", id: matchId });
        return tags;
      },
    }),
    adminGetMatchReferees: builder.query({
      /**
       * @param {{ tid: string, matchId: string }} args
       */
      query: ({ tid, matchId }) =>
        `/api/admin/tournaments/${tid}/matches/${matchId}/referees`,
      providesTags: (result, error, { matchId }) => [
        { type: "MatchReferees", id: matchId },
      ],
      // Optional: chuẩn hoá data
      transformResponse: (res) =>
        Array.isArray(res) ? res : res?.referees || [],
    }),
    verifyManager: builder.query({
      query: (tid) => `/api/tournaments/${tid}/is-manager`,
    }),
    refereeSetBreak: builder.mutation({
      query: ({ matchId, ...body }) => ({
        url: `/api/referee/matches/${matchId}/break`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (r, e, { matchId }) => [{ type: "Match", id: matchId }],
    }),
  }),
});

export const {
  // mới thêm
  useListTournamentsQuery,
  useSearchTournamentsQuery,
  useLazySearchTournamentsQuery,
  useUpdateOverlayMutation,

  // đã có
  useGetTournamentsQuery,
  useGetRegistrationsQuery,
  useCreateRegistrationMutation,
  useUpdatePaymentMutation,
  useCheckinMutation,
  useGetTournamentQuery,
  useLazyGetTournamentQuery, // ✅ export thêm lazy
  useGetMatchesQuery,
  useGetTournamentMatchesForCheckinQuery,
  useSearchUserMatchesQuery,
  useUserCheckinRegistrationMutation,
  useListTournamentBracketsQuery,
  useListTournamentMatchesQuery,
  useGetMatchPublicQuery,
  useCancelRegistrationMutation,
  useCreateRegInviteMutation,
  useListMyRegInvitesQuery,
  useRespondRegInviteMutation,
  useManagerSetRegPaymentStatusMutation,
  useManagerDeleteRegistrationMutation,
  useGetOverlaySnapshotQuery,
  useGetDrawStatusQuery,
  useInitDrawMutation,
  useRevealDrawMutation,
  useUndoDrawMutation,
  useCancelDrawMutation,
  useFinalizeKoMutation,
  useDrawCancelMutation,
  useDrawCommitMutation,
  useDrawNextMutation,
  useStartDrawMutation,
  useGetBracketQuery,
  useGenerateGroupMatchesMutation,
  useManagerReplaceRegPlayerMutation,
  useListPublicMatchesByTournamentQuery,
  useAdminGetBracketsQuery,
  useAdminListMatchesByTournamentQuery,
  useAdminSetMatchLiveUrlMutation,
  useListMyTournamentsQuery,
  useCreateComplaintMutation,
  useSearchRegistrationsQuery,
  useRefereeIncPointMutation,
  useRefereeSetGameScoreMutation,
  useRefereeSetStatusMutation,
  useRefereeSetWinnerMutation,
  useRefereeNextGameMutation,
  useGetCourtsForMatchQuery,
  useRefereeAssignCourtMutation,
  useRefereeUnassignCourtMutation,
  useGetMatchQuery,
  useAdminSearchRefereesQuery,
  useAdminAssignMatchToCourtMutation,
  useAdminClearMatchCourtMutation,
  useAdminGetMatchRefereesQuery,
  useVerifyManagerQuery,
  useRefereeSetBreakMutation,
} = tournamentsApiSlice;
