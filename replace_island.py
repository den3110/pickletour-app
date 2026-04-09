import sys
with open('pickletour-app-mobile/app/(tabs)/index.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

start_comp = '/* ---------- Athlete Island Card ---------- */\nfunction AthleteIsland() {'
end_comp = '/* ---------- Feature Item (Interactive) ---------- */'

start_idx = text.find(start_comp)
end_idx = text.find(end_comp)

new_comp = r'''/* ---------- Athlete Island Card ---------- */
function AthleteIsland() {
  const userInfo = useSelector((s) => s.auth?.userInfo);
  const router = useRouter();
  const goProfile = React.useCallback(() => router.push("/profile/stack"), []);

  const { dark } = useTheme();

  const rankNo = userInfo?.rankNo ?? userInfo?.rank?.rankNo ?? null;
  let rankDisplay = "Thành viên",
    rankIcon = "star",
    rankColor = "#888888";

  if (userInfo) {
     rankDisplay = "Tân binh";
     rankIcon = "shield-checkmark";
     rankColor = "#4ECDC4";
  }

  if (Number.isFinite(rankNo)) {
    if (rankNo <= 100) {
      rankDisplay = `TOP ${rankNo}`;
      rankIcon = "flash";
      rankColor = "#FFD700";
    } else {
      rankDisplay = `Hạng ${rankNo}`;
      rankIcon = "medal";
      rankColor = "#FF9F43";
    }
  }

  const roleUser = () => {
    switch (userInfo?.role) {
      case "user": return "Vận động viên";
      case "referee": return "Trọng tài";
      case "admin": return "Admin";
      default: return "Cùng PickleTour";
    }
  };

  const avatarUrl = normalizeUrl(userInfo?.avatar);
  const name = userInfo?.name || "Bắt đầu hành trình";

  return (
    <View style={styles.islandContainer}>
      <AnimatedLogo />

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={userInfo ? goProfile : () => router.push("/login")}
        style={styles.dynamicIsland}
      >
        <View style={styles.dynamicIslandLeft}>
           {!userInfo ? (
              <View style={styles.islandAvatarPlaceholder}>
                <Ionicons name="person" size={20} color="#666" />
              </View>
            ) : (
              <Image
                source={{ uri: normalizeUrl(avatarUrl) }}
                style={styles.islandAvatar}
                contentFit="cover"
                transition={500}
              />
            )}
            <View style={styles.islandInfo}>
              <Text style={styles.islandName} numberOfLines={1}>
                {name}
              </Text>
              <Text style={styles.islandRole}>
                {userInfo ? roleUser() : "Đăng nhập ngay"}
              </Text>
            </View>
        </View>

        <View style={styles.dynamicIslandRight}>
          {userInfo ? (
             <View style={[styles.islandRankBadge, { backgroundColor: rankColor + "20", borderColor: rankColor + "40" }]}>
                <Ionicons name={rankIcon} size={12} color={rankColor} style={{ marginRight: 4 }} />
                <Text style={[styles.islandRankText, { color: rankColor }]}>{rankDisplay}</Text>
             </View>
          ) : (
             <LinearGradient
                colors={["#FF6B6B", "#FF8E53"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.islandLoginAction}
             >
                <Text style={styles.islandLoginText}>Vào</Text>
                <Ionicons name="chevron-forward" size={14} color="#FFF" />
             </LinearGradient>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
}

'''

text = text[:start_idx] + new_comp + text[end_idx:]

start_style = '  /* 💎 PREMIUM ATHLETE ISLAND */'
end_style = '  featuresContainer: { paddingHorizontal: 16 },'

start_style_idx = text.find(start_style)
end_style_idx = text.find(end_style)

new_style = r'''  /* 💎 DYNAMIC ISLAND AESTHETIC */
  dynamicIsland: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    backgroundColor: "#000000",
    borderRadius: 40,
    paddingVertical: 12,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  dynamicIslandLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: 10,
  },
  islandAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#222",
  },
  islandAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#222",
    justifyContent: "center",
    alignItems: "center",
  },
  islandInfo: {
    marginLeft: 12,
    flex: 1,
  },
  islandName: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 2,
    letterSpacing: -0.3,
  },
  islandRole: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    fontWeight: "500",
  },
  dynamicIslandRight: {
    flexShrink: 0,
    justifyContent: "center",
    alignItems: "flex-end",
  },
  islandRankBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  islandRankText: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  islandLoginAction: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  islandLoginText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 13,
    marginRight: 4,
  },

'''

text = text[:start_style_idx] + new_style + text[end_style_idx:]

with open('pickletour-app-mobile/app/(tabs)/index.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print('Success')
