// The output contract. plans.strategies is jsonb — this schema is the only
// thing standing between the engine and silent shape drift, so every
// PlanResult must parse against it (generatePlan enforces this).
import { z } from "zod";

export const transferStepSchema = z.object({
  from_currency_id: z.string().uuid(),
  from_currency_name: z.string(),
  to_currency_id: z.string().uuid(),
  to_currency_name: z.string(),
  points_sent: z.number().int().nonnegative(),
  points_delivered: z.number().int().nonnegative(),
  bonus_pct: z.number().int().positive().nullable(),
  transfer_hours_est: z.number().int().nonnegative(),
});

// A currency's contribution to one destination program. Base shape (no leg
// tag) is what the solver works in; the engine tags each with leg_seq before
// it reaches the output, so a currency feeding both legs of an open-jaw
// becomes two entries (one per leg) in the trip-level allocations array.
export const baseAllocationSchema = z.object({
  currency_id: z.string().uuid(),
  currency_name: z.string(),
  points_used: z.number().int().nonnegative(),
  points_delivered: z.number().int().nonnegative(),
  opportunity_cost_usd: z.number().nonnegative(),
  // empty path = points already live in the target program
  path: z.array(transferStepSchema).max(2),
});

export const allocationSchema = baseAllocationSchema.extend({
  leg_seq: z.union([z.literal(1), z.literal(2)]),
});

export const cardRecommendationSchema = z.object({
  card_id: z.string().uuid(),
  card_name: z.string(),
  issuer: z.string(),
  offer_id: z.string().uuid(),
  offer_points: z.number().int().positive(),
  delivered_points: z.number().int().nonnegative(),
  min_spend_usd: z.number().int().nonnegative(),
  window_months: z.number().int().positive(),
  annual_fee: z.number().int().nonnegative(),
  score: z.number().nonnegative(),
});

export const unlockOpportunitySchema = z.object({
  currency_id: z.string().uuid(),
  currency_name: z.string(),
  balance: z.number().int().positive(),
  cashback_cpp: z.number().nonnegative(),
  transfer_cpp: z.number().nonnegative(),
  value_now_usd: z.number().nonnegative(),
  value_unlocked_usd: z.number().nonnegative(),
  delta_usd: z.number(),
  unlocking_card_ids: z.array(z.string().uuid()).min(1),
});

export const timelineEventSchema = z.object({
  type: z.enum(["welcome_bonus_posts", "transfer", "book"]),
  description: z.string(),
});

// One leg's projected points at a given month. A single trip-wide
// projected_balance is meaningless once the legs target different programs
// (one point total across two currencies), so balances are per leg.
export const projectedLegBalanceSchema = z.object({
  seq: z.union([z.literal(1), z.literal(2)]),
  projected_balance: z.number().int().nonnegative(),
});

export const timelineEntrySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  projected_balances: z.array(projectedLegBalanceSchema).min(1).max(2),
  /**
   * Progress toward the trip's TOTAL requirement, 0-100. The design's progress
   * meter consumes this: sum of each leg's covered-toward-need over
   * points_needed_total, so one leg's surplus can't mask another's shortfall.
   */
  projected_pct: z.number().int().min(0).max(100),
  events: z.array(timelineEventSchema),
});

export const reachabilityTierSchema = z.enum([
  "bookable_now",
  "reachable",
  "needs_card",
  "stretch",
]);

export const availabilitySchema = z.object({
  verified: z.boolean(),
  entries: z.array(
    z.object({
      date: z.string(),
      cabin: z.string(),
      seats_available: z.number().int().nonnegative(),
    })
  ),
});

/**
 * One directional flight within a trip. A round trip is two LegPlans that name
 * the SAME route_id/program (it supplies both legs of one atomic booking); an
 * open-jaw or two one-ways is two LegPlans with their own routes and programs.
 * A one-way goal is a single LegPlan. Allocations are NOT here — they live at
 * the trip level, tagged with leg_seq, because both legs draw one wallet.
 */
export const legPlanSchema = z.object({
  seq: z.union([z.literal(1), z.literal(2)]),
  route_id: z.string().uuid(),
  route_name: z.string(),
  program_currency_id: z.string().uuid(),
  program_currency_name: z.string(),
  cabin: z.string(),
  match_type: z.enum(["airport", "region"]),
  // Recorded from the route; V1 never branches on it (always 'fixed').
  pricing_mode: z.enum(["fixed", "dynamic"]),
  points_needed: z.number().int().positive(),
  reachable_points: z.number().int().nonnegative(),
  gap: z.number().int().nonnegative(),
  taxes_fees_usd_est: z.number().int().nonnegative(),
  availability: availabilitySchema,
});

export const strategySchema = z.object({
  legs: z.array(legPlanSchema).min(1).max(2),
  // One shared wallet feeds the whole trip; each allocation names the leg it
  // serves. A currency feeding both legs appears twice, once per leg_seq.
  allocations: z.array(allocationSchema),
  travelers: z.number().int().positive(),
  // Trip totals: sums over legs. reachable_points is deliberately per-leg only
  // (summing points across two programs is meaningless), so there is no
  // trip-level reachable total.
  points_needed_total: z.number().int().positive(),
  gap_total: z.number().int().nonnegative(),
  taxes_fees_usd_est_total: z.number().int().nonnegative(),
  total_opportunity_cost_usd: z.number().nonnegative(),
  transfer_hops: z.number().int().nonnegative(),
  max_transfer_hours: z.number().int().nonnegative(),
  tier: reachabilityTierSchema,
  recommended_card: cardRecommendationSchema.nullable(),
  earn_velocity: z.object({
    held: z.number().nonnegative().nullable(),
    with_recommended: z.number().nonnegative().nullable(),
  }),
  months_to_goal: z.number().int().nonnegative().nullable(),
  unlock_opportunities: z.array(unlockOpportunitySchema),
  timeline: z.array(timelineEntrySchema).max(24),
  rationale: z.string().min(1),
});

/**
 * The one-cabin-down teaser (Task 4), attached OUTSIDE the ranked strategies —
 * it answers a different question ("could you drop a cabin?") and must never
 * outrank the trip the person actually asked for. Just enough to render a
 * one-line teaser: no allocations, timeline, or transfer path. Null when the
 * goal is already economy or no route exists at the lower cabin.
 */
export const cabinAlternativeSchema = z.object({
  cabin: z.string(),
  points_needed_total: z.number().int().positive(),
  tier: reachabilityTierSchema,
  months_to_goal: z.number().int().nonnegative().nullable(),
  requires_card: z.boolean(),
});

export const planResultSchema = z.object({
  strategies: z.array(strategySchema),
  cabin_alternative: cabinAlternativeSchema.nullable(),
});

export type TransferStep = z.infer<typeof transferStepSchema>;
export type BaseAllocation = z.infer<typeof baseAllocationSchema>;
export type Allocation = z.infer<typeof allocationSchema>;
export type CardRecommendation = z.infer<typeof cardRecommendationSchema>;
export type UnlockOpportunity = z.infer<typeof unlockOpportunitySchema>;
export type TimelineEvent = z.infer<typeof timelineEventSchema>;
export type ProjectedLegBalance = z.infer<typeof projectedLegBalanceSchema>;
export type TimelineEntry = z.infer<typeof timelineEntrySchema>;
export type ReachabilityTier = z.infer<typeof reachabilityTierSchema>;
export type Availability = z.infer<typeof availabilitySchema>;
export type LegPlan = z.infer<typeof legPlanSchema>;
export type Strategy = z.infer<typeof strategySchema>;
export type CabinAlternative = z.infer<typeof cabinAlternativeSchema>;
export type PlanResult = z.infer<typeof planResultSchema>;
