import { createSlice, createListenerMiddleware } from "@reduxjs/toolkit";
import { saveUserInfo, clearUserInfo } from "@/utils/authStorage";
import { apiSlice } from "./apiSlice";


const initialState = { userInfo: null };

const slice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials: (state, { payload }) => {
      state.userInfo = payload; // giữ logic cũ
    },
    logout: (state) => {
      state.userInfo = null;
    },
  },
});

export const { setCredentials, logout } = slice.actions;
export default slice.reducer;
export const authReducer = slice.reducer;

/* Listener: lưu/xoá userInfo + reset API cache khi logout */
export const authListenerMiddleware = createListenerMiddleware();

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

authListenerMiddleware.startListening({
  actionCreator: logout,
  effect: async (_action, api) => {
    try {
      await clearUserInfo();
      api.dispatch(apiSlice.util.resetApiState());
    } catch (e) {
      console.log("logout clear error", e);
    }
  },
});
