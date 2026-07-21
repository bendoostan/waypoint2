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

export const allocationSchema = z.object({
  currency_id: z.string().uuid(),
  currency_name: z.string(),
  points_used: z.number().int().nonnegative(),
  points_delivered: z.number().int().nonnegative(),
  opportunity_cost_usd: z.number().nonnegative(),
  // empty path = points already live in the target program
  path: z.array(transferStepSchema).max(2),
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

export const timelineEntrySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  projected_balance: z.number().int().nonnegative(),
  events: z.array(timelineEventSchema),
});

export const reachabilityTierSchema = z.enum([
  "bookable_now",
  "reachable",
  "needs_card",
  "stretch",
]);

export const strategySchema = z.object({
  route_id: z.string().uuid(),
  route_name: z.string(),
  program_currency_id: z.string().uuid(),
  program_currency_name: z.string(),
  cabin: z.string(),
  match_type: z.enum(["airport", "region"]),
  legs: z.union([z.literal(1), z.literal(2)]),
  travelers: z.number().int().positive(),
  points_needed: z.number().int().positive(),
  reachable_points: z.number().int().nonnegative(),
  gap: z.number().int().nonnegative(),
  taxes_fees_usd_est: z.number().int().nonnegative(),
  allocations: z.array(allocationSchema),
  total_opportunity_cost_usd: z.number().nonnegative(),
  transfer_hops: z.number().int().nonnegative(),
  max_transfer_hours: z.number().int().nonnegative(),
  availability: z.object({
    verified: z.boolean(),
    entries: z.array(
      z.object({
        date: z.string(),
        cabin: z.string(),
        seats_available: z.number().int().nonnegative(),
      })
    ),
  }),
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

export const planResultSchema = z.object({
  strategies: z.array(strategySchema),
});

export type TransferStep = z.infer<typeof transferStepSchema>;
export type Allocation = z.infer<typeof allocationSchema>;
export type CardRecommendation = z.infer<typeof cardRecommendationSchema>;
export type UnlockOpportunity = z.infer<typeof unlockOpportunitySchema>;
export type TimelineEvent = z.infer<typeof timelineEventSchema>;
export type TimelineEntry = z.infer<typeof timelineEntrySchema>;
export type ReachabilityTier = z.infer<typeof reachabilityTierSchema>;
export type Strategy = z.infer<typeof strategySchema>;
export type PlanResult = z.infer<typeof planResultSchema>;
