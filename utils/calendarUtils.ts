// utils/calendarUtils.ts
import * as Calendar from "expo-calendar";
import { Platform, Alert, Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ===== CONSTANTS =====
const CALENDAR_NAME = "Trận đấu Pickletour";
const CALENDAR_COLOR = "#3B82F6";
const STORAGE_KEY = "pickleballCalendarId";
// ✨ THÊM HẰNG SỐ NÀY NGAY DƯỚI
const APPLE_EPOCH_MS = new Date("2001-01-01T00:00:00Z").getTime();
// ===== TYPES =====
export interface Match {
  _id: string;
  scheduledAt: Date | string;
  tournament: {
    name: string;
    location?: string;
  };
  bracket: {
    name: string;
  };
  courtLabel?: string;
  myTeam?: any;
  opponentTeam?: any;
}

export interface CalendarEventDetails {
  title: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  notes?: string;
  alarms?: Array<{ relativeOffset: number }>; // minutes before event
}

function dateToCalshowSeconds(date: Date) {
  return Math.floor((date.getTime() - APPLE_EPOCH_MS) / 1000);
}

// ===== PERMISSION =====
export async function requestCalendarPermissions(): Promise<boolean> {
  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync();

    if (status !== "granted") {
      Alert.alert(
        "Cần quyền truy cập lịch",
        "Vui lòng cấp quyền truy cập lịch để thêm trận đấu vào lịch của bạn.",
        [
          { text: "Hủy", style: "cancel" },
          { text: "Mở Cài đặt", onPress: () => Linking.openSettings() },
        ]
      );
      return false;
    }

    console.log("✅ Calendar permission granted");
    return true;
  } catch (error) {
    console.error("❌ Request calendar permission error:", error);
    return false;
  }
}

export async function checkCalendarPermissions(): Promise<boolean> {
  try {
    const { status } = await Calendar.getCalendarPermissionsAsync();
    return status === "granted";
  } catch (error) {
    console.error("Check calendar permission error:", error);
    return false;
  }
}

