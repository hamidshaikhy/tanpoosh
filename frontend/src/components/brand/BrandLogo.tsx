import { MONOGRAM, WORDMARK } from "./paths";

type Variant = "dark-wordmark" | "light-wordmark" | "monogram" | "monogram-light";

/**
 * Approved TANPOOSH logo system, vector-traced from references/tanpoosh-logo.png.
 * - dark-wordmark: light/ivory backgrounds (store header, footer, receipts)
 * - light-wordmark: dark backgrounds (studio header)
 * - monogram: compact contexts only
 * Decorative by default (aria-hidden); the surrounding link supplies the accessible name.
 */
export function BrandLogo({ variant = "dark-wordmark", className = "", title }: { variant?: Variant; className?: string; title?: string }) {
  const isMono = variant.startsWith("monogram");
  const shape = isMono ? MONOGRAM : WORDMARK;
  const fill = variant === "light-wordmark" || variant === "monogram-light" ? "var(--night-ink)" : "var(--ink)";
  return (
    <svg
      viewBox={`0 0 ${shape.width} ${shape.height}`}
      className={className}
      fill={fill}
      fillRule="evenodd"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
    >
      <path d={shape.d} />
    </svg>
  );
}
