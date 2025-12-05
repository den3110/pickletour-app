// src/slices/userMatchHeaderSlice.js
import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  kind: null, // 'user' | 'normal' | ... tuỳ bạn
};

const userMatchHeaderSlice = createSlice({
  name: "userMatchHeader",
  initialState,
  reducers: {
    setUserMatchHeader(state, action) {
      const { kind } = action.payload || {};
      if (kind !== undefined) {
        state.kind = kind || null;
      }
    },
    clearUserMatchHeader() {
      return initialState;
    },
  },
});

export const { setUserMatchHeader, clearUserMatchHeader } =
  userMatchHeaderSlice.actions;

export default userMatchHeaderSlice.reducer;
