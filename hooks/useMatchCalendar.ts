// hooks/useMatchCalendar.ts
import { useState, useEffect, useCallback } from "react";
import { Alert } from "react-native";
import {
  addMatchToCalendar,
  removeMatchFromCalendar,
  updateMatchInCalendar,
  isMatchInCalendar,
  checkCalendarPermissions,
  requestCalendarPermissions, // ✅ THÊM CÁI NÀY
  addMultipleMatchesToCalendar,
  syncAllMatchesToCalendar,
  openCalendarApp,
  type Match,
} from "@/utils/calendarUtils";

export function useMatchCalendar() {
  const [hasPermission, setHasPermission] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Check permission on mount
  useEffect(() => {
    checkPermission();
  }, []);

  // ✅ CHỈNH LẠI: Chỉ check, không request
  const checkPermission = async () => {
    const granted = await checkCalendarPermissions();
    setHasPermission(granted);
    return granted;
  };

  // ✅ THÊM MỚI: Request permission thực sự
  const requestPermission = async () => {
    const granted = await requestCalendarPermissions();
    setHasPermission(granted);
    return granted;
  };

  // Add single match
  const addToCalendar = useCallback(async (match: Match): Promise<boolean> => {
    setIsLoading(true);
    try {
      const eventId = await addMatchToCalendar(match);

      if (eventId) {
        Alert.alert(
          "Thêm vào lịch thành công! 📅",
          "Trận đấu đã được thêm vào lịch của bạn. Hệ thống sẽ tự động nhắc nhở trước:\n\n" +
            "• 24 giờ\n" +
            "• 1 giờ\n" +
            "• 30 phút\n" +
            "• 15 phút",
          [
            { text: "OK" },
            { text: "Xem lịch", onPress: () => openCalendarApp(match._id) },
          ]
        );
        return true;
      }
      return false;
    } catch (error) {
      console.error("Add to calendar error:", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Remove from calendar
  const removeFromCalendar = useCallback(
    async (matchId: string): Promise<boolean> => {
      setIsLoading(true);
      try {
        const success = await removeMatchFromCalendar(matchId);

        if (success) {
          Alert.alert("Đã xóa", "Trận đấu đã được xóa khỏi lịch");
        }

        return success;
      } catch (error) {
        console.error("Remove from calendar error:", error);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Update in calendar
  const updateInCalendar = useCallback(
    async (match: Match): Promise<boolean> => {
      setIsLoading(true);
      try {
        return await updateMatchInCalendar(match);
      } catch (error) {
        console.error("Update in calendar error:", error);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Check if in calendar
  const checkInCalendar = useCallback(
    async (matchId: string): Promise<boolean> => {
      try {
        return await isMatchInCalendar(matchId);
      } catch (error) {
        console.error("Check in calendar error:", error);
        return false;
      }
    },
    []
  );

  // Add multiple matches
  const addMultipleToCalendar = useCallback(
    async (matches: Match[]): Promise<void> => {
      setIsLoading(true);
      try {
        const { success, failed } = await addMultipleMatchesToCalendar(matches);

        Alert.alert(
          "Hoàn tất",
          `Đã thêm ${success} trận vào lịch${
            failed > 0 ? `, ${failed} trận thất bại` : ""
          }`,
          [
            { text: "OK" },
            { text: "Xem lịch", onPress: () => openCalendarApp() },
          ]
        );
      } catch (error) {
        console.error("Add multiple error:", error);
        Alert.alert("Lỗi", "Không thể thêm trận đấu vào lịch");
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Sync all matches
  const syncToCalendar = useCallback(
    async (matches: Match[]): Promise<void> => {
      setIsLoading(true);
      try {
        await syncAllMatchesToCalendar(matches);
      } catch (error) {
        console.error("Sync error:", error);
        Alert.alert("Lỗi", "Không thể đồng bộ lịch");
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Prompt user to add
  const promptAddToCalendar = useCallback(
    (match: Match) => {
      Alert.alert(
        "Thêm vào lịch",
        "Bạn có muốn thêm trận đấu này vào lịch?\n\nHệ thống sẽ tự động nhắc nhở bạn trước trận đấu.",
        [
          { text: "Hủy", style: "cancel" },
          {
            text: "Thêm vào lịch",
            onPress: () => addToCalendar(match),
          },
        ]
      );
    },
    [addToCalendar]
  );

  // Prompt user to remove
  const promptRemoveFromCalendar = useCallback(
    (matchId: string) => {
      Alert.alert(
        "Xóa khỏi lịch",
        "Bạn có chắc muốn xóa trận đấu này khỏi lịch?",
        [
          { text: "Không", style: "cancel" },
          {
            text: "Xóa",
            style: "destructive",
            onPress: () => removeFromCalendar(matchId),
          },
        ]
      );
    },
    [removeFromCalendar]
  );

  return {
    hasPermission,
    isLoading,
    addToCalendar,
    removeFromCalendar,
    updateInCalendar,
    checkInCalendar,
    addMultipleToCalendar,
    syncToCalendar,
    promptAddToCalendar,
    promptRemoveFromCalendar,
    openCalendarApp,
    checkPermission,
    requestPermission, // ✅ EXPORT HÀM MỚI
  };
}
