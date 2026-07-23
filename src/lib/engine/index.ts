// The engine entry point (PLAN.md §4). Pure: data in, PlanResult out.
// Every result is parsed against the zod contract before it leaves.
//
// A strategy now covers the WHOLE trip (1 or 2 legs) from one shared wallet.
// For a two-leg trip we enumerate trip-level options — a round_trip-unit route
// covering both directions, or a split of two one-way routes (same or different
// programs) — solve each option's shared-wallet allocation exactly, then rank.
import { closeGap } from "./gap";
import type { GapClosure } from "./gap";
import { effectiveWallet } from "./effective-wallet";
import { expandReachability } from "./reachability";
import { matchLegRoutes, matchRoundTripRoutes } from "./routes";
import type { RouteCandidate } from "./routes";
import { assignTier, assignTripTier, rankStrategies } from "./rank";
import { rationale } from "./rationale";
import { planResultSchema } from "./schema";
import type { LegPlan, PlanResult, ReachabilityTier, Strategy } from "./schema";
import { solveCandidate } from "./solve";
import type { SolveResult } from "./solve";
import { solveSplit } from "./trip";
import { buildTimeline } from "./timeline";
import type { EngineInput, ReferenceData, WalletCard } from "./types";

type LegResult = { plan: LegPlan; solved: SolveResult };

export function generatePlan(input: EngineInput): PlanResult {
  const { referenceData: ref, goal, now, legs } = input;
  if (legs.length < 1 || legs.length > 2) {
    throw new Error(
      `a trip must have 1 or 2 legs, got ${legs.length} (open-jaw is 2 legs)`
    );
  }
  const travelers = goal.num_travelers;

  const wallet = effectiveWallet(input.wallet, ref.currencies, ref.cards);
  const reach = expandReachability(
    wallet.entries,
    ref.transferPartners,
    ref.transferBonuses,
    ref.currencies,
    now
  );
  const names = new Map(ref.currencies.map((c) => [c.id, c.name]));
  const nameOf = (id: string) => names.get(id) ?? id;

  const makeLegPlan = (
    legIndex: 1 | 2,
    coversRoundTrip: boolean,
    candidate: RouteCandidate,
    solved: SolveResult,
    needed: number
  ): LegPlan => ({
    leg_index: legIndex,
    covers_round_trip: coversRoundTrip,
    route_id: candidate.route.id,
    route_name: candidate.route.name,
    program_currency_id: candidate.route.program_currency_id,
    program_currency_name: nameOf(candidate.route.program_currency_id),
    cabin: candidate.route.cabin,
    match_type: candidate.match_type,
    points_needed: needed,
    reachable_points: solved.reachable_points,
    gap: solved.gap,
    allocations: solved.allocations,
    taxes_fees_usd_est:
      candidate.route.taxes_fees_usd_est *
      (coversRoundTrip ? 2 : 1) *
      travelers,
    availability: candidate.availability,
  });

  const buildStrategy = (
    booking: Strategy["booking"],
    legResults: LegResult[]
  ): Strategy =>
    finalizeStrategy(booking, legResults, {
      ref,
      wallet,
      heldWallet: input.wallet,
      monthlySpend: input.monthlySpend,
      now,
      travelers,
    });

  const strategies: Strategy[] = [];

  const leg1 = legs[0]!;
  const leg2 = legs[1] ?? null;

  const leg1Routes = matchLegRoutes(ref.awardRoutes, leg1, input.availability);

  if (leg2) {
    // (a) round_trip-unit options: one route, both directions, one program.
    for (const c of matchRoundTripRoutes(
      ref.awardRoutes,
      leg1,
      leg2,
      input.availability
    )) {
      const needed = c.route.points_oneway * 2 * travelers;
      const solved = solveCandidate(
        needed,
        c.route.program_currency_id,
        reach,
        wallet.entries,
        ref.currencies
      );
      strategies.push(
        buildStrategy("round_trip_unit", [
          { plan: makeLegPlan(1, true, c, solved, needed), solved },
        ])
      );
    }

    // (b) split options: a one-way route for each leg, jointly solved.
    const leg2Routes = matchLegRoutes(
      ref.awardRoutes,
      leg2,
      input.availability
    );
    for (const r1 of leg1Routes) {
      for (const r2 of leg2Routes) {
        const n1 = r1.route.points_oneway * travelers;
        const n2 = r2.route.points_oneway * travelers;
        const split = solveSplit(
          n1,
          r1.route.program_currency_id,
          n2,
          r2.route.program_currency_id,
          reach,
          wallet.entries,
          ref.currencies
        );
        strategies.push(
          buildStrategy("one_way_each", [
            {
              plan: makeLegPlan(1, false, r1, split.leg1, n1),
              solved: split.leg1,
            },
            {
              plan: makeLegPlan(2, false, r2, split.leg2, n2),
              solved: split.leg2,
            },
          ])
        );
      }
    }
  } else {
    // single-leg (one-way) trip
    for (const r1 of leg1Routes) {
      const n1 = r1.route.points_oneway * travelers;
      const solved = solveCandidate(
        n1,
        r1.route.program_currency_id,
        reach,
        wallet.entries,
        ref.currencies
      );
      strategies.push(
        buildStrategy("one_way_each", [
          { plan: makeLegPlan(1, false, r1, solved, n1), solved },
        ])
      );
    }
  }

  return planResultSchema.parse({ strategies: rankStrategies(strategies) });
}

