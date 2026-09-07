// Các "gán vào bài viết" của Feed: giải đấu, bình chọn (poll), kết quả trận đấu.
// Dùng chung cho cả Bảng tin (list) lẫn trang Chi tiết bài viết để không bị lệch.
import React, { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  View,
} from "react-native";
import { Text } from "@/components/ui/i18nText";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useVoteFeedPollMutation } from "@/slices/feedApiSlice";
import { useThemeTokens } from "@/hooks/useThemeTokens";
import { CONDITION_MAP, formatPrice } from "@/constants/market";
import { PLAY_STATUS, formatPlayTime, skillLabel } from "@/constants/play";

function fmtTourDate(startIso?: string, endIso?: string) {
  if (!startIso) return "";
  const s = new Date(startIso);
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(
      d.getMonth() + 1
    ).padStart(2, "0")}/${d.getFullYear()}`;
  if (!endIso || endIso === startIso) return fmt(s);
  const e = new Date(endIso);
  if (
    s.getMonth() === e.getMonth() &&
    s.getFullYear() === e.getFullYear() &&
    s.getDate() !== e.getDate()
  ) {
    return `${String(s.getDate()).padStart(2, "0")}–${fmt(e)}`;
  }
  return `${fmt(s)} → ${fmt(e)}`;
}

export function LinkedTournamentCard({ tour }: { tour: any }) {
  const C = useThemeTokens();
  const dateStr = fmtTourDate(tour?.startDate, tour?.endDate);
  const reg = Number(tour?.registrationCount || 0);
  const maxPairs = Number(tour?.maxPairs || 0);
  return (
    <Pressable
      onPress={() => router.push(`/tournament/${tour._id}` as any)}
      style={{
        marginTop: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        padding: 10,
        borderRadius: 12,
        backgroundColor: C.amberSoft,
        borderWidth: 1,
        borderColor: C.dark ? "rgba(245,158,11,0.35)" : "#FDE68A",
      }}
    >
      {tour.image ? (
        <Image
          source={{ uri: tour.image }}
          style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: C.amberSoft }}
        />
      ) : (
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 8,
            backgroundColor: C.amberSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="trophy" size={22} color="#F59E0B" />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: "700",
            color: C.amberText,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          Giải đấu
        </Text>
        <Text
          style={{ fontSize: 14, fontWeight: "700", color: C.text, marginTop: 2 }}
          numberOfLines={2}
        >
          {tour.name}
        </Text>
        {tour.location ? (
          <InfoRow icon="location-outline" text={tour.location} />
        ) : null}
        {dateStr ? <InfoRow icon="calendar-outline" text={dateStr} /> : null}
        {(reg > 0 || maxPairs > 0) && (
          <InfoRow
            icon="people-outline"
            text={`${reg} cặp${maxPairs > 0 ? ` / ${maxPairs}` : ""} đã đăng ký`}
          />
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={C.muted} />
    </Pressable>
  );
}

function InfoRow({ icon, text }: { icon: any; text: string }) {
  const C = useThemeTokens();
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}
    >
      <Ionicons name={icon} size={12} color={C.muted} />
      <Text style={{ fontSize: 11, color: C.sub, flexShrink: 1 }} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

export function PollBlock({ poll: pollProp, postId }: { poll: any; postId: string }) {
  const C = useThemeTokens();
  const [poll, setPoll] = useState<any>(pollProp || null);
  useEffect(() => setPoll(pollProp || null), [pollProp]);
  const [votePoll] = useVoteFeedPollMutation();

  if (!poll) return null;
  const total = poll.totalVotes || 0;
  const closed = poll.closesAt && new Date(poll.closesAt) < new Date();

  const doVote = async (optId: string) => {
    const optionIds = poll.multi
      ? poll.options
          .filter((o: any) => (o.id === optId ? !o.voted : o.voted))
          .map((o: any) => o.id)
      : [optId];
    try {
      const r: any = await votePoll({ id: postId, optionIds }).unwrap();
      if (r?.poll) setPoll(r.poll);
    } catch {}
  };

  return (
    <View
      style={{
        marginTop: 10,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: C.border,
        backgroundColor: C.bg,
      }}
    >
      {!!poll.question && (
        <Text style={{ fontWeight: "800", marginBottom: 8, color: C.text }}>
          {poll.question}
        </Text>
      )}
      {poll.options.map((o: any) => {
        const pct = total > 0 ? Math.round((o.votes / total) * 100) : 0;
        return (
          <Pressable
            key={o.id}
            onPress={() => !closed && doVote(o.id)}
            style={{
              marginBottom: 6,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: o.voted ? "#0066FF" : C.border,
              overflow: "hidden",
              backgroundColor: C.card,
            }}
          >
            <View
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: `${pct}%`,
                backgroundColor: o.voted ? C.primarySoft : C.field,
              }}
            />
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                paddingHorizontal: 10,
                paddingVertical: 8,
              }}
            >
              <Text style={{ fontWeight: o.voted ? "800" : "500", color: C.text }}>
                {o.voted ? "✓ " : ""}
                {o.text}
              </Text>
              <Text style={{ fontWeight: "700", color: C.text2 }}>
                {pct}% · {o.votes}
              </Text>
            </View>
          </Pressable>
        );
      })}
      <Text style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>
        {total} lượt bình chọn{closed ? " · đã đóng" : ""}
        {poll.multi ? " · chọn nhiều" : ""}
      </Text>
    </View>
  );
}

export function SharedMatchCard({ sm }: { sm: any }) {
  const C = useThemeTokens();
  if (!sm) return null;
  const winA = sm.winner === "A";
  const winB = sm.winner === "B";
  return (
    <Pressable
      onPress={() => sm.matchId && router.push(`/match/${sm.matchId}` as any)}
      style={{
        marginTop: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: C.border,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 12,
          paddingVertical: 6,
          backgroundColor: "#0066FF",
        }}
      >
        <Text>🏓</Text>
        <Text style={{ color: "#fff", fontWeight: "800", flex: 1 }} numberOfLines={1}>
          {sm.tournamentName || "Kết quả trận đấu"}
          {sm.code ? ` · ${sm.code}` : ""}
        </Text>
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          paddingVertical: 12,
          gap: 8,
        }}
      >
        <Text style={{ flex: 1, fontWeight: winA ? "800" : "500", color: winA ? C.greenText : C.text }}>
          {sm.teamA || "Đội A"}
        </Text>
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 4,
            borderRadius: 10,
            backgroundColor: C.border,
            alignItems: "center",
            minWidth: 74,
          }}
        >
          <Text style={{ fontWeight: "900", fontSize: 18, color: C.text }}>
            {sm.scoreA} – {sm.scoreB}
          </Text>
          {sm.setsA || sm.setsB ? (
            <Text style={{ fontSize: 11, color: C.sub }}>
              Sets {sm.setsA}–{sm.setsB}
            </Text>
          ) : null}
        </View>
        <Text
          style={{
            flex: 1,
            textAlign: "right",
            fontWeight: winB ? "800" : "500",
            color: winB ? C.greenText : C.text,
          }}
        >
          {sm.teamB || "Đội B"}
        </Text>
      </View>
    </Pressable>
  );
}

export function SharedListingCard({ sl }: { sl: any }) {
  const C = useThemeTokens();
  if (!sl) return null;
  const cond = CONDITION_MAP[sl.condition];
  const sold = sl.status === "sold";
  const cta = sold
    ? "Đã bán"
    : sl.type === "trade"
    ? "Xem / Đổi"
    : sl.type === "giveaway"
    ? "Nhận ngay"
    : "Mua ngay";
  return (
    <Pressable
      onPress={() => sl.listingId && router.push(`/marketplace/${sl.listingId}` as any)}
      style={{
        marginTop: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: C.border,
        overflow: "hidden",
        flexDirection: "row",
      }}
    >
      <View style={{ width: 104, height: 104, backgroundColor: C.field }}>
        {sl.image ? (
          <Image
            source={{ uri: sl.image }}
            style={{ width: "100%", height: "100%", opacity: sold ? 0.6 : 1 }}
          />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 30 }}>🛍️</Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1, padding: 10, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text style={{ fontSize: 12 }}>🛍️</Text>
          <Text style={{ color: "#0066FF", fontWeight: "700", fontSize: 12 }}>
            Sản phẩm trên Chợ
          </Text>
        </View>
        <Text numberOfLines={2} style={{ fontWeight: "700", fontSize: 14, color: C.text }}>
          {sl.title || "Sản phẩm"}
        </Text>
        <Text style={{ color: "#0066FF", fontWeight: "900", fontSize: 16 }}>
          {formatPrice(sl.price, sl.type)}
        </Text>
        <View
          style={{
            marginTop: "auto",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <Text numberOfLines={1} style={{ color: C.sub, fontSize: 11, flex: 1 }}>
            {[cond?.label, sl.province].filter(Boolean).join(" · ")}
          </Text>
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 5,
              borderRadius: 999,
              backgroundColor: sold ? C.border : "#0066FF",
            }}
          >
            <Text style={{ color: sold ? C.muted : "#fff", fontWeight: "700", fontSize: 12 }}>
              {cta}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export function SharedPlayCard({ sp }: { sp: any }) {
  const C = useThemeTokens();
  if (!sp) return null;
  const st = PLAY_STATUS[sp.status] || PLAY_STATUS.open;
  const slotsLeft = Math.max(0, (sp.slots || 0) - (sp.acceptedCount || 0));
  return (
    <Pressable
      onPress={() => sp.playId && router.push(`/play/${sp.playId}` as any)}
      style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: C.border, overflow: "hidden" }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#16a34a" }}>
        <Text>🏓</Text>
        <Text style={{ color: "#fff", fontWeight: "800", flex: 1 }} numberOfLines={1}>Kèo giao lưu · Tìm bạn đánh</Text>
        <View style={{ backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{st.label}</Text>
        </View>
      </View>
      <View style={{ padding: 12 }}>
        <Text style={{ fontWeight: "800", fontSize: 15, color: C.text }}>{sp.title || sp.courtName || "Kèo pickleball"}</Text>
        <Text style={{ fontSize: 13, color: C.sub, marginTop: 4 }}>🕒 {formatPlayTime(sp.playAt)}</Text>
        <Text style={{ fontSize: 13, color: C.sub }}>📍 {[sp.courtName, sp.province].filter(Boolean).join(", ") || "—"}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, gap: 8 }}>
          <Text style={{ fontSize: 12.5, color: C.sub, flex: 1 }}>{skillLabel(sp.skillMin, sp.skillMax)} · thiếu {slotsLeft} người</Text>
          <View style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: sp.status === "open" ? "#16a34a" : C.border }}>
            <Text style={{ color: sp.status === "open" ? "#fff" : C.muted, fontWeight: "700", fontSize: 12.5 }}>{sp.status === "open" ? "Tham gia" : "Xem kèo"}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// Card sự kiện xé vé / social được chia sẻ (rủ mọi người tham gia)
export function SharedEventCard({ se }: { se: any }) {
  const C = useThemeTokens();
  if (!se) return null;
  const start = se.startAt ? new Date(se.startAt) : null;
  const when = start
    ? start.toLocaleString("vi-VN", { weekday: "short", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })
    : "";
  const ended = se.endAt ? new Date(se.endAt).getTime() < Date.now() : false;
  const left = Math.max(0, (se.capacity || 0) - (se.registered || 0));
  const price = se.price > 0 ? `${Number(se.price).toLocaleString("vi-VN")}đ` : "Miễn phí";
  const skill = se.skillMin || se.skillMax ? `Trình ${se.skillMin || 0}${se.skillMax ? `–${se.skillMax}` : "+"}` : "Mọi trình";
  const gender: any = { male: "Chỉ nam", female: "Chỉ nữ", balanced: "Cân bằng nam/nữ" };
  return (
    <Pressable
      onPress={() => se.eventId && router.push(`/events/${se.eventId}` as any)}
      style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: C.border, overflow: "hidden" }}
    >
      {!!se.coverImage && <Image source={{ uri: se.coverImage }} style={{ width: "100%", height: 140 }} resizeMode="cover" />}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#e11d48" }}>
        <Text>🎟️</Text>
        <Text style={{ color: "#fff", fontWeight: "800", flex: 1 }} numberOfLines={1}>Sự kiện xé vé · Đánh social</Text>
        <View style={{ backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{ended ? "Đã diễn ra" : left > 0 ? `Còn ${left} suất` : "Hết suất"}</Text>
        </View>
      </View>
      <View style={{ padding: 12 }}>
        <Text style={{ fontWeight: "800", fontSize: 15, color: C.text }}>{se.title || "Sự kiện"}</Text>
        {!!when && <Text style={{ fontSize: 13, color: C.sub, marginTop: 4 }}>🕒 {when}</Text>}
        <Text style={{ fontSize: 13, color: C.sub }} numberOfLines={1}>📍 {[se.venueName, se.address].filter(Boolean).join(" · ") || "—"}{se.courts ? ` · ${se.courts}` : ""}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, gap: 8 }}>
          <Text style={{ fontSize: 12.5, color: C.sub, flex: 1 }} numberOfLines={1}>{skill}{gender[se.genderPolicy] ? ` · ${gender[se.genderPolicy]}` : ""} · {se.registered || 0}/{se.capacity || 0} suất · {price}</Text>
          <View style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: !ended && left > 0 ? "#e11d48" : C.border }}>
            <Text style={{ color: !ended && left > 0 ? "#fff" : C.muted, fontWeight: "700", fontSize: 12.5 }}>{!ended && left > 0 ? "Tham gia" : "Xem"}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// Gộp TẤT CẢ phần "gán vào bài" của 1 post — dùng ở cả Bảng tin (list) lẫn Chi tiết bài viết.
// ⚠️ Thêm loại đính kèm mới thì PHẢI render ở ĐÂY (để màn chi tiết hiện), không chỉ ở feed list.
export function PostAttachments({ post }: { post: any }) {
  if (!post) return null;
  return (
    <>
      {post.linkedTournament && (
        <LinkedTournamentCard tour={post.linkedTournament} />
      )}
      {post.sharedMatch && <SharedMatchCard sm={post.sharedMatch} />}
      {post.sharedListing && <SharedListingCard sl={post.sharedListing} />}
      {post.sharedPlay && <SharedPlayCard sp={post.sharedPlay} />}
      {post.sharedEvent && <SharedEventCard se={post.sharedEvent} />}
      {post.poll && <PollBlock poll={post.poll} postId={String(post._id)} />}
    </>
  );
}
