// app/(app)/ChatAssistant.jsx
import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Dimensions,
  StyleSheet,
  Modal,
  Pressable,
  Alert,
  Keyboard,
  PanResponder,
  Image,
  useColorScheme, // 🔹 Import thêm hook này
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  useSendChatMessageMutation,
  useGetChatHistoryQuery,
  useClearChatHistoryMutation,
  useSendChatFeedbackMutation,
} from "@/slices/chatApiSlice";

const { width } = Dimensions.get("window");
const BUBBLE_MAX_WIDTH = width - 120;

// 🔹 ICON BOT MỚI
const CHATBOT_ICON = require("@/assets/images/icon-chatbot.png");

// 🔹 AsyncStorage keys
const SESSION_LIMIT_INFO_KEY = "pikora_chat_session_limit_info";
const SESSION_LIMIT_BANNER_DISMISSED_KEY =
  "pikora_chat_session_limit_banner_dismissed";

// 🔹 CẤU HÌNH MÀU SẮC CHO THEME
const THEME_COLORS = {
  light: {
    background: "#ffffff",
    text: "#1a1a1a",
    subText: "#666666",
    botBubbleBg: "#ffffff",
    inputBg: "#f7f8fc",
    inputBorder: "#e8eaf0",
    divider: "#f0f0f0",
    menuBg: "#ffffff",
    shadow: "#000",
    placeholder: "#a0a0a0",
    quickReplyBg: ["#f7f8fc", "#eef1f8"],
    messageAreaGradient: ["#f8f9fd", "#ffffff"],
  },
  dark: {
    background: "#121212",
    text: "#ffffff",
    subText: "#aaaaaa",
    botBubbleBg: "#1e1e1e",
    inputBg: "#2c2c2c",
    inputBorder: "#444444",
    divider: "#333333",
    menuBg: "#1e1e1e",
    shadow: "#000",
    placeholder: "#666666",
    quickReplyBg: ["#1e1e1e", "#2a2a2a"],
    messageAreaGradient: ["#121212", "#121212"], // Dark mode để nền phẳng hoặc gradient tối nhẹ
  },
};

// ==================== SUB COMPONENTS ====================

// Typing Indicator Animation
const TypingIndicator = () => {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = (dot, delay) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: -8,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ])
      ).start();
    };

    animate(dot1, 0);
    animate(dot2, 150);
    animate(dot3, 300);
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.typingContainer}>
      <LinearGradient
        colors={["#667eea", "#764ba2"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.typingBubble}
      >
        <View style={styles.typingDots}>
          <Animated.View
            style={[styles.typingDot, { transform: [{ translateY: dot1 }] }]}
          />
          <Animated.View
            style={[styles.typingDot, { transform: [{ translateY: dot2 }] }]}
          />
          <Animated.View
            style={[styles.typingDot, { transform: [{ translateY: dot3 }] }]}
          />
        </View>
      </LinearGradient>
    </View>
  );
};

// Map screen -> label/icon (dùng cho nút điều hướng)
const SCREEN_META = {
  TournamentList: {
    label: "Mở danh sách giải đấu",
    icon: "trophy-outline",
  },
  TournamentDetail: {
    label: "Mở chi tiết giải đấu",
    icon: "information-circle-outline",
  },
  Registration: {
    label: "Mở màn hình đăng ký",
    icon: "clipboard-outline",
  },
  MyRegistrations: {
    label: "Đơn đăng ký của tôi",
    icon: "document-text-outline",
  },
  Bracket: {
    label: "Mở sơ đồ nhánh đấu",
    icon: "git-branch-outline",
  },
  Schedule: {
    label: "Mở lịch thi đấu",
    icon: "calendar-outline",
  },
  MatchDetail: {
    label: "Mở chi tiết trận đấu",
    icon: "tennisball-outline",
  },
  LiveScore: {
    label: "Mở tỉ số trực tiếp",
    icon: "pulse-outline",
  },
  CourtList: {
    label: "Mở danh sách sân",
    icon: "map-outline",
  },
  Profile: {
    label: "Mở trang cá nhân",
    icon: "person-circle-outline",
  },
  Settings: {
    label: "Mở cài đặt",
    icon: "settings-outline",
  },
  MyRatings: {
    label: "Xem điểm rating",
    icon: "stats-chart-outline",
  },
  LiveStream: {
    label: "Mở livestream",
    icon: "videocam-outline",
  },
  SearchPlayer: {
    label: "Tìm kiếm VĐV",
    icon: "search-outline",
  },
  Leaderboard: {
    label: "Xem bảng xếp hạng",
    icon: "podium-outline",
  },
  Notifications: {
    label: "Xem thông báo",
    icon: "notifications-outline",
  },
  Home: {
    label: "Về trang chủ",
    icon: "home-outline",
  },
};

