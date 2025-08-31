// src/slices/uploadApiSlice.js
import { apiSlice } from "./apiSlice";

function toFormData(payload, field) {
  const fd = new FormData();
  if (payload && payload.uri) {
    // React Native file object
    fd.append(field, {
      uri: payload.uri,
      name: payload.name || "upload.jpg",
      type: payload.type || "image/jpeg",
    });
  } else {
    // Web File/Blob (nếu chạy web)
    fd.append(field, payload);
  }
  return fd;
}

export const uploadApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // ---------- Upload Avatar ----------
    uploadAvatar: builder.mutation({
      query: (payload) => {
        // Cho phép:
        //  - payload là FormData (pass-through)
        //  - payload là RN file object { uri, name, type } → tự wrap FormData
        const body =
          typeof FormData !== "undefined" && payload instanceof FormData
            ? payload
            : toFormData(payload, "avatar"); // ⬅️ ĐỔI 'avatar' -> 'file' nếu server yêu cầu

        return {
          url: "/api/upload/avatar",
          method: "POST",
          body,
        };
      },
      invalidatesTags: ["User"],
      extraOptions: { skip404Redirect: true },
    }),

    // ---------- Upload CCCD ----------
    uploadCccd: builder.mutation({
      query: (payload) => {
        // payload có thể là FormData (front/back) hoặc object { front, back } là RN file object
        if (typeof FormData !== "undefined" && payload instanceof FormData) {
          return {
            url: "/api/upload/cccd",
            method: "POST",
            body: payload,
          };
        }

        const fd = new FormData();
        const front = payload?.front;
        const back = payload?.back;

        if (front) {
          if (front.uri) {
            fd.append("front", {
              uri: front.uri,
              name: front.name || "front.jpg",
              type: front.type || "image/jpeg",
            });
          } else {
            fd.append("front", front);
          }
        }

        if (back) {
          if (back.uri) {
            fd.append("back", {
              uri: back.uri,
              name: back.name || "back.jpg",
              type: back.type || "image/jpeg",
            });
          } else {
            fd.append("back", back);
          }
        }

        return {
          url: "/api/upload/cccd",
          method: "POST",
          body: fd,
        };
      },
      invalidatesTags: ["User"],
      extraOptions: { skip404Redirect: true },
    }),
  }),
});

export const { useUploadAvatarMutation, useUploadCccdMutation } =
  uploadApiSlice;
