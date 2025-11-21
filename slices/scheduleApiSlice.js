// store/slices/scheduleApiSlice.js
import { apiSlice } from "./apiSlice";

export const scheduleApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Get full schedule
    getMySchedule: builder.query({
      query: ({ startDate, endDate, timezone, status, tournamentId } = {}) => ({
        url: "/api/schedule/my-matches",
        params: { startDate, endDate, timezone, status, tournamentId },
      }),
      transformResponse: (response) => response.data,
      providesTags: ["Schedule"],
    }),

    // Get matches by specific date
    getMatchesByDate: builder.query({
      query: ({ date, timezone } = {}) => ({
        url: `/api/schedule/date/${date}`,
        params: { timezone },
      }),
      transformResponse: (response) => response.data,
      providesTags: (result, error, { date }) => [
        { type: "Schedule", id: date },
      ],
    }),

    // Get upcoming matches
    getUpcomingMatches: builder.query({
      query: ({ days = 7, timezone } = {}) => ({
        url: "/api/schedule/upcoming",
        params: { days, timezone },
      }),
      transformResponse: (response) => response.data,
      providesTags: ["UpcomingMatches"],
    }),

    // Get marked dates for calendar
    getMarkedDates: builder.query({
      query: ({ month, timezone } = {}) => ({
        url: "/api/schedule/marked-dates",
        params: { month, timezone },
      }),
      transformResponse: (response) => response.data,
      providesTags: ["MarkedDates"],
    }),
  }),
});

export const {
  useGetMyScheduleQuery,
  useGetMatchesByDateQuery,
  useGetUpcomingMatchesQuery,
  useGetMarkedDatesQuery,
  useLazyGetMyScheduleQuery,
  useLazyGetMatchesByDateQuery,
} = scheduleApiSlice;
