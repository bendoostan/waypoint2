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
    if (closure.recommended_card.delivered_points + withCard * 12 >= gap) {
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

/** Stable trip name for tie-breaking — every leg's route, in order. */
function tripName(strategy: Strategy): string {
  return strategy.legs.map((l) => l.route_name).join(" + ");
}

export function rankStrategies(strategies: Strategy[]): Strategy[] {
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
