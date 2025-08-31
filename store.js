import { configureStore } from '@reduxjs/toolkit';
import authReducer, { authListenerMiddleware } from '@/slices/authSlice';
import { apiSlice } from '@/slices/apiSlice';
import rankingUiReducer from '@/slices/rankingUiSlice'; // nếu có

const store = configureStore({
  reducer: {
    auth: authReducer,
    [apiSlice.reducerPath]: apiSlice.reducer,
    rankingUi: rankingUiReducer,
  },
  middleware: (getDefault) =>
    getDefault()
      .prepend(authListenerMiddleware.middleware)
      .concat(apiSlice.middleware),
  devTools: true,
});

export default store;
export { store };