// ===== GET OR CREATE CALENDAR =====
async function getOrCreatePickleballCalendar(): Promise<string | null> {
  try {
    // Check if we have saved calendar ID
    const savedId = await AsyncStorage.getItem(STORAGE_KEY);
    if (savedId) {
      // Verify calendar still exists
      try {
        const calendar = await Calendar.getCalendarAsync(savedId);
        if (calendar) {
          console.log("✅ Using existing calendar:", savedId);
          return savedId;
        }
      } catch (e) {
        // Calendar doesn't exist anymore, remove from storage
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
    }

    // Get all calendars
    const calendars = await Calendar.getCalendarsAsync(
      Calendar.EntityTypes.EVENT
    );
    console.log("📅 Available calendars:", calendars.length);

    // Try to find our calendar by name
    const existingCalendar = calendars.find(
      (cal) => cal.title === CALENDAR_NAME && cal.allowsModifications
    );

    if (existingCalendar) {
      console.log("✅ Found existing calendar:", existingCalendar.id);
      await AsyncStorage.setItem(STORAGE_KEY, existingCalendar.id);
      return existingCalendar.id;
    }

    // Create new calendar
    console.log("🆕 Creating new calendar...");

    // Find default source
    const defaultCalendar = calendars.find(
      (cal) => cal.allowsModifications && cal.source?.name !== "Birthdays"
    );

    if (!defaultCalendar) {
      console.error("❌ No writable calendar found");
      return null;
    }

    const newCalendarId = await Calendar.createCalendarAsync({
      title: CALENDAR_NAME,
      color: CALENDAR_COLOR,
      entityType: Calendar.EntityTypes.EVENT,
      sourceId: defaultCalendar.source.id,
      source: defaultCalendar.source,
      name: CALENDAR_NAME,
      ownerAccount: defaultCalendar.source.name || "local",
      accessLevel: Calendar.CalendarAccessLevel.OWNER,
    });

    console.log("✅ Created new calendar:", newCalendarId);
    await AsyncStorage.setItem(STORAGE_KEY, newCalendarId);
    return newCalendarId;
  } catch (error) {
    console.error("❌ Get or create calendar error:", error);

    // Fallback: use default calendar
    try {
      const calendars = await Calendar.getCalendarsAsync(
        Calendar.EntityTypes.EVENT
      );
      const defaultCal = calendars.find((cal) => cal.allowsModifications);
      if (defaultCal) {
        console.log("⚠️ Using default calendar as fallback:", defaultCal.id);
        return defaultCal.id;
      }
    } catch (e) {
      console.error("Fallback also failed:", e);
    }

    return null;
  }
}

// ===== ADD MATCH TO CALENDAR =====
export async function addMatchToCalendar(match: Match): Promise<string | null> {
  try {
    // Check permission
    const hasPermission = await requestCalendarPermissions();
    if (!hasPermission) return null;

    // Get calendar
    const calendarId = await getOrCreatePickleballCalendar();
    if (!calendarId) {
      Alert.alert("Lỗi", "Không thể tạo hoặc truy cập lịch");
      return null;
    }

    // Prepare event details
    const startDate = new Date(match.scheduledAt);
    const endDate = new Date(startDate.getTime() + 90 * 60 * 1000); // +90 minutes

    const teamName = getTeamName(match.myTeam);
    const opponentName = getTeamName(match.opponentTeam);

    const title = `🏓 ${match.tournament.name}`;

    const notes = [
      `Giải: ${match.bracket.name}`,
      ``,
      `🎾 ${teamName}`,
      `VS`,
      `🎾 ${opponentName}`,
      match.courtLabel ? `\nSân: ${match.courtLabel}` : "",
      match.tournament.location
        ? `\nĐịa điểm: ${match.tournament.location}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    // Create event with alarms
    const eventId = await Calendar.createEventAsync(calendarId, {
      title,
      startDate,
      endDate,
      location: match.tournament.location || match.courtLabel || "",
      notes,
      timeZone: "Asia/Ho_Chi_Minh",
      alarms: [
        { relativeOffset: -24 * 60 }, // 24 hours before
        { relativeOffset: -60 }, // 1 hour before
        { relativeOffset: -30 }, // 30 minutes before
        { relativeOffset: -15 }, // 15 minutes before
      ],
    });

    console.log("✅ Added event to calendar:", eventId);

    // Save mapping
    await saveMatchEventMapping(match._id, eventId);

    return eventId;
  } catch (error) {
    console.error("❌ Add match to calendar error:", error);
    Alert.alert("Lỗi", "Không thể thêm trận đấu vào lịch");
    return null;
  }
}

// ===== ADD MULTIPLE MATCHES =====
export async function addMultipleMatchesToCalendar(
  matches: Match[]
): Promise<{ success: number; failed: number }> {
  try {
    const hasPermission = await requestCalendarPermissions();
    if (!hasPermission) return { success: 0, failed: matches.length };

    let success = 0;
    let failed = 0;

    for (const match of matches) {
      const eventId = await addMatchToCalendar(match);
      if (eventId) {
        success++;
      } else {
        failed++;
      }
    }

    return { success, failed };
  } catch (error) {
    console.error("Add multiple matches error:", error);
    return { success: 0, failed: matches.length };
  }
}

// ===== REMOVE MATCH FROM CALENDAR =====
export async function removeMatchFromCalendar(
  matchId: string
): Promise<boolean> {
  try {
    const hasPermission = await checkCalendarPermissions();
    if (!hasPermission) return false;

    const eventId = await getMatchEventId(matchId);
    if (!eventId) {
      console.log("⚠️ No calendar event found for match:", matchId);
      return false;
    }

    await Calendar.deleteEventAsync(eventId);
    console.log("✅ Removed event from calendar:", eventId);

    // Remove mapping
    await removeMatchEventMapping(matchId);

    return true;
  } catch (error) {
    console.error("❌ Remove match from calendar error:", error);
    return false;
  }
}

// ===== UPDATE MATCH IN CALENDAR =====
export async function updateMatchInCalendar(match: Match): Promise<boolean> {
  try {
    const hasPermission = await checkCalendarPermissions();
    if (!hasPermission) return false;

    const eventId = await getMatchEventId(match._id);
    if (!eventId) {
      // Event doesn't exist, create it
      const newEventId = await addMatchToCalendar(match);
      return !!newEventId;
    }

    // Update existing event
    const startDate = new Date(match.scheduledAt);
    const endDate = new Date(startDate.getTime() + 90 * 60 * 1000);

    const teamName = getTeamName(match.myTeam);
    const opponentName = getTeamName(match.opponentTeam);

    const title = `🏓 ${match.tournament.name}`;

    const notes = [
      `Giải: ${match.bracket.name}`,
      ``,
      `🎾 ${teamName}`,
      `VS`,
      `🎾 ${opponentName}`,
      match.courtLabel ? `\nSân: ${match.courtLabel}` : "",
      match.tournament.location
        ? `\nĐịa điểm: ${match.tournament.location}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    await Calendar.updateEventAsync(eventId, {
      title,
      startDate,
      endDate,
      location: match.tournament.location || match.courtLabel || "",
      notes,
      timeZone: "Asia/Ho_Chi_Minh",
    });

    console.log("✅ Updated event in calendar:", eventId);
    return true;
  } catch (error) {
    console.error("❌ Update match in calendar error:", error);
    return false;
  }
}

// ===== CHECK IF MATCH IN CALENDAR =====
export async function isMatchInCalendar(matchId: string): Promise<boolean> {
  try {
    const eventId = await getMatchEventId(matchId);
    if (!eventId) return false;

    // Verify event still exists
    try {
      const event = await Calendar.getEventAsync(eventId);
      return !!event;
    } catch (e) {
      // Event doesn't exist anymore
      await removeMatchEventMapping(matchId);
      return false;
    }
  } catch (error) {
    console.error("Check match in calendar error:", error);
    return false;
  }
}

// ===== OPEN CALENDAR APP =====
export async function openCalendarApp(matchId?: string): Promise<void> {
  try {
    let targetDate: Date | null = null;

    // Nếu có matchId -> cố gắng lấy event và dùng startDate của event
    if (matchId) {
      const eventId = await getMatchEventId(matchId);
      if (eventId) {
        try {
          const event = await Calendar.getEventAsync(eventId);
          if (event?.startDate) {
            targetDate = new Date(event.startDate as any);
          }
        } catch (e) {
          console.warn("⚠️ Cannot get event by id, fallback to today:", e);
        }
      }
    }

    // Nếu không lấy được gì, dùng ngày hôm nay
    if (!targetDate) {
      targetDate = new Date();
    }

    if (Platform.OS === "ios") {
      // iOS: calshow:<secondsSince2001>
      const seconds = dateToCalshowSeconds(targetDate);
      const url = `calshow:${seconds}`;

      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        return;
      }

      // Fallback: chỉ mở app Calendar
      await Linking.openURL("calshow:");
    } else {
      // Android: content://com.android.calendar/time/<millisSince1970>
      const millis = targetDate.getTime();
      const url = `content://com.android.calendar/time/${millis}`;
      await Linking.openURL(url);
    }
  } catch (error) {
    console.error("Open calendar app error:", error);
    Alert.alert("Không thể mở ứng dụng lịch");
  }
}

// ===== GET CALENDAR EVENTS FOR DATE RANGE =====
export async function getCalendarEventsForMatches(
  startDate: Date,
  endDate: Date
): Promise<Calendar.Event[]> {
  try {
    const hasPermission = await checkCalendarPermissions();
    if (!hasPermission) return [];

    const calendarId = await getOrCreatePickleballCalendar();
    if (!calendarId) return [];

    const events = await Calendar.getEventsAsync(
      [calendarId],
      startDate,
      endDate
    );

    return events;
  } catch (error) {
    console.error("Get calendar events error:", error);
    return [];
  }
}

// ===== SYNC ALL MATCHES =====
export async function syncAllMatchesToCalendar(
  matches: Match[]
): Promise<void> {
  try {
    const hasPermission = await requestCalendarPermissions();
    if (!hasPermission) return;

    console.log("🔄 Syncing matches to calendar...");

    let added = 0;
    let skipped = 0;

    for (const match of matches) {
      const inCalendar = await isMatchInCalendar(match._id);

      if (inCalendar) {
        skipped++;
      } else {
        const eventId = await addMatchToCalendar(match);
        if (eventId) added++;
      }
    }

    console.log(`✅ Sync complete: ${added} added, ${skipped} skipped`);

    Alert.alert(
      "Đồng bộ hoàn tất",
      `Đã thêm ${added} trận vào lịch${
        skipped > 0 ? `, ${skipped} trận đã có sẵn` : ""
      }`,
      [{ text: "OK" }]
    );
  } catch (error) {
    console.error("Sync matches error:", error);
    Alert.alert("Lỗi", "Không thể đồng bộ lịch");
  }
}

// ===== CLEAR ALL EVENTS =====
export async function clearAllPickleballEvents(): Promise<boolean> {
  try {
    const hasPermission = await checkCalendarPermissions();
    if (!hasPermission) return false;

    const calendarId = await getOrCreatePickleballCalendar();
    if (!calendarId) return false;

    // Get all events in the next 2 years
    const startDate = new Date();
    const endDate = new Date();
    endDate.setFullYear(endDate.getFullYear() + 2);

    const events = await Calendar.getEventsAsync(
      [calendarId],
      startDate,
      endDate
    );

    for (const event of events) {
      await Calendar.deleteEventAsync(event.id);
    }

    // Clear mappings
    await AsyncStorage.removeItem("matchEventMappings");

    console.log(`✅ Cleared ${events.length} events from calendar`);
    return true;
  } catch (error) {
    console.error("Clear events error:", error);
    return false;
  }
}

// ===== STORAGE HELPERS =====
async function saveMatchEventMapping(
  matchId: string,
  eventId: string
): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem("matchEventMappings");
    const mappings = stored ? JSON.parse(stored) : {};
    mappings[matchId] = eventId;
    await AsyncStorage.setItem("matchEventMappings", JSON.stringify(mappings));
  } catch (error) {
    console.error("Save mapping error:", error);
  }
}

async function getMatchEventId(matchId: string): Promise<string | null> {
  try {
    const stored = await AsyncStorage.getItem("matchEventMappings");
    if (!stored) return null;
    const mappings = JSON.parse(stored);
    return mappings[matchId] || null;
  } catch (error) {
    console.error("Get mapping error:", error);
    return null;
  }
}

async function removeMatchEventMapping(matchId: string): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem("matchEventMappings");
    if (!stored) return;
    const mappings = JSON.parse(stored);
    delete mappings[matchId];
    await AsyncStorage.setItem("matchEventMappings", JSON.stringify(mappings));
  } catch (error) {
    console.error("Remove mapping error:", error);
  }
}

// ===== HELPER =====
function getTeamName(team: any): string {
  if (!team) return "TBA";
  if (team.teamName) return team.teamName;

  const p1 = team.player1?.nickname || team.player1?.name || "";
  const p2 = team.player2?.nickname || team.player2?.name || "";

  if (p1 && p2) return `${p1} / ${p2}`;
  return p1 || p2 || "TBA";
}
