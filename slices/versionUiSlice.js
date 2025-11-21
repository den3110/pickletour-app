// src/slices/versionUiSlice.js
import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  open: false,
  data: {}, // { storeUrl, latestVersion, minSupportedBuild, changelog, message }
};

const versionSlice = createSlice({
  name: "version",
  initialState,
  reducers: {
    forceOpen: (state, action) => {
      state.open = true;
      state.data = action.payload || {};
    },
    forceClose: (state) => {
      state.open = false;
    },
  },
});

export const { forceOpen, forceClose } = versionSlice.actions;
export default versionSlice.reducer;
