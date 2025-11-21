// slices/newsApiSlice.js
import { apiSlice } from "./apiSlice";

export const newsApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getNews: builder.query({
      query: () => "/api/news",
      keepUnusedDataFor: 5,
    }),
    // GET /api/news/:slug
    getNewsDetail: builder.query({
      query: (slug) => `/api/news/${slug}`,
      keepUnusedDataFor: 300,
    }),
  }),
});

export const { useGetNewsQuery, useGetNewsDetailQuery } = newsApiSlice;
