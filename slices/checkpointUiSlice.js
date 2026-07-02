import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  forcedCheckpoint: null,
  nonce: 0,
};

const getMandateId = (payload = {}) =>
  String(
    payload?.mandate?.id ||
      payload?.mandate?._id ||
      payload?.mandateId ||
      "",
  );

const slice = createSlice({
  name: "checkpointUi",
  initialState,
  reducers: {
    forceCheckpoint: (state, { payload }) => {
      const checkpoint = payload?.checkpoint || null;
      const mandate = payload?.mandate || null;
      const mandateId = getMandateId(payload);

      state.forcedCheckpoint = {
        checkpoint,
        mandate,
        mandateId,
        required: payload?.required !== false,
        returnTo: payload?.returnTo || "/",
        source: payload?.source || "mobile",
        createdAt: payload?.createdAt || Date.now(),
      };
      state.nonce += 1;
    },
    clearForcedCheckpoint: (state) => {
      state.forcedCheckpoint = null;
      state.nonce += 1;
    },
  },
});

export const { forceCheckpoint, clearForcedCheckpoint } = slice.actions;
export default slice.reducer;
