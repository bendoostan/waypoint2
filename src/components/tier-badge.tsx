import { cn } from "@/lib/utils";

// The five reachability states, styled per DESIGN.md — calm at every tier,
// never red. "not_planned" is a real state (no plan has been generated yet);
// we never guess a tier before the engine has run.
export type TierKey =
  "bookable_now" | "reachable" | "needs_card" | "stretch" | "not_planned";

const TIERS: Record<
  TierKey,
  { label: string; className: string; dot: string | null }
> = {
  bookable_now: {
    label: "Bookable now",
    className: "bg-wp-success-bg text-wp-success",
    dot: "bg-wp-success",
  },
  reachable: {
    label: "Reachable",
    className: "bg-wp-surface-2 text-wp-ink",
    dot: "bg-wp-ink",
  },
  needs_card: {
    label: "Needs a card",
    // champagne tint via color-mix; text uses the contrast-safe variant
    className: "text-wp-accent-text",
    dot: "bg-wp-accent",
  },
  stretch: {
    label: "A stretch",
    className: "bg-wp-track text-wp-muted",
    dot: "bg-wp-muted-2",
  },
  not_planned: {
    label: "Not planned",
    className: "bg-wp-track text-wp-muted",
    dot: null,
  },
};

export function TierBadge({
  tier,
  className,
}: {
  tier: TierKey;
  className?: string;
}) {
  const t = TIERS[tier];
  const isNeedsCard = tier === "needs_card";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
        t.className,
        className
      )}
      style={
        isNeedsCard
          ? {
              backgroundColor:
                "color-mix(in oklab, var(--wp-accent), #fff 84%)",
            }
          : undefined
      }
    >
      {t.dot ? <span className={cn("size-[7px] rounded-full", t.dot)} /> : null}
      {t.label}
    </span>
  );
}

/** Normalize an engine tier string (or absent plan) to a badge key. */
export function tierFromPlan(tier: string | null | undefined): TierKey {
  switch (tier) {
    case "bookable_now":
    case "reachable":
    case "needs_card":
    case "stretch":
      return tier;
    default:
      return "not_planned";
  }
}