// Months to close one leg's gap given its tier and closure, mirroring the
// per-tier path the single-leg engine used.
function legMonths(tier: ReachabilityTier, closure: GapClosure): number | null {
  switch (tier) {
    case "bookable_now":
      return 0;
    case "reachable":
      return closure.months_held;
    case "needs_card":
      return closure.months_with_card;
    case "stretch":
      return closure.months_held ?? closure.months_with_card;
  }
}

function finalizeStrategy(
  booking: Strategy["booking"],
  legResults: LegResult[],
  ctx: {
    ref: ReferenceData;
    wallet: ReturnType<typeof effectiveWallet>;
    heldWallet: WalletCard[];
    monthlySpend: Record<string, number>;
    now: Date;
    travelers: number;
  }
): Strategy {
  const { ref, wallet, heldWallet, monthlySpend, now } = ctx;
  const legs = legResults.map((r) => r.plan);

  const pointsNeeded = legs.reduce((s, l) => s + l.points_needed, 0);
  const reachablePoints = legs.reduce((s, l) => s + l.reachable_points, 0);
  const gap = legs.reduce((s, l) => s + l.gap, 0);
  const taxes = legs.reduce((s, l) => s + l.taxes_fees_usd_est, 0);
  const totalCost =
    Math.round(
      legResults.reduce((s, r) => s + r.solved.total_opportunity_cost_usd, 0) *
        100
    ) / 100;
  const transferHops = legResults.reduce(
    (s, r) => s + r.solved.transfer_hops,
    0
  );
  const maxHours = legResults.reduce(
    (m, r) => Math.max(m, r.solved.max_transfer_hours),
    0
  );

  // Gap closure runs per leg, targeting that leg's program with that leg's gap.
  const perLeg = legResults.map((r) => {
    const closure = closeGap({
      gap: r.solved.gap,
      destCurrencyId: r.plan.program_currency_id,
      entries: wallet.entries,
      wallet: heldWallet,
      currencies: ref.currencies,
      cards: ref.cards,
      earningRates: ref.earningRates,
      welcomeOffers: ref.welcomeOffers,
      transferPartners: ref.transferPartners,
      transferBonuses: ref.transferBonuses,
      monthlySpend,
      now,
    });
    return { r, closure, tier: assignTier(r.solved.gap, closure) };
  });

  const tier = assignTripTier(perLeg.map((p) => p.tier));

  // The tier-driving leg: among gapped legs, the one whose tier matches the
  // trip tier (largest gap breaks ties); leg 1 when nothing is short.
  const gapped = perLeg.filter((p) => p.r.solved.gap > 0);
  const driving =
    gapped
      .filter((p) => p.tier === tier)
      .sort((a, b) => b.r.solved.gap - a.r.solved.gap)[0] ?? perLeg[0]!;

  const showCard =
    gap > 0 && (tier === "needs_card" || tier === "stretch")
      ? driving.closure.recommended_card
      : null;

  const earnVelocity = {
    held: driving.closure.earn_velocity.held,
    with_recommended:
      showCard !== null ? driving.closure.earn_velocity.with_recommended : null,
  };

  // The trip books only when EVERY leg is covered, so months_to_goal is the
  // slowest gapped leg (null if any gapped leg has no datable path).
  let monthsToGoal: number | null;
  if (tier === "bookable_now") {
    monthsToGoal = 0;
  } else {
    monthsToGoal = 0;
    for (const p of gapped) {
      const m = legMonths(p.tier, p.closure);
      if (m === null) {
        monthsToGoal = null;
        break;
      }
      monthsToGoal = Math.max(monthsToGoal, m);
    }
  }

  const base = {
    booking,
    legs,
    travelers: ctx.travelers,
    points_needed: pointsNeeded,
    reachable_points: reachablePoints,
    gap,
    taxes_fees_usd_est: taxes,
    total_opportunity_cost_usd: totalCost,
    transfer_hops: transferHops,
    max_transfer_hours: maxHours,
    tier,
    recommended_card: showCard,
    earn_velocity: earnVelocity,
    months_to_goal: monthsToGoal,
    unlock_opportunities: wallet.unlockOpportunities,
  };

  return {
    ...base,
    timeline: buildTimeline({
      now,
      needed: pointsNeeded,
      reachable: reachablePoints,
      gap,
      legs,
      closure: driving.closure,
      recommended: showCard,
    }),
    rationale: rationale(base),
  };
}

export { effectiveWallet } from "./effective-wallet";
export { expandReachability } from "./reachability";
export { matchLegRoutes, matchRoundTripRoutes } from "./routes";
export { solveCandidate } from "./solve";
export { solveSplit } from "./trip";
export { closeGap } from "./gap";
export { assignTier, assignTripTier, rankStrategies } from "./rank";
export { buildTimeline } from "./timeline";
export { rationale } from "./rationale";
export { planResultSchema, strategySchema } from "./schema";
export type { PlanResult, Strategy, LegPlan } from "./schema";
export type { EngineInput, EngineLeg } from "./types";
