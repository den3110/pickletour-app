// src/hooks/useRatingPrompt.js
import React, { useState, useCallback } from "react";
import AskForReviewGateModal from "@/components/AskForReviewGateModal";
import {
  canAskForRating,
  markRatingPromptShown,
} from "@/services/ratingService";

// Hook này trả về:
// - triggerMaybeAsk: dùng sau "moment vui", nó tự check điều kiện rồi show nếu ok
// - openTest: bỏ qua điều kiện, show luôn (dùng cho test)
// - RatingPrompt: component modal để bạn render trong JSX
export function useRatingPrompt(options = {}) {
  const { onNeedFeedback } = options;
  const [visible, setVisible] = useState(false);

  const triggerMaybeAsk = useCallback(async () => {
    const ok = await canAskForRating();
    if (!ok) return;

    setVisible(true);
    await markRatingPromptShown();
  }, []);

  const openTest = useCallback(() => {
    // test mode: cho hiện luôn
    setVisible(true);
  }, []);

  const RatingPrompt = (
    <AskForReviewGateModal
      visible={visible}
      onClose={() => setVisible(false)}
      onNeedFeedback={onNeedFeedback}
    />
  );

  return { triggerMaybeAsk, openTest, RatingPrompt };
}
