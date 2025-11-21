// src/utils/analytics.js
import { Platform } from "react-native";

class AnalyticsService {
  constructor() {
    this.analytics = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    try {
      if (Platform.OS === "web") {
        // Web: Firebase JS SDK
        const { analytics } = await import("@/configs/firebase.web");
        this.analytics = analytics;
      } else {
        // Mobile: React Native Firebase
        const firebaseAnalytics = await import(
          "@react-native-firebase/analytics"
        );
        this.analytics = firebaseAnalytics.default();
        await this.analytics.setAnalyticsCollectionEnabled(true);
      }

      this.initialized = true;
      console.log("✅ Analytics initialized for", Platform.OS);
    } catch (error) {
      console.error("❌ Analytics init failed:", error);
    }
  }

  // Log custom events
  async logEvent(eventName, params = {}) {
    if (!this.initialized) await this.init();

    try {
      if (Platform.OS === "web") {
        const { logEvent } = await import("firebase/analytics");
        logEvent(this.analytics, eventName, params);
      } else {
        await this.analytics.logEvent(eventName, params);
      }
    } catch (error) {
      console.error("Analytics event error:", error);
    }
  }

  // Log screen/page views
  async logScreenView(screenName, screenClass = null) {
    if (!this.initialized) await this.init();

    try {
      if (Platform.OS === "web") {
        const { logEvent } = await import("firebase/analytics");
        logEvent(this.analytics, "page_view", {
          page_title: screenName,
          page_location: window.location.href,
          page_path: window.location.pathname,
        });
      } else {
        await this.analytics.logScreenView({
          screen_name: screenName,
          screen_class: screenClass || screenName,
        });
      }
    } catch (error) {
      console.error("Analytics screen view error:", error);
    }
  }

  // Set user ID
  async setUserId(userId) {
    if (!this.initialized) await this.init();

    try {
      if (Platform.OS === "web") {
        const { setUserId } = await import("firebase/analytics");
        setUserId(this.analytics, userId);
      } else {
        await this.analytics.setUserId(userId);
      }
    } catch (error) {
      console.error("Analytics setUserId error:", error);
    }
  }

  // Set user properties
  async setUserProperties(properties = {}) {
    if (!this.initialized) await this.init();

    try {
      if (Platform.OS === "web") {
        const { setUserProperties } = await import("firebase/analytics");
        setUserProperties(this.analytics, properties);
      } else {
        for (const [key, value] of Object.entries(properties)) {
          await this.analytics.setUserProperty(key, String(value));
        }
      }
    } catch (error) {
      console.error("Analytics setUserProperties error:", error);
    }
  }

  // Predefined Events
  async logLogin(method = "email") {
    await this.logEvent("login", { method });
  }

  async logSignUp(method = "email") {
    await this.logEvent("sign_up", { method });
  }

  async logSearch(searchTerm) {
    await this.logEvent("search", { search_term: searchTerm });
  }

  async logShare(contentType, itemId, method) {
    await this.logEvent("share", {
      content_type: contentType,
      item_id: itemId,
      method: method,
    });
  }

  async logSelectContent(contentType, itemId) {
    await this.logEvent("select_content", {
      content_type: contentType,
      item_id: itemId,
    });
  }
}

// Export singleton instance
const analytics = new AnalyticsService();
export default analytics;
