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
        backgroundColor: "#FFFBEB",
        borderWidth: 1,
        borderColor: "#FDE68A",
      }}
    >
      {tour.image ? (
        <Image
          source={{ uri: tour.image }}
          style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: "#FEF3C7" }}
        />
      ) : (
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 8,
            backgroundColor: "#FEF3C7",
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
            color: "#B45309",
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          Giải đấu
        </Text>
        <Text
          style={{ fontSize: 14, fontWeight: "700", color: "#0F172A", marginTop: 2 }}
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
      <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
    </Pressable>
  );
}

function InfoRow({ icon, text }: { icon: any; text: string }) {
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}
    >
      <Ionicons name={icon} size={12} color="#94A3B8" />
      <Text style={{ fontSize: 11, color: "#64748B", flexShrink: 1 }} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

export function PollBlock({ poll: pollProp, postId }: { poll: any; postId: string }) {
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
        borderColor: "#E2E8F0",
        backgroundColor: "#F8FAFC",
      }}
    >
      {!!poll.question && (
        <Text style={{ fontWeight: "800", marginBottom: 8, color: "#0F172A" }}>
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
              borderColor: o.voted ? "#0066FF" : "#E2E8F0",
              overflow: "hidden",
              backgroundColor: "#fff",
            }}
          >
            <View
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: `${pct}%`,
                backgroundColor: o.voted ? "#DBEAFE" : "#EEF2F7",
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
              <Text style={{ fontWeight: o.voted ? "800" : "500", color: "#0F172A" }}>
                {o.voted ? "✓ " : ""}
                {o.text}
              </Text>
              <Text style={{ fontWeight: "700", color: "#334155" }}>
                {pct}% · {o.votes}
              </Text>
            </View>
          </Pressable>
        );
      })}
      <Text style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>
        {total} lượt bình chọn{closed ? " · đã đóng" : ""}
        {poll.multi ? " · chọn nhiều" : ""}
      </Text>
    </View>
  );
}

export function SharedMatchCard({ sm }: { sm: any }) {
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
        borderColor: "#E2E8F0",
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
        <Text style={{ flex: 1, fontWeight: winA ? "800" : "500", color: winA ? "#15803D" : "#0F172A" }}>
          {sm.teamA || "Đội A"}
        </Text>
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 4,
            borderRadius: 10,
            backgroundColor: "#E2E8F0",
            alignItems: "center",
            minWidth: 74,
          }}
        >
          <Text style={{ fontWeight: "900", fontSize: 18, color: "#0F172A" }}>
            {sm.scoreA} – {sm.scoreB}
          </Text>
          {sm.setsA || sm.setsB ? (
            <Text style={{ fontSize: 11, color: "#64748B" }}>
              Sets {sm.setsA}–{sm.setsB}
            </Text>
          ) : null}
        </View>
        <Text
          style={{
            flex: 1,
            textAlign: "right",
            fontWeight: winB ? "800" : "500",
            color: winB ? "#15803D" : "#0F172A",
          }}
        >
          {sm.teamB || "Đội B"}
        </Text>
      </View>
    </Pressable>
  );
}

// Gộp tất cả phần "gán vào bài" của 1 post — dùng ở cả list lẫn chi tiết.
export function PostAttachments({ post }: { post: any }) {
  if (!post) return null;
  return (
    <>
      {post.linkedTournament && (
        <LinkedTournamentCard tour={post.linkedTournament} />
      )}
      {post.sharedMatch && <SharedMatchCard sm={post.sharedMatch} />}
      {post.poll && <PollBlock poll={post.poll} postId={String(post._id)} />}
    </>
  );
}
