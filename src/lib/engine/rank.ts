// Stage 6 (PLAN.md §4.6): reachability tiers and deterministic ranking.
// Tiers describe the WHOLE trip now: a trip is bookable_now only if EVERY leg
// is covered; otherwise the worst (most severe) leg drives the tier.
import type { ReachabilityTier, Strategy } from "./schema";
import type { GapClosure } from "./gap";

const TIER_ORDER: Record<ReachabilityTier, number> = {
  bookable_now: 0,
  reachable: 1,
  needs_card: 2,
  stretch: 3,
};

/** Per-leg (single-destination) tier from that leg's gap and gap closure. */
export function assignTier(gap: number, closure: GapClosure): ReachabilityTier {
  if (gap <= 0) return "bookable_now";

  const held = closure.earn_velocity.held;
  if (held !== null && held > 0 && Math.ceil(gap / held) <= 12) {
    return "reachable";
  }

  if (closure.recommended_card !== null) {
    const withCard = closure.earn_velocity.with_recommended ?? 0;
    // delivered_points (the welcome bonus) and unlock_points_this_leg (an
    // already-held balance the card releases) are both immediate-or-soon
    // sources toward THIS leg's own gap — unlock_points_this_leg is already
    // leg-attributed by the joint re-solve in gap.ts, never the trip-wide
    // total, so a two-leg trip can't double-credit one balance to both legs.
    const immediate =
      closure.recommended_card.delivered_points +
      closure.unlock_points_this_leg;
    if (immediate + withCard * 12 >= gap) {
      return "needs_card";
    }
  }

  return "stretch";
}

/**
 * The trip tier is the worst of its legs': bookable_now requires every leg
 * covered; any shortfall pushes the whole trip to the hardest leg's tier.
 */
export function assignTripTier(legTiers: ReachabilityTier[]): ReachabilityTier {
  let worst: ReachabilityTier = "bookable_now";
  for (const tier of legTiers) {
    if (TIER_ORDER[tier] > TIER_ORDER[worst]) worst = tier;
  }
  return worst;
}

/** The fields ranking needs — satisfied by a full Strategy or a core. */
export type Rankable = Pick<
  Strategy,
  "tier" | "total_opportunity_cost_usd" | "transfer_hops" | "max_transfer_hours"
> & { legs: { route_name: string }[] };

/** Stable trip name for tie-breaking — every leg's route, in order. */
function tripName(strategy: Rankable): string {
  return strategy.legs.map((l) => l.route_name).join(" + ");
}

export function rankStrategies<T extends Rankable>(strategies: T[]): T[] {
  return [...strategies].sort((a, b) => {
    const tier = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
    if (tier !== 0) return tier;
    if (a.total_opportunity_cost_usd !== b.total_opportunity_cost_usd) {
      return a.total_opportunity_cost_usd - b.total_opportunity_cost_usd;
    }
    if (a.transfer_hops !== b.transfer_hops) {
      return a.transfer_hops - b.transfer_hops;
    }
    if (a.max_transfer_hours !== b.max_transfer_hours) {
      return a.max_transfer_hours - b.max_transfer_hours;
    }
    return tripName(a).localeCompare(tripName(b));
  });
}
