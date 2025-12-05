// src/hooks/useUserMatchHeader.js
import { useEffect } from "react";
import { useDispatch } from "react-redux";
import {
  setUserMatchHeader,
  clearUserMatchHeader,
} from "../slices/userMatchHeaderSlice";

export function useUserMatchHeader(kind) {
  const dispatch = useDispatch();

  useEffect(() => {
    // kind: 'user' | 'normal' | null
    dispatch(setUserMatchHeader({ kind: kind || null }));

    return () => {
      // có thể bỏ clear nếu bạn muốn giữ, nhưng cho an toàn mình clear
      dispatch(clearUserMatchHeader());
    };
  }, [dispatch, kind]);
}
