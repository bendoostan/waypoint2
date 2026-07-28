// Pure derivations for the Redeem section — kept out of page.tsx so the
// "does a zero-reachable leg still get a gap and a future block" logic is
// unit-testable without rendering React.
import type { Allocation, Strategy } from "@/lib/engine/schema";

export type LegRedeemView = {
  seq: 1 | 2;
  allocations: Allocation[];
  gap: number;
};

// One entry per strategy.legs, always — a leg with zero allocations
// (reachable_points: 0) still gets an entry with an empty array, never
// silently dropped the way grouping-by-allocation used to drop it.
export function legRedeemViews(strategy: Strategy): LegRedeemView[] {
  const allocationsByLeg = new Map<number, Allocation[]>();
  for (const a of strategy.allocations) {
    allocationsByLeg.set(a.leg_seq, [
      ...(allocationsByLeg.get(a.leg_seq) ?? []),
      a,
    ]);
  }
  return strategy.legs.map((leg) => ({
    seq: leg.seq,
    allocations: allocationsByLeg.get(leg.seq) ?? [],
    gap: leg.gap,
  }));
}

export type RedeemFutureSources = {
  /** with_recommended when a card is being recommended, else held. */
  velocity: number | null;
  /** True when there's a welcome bonus or nonzero earn velocity to show. */
  hasFutureSource: boolean;
};

// recommended_card and earn_velocity are trip-level fields with no leg_seq —
// the engine picks one "driving" leg internally to compute them against but
// never exposes which (see index.ts assembleCore), so attributing either to
// a specific leg would be invented, not derived. They close gap_total once,
// at trip level.
export function redeemFutureSources(strategy: Strategy): RedeemFutureSources {
  const velocity =
    strategy.earn_velocity.with_recommended ?? strategy.earn_velocity.held;
  return {
    velocity,
    hasFutureSource:
      strategy.recommended_card !== null || (velocity !== null && velocity > 0),
  };
}
