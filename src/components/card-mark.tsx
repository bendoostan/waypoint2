import { cn } from "@/lib/utils";

// Brand color + wordmark + IATA — NEVER a logo or card art (DESIGN.md). A held
// card renders as a small brand-colored tile with the issuer wordmark. A
// program with no brand color falls back to a dashed placeholder with the name
// and IATA. `logo_url` in the schema stays unused until Design signs off.

/** Relative luminance of a #rrggbb color, for choosing readable text. */
function isLight(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  // perceptual luminance
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
}

export function CardMark({
  brandColor,
  wordmark,
  iata,
  size = "md",
  className,
}: {
  brandColor: string | null;
  /** issuer or program wordmark, e.g. "chase", "AMEX", "United" */
  wordmark: string;
  /** program code shown on the dashed placeholder, e.g. "MileagePlus · UA" */
  iata?: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const dims =
    size === "sm"
      ? "w-[52px] h-[34px] rounded-md"
      : "w-[62px] h-[42px] rounded-lg";

  if (!brandColor) {
    // No brand color: dashed placeholder, ink text — a clean stand-in.
    return (
      <div
        className={cn(
          "border-wp-border-dashed bg-wp-track flex flex-none flex-col justify-between border border-dashed p-2",
          dims,
          className
        )}
      >
        <span className="text-wp-muted-2 text-[9px] font-semibold tracking-wider uppercase">
          No art
        </span>
        <span className="font-display text-wp-ink text-[11px] leading-none">
          {wordmark}
          {iata ? (
            <span className="text-wp-muted ml-1 text-[9px]">{iata}</span>
          ) : null}
        </span>
      </div>
    );
  }

  const light = isLight(brandColor);
  const text = light ? "#20263B" : "rgba(247,244,237,0.9)";
  return (
    <div
      className={cn(
        "flex flex-none items-center justify-center overflow-hidden",
        dims,
        className
      )}
      style={{
        background: `linear-gradient(135deg, ${brandColor}, color-mix(in oklab, ${brandColor}, #000 32%))`,
      }}
    >
      <span className="font-display text-[13px] italic" style={{ color: text }}>
        {wordmark}
      </span>
    </div>
  );
}
