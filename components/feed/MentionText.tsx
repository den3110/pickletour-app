import React from "react";
import { Text } from "@/components/ui/i18nText";
import { router } from "expo-router";

/**
 * Render nội dung có @mention thành text màu xanh, tap để mở profile.
 * Chỉ style những @mention khớp với `mentions` (array user đã populate từ backend).
 */
export function MentionText({
  content,
  mentions,
  style,
  mentionColor = "#1877F2",
}: {
  content: string;
  mentions?: any[];
  style?: any;
  mentionColor?: string;
}) {
  if (!content) return null;

  const byNick = new Map<string, any>();
  const byName = new Map<string, any>();
  (mentions || []).forEach((u) => {
    if (u?.nickname) byNick.set(String(u.nickname).toLowerCase(), u);
    if (u?.name) byName.set(String(u.name).toLowerCase(), u);
  });

  const re = /(^|\s)@([\p{L}\p{N}._-]+(?: [\p{L}\p{N}._-]+){0,2})/gu;

  const parts: Array<{ type: "text" | "mention"; text: string; user?: any }> = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const [, lead, raw] = m;
    const startIdx = m.index + lead.length;
    if (startIdx > lastIndex) {
      parts.push({ type: "text", text: content.slice(lastIndex, startIdx) });
    }
    const words = raw.split(/\s+/);
    let matched: any = null;
    let matchedLen = 0;
    for (let i = words.length; i > 0; i--) {
      const candidate = words.slice(0, i).join(" ");
      const u =
        byNick.get(candidate.toLowerCase()) ||
        byName.get(candidate.toLowerCase());
      if (u) {
        matched = u;
        matchedLen = candidate.length;
        break;
      }
    }
    if (matched) {
      parts.push({
        type: "mention",
        text: "@" + raw.slice(0, matchedLen),
        user: matched,
      });
      lastIndex = startIdx + 1 + matchedLen;
    } else {
      parts.push({ type: "text", text: "@" + raw });
      lastIndex = startIdx + 1 + raw.length;
    }
  }
  if (lastIndex < content.length) {
    parts.push({ type: "text", text: content.slice(lastIndex) });
  }

  return (
    <Text style={style}>
      {parts.map((p, i) =>
        p.type === "mention" ? (
          <Text
            key={i}
            style={{ color: mentionColor, fontWeight: "700" }}
            onPress={() =>
              p.user?._id && router.push(`/profile/${p.user._id}`)
            }
          >
            {p.text}
          </Text>
        ) : (
          <Text key={i}>{p.text}</Text>
        )
      )}
    </Text>
  );
}
