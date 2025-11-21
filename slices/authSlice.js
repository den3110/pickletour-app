// slices/authSlice.js
import { createSlice, createListenerMiddleware } from "@reduxjs/toolkit";
import { saveUserInfo, clearUserInfo } from "@/utils/authStorage";
import { apiSlice } from "./apiSlice";

/**
 * Lộ trình A:
 * - isGuest: true => duyệt/browse tự do không cần đăng nhập
 * - Khi đăng nhập thành công -> setCredentials: isGuest = false
 * - continueAsGuest: quay về trạng thái khách, xoá cache API, xoá userInfo lưu trữ
 * - logout: giống continueAsGuest nhưng dùng khi đã đăng nhập trước đó
 */

const initialState = {
  userInfo: null, // object user hoặc null
  isGuest: true, // mặc định là khách để vào app duyệt ngay
};

const slice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials: (state, { payload }) => {
      // payload có thể là { user, token } hoặc object user tuỳ hệ thống hiện tại
      state.userInfo = payload;
      state.isGuest = false;
    },
    logout: (state) => {
      state.userInfo = null;
      state.isGuest = true;
    },
    continueAsGuest: (state) => {
      // cho phép vào app ở chế độ khách (duyệt không cần tài khoản)
      state.userInfo = null;
      state.isGuest = true;
    },
  },
});

export const { setCredentials, logout, continueAsGuest } = slice.actions;
export default slice.reducer;
export const authReducer = slice.reducer;

/* ================= Listener: persist / clear & reset API cache ================= */

export const authListenerMiddleware = createListenerMiddleware();

// Lưu userInfo khi đăng nhập (không lưu khi ở guest)
authListenerMiddleware.startListening({
  actionCreator: setCredentials,
  effect: async (action) => {
    try {
      await saveUserInfo(action.payload);
    } catch (e) {
      console.log("save userInfo error", e);
    }
  },
});

// Khi logout hoặc chuyển về guest: xoá storage + reset API cache
const handleClearOnExit = async (_action, api) => {
  try {
    await clearUserInfo();
    api.dispatch(apiSlice.util.resetApiState());
  } catch (e) {
    console.log("auth clear error", e);
  }
};

authListenerMiddleware.startListening({
  actionCreator: logout,
  effect: handleClearOnExit,
});

authListenerMiddleware.startListening({
  actionCreator: continueAsGuest,
  effect: handleClearOnExit,
});

/* ================= Optional selectors ================= */
export const selectAuth = (state) => state.auth;
export const selectIsGuest = (state) => state.auth.isGuest;
export const selectUserInfo = (state) => state.auth.userInfo;
