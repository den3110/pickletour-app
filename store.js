import { configureStore } from "@reduxjs/toolkit";
import authReducer, { authListenerMiddleware } from "@/slices/authSlice";
import { apiSlice } from "@/slices/apiSlice";
import rankingUiReducer from "@/slices/rankingUiSlice"; // nếu có
import adminUiReducer from "@/slices/adminUiSlice"; // nếu có
import versionReducer from "@/slices/versionUiSlice"; // nếu có
import botContextReducer from "@/slices/botContextSlice";
import userMatchHeaderSlice from "@/slices/userMatchHeaderSlice"
const store = configureStore({
  reducer: {
    auth: authReducer,
    [apiSlice.reducerPath]: apiSlice.reducer,
    adminUi: adminUiReducer,
    rankingUi: rankingUiReducer,
    version: versionReducer,
    botContext: botContextReducer,
    userMatchHeader: userMatchHeaderSlice,
  },
  middleware: (getDefault) =>
    getDefault()
      .prepend(authListenerMiddleware.middleware)
      .concat(apiSlice.middleware),
  devTools: true,
});

export default store;
export { store };
