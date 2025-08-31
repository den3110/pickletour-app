import React, { useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useColorScheme,
  AccessibilityState,
} from "react-native";

type Props = {
  count: number; // tổng số trang (>=1)
  page: number; // trang hiện tại (1-based)
  onChange: (p: number) => void;
  disabled?: boolean;
  siblingCount?: number; // số trang kề hai bên
  boundaryCount?: number; // số trang ở hai đầu
  showFirstButton?: boolean;
  showLastButton?: boolean;
  showPrevNext?: boolean;
  size?: "sm" | "md"; // kích thước
};

type Item =
  | { type: "page"; page: number; selected: boolean; disabled: boolean }
  | { type: "start-ellipsis" | "end-ellipsis" }
  | {
      type: "previous" | "next" | "first" | "last";
      disabled: boolean;
      target?: number;
    };

function range(start: number, end: number) {
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

// Thuật toán giống MUI Pagination
function getItems({
  count,
  page,
  siblingCount,
  boundaryCount,
  showFirstButton,
  showLastButton,
  showPrevNext,
}: Required<
  Pick<
    Props,
    | "count"
    | "page"
    | "siblingCount"
    | "boundaryCount"
    | "showFirstButton"
    | "showLastButton"
    | "showPrevNext"
  >
>): Item[] {
  const startPages = range(1, Math.min(boundaryCount, count));
  const endPages = range(
    Math.max(count - boundaryCount + 1, boundaryCount + 1),
    count
  );

  const siblingsStart = Math.max(
    Math.min(page - siblingCount, count - boundaryCount - siblingCount * 2 - 1),
    boundaryCount + 2
  );

  const siblingsEnd = Math.min(
    Math.max(page + siblingCount, boundaryCount + siblingCount * 2 + 2),
    endPages.length ? endPages[0] - 2 : count - 1
  );

  const items: Item[] = [];

  if (showFirstButton) {
    items.push({ type: "first", disabled: page === 1, target: 1 });
  }
  if (showPrevNext) {
    items.push({
      type: "previous",
      disabled: page === 1,
      target: Math.max(1, page - 1),
    });
  }

  // start pages
  startPages.forEach((p) =>
    items.push({ type: "page", page: p, selected: p === page, disabled: false })
  );

  // start ellipsis
  if (siblingsStart > boundaryCount + 2) {
    items.push({ type: "start-ellipsis" });
  } else if (boundaryCount + 1 < count - boundaryCount) {
    const p = boundaryCount + 1;
    items.push({
      type: "page",
      page: p,
      selected: p === page,
      disabled: false,
    });
  }

  // sibling pages
  for (let p = siblingsStart; p <= siblingsEnd; p++) {
    items.push({
      type: "page",
      page: p,
      selected: p === page,
      disabled: false,
    });
  }

  // end ellipsis
  if (siblingsEnd < count - boundaryCount - 1) {
    items.push({ type: "end-ellipsis" });
  } else if (count - boundaryCount > boundaryCount) {
    const p = count - boundaryCount;
    items.push({
      type: "page",
      page: p,
      selected: p === page,
      disabled: false,
    });
  }

  // end pages
  endPages.forEach((p) =>
    items.push({ type: "page", page: p, selected: p === page, disabled: false })
  );

  if (showPrevNext) {
    items.push({
      type: "next",
      disabled: page === count,
      target: Math.min(count, page + 1),
    });
  }
  if (showLastButton) {
    items.push({ type: "last", disabled: page === count, target: count });
  }

  return items;
}

export default function PaginationRN({
  count,
  page,
  onChange,
  disabled = false,
  siblingCount = 1,
  boundaryCount = 1,
  showFirstButton = false,
  showLastButton = false,
  showPrevNext = true,
  size = "md",
}: Props) {
  const scheme = useColorScheme() ?? "light";
  const tint = scheme === "dark" ? "#7cc0ff" : "#0a84ff";
  const bg = scheme === "dark" ? "#0b0d10" : "#fff";
  const text = scheme === "dark" ? "#f7f7f7" : "#111";
  const border = scheme === "dark" ? "#2e2f33" : "#dfe3ea";

  const items = useMemo(
    () =>
      getItems({
        count,
        page,
        siblingCount,
        boundaryCount,
        showFirstButton,
        showLastButton,
        showPrevNext,
      }),
    [
      count,
      page,
      siblingCount,
      boundaryCount,
      showFirstButton,
      showLastButton,
      showPrevNext,
    ]
  );

  const sz = size === "sm" ? 32 : 38;

  return (
    <View style={[styles.root]}>
      <View style={[styles.wrap]}>
        {items.map((it, idx) => {
          if (it.type === "start-ellipsis" || it.type === "end-ellipsis") {
            return (
              <View
                key={`el-${idx}`}
                style={[
                  styles.btn,
                  { width: sz, height: sz, borderColor: "transparent" },
                ]}
              >
                <Text style={{ color: "#9aa0a6" }}>…</Text>
              </View>
            );
          }

          if (it.type === "page") {
            const active = it.selected;
            const a11y: AccessibilityState = {
              selected: active,
              disabled: disabled,
            };
            return (
              <Pressable
                key={`p-${it.page}`}
                accessibilityRole="button"
                accessibilityState={a11y}
                onPress={() => !disabled && onChange(it.page)}
                style={({ pressed }) => [
                  styles.btn,
                  {
                    width: sz,
                    height: sz,
                    borderColor: active ? tint : border,
                    backgroundColor: active ? tint : bg,
                  },
                  pressed && !disabled && { opacity: 0.9 },
                ]}
              >
                <Text
                  style={{ color: active ? "#fff" : text, fontWeight: "700" }}
                >
                  {it.page}
                </Text>
              </Pressable>
            );
          }

          // prev/next/first/last
          const label =
            it.type === "previous"
              ? "‹"
              : it.type === "next"
              ? "›"
              : it.type === "first"
              ? "«"
              : "»";
          const isDisabled = disabled || it.disabled;
          const a11y: AccessibilityState = { disabled: isDisabled };

          return (
            <Pressable
              key={`${it.type}`}
              accessibilityRole="button"
              accessibilityState={a11y}
              onPress={() => !isDisabled && it.target && onChange(it.target)}
              style={({ pressed }) => [
                styles.btn,
                {
                  width: sz,
                  height: sz,
                  borderColor: border,
                  backgroundColor: bg,
                  opacity: isDisabled ? 0.5 : 1,
                },
                pressed && !isDisabled && { opacity: 0.8 },
              ]}
            >
              <Text style={{ color: text, fontWeight: "700" }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: "center", marginTop: 8 },
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  btn: {
    borderWidth: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
});
