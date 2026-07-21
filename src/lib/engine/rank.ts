// Stage 6 (PLAN.md §4.6): reachability tiers and deterministic ranking.
import type { ReachabilityTier, Strategy } from "./schema";
import type { GapClosure } from "./gap";

const TIER_ORDER: Record<ReachabilityTier, number> = {
  bookable_now: 0,
  reachable: 1,
  needs_card: 2,
  stretch: 3,
};

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
    return a.route_name.localeCompare(b.route_name);
  });
}