// Message Bubble Component
const MessageBubble = ({
  message,
  isUser,
  timestamp,
  meta,
  navigation,
  onPressNavigation,
  theme, // 🔹 Nhận theme prop
}) => {
  const slideAnim = useRef(new Animated.Value(50)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [slideAnim, fadeAnim]);

  const navData =
    navigation && navigation.action === "navigate" ? navigation : null;

  let navLabel = "Mở màn hình này";
  let navIcon = "arrow-forward-circle-outline";

  if (navData?.screen && SCREEN_META[navData.screen]) {
    navLabel = SCREEN_META[navData.screen].label;
    navIcon = SCREEN_META[navData.screen].icon;
  }

  const hasMissingContext =
    navData &&
    Array.isArray(navData.missingContext) &&
    navData.missingContext.length > 0;

  return (
    <Animated.View
      style={[
        styles.messageRow,
        isUser ? styles.userMessageRow : styles.botMessageRow,
        {
          opacity: fadeAnim,
          transform: [{ translateX: slideAnim }],
        },
      ]}
    >
      {!isUser && (
        <LinearGradient
          colors={["#667eea", "#764ba2"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatarGradient}
        >
          <View style={[styles.avatarInner, { backgroundColor: theme.background }]}>
            <Image
              source={CHATBOT_ICON}
              style={styles.avatarImage}
              resizeMode="contain"
            />
          </View>
        </LinearGradient>
      )}

      <View style={styles.messageBubbleContainer}>
        {isUser ? (
          <LinearGradient
            colors={["#667eea", "#764ba2"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.userBubble}
          >
            <Text style={styles.userMessageText}>{message}</Text>
          </LinearGradient>
        ) : (
          <View style={[styles.botBubble, { backgroundColor: theme.botBubbleBg }]}>
            <Text style={[styles.botMessageText, { color: theme.text }]}>
              {message}
            </Text>

            {meta?.source && (
              <Text style={styles.metaText}>
                {meta.type === "navigation" ? "Navigation" : "Bot"} •{" "}
                {meta.source}
              </Text>
            )}

            {navData && (
              <View style={styles.navContainer}>
                <TouchableOpacity
                  style={[
                    styles.navButton,
                    hasMissingContext && { opacity: 0.7 },
                  ]}
                  onPress={() => {
                    if (!onPressNavigation) return;
                    onPressNavigation(navData);
                  }}
                >
                  <Ionicons name={navIcon} size={16} color="#2563EB" />
                  <Text style={styles.navButtonText}>
                    {hasMissingContext
                      ? "Thiếu thông tin, bấm để xem chi tiết"
                      : navLabel}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
        <Text style={[styles.timestamp, isUser && styles.userTimestamp]}>
          {timestamp}
        </Text>
      </View>

      {isUser && (
        <View style={styles.userAvatar}>
          <Ionicons name="person" size={20} color="#667eea" />
        </View>
      )}
    </Animated.View>
  );
};

// Quick Reply Button
const QuickReplyButton = ({ icon, text, onPress, theme }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 3,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        <LinearGradient
          colors={theme.quickReplyBg}
          style={[styles.quickReplyButton, { borderColor: theme.inputBorder }]}
        >
          <Ionicons name={icon} size={18} color="#667eea" />
          <Text style={[styles.quickReplyText, { color: theme.text }]}>
            {text}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
};

// Empty State
const EmptyState = ({ theme }) => {
  const bounceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: -10,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [bounceAnim]);

  return (
    <View style={styles.emptyStateContainer}>
      <Animated.View
        style={[
          styles.emptyStateIcon,
          { transform: [{ translateY: bounceAnim }] },
        ]}
      >
        <LinearGradient
          colors={["#667eea", "#764ba2"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.emptyStateGradient}
        >
          <Image
            source={CHATBOT_ICON}
            style={styles.emptyStateImage}
            resizeMode="contain"
          />
        </LinearGradient>
      </Animated.View>

      <Text style={[styles.emptyStateTitle, { color: theme.text }]}>
        Xin chào! Tôi là Pikora - trợ lý ảo của PickleTour
      </Text>
      <Text style={[styles.emptyStateSubtitle, { color: theme.subText }]}>
        Hỏi tôi bất cứ điều gì về giải đấu, lịch thi đấu, hoặc luật chơi
      </Text>

      <View style={styles.suggestionsContainer}>
        <Text style={styles.suggestionsTitle}>Gợi ý câu hỏi:</Text>
        <View style={styles.suggestionsList}>
          <View style={[styles.suggestionChip, { backgroundColor: theme.inputBg }]}>
            <Ionicons name="trophy-outline" size={14} color="#667eea" />
            <Text style={styles.suggestionText}>Giải đấu sắp tới</Text>
          </View>
          <View style={[styles.suggestionChip, { backgroundColor: theme.inputBg }]}>
            <Ionicons name="calendar-outline" size={14} color="#667eea" />
            <Text style={styles.suggestionText}>Lịch thi đấu của tôi</Text>
          </View>
          <View style={[styles.suggestionChip, { backgroundColor: theme.inputBg }]}>
            <Ionicons name="help-circle-outline" size={14} color="#667eea" />
            <Text style={styles.suggestionText}>Luật pickleball</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

// Helper format time từ ISO
const formatTimestampFromISO = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Helper format AM/PM từ ISO
const formatTimeAmPmFromISO = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12.toString().padStart(2, "0")}:${minutes} ${suffix}`;
};

// ==================== MAIN COMPONENT ====================

const ChatAssistant = ({ isBack = false }) => {
  // 🔹 Detect theme
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = THEME_COLORS[isDark ? "dark" : "light"];

  const [messages, setMessages] = useState([]); // {id, message, isUser, timestamp, meta, navigation}
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [hasLoadedHistory, setHasLoadedHistory] = useState(false);
  const [sessionLimitInfo, setSessionLimitInfo] = useState(null);
  const [sessionLimitDismissed, setSessionLimitDismissed] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const scrollViewRef = useRef(null);
  const inputRef = useRef(null);

  const tabBarHeight = useBottomTabBarHeight();

  const [sendChatMessage, { isLoading: isSending }] =
    useSendChatMessageMutation();
  const [clearChatHistory] = useClearChatHistoryMutation();
  const [sendChatFeedback] = useSendChatFeedbackMutation();

  // 🔹 LẤY HISTORY CHAT TỪ API
  const {
    data: historyData,
    isLoading: isHistoryLoading,
    isFetching: isHistoryFetching,
  } = useGetChatHistoryQuery(100);

  // Listen keyboard show/hide để xử lý tap action
  useEffect(() => {
    const showEvt =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvt, () =>
      setIsKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(hideEvt, () =>
      setIsKeyboardVisible(false)
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // 🔹 Map history từ backend -> state messages (chỉ set lần đầu, sau khi load xong)
  useEffect(() => {
    if (!hasLoadedHistory && !isHistoryLoading) {
      if (historyData?.messages) {
        const mapped = historyData.messages.map((m) => ({
          id:
            m.id?.toString?.() || m._id?.toString?.() || String(Math.random()),
          message: m.message,
          isUser: m.role === "user",
          timestamp: formatTimestampFromISO(m.createdAt),
          meta: m.meta || null,
          navigation: m.navigation || null,
        }));
        setMessages(mapped);
      } else {
        setMessages([]);
      }
      setHasLoadedHistory(true);
    }
  }, [historyData, isHistoryLoading, hasLoadedHistory]);

  // 🔹 Load trạng thái session limit từ AsyncStorage
  useEffect(() => {
    const loadSessionLimit = async () => {
      try {
        const [infoStr, dismissedStr] = await Promise.all([
          AsyncStorage.getItem(SESSION_LIMIT_INFO_KEY),
          AsyncStorage.getItem(SESSION_LIMIT_BANNER_DISMISSED_KEY),
        ]);

        if (infoStr) {
          const parsed = JSON.parse(infoStr);
          if (parsed?.resetAt) {
            const reset = new Date(parsed.resetAt);
            const now = new Date();
            if (now < reset) {
              setSessionLimitInfo({
                resetAt: parsed.resetAt,
                remaining: parsed.remaining || null,
              });
            } else {
              await AsyncStorage.removeItem(SESSION_LIMIT_INFO_KEY);
              await AsyncStorage.removeItem(SESSION_LIMIT_BANNER_DISMISSED_KEY);
            }
          }
        }

        if (dismissedStr === "1") {
          setSessionLimitDismissed(true);
        }
      } catch (e) {
        console.log("[ChatAssistant] load session limit error:", e);
      }
    };

    loadSessionLimit();
  }, []);

  // Scroll xuống cuối khi có message mới hoặc đang typing
  useEffect(() => {
    const timeout = setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
    return () => clearTimeout(timeout);
  }, [messages, isTyping]);

  const buildTimestamp = () =>
    new Date().toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });

  const isCurrentlyLimited = () => {
    if (!sessionLimitInfo?.resetAt) return false;
    const now = new Date();
    const reset = new Date(sessionLimitInfo.resetAt);
    return now < reset;
  };

  const handleSend = async (textFromInput) => {
    const text = textFromInput?.trim();
    if (!text || isSending) return;

    // Nếu đang bị session-limit thì không cho gửi + show lại banner
    if (isCurrentlyLimited()) {
      setSessionLimitDismissed(false);
      try {
        await AsyncStorage.removeItem(SESSION_LIMIT_BANNER_DISMISSED_KEY);
      } catch (e) {
        console.log("[ChatAssistant] clear banner dismissed error:", e);
      }

      Alert.alert(
        "Session limit reached",
        "Bạn đã dùng hết 15 tin nhắn cho lượt này. Vui lòng thử lại sau khi hết thời gian khoá."
      );
      Keyboard.dismiss();
      return;
    }

    const userMessage = {
      id: Date.now().toString(),
      message: text,
      isUser: true,
      timestamp: buildTimestamp(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setIsTyping(true);

    try {
      const res = await sendChatMessage(text).unwrap();

      const botMessage = {
        id: (Date.now() + 1).toString(),
        message:
          res.reply || "Xin lỗi, hiện tại mình chưa trả lời được câu này.",
        isUser: false,
        timestamp: buildTimestamp(),
        meta: {
          type: res.type,
          source: res.source,
          usedSkill: res.usedSkill || res.skillName,
          confidence: res.confidence,
          botName: res.botName,
          createdSkill: res.createdSkill,
        },
        navigation: res.navigation || null,
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.log("[ChatAssistant] sendChatMessage error:", error);

      const isSessionLimitError =
        error?.status === 429 &&
        (error?.data?.error === "session_limit_reached" ||
          error?.data?.code === "session_limit_reached");

      if (isSessionLimitError) {
        const resetAtIso = error?.data?.resetAt;
        let resetText = "";

        if (resetAtIso) {
          resetText = formatTimeAmPmFromISO(resetAtIso);
        }

        const info = {
          resetAt: resetAtIso || null,
          remaining: error?.data?.remaining || null,
        };

        setSessionLimitInfo(info);
        setSessionLimitDismissed(false);

        try {
          await AsyncStorage.setItem(
            SESSION_LIMIT_INFO_KEY,
            JSON.stringify(info)
          );
          await AsyncStorage.removeItem(SESSION_LIMIT_BANNER_DISMISSED_KEY);
        } catch (e) {
          console.log("[ChatAssistant] save session limit error:", e);
        }

        const limitMsg = resetText
          ? `Session limit reached.\nBạn đã dùng hết 15 tin nhắn cho lượt này. Bạn có thể chat lại sau khoảng ${resetText}.`
          : "Session limit reached.\nBạn đã dùng hết 15 tin nhắn cho lượt này. Vui lòng thử lại sau.";

        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 2).toString(),
            message: limitMsg,
            isUser: false,
            timestamp: buildTimestamp(),
          },
        ]);

        return;
      }

      // lỗi khác (server, network...)
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 3).toString(),
          message:
            "Xin lỗi, hiện tại mình không trả lời được. Bạn thử lại sau nhé.",
          isUser: false,
          timestamp: buildTimestamp(),
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        const { dy, vy } = gestureState;
        return dy > 8 || vy > 0.6;
      },
      onPanResponderRelease: (evt, gestureState) => {
        const { dy, vy } = gestureState;
        if (dy > 20 || vy > 0.9) {
          Keyboard.dismiss();
        }
      },
    })
  ).current;

  const handleQuickReply = (text) => {
    setInputText(text);
    inputRef.current?.focus();
  };

  // XOÁ TOÀN BỘ HỘI THOẠI (có confirm, gọi API + clear state)
  const handleClearChat = () => {
    Alert.alert(
      "Xoá toàn bộ hội thoại?",
      "Thao tác này sẽ xoá toàn bộ lịch sử trò chuyện với Pikora cho tài khoản này.",
      [
        {
          text: "Huỷ",
          style: "cancel",
        },
        {
          text: "Xoá",
          style: "destructive",
          onPress: () => {
            clearChatHistory()
              .unwrap()
              .catch((e) =>
                console.log("[ChatAssistant] clearChatHistory error:", e)
              );
            setMessages([]);
            setIsMenuVisible(false);
            setHasLoadedHistory(true);
          },
        },
      ]
    );
  };

  // GỬI FEEDBACK (dùng RTK Query)
  const handleFeedback = () => {
    setIsMenuVisible(false);
    Alert.alert(
      "Gửi feedback cho PickleTour",
      "Bạn có muốn gửi hội thoại hiện tại cho team hỗ trợ không?",
      [
        {
          text: "Huỷ",
          style: "cancel",
        },
        {
          text: "Gửi",
          onPress: () => {
            const payload = {
              message: "In-app chat assistant feedback",
              lastMessages: messages.slice(-30),
            };
            sendChatFeedback(payload)
              .unwrap()
              .then(() => {
                Alert.alert("Đã gửi", "Cảm ơn bạn đã gửi feedback cho Pikora!");
              })
              .catch((e) => {
                console.log("[ChatAssistant] sendChatFeedback error:", e);
                Alert.alert(
                  "Lỗi",
                  "Không gửi được feedback. Bạn thử lại sau nhé."
                );
              });
          },
        },
      ]
    );
  };

  // Đóng banner session limit
  const handleDismissSessionBanner = async () => {
    setSessionLimitDismissed(true);
    try {
      await AsyncStorage.setItem(SESSION_LIMIT_BANNER_DISMISSED_KEY, "1");
    } catch (e) {
      console.log("[ChatAssistant] save banner dismissed error:", e);
    }
  };

  // xử lý navigation từ bot (deepLink kiểu pickletour://...)
  const handleNavigationPress = (nav) => {
    if (!nav) return;

    // nếu keyboard đang mở: chỉ tắt keyboard, nhưng KHÔNG return
    if (isKeyboardVisible) {
      Keyboard.dismiss();
      inputRef.current?.blur?.();
    }

    if (!nav.deepLink) {
      const missingText =
        Array.isArray(nav.missingContext) && nav.missingContext.length
          ? nav.missingContext.join(", ")
          : "một số thông tin cần thiết";

      Alert.alert(
        "Thiếu thông tin",
        `Bạn cần chọn ${missingText} trước khi mở màn hình này.`
      );
      return;
    }

    try {
      let link = nav.deepLink; // ví dụ: pickletour://tournaments

      const prefix = "pickletour://";
      if (link.startsWith(prefix)) {
        link = link.slice(prefix.length); // "tournaments" hoặc "tournament/123"
      }

      if (!link.startsWith("/")) {
        link = "/" + link;
      }

      router.push(link);
    } catch (e) {
      console.log("[ChatAssistant] navigation error", e);
      Alert.alert("Lỗi", "Không thể mở màn hình. Bạn thử lại sau nhé.");
    }
  };

  const isInitialLoading = !hasLoadedHistory;
  const isSessionLimited = isCurrentlyLimited();

  return (
    <SafeAreaView
      style={[
        styles.container,
        {
          paddingBottom: tabBarHeight - (Platform?.OS === "ios" ? 0 : 40),
          backgroundColor: theme.background, // 🔹 Áp dụng màu nền chính
        },
      ]}
      edges={[Platform.OS === "ios" && "top"]}
    >
      {/* Header */}
      <LinearGradient
        colors={["#667eea", "#764ba2"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          {isBack && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </TouchableOpacity>
          )}

          <View style={styles.headerCenter}>
            <View style={styles.headerAvatarContainer}>
              <LinearGradient
                colors={["#fff", "#f0f0f0"]}
                style={styles.headerAvatar}
              >
                <Image
                  source={CHATBOT_ICON}
                  style={styles.headerAvatarImage}
                  resizeMode="contain"
                />
              </LinearGradient>
              <View style={styles.onlineDot} />
            </View>
            <View style={styles.headerTextContainer}>
              <Text style={styles.headerTitle}>Pikora</Text>
              <Text style={styles.headerSubtitle}>
                {isTyping || isSending
                  ? "Đang trả lời..."
                  : "Luôn sẵn sàng hỗ trợ"}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => setIsMenuVisible(true)}
          >
            <Ionicons name="ellipsis-vertical" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Messages Area */}
      <View style={[styles.messagesContainer, { backgroundColor: theme.background }]}>
        <LinearGradient
          colors={theme.messageAreaGradient} // 🔹 Gradient đổi theo theme
          style={styles.messagesGradient}
        >
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {isInitialLoading ? (
              <View
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingTop: 32,
                }}
              >
                <ActivityIndicator size="small" color="#667eea" />
                <Text style={{ marginTop: 8, color: theme.subText, fontSize: 13 }}>
                  Đang tải hội thoại...
                </Text>
              </View>
            ) : messages.length === 0 ? (
              <EmptyState theme={theme} />
            ) : (
              <>
                {messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg.message}
                    isUser={msg.isUser}
                    timestamp={msg.timestamp}
                    meta={msg.meta}
                    navigation={msg.navigation}
                    onPressNavigation={handleNavigationPress}
                    theme={theme} // 🔹 Truyền theme
                  />
                ))}
                {(isTyping || isSending) && <TypingIndicator />}
              </>
            )}
          </ScrollView>
        </LinearGradient>

        {/* Quick Replies */}
        {messages.length === 0 && !isInitialLoading && (
          <View style={[styles.quickRepliesContainer, { borderTopColor: theme.divider }]}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickRepliesScroll}
            >
              <QuickReplyButton
                icon="trophy-outline"
                text="Giải đấu"
                onPress={() => handleQuickReply("Các giải đấu sắp tới")}
                theme={theme}
              />
              <QuickReplyButton
                icon="calendar-outline"
                text="Lịch thi đấu"
                onPress={() => handleQuickReply("Lịch thi đấu của tôi")}
                theme={theme}
              />
              <QuickReplyButton
                icon="help-circle-outline"
                text="Luật chơi"
                onPress={() => handleQuickReply("Luật pickleball cơ bản")}
                theme={theme}
              />
              <QuickReplyButton
                icon="stats-chart-outline"
                text="Xếp hạng"
                onPress={() => handleQuickReply("Xếp hạng của tôi")}
                theme={theme}
              />
            </ScrollView>
          </View>
        )}
      </View>

      {/* Input Area */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "padding"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : -tabBarHeight} // Trừ đi tab bar height
      >
        {isSessionLimited && !sessionLimitDismissed && (
          <View
            style={{
              paddingHorizontal: 16,
              paddingBottom: 6,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: theme.background,
            }}
          >
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text
                style={{
                  fontSize: 12,
                  color: "#ef4444",
                  fontWeight: "500",
                }}
              >
                Session limit reached · Bạn đã dùng hết 15 tin nhắn cho lượt
                này.
              </Text>
              {sessionLimitInfo?.resetAt && (
                <Text
                  style={{
                    fontSize: 12,
                    color: "#ef4444",
                    marginTop: 2,
                  }}
                >
                  Có thể chat lại sau{" "}
                  {formatTimeAmPmFromISO(sessionLimitInfo.resetAt)}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={handleDismissSessionBanner}>
              <Ionicons name="close" size={18} color={theme.subText} />
            </TouchableOpacity>
          </View>
        )}
        <BlurView
          intensity={95}
          tint={isDark ? "dark" : "light"} // 🔹 Đổi tint theo theme
          style={[styles.inputContainer, { borderTopColor: theme.divider }]}
          {...panResponder.panHandlers}
        >
          <View style={styles.inputWrapper}>
            <View style={[styles.textInputContainer, { 
                backgroundColor: theme.inputBg, 
                borderColor: theme.inputBorder 
              }]}>
              <TextInput
                ref={inputRef}
                style={[styles.textInput, { color: theme.text }]}
                placeholder="Nhập câu hỏi của bạn..."
                placeholderTextColor={theme.placeholder}
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={500}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.sendButton,
                (!inputText.trim() || isSending) && styles.sendButtonDisabled,
              ]}
              onPress={() => handleSend(inputText)}
              disabled={!inputText.trim() || isSending}
            >
              <LinearGradient
                colors={
                  inputText.trim() && !isSending
                    ? ["#667eea", "#764ba2"]
                    : isDark ? ["#444", "#444"] : ["#e0e0e0", "#d0d0d0"]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.sendButtonGradient}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons
                    name="send"
                    size={20}
                    color={inputText.trim() ? "#fff" : "#a0a0a0"}
                  />
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </BlurView>
      </KeyboardAvoidingView>

      {/* Menu Modal */}
      <Modal
        transparent
        visible={isMenuVisible}
        animationType="fade"
        onRequestClose={() => setIsMenuVisible(false)}
      >
        <View style={styles.menuOverlay}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setIsMenuVisible(false)}
          />
          <View style={[styles.menuModal, { backgroundColor: theme.menuBg, shadowColor: theme.shadow }]}>
            <Text style={[styles.menuTitle, { color: theme.subText }]}>Tùy chọn</Text>

            <TouchableOpacity style={styles.menuItem} onPress={handleClearChat}>
              <Ionicons
                name="trash-outline"
                size={18}
                color="#e53935"
                style={styles.menuItemIcon}
              />
              <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>
                Xoá toàn bộ hội thoại
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={handleFeedback}>
              <Ionicons
                name="chatbox-ellipses-outline"
                size={18}
                color={theme.subText}
                style={styles.menuItemIcon}
              />
              <Text style={[styles.menuItemText, { color: theme.text }]}>Gửi feedback</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

// ==================== STYLES ====================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Background color is handled dynamically
  },

  // Header Styles
  header: {
    paddingBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 12,
  },
  headerAvatarContainer: {
    position: "relative",
  },
  headerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  headerAvatarImage: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  onlineDot: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#4CAF50",
    borderWidth: 2,
    borderColor: "#fff",
  },
  headerTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "400",
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },

  // Messages Container
  messagesContainer: {
    flex: 1,
  },
  messagesGradient: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    flexGrow: 1,
  },

  // Message Bubble Styles
  messageRow: {
    flexDirection: "row",
    marginBottom: 16,
    alignItems: "flex-end",
  },
  userMessageRow: {
    justifyContent: "flex-end",
  },
  botMessageRow: {
    justifyContent: "flex-start",
  },
  avatarGradient: {
    width: 36,
    height: 36,
    borderRadius: 18,
    padding: 2,
    marginRight: 8,
  },
  avatarInner: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f0f0f0",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  messageBubbleContainer: {
    maxWidth: BUBBLE_MAX_WIDTH,
    flexShrink: 1,
  },
  userBubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderBottomRightRadius: 4,
    shadowColor: "#667eea",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    flexShrink: 1,
  },
  botBubble: {
    // backgroundColor handled dynamically
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderBottomLeftRadius: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    flexShrink: 1,
  },
  userMessageText: {
    fontSize: 15,
    color: "#fff",
    fontWeight: "500",
    lineHeight: 20,
  },
  botMessageText: {
    fontSize: 15,
    // color handled dynamically
    fontWeight: "400",
    lineHeight: 20,
  },
  timestamp: {
    fontSize: 11,
    color: "#999",
    marginTop: 4,
    marginLeft: 4,
  },
  userTimestamp: {
    textAlign: "right",
    marginLeft: 0,
    marginRight: 4,
  },

  metaText: {
    marginTop: 6,
    fontSize: 10,
    color: "#9CA3AF",
  },

  // Navigation button
  navContainer: {
    marginTop: 10,
  },
  navButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(37, 99, 235, 0.08)",
  },
  navButtonText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "500",
    color: "#2563EB",
  },

  // Typing Indicator
  typingContainer: {
    flexDirection: "row",
    marginBottom: 16,
    paddingLeft: 44,
  },
  typingBubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderBottomLeftRadius: 4,
  },
  typingDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#fff",
  },

  // Empty State
  emptyStateContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyStateIcon: {
    marginBottom: 24,
  },
  emptyStateGradient: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#667eea",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
    overflow: "hidden",
  },
  emptyStateImage: {
    width: 72,
    height: 72,
  },
  emptyStateTitle: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  suggestionsContainer: {
    marginTop: 32,
    width: "100%",
  },
  suggestionsTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#999",
    marginBottom: 12,
    textAlign: "center",
  },
  suggestionsList: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  suggestionChip: {
    flexDirection: "row",
    alignItems: "center",
    // backgroundColor handled dynamically
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    gap: 6,
  },
  suggestionText: {
    fontSize: 13,
    color: "#667eea",
    fontWeight: "500",
  },

  // Quick Replies
  quickRepliesContainer: {
    paddingVertical: 12,
    borderTopWidth: 1,
    // borderTopColor handled dynamically
  },
  quickRepliesScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  quickReplyButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 8,
    borderWidth: 1,
    // borderColor handled dynamically
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  quickReplyText: {
    fontSize: 14,
    fontWeight: "600",
  },

  // Input Area
  inputContainer: {
    borderTopWidth: 1,
    // borderTopColor handled dynamically
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 12 : 16,
    paddingHorizontal: 16,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  textInputContainer: {
    flex: 1,
    // backgroundColor handled dynamically
    borderRadius: 24,
    borderWidth: 1,
    // borderColor handled dynamically
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 44,
    maxHeight: 120,
  },
  textInput: {
    fontSize: 15,
    lineHeight: 20,
  },
  sendButton: {
    marginBottom: 4,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonGradient: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#667eea",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },

  // Menu modal
  menuOverlay: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 115,
    paddingRight: 12,
  },
  menuModal: {
    width: 230,
    // backgroundColor handled dynamically
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 8,
    // shadowColor handled dynamically
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  menuTitle: {
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 4,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 10,
  },
  menuItemLast: {
    marginTop: 4,
  },
  menuItemIcon: {
    marginRight: 8,
  },
  menuItemText: {
    fontSize: 14,
    // color handled dynamically
  },
  menuItemTextDanger: {
    color: "#e53935",
  },
});

export default ChatAssistant;