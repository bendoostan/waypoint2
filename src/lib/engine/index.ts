// The engine entry point (PLAN.md §4). Pure: data in, PlanResult out.
// Every result is parsed against the zod contract before it leaves.
//
// A strategy covers the WHOLE trip (1 or 2 legs) from one shared wallet. For a
// two-leg trip we enumerate trip candidates — a round_trip route that supplies
// BOTH legs on one program, or a split of two one-way routes (same or different
// programs) — solve each candidate's shared-wallet allocation exactly, then
// rank. After the main solve we compute the one-cabin-down teaser (Task 4).
import { closeGap } from "./gap";
import type { GapClosure } from "./gap";
import { effectiveWallet } from "./effective-wallet";
import type { EffectiveWallet } from "./effective-wallet";
import { expandReachability } from "./reachability";
import type { Reachability } from "./reachability";
import { matchLegRoutes, matchRoundTripRoutes } from "./routes";
import type { RouteCandidate } from "./routes";
import { assignTier, assignTripTier, rankStrategies } from "./rank";
import { rationale } from "./rationale";
import { planResultSchema } from "./schema";
import type {
  Allocation,
  BaseAllocation,
  CabinAlternative,
  LegPlan,
  PlanResult,
  ReachabilityTier,
  Strategy,
} from "./schema";
import { solveCandidate } from "./solve";
import { solveSplit } from "./trip";
import { buildTimeline } from "./timeline";
import type { LegProjection } from "./timeline";
import type {
  AvailabilityRow,
  EngineInput,
  EngineLeg,
  ReferenceData,
  WalletCard,
} from "./types";

// A concrete trip option: the leg plans plus the shared-wallet allocations
// (already tagged with leg_seq) that back their numbers.
type TripCandidate = { legPlans: LegPlan[]; allocations: Allocation[] };

type LegAssessment = {
  plan: LegPlan;
  closure: GapClosure;
  tier: ReachabilityTier;
};

// A strategy minus the presentational timeline/rationale. Enough to rank, and
// all the cabin-alternative teaser reads — so the alternative never computes a
// timeline or rationale (Task 4).
type StrategyCore = Omit<Strategy, "timeline" | "rationale"> & {
  perLeg: LegAssessment[];
};

type Ctx = {
  ref: ReferenceData;
  reach: Reachability;
  wallet: EffectiveWallet;
  heldWallet: WalletCard[];
  monthlySpend: Record<string, number>;
  now: Date;
  travelers: number;
  availability: AvailabilityRow[];
  nameOf: (id: string) => string;
};

// Curated catalogue keeps per-leg matches tiny; this cap only guards a
// pathological catalogue (many routes on one O/D/cabin) from an O(n²) product,
// preferring the top-ranked routes (airport match first) over silent truncation.
const MAX_LEG_ROUTES = 12;

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function cents(x: number): number {
  return Math.round(x * 100) / 100;
}

function tag(allocations: BaseAllocation[], seq: 1 | 2): Allocation[] {
  return allocations.map((a) => ({ ...a, leg_seq: seq }));
}

function makeLegPlan(
  seq: 1 | 2,
  candidate: RouteCandidate,
  pointsNeeded: number,
  reachable: number,
  gap: number,
  ctx: Ctx
): LegPlan {
  return {
    seq,
    route_id: candidate.route.id,
    route_name: candidate.route.name,
    program_currency_id: candidate.route.program_currency_id,
    program_currency_name: ctx.nameOf(candidate.route.program_currency_id),
    cabin: candidate.route.cabin,
    match_type: candidate.match_type,
    pricing_mode:
      candidate.route.pricing_mode === "dynamic" ? "dynamic" : "fixed",
    points_needed: pointsNeeded,
    reachable_points: reachable,
    gap,
    taxes_fees_usd_est: candidate.route.taxes_fees_usd_est * ctx.travelers,
    availability: candidate.availability,
  };
}

/** All trip candidates for an itinerary (1 or 2 legs). */
function buildCandidates(legs: EngineLeg[], ctx: Ctx): TripCandidate[] {
  const routes = ctx.ref.awardRoutes;
  const currencies = ctx.ref.currencies;
  const leg1 = legs[0]!;
  const leg2 = legs[1] ?? null;
  const out: TripCandidate[] = [];

  const leg1Routes = matchLegRoutes(routes, leg1, ctx.availability).slice(
    0,
    MAX_LEG_ROUTES
  );

  if (leg2 === null) {
    // One-way goal: one_way routes only (matchLegRoutes filters booking_unit).
    for (const r of leg1Routes) {
      const n = r.route.points_oneway * ctx.travelers;
      const solved = solveCandidate(
        n,
        r.route.program_currency_id,
        ctx.reach,
        ctx.wallet.entries,
        currencies
      );
      out.push({
        legPlans: [
          makeLegPlan(1, r, n, solved.reachable_points, solved.gap, ctx),
        ],
        allocations: tag(solved.allocations, 1),
      });
    }
    return out;
  }

  // (a) round_trip-unit: one route, both directions, one program. It supplies
  // BOTH legs as one atomic booking, so we solve the combined need once and
  // split the reachable across the legs (leg 1 first); the single booking's
  // allocations are attributed to leg 1.
  for (const R of matchRoundTripRoutes(routes, leg1, leg2, ctx.availability)) {
    const nLeg = R.route.points_oneway * ctx.travelers;
    const combined = solveCandidate(
      nLeg * 2,
      R.route.program_currency_id,
      ctx.reach,
      ctx.wallet.entries,
      currencies
    );
    const leg1Reach = Math.min(nLeg, combined.reachable_points);
    const leg2Reach = Math.min(nLeg, combined.reachable_points - leg1Reach);
    out.push({
      legPlans: [
        makeLegPlan(1, R, nLeg, leg1Reach, nLeg - leg1Reach, ctx),
        makeLegPlan(2, R, nLeg, leg2Reach, nLeg - leg2Reach, ctx),
      ],
      allocations: tag(combined.allocations, 1),
    });
  }

  // (b) split: a one-way route per leg, jointly solved on the shared wallet.
  const leg2Routes = matchLegRoutes(routes, leg2, ctx.availability).slice(
    0,
    MAX_LEG_ROUTES
  );
  for (const r1 of leg1Routes) {
    for (const r2 of leg2Routes) {
      const n1 = r1.route.points_oneway * ctx.travelers;
      const n2 = r2.route.points_oneway * ctx.travelers;
      const split = solveSplit(
        n1,
        r1.route.program_currency_id,
        n2,
        r2.route.program_currency_id,
        ctx.reach,
        ctx.wallet.entries,
        currencies
      );
      out.push({
        legPlans: [
          makeLegPlan(
            1,
            r1,
            n1,
            split.leg1.reachable_points,
            split.leg1.gap,
            ctx
          ),
          makeLegPlan(
            2,
            r2,
            n2,
            split.leg2.reachable_points,
            split.leg2.gap,
            ctx
          ),
        ],
        allocations: [
          ...tag(split.leg1.allocations, 1),
          ...tag(split.leg2.allocations, 2),
        ],
      });
    }
  }

  return out;
}

/** Solve/gap/tier a trip candidate into a rankable core (no timeline). */
function assembleCore(candidate: TripCandidate, ctx: Ctx): StrategyCore {
  const legs = candidate.legPlans;
  const allocations = candidate.allocations;

  const pointsNeededTotal = legs.reduce((s, l) => s + l.points_needed, 0);
  const gapTotal = legs.reduce((s, l) => s + l.gap, 0);
  const taxesTotal = legs.reduce((s, l) => s + l.taxes_fees_usd_est, 0);
  const totalCost = cents(
    allocations.reduce((s, a) => s + a.opportunity_cost_usd, 0)
  );
  const transferHops = allocations.reduce((s, a) => s + a.path.length, 0);
  const maxHours = allocations.reduce(
    (m, a) => Math.max(m, ...a.path.map((p) => p.transfer_hours_est), 0),
    0
  );

  // Gap closure runs per leg, targeting that leg's program with that leg's gap.
  const perLeg: LegAssessment[] = legs.map((plan) => {
    const closure = closeGap({
      gap: plan.gap,
      destCurrencyId: plan.program_currency_id,
      entries: ctx.wallet.entries,
      wallet: ctx.heldWallet,
      currencies: ctx.ref.currencies,
      cards: ctx.ref.cards,
      earningRates: ctx.ref.earningRates,
      welcomeOffers: ctx.ref.welcomeOffers,
      transferPartners: ctx.ref.transferPartners,
      transferBonuses: ctx.ref.transferBonuses,
      monthlySpend: ctx.monthlySpend,
      now: ctx.now,
    });
    return { plan, closure, tier: assignTier(plan.gap, closure) };
  });

  // Tier is the worse of the legs (assignTripTier). The tier-driving leg —
  // among gapped legs, the one whose tier matches the trip's (largest gap
  // breaks ties) — owns the card CTA and velocity; leg 1 when nothing is short.
  const tier = assignTripTier(perLeg.map((p) => p.tier));
  const gapped = perLeg.filter((p) => p.plan.gap > 0);
  const driving =
    gapped
      .filter((p) => p.tier === tier)
      .sort((a, b) => b.plan.gap - a.plan.gap)[0] ?? perLeg[0]!;

  const showCard =
    gapTotal > 0 && (tier === "needs_card" || tier === "stretch")
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

  return {
    legs,
    allocations,
    travelers: ctx.travelers,
    points_needed_total: pointsNeededTotal,
    gap_total: gapTotal,
    taxes_fees_usd_est_total: taxesTotal,
    total_opportunity_cost_usd: totalCost,
    transfer_hops: transferHops,
    max_transfer_hours: maxHours,
    tier,
    recommended_card: showCard,
    earn_velocity: earnVelocity,
    months_to_goal: monthsToGoal,
    unlock_opportunities: ctx.wallet.unlockOpportunities,
    perLeg,
  };
}

// Months to close one leg's gap given its tier and closure.
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

// A leg's timeline projection: velocity and welcome bonus consistent with the
// month legMonths reports for it, so the timeline books when months_to_goal says.
function legProjection(a: LegAssessment): LegProjection {
  const { plan, closure, tier } = a;
  const base = {
    seq: plan.seq,
    reachable: plan.reachable_points,
    needed: plan.points_needed,
  };
  const none = {
    ...base,
    velocity: 0,
    bonus_month: null,
    bonus_delivered: 0,
    bonus_event: null,
  };
  if (plan.gap <= 0) return none;

  const held = closure.earn_velocity.held ?? 0;
  const withRec = closure.earn_velocity.with_recommended ?? 0;
  const card = closure.recommended_card;
  const heldOnly = { ...none, velocity: held };
  const cardPath = {
    ...base,
    velocity: withRec,
    bonus_month: closure.bonus_month,
    bonus_delivered: card?.delivered_points ?? 0,
    bonus_event: card
      ? `${card.issuer} ${card.card_name} welcome bonus posts (~${fmt(
          card.delivered_points
        )} points after $${fmt(card.min_spend_usd)} spend)`
      : null,
  };

  switch (tier) {
    case "reachable":
      return heldOnly;
    case "needs_card":
      return card ? cardPath : heldOnly;
    case "stretch":
      if (closure.months_held !== null) return heldOnly;
      return card ? cardPath : none;
    default:
      return none;
  }
}

function finishStrategy(core: StrategyCore, ctx: Ctx): Strategy {
  const { perLeg, ...rest } = core;
  const timeline = buildTimeline({
    now: ctx.now,
    legs: perLeg.map(legProjection),
    legPlans: core.legs,
    allocations: core.allocations,
    gapTotal: core.gap_total,
  });
  return { ...rest, timeline, rationale: rationale(rest) };
}

// --- cabin alternative (Task 4) --------------------------------------------

// first -> business -> premium_economy -> economy; null once at the floor.
function lowerCabin(cabin: string): string | null {
  switch (cabin) {
    case "first":
      return "business";
    case "business":
      return "premium_economy";
    case "premium_economy":
      return "economy";
    default:
      return null;
  }
}

const CABIN_RANK: Record<string, number> = {
  economy: 0,
  premium_economy: 1,
  business: 2,
  first: 3,
};

/** The headline cabin of a (possibly mixed) itinerary — its most premium leg. */
function topCabin(legs: EngineLeg[]): string {
  return legs
    .map((l) => l.cabin)
    .sort((a, b) => (CABIN_RANK[b] ?? 0) - (CABIN_RANK[a] ?? 0))[0]!;
}

function buildCabinAlternative(
  legs: EngineLeg[],
  ctx: Ctx
): CabinAlternative | null {
  // Step every leg down one rung; economy legs stay economy. No change means
  // the trip is already economy — there is no lower cabin to offer.
  const stepped = legs.map((l) => {
    const lower = lowerCabin(l.cabin);
    return lower ? { ...l, cabin: lower } : l;
  });
  if (stepped.every((l, i) => l.cabin === legs[i]!.cabin)) return null;

  const candidates = buildCandidates(stepped, ctx);
  if (candidates.length === 0) return null; // no route at the lower cabin

  const best = rankStrategies(candidates.map((c) => assembleCore(c, ctx)))[0]!;
  return {
    cabin: topCabin(stepped),
    points_needed_total: best.points_needed_total,
    tier: best.tier,
    months_to_goal: best.months_to_goal,
    // bookable_now / reachable need nothing new; needs_card / stretch do.
    requires_card: best.tier === "needs_card" || best.tier === "stretch",
  };
}

export function generatePlan(input: EngineInput): PlanResult {
  const { referenceData: ref, goal, now } = input;
  const legs = goal.legs;
  if (legs.length < 1 || legs.length > 2) {
    throw new Error(
      `a trip must have 1 or 2 legs, got ${legs.length} (open-jaw is 2 legs)`
    );
  }

  const wallet = effectiveWallet(input.wallet, ref.currencies, ref.cards);
  const reach = expandReachability(
    wallet.entries,
    ref.transferPartners,
    ref.transferBonuses,
    ref.currencies,
    now
  );
  const names = new Map(ref.currencies.map((c) => [c.id, c.name]));
  const ctx: Ctx = {
    ref,
    reach,
    wallet,
    heldWallet: input.wallet,
    monthlySpend: input.monthlySpend,
    now,
    travelers: goal.num_travelers,
    availability: input.availability,
    nameOf: (id) => names.get(id) ?? id,
  };

  const cores = buildCandidates(legs, ctx).map((c) => assembleCore(c, ctx));
  const strategies = rankStrategies(cores).map((core) =>
    finishStrategy(core, ctx)
  );
  const cabin_alternative = buildCabinAlternative(legs, ctx);

  return planResultSchema.parse({ strategies, cabin_alternative });
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
export type { PlanResult, Strategy, LegPlan, CabinAlternative } from "./schema";
export type { EngineInput, EngineLeg, EngineGoal } from "./types";
