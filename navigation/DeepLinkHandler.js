// src/navigation/DeepLinkHandler.js
import { useEffect } from "react";
import * as Linking from "expo-linking";
import { useNavigation } from "@react-navigation/native";

export const useDeepLinking = () => {
  const navigation = useNavigation();

  useEffect(() => {
    // Parse URL và navigate
    const handleDeepLink = (url) => {
      if (!url) return;

      const { hostname, path, queryParams } = Linking.parse(url);

      console.log("Deep link received:", { hostname, path, queryParams });

      // Route theo path
      if (path) {
        // Tournament detail: /tournament/123
        if (path.startsWith("tournament/")) {
          const id = path.split("/")[1];
          navigation.navigate("TournamentDetail", { tournamentId: id });
        }
        // Match detail: /match/456
        else if (path.startsWith("match/")) {
          const id = path.split("/")[1];
          navigation.navigate("MatchDetail", { matchId: id });
        }
        // Profile: /profile/username
        else if (path.startsWith("profile/")) {
          const username = path.split("/")[1];
          navigation.navigate("Profile", { username });
        }
        // Live stream: /live/789
        else if (path.startsWith("live/")) {
          const streamId = path.split("/")[1];
          navigation.navigate("LiveStream", { streamId });
        }
      }
    };

    // Lắng nghe khi app đang mở
    const subscription = Linking.addEventListener("url", (event) => {
      handleDeepLink(event.url);
    });

    // Check URL khi app vừa mở
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink(url);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [navigation]);
};
