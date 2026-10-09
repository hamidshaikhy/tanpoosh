/**
 * Minimal line icons (1.5px strokes) matching the references. Directional icons (arrow, chevron)
 * point toward "forward" in RTL (left) and are mirrored with `rtl-flip` only where direction
 * conveys navigation.
 */
import type { SVGProps } from "react";

type Name =
  | "bag"
  | "search"
  | "user"
  | "arrow"
  | "chevron"
  | "chevron-down"
  | "close"
  | "plus"
  | "minus"
  | "heart"
  | "heart-fill"
  | "menu"
  | "rotate"
  | "bookmark"
  | "share"
  | "move"
  | "check"
  | "alert"
  | "info"
  | "trash"
  | "edit"
  | "undo"
  | "redo"
  | "zoom-in"
  | "zoom-out"
  | "eye"
  | "eye-off"
  | "box"
  | "truck"
  | "logout"
  | "grid"
  | "tag"
  | "users"
  | "shield"
  | "file"
  | "chart"
  | "card"
  | "refund"
  | "message"
  | "star"
  | "settings"
  | "external"
  | "copy"
  | "upload"
  | "instagram"
  | "telegram"
  | "lock";

const paths: Record<Name, string> = {
  bag: "M6 8h12l-1 12H7L6 8Zm3 0V6a3 3 0 0 1 6 0v2",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 4 4",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0",
  // points LEFT (= forward in RTL)
  arrow: "M19 12H5m6-6-6 6 6 6",
  chevron: "m14 6-6 6 6 6",
  "chevron-down": "m6 9 6 6 6-6",
  close: "M6 6l12 12M18 6 6 18",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z",
  "heart-fill": "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z",
  menu: "M4 7h16M4 12h16M4 17h16",
  rotate: "M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5",
  bookmark: "M7 4h10v16l-5-4-5 4V4Z",
  share: "M8 12a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm13-6a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm0 12a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM7.7 10.8l8.6-3.6M7.7 13.2l8.6 3.6",
  move: "M12 3v18M3 12h18M12 3 9 6m3-3 3 3m-3 15-3-3m3 3 3-3M3 12l3-3m-3 3 3 3m15-3-3-3m3 3-3 3",
  check: "m5 12 5 5 9-10",
  alert: "M12 8v5m0 3h.01M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z",
  info: "M12 11v6m0-9h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  trash: "M5 7h14M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3",
  edit: "M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4",
  undo: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  redo: "m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3",
  "zoom-in": "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 4 4M11 8v6M8 11h6",
  "zoom-out": "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 4 4M8 11h6",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  "eye-off": "M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2",
  box: "M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Zm0 0L12 12m0 0 9-4.5M12 12v9",
  truck: "M3 6h11v10H3V6Zm11 4h4l3 3v3h-7v-6ZM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
  grid: "M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z",
  tag: "M3 12V4h8l10 10-8 8L3 12Zm5-4h.01",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0m1-9a3 3 0 1 0 0-6m2 15a6 6 0 0 0-3-5.2",
  shield: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z",
  file: "M6 3h8l4 4v14H6V3Zm8 0v4h4M9 13h6m-6 4h6",
  chart: "M4 20V10m6 10V4m6 16v-7m4 7H2",
  card: "M3 6h18v12H3V6Zm0 4h18M7 15h4",
  refund: "M4 8h11a5 5 0 0 1 0 10H8M4 8l4-4M4 8l4 4",
  message: "M4 5h16v11H8l-4 4V5Z",
  star: "m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.3 7.3 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.3 7.3 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.3 7.3 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.3 7.3 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z",
  external: "M14 4h6v6m0-6-9 9M18 14v6H4V6h6",
  copy: "M8 8h12v12H8V8Zm-4 8V4h12",
  upload: "M12 16V4m0 0-5 5m5-5 5 5M4 20h16",
  instagram: "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Zm5 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm5.5-9.5h.01",
  telegram: "m21 4-18 7 6 2m12-9-4 16-8-7m12-9L9 13v6l3-3",
  lock: "M6 11h12v10H6V11Zm2 0V7a4 4 0 0 1 8 0v4",
};

export function Icon({ name, className = "size-5", flip = false, ...rest }: { name: Name; className?: string; flip?: boolean } & SVGProps<SVGSVGElement>) {
  const filled = name === "heart-fill";
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className} ${flip ? "-scale-x-100" : ""} shrink-0`}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={paths[name]} />
    </svg>
  );
}
