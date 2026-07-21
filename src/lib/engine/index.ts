// The engine entry point (PLAN.md §4). Pure: data in, PlanResult out.
// Every result is parsed against the zod contract before it leaves.
import { closeGap } from "./gap";
import { effectiveWallet } from "./effective-wallet";
import { expandReachability } from "./reachability";
import { matchRoutes } from "./routes";
import { assignTier, rankStrategies } from "./rank";
import { rationale } from "./rationale";
import { planResultSchema } from "./schema";
import type { PlanResult, Strategy } from "./schema";
import { solveCandidate } from "./solve";
import { buildTimeline } from "./timeline";
import type { EngineInput } from "./types";

export function generatePlan(input: EngineInput): PlanResult {
  const { referenceData: ref, goal, now } = input;

  const wallet = effectiveWallet(input.wallet, ref.currencies, ref.cards);
  const reach = expandReachability(
    wallet.entries,
    ref.transferPartners,
    ref.transferBonuses,
    ref.currencies,
    now
  );
  const candidates = matchRoutes(ref.awardRoutes, goal, input.availability);

  const currencyName = new Map(ref.currencies.map((c) => [c.id, c.name]));

  const strategies: Strategy[] = candidates.map((candidate) => {
    const route = candidate.route;
    const needed = route.points_oneway * input.legs * goal.num_travelers;

    const solved = solveCandidate(
      needed,
      route.program_currency_id,
      reach,
      wallet.entries,
      ref.currencies
    );

    const closure = closeGap({
      gap: solved.gap,
      destCurrencyId: route.program_currency_id,
      entries: wallet.entries,
      wallet: input.wallet,
      currencies: ref.currencies,
      cards: ref.cards,
      earningRates: ref.earningRates,
      welcomeOffers: ref.welcomeOffers,
      transferPartners: ref.transferPartners,
      transferBonuses: ref.transferBonuses,
      monthlySpend: input.monthlySpend,
      now,
    });

    const tier = assignTier(solved.gap, closure);

    // The card recommendation is the gap-closing move: only surface it when
    // the tier actually calls for a new card. months_to_goal follows the
    // path the tier describes.
    const showCard =
      solved.gap > 0 && (tier === "needs_card" || tier === "stretch")
        ? closure.recommended_card
        : null;
    const monthsToGoal =
      tier === "bookable_now"
        ? 0
        : tier === "reachable"
          ? closure.months_held
          : tier === "needs_card"
            ? closure.months_with_card
            : (closure.months_held ?? closure.months_with_card);
    const displayClosure = {
      ...closure,
      recommended_card: showCard,
      earn_velocity: {
        held: closure.earn_velocity.held,
        with_recommended:
          showCard !== null ? closure.earn_velocity.with_recommended : null,
      },
    };

    const base = {
      route_id: route.id,
      route_name: route.name,
      program_currency_id: route.program_currency_id,
      program_currency_name:
        currencyName.get(route.program_currency_id) ??
        route.program_currency_id,
      cabin: route.cabin,
      match_type: candidate.match_type,
      legs: input.legs,
      travelers: goal.num_travelers,
      points_needed: needed,
      reachable_points: solved.reachable_points,
      gap: solved.gap,
      taxes_fees_usd_est:
        route.taxes_fees_usd_est * input.legs * goal.num_travelers,
      allocations: solved.allocations,
      total_opportunity_cost_usd: solved.total_opportunity_cost_usd,
      transfer_hops: solved.transfer_hops,
      max_transfer_hours: solved.max_transfer_hours,
      availability: candidate.availability,
      tier,
      recommended_card: showCard,
      earn_velocity: displayClosure.earn_velocity,
      months_to_goal: monthsToGoal,
      unlock_opportunities: wallet.unlockOpportunities,
    };

    return {
      ...base,
      timeline: buildTimeline({
        now,
        needed,
        reachable: solved.reachable_points,
        gap: solved.gap,
        allocations: solved.allocations,
        closure: displayClosure,
        routeName: route.name,
        recommended: base.recommended_card,
      }),
      rationale: rationale(base),
    };
  });

  return planResultSchema.parse({ strategies: rankStrategies(strategies) });
}

export { effectiveWallet } from "./effective-wallet";
export { expandReachability } from "./reachability";
export { matchRoutes } from "./routes";
export { solveCandidate } from "./solve";
export { closeGap } from "./gap";
export { assignTier, rankStrategies } from "./rank";
export { buildTimeline } from "./timeline";
export { rationale } from "./rationale";
export { planResultSchema, strategySchema } from "./schema";
export type { PlanResult, Strategy } from "./schema";
export type { EngineInput } from "./types";
