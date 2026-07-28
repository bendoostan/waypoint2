import type { SupabaseClient } from "@supabase/supabase-js";

import { generatePlan } from "@/lib/engine";
import { buildEngineInput } from "@/lib/engine/from-db";
import { planResultSchema, type PlanResult } from "@/lib/engine/schema";
import type { Database } from "@/types/database";
import type { GoalLegRow, GoalRow } from "@/lib/engine/types";

export type PlanWithMeta = {
  result: PlanResult;
  generatedAt: string;
};

// Fetches every reference/wallet table the engine needs and runs it. Shared
// by the first-generation path and the explicit regenerate action below —
// the only difference between them is what happens to the `plans` row after.
async function computePlan(
  supabase: SupabaseClient<Database>,
  goal: GoalRow,
  goalLegs: GoalLegRow[]
): Promise<PlanResult> {
  const [
    { data: userCards },
    { data: profile },
    { data: currencies },
    { data: cards },
    { data: earningRates },
    { data: welcomeOffers },
    { data: transferPartners },
    { data: transferBonuses },
    { data: awardRoutes },
    { data: availability },
  ] = await Promise.all([
    supabase.from("user_cards").select("*"),
    supabase.from("profiles").select("monthly_spend").maybeSingle(),
    supabase.from("currencies").select("*"),
    supabase.from("card_catalog").select("*").eq("is_active", true),
    supabase.from("earning_rates").select("*"),
    supabase.from("welcome_offers").select("*").eq("is_active", true),
    supabase.from("transfer_partners").select("*").eq("is_active", true),
    supabase.from("transfer_bonuses").select("*"),
    supabase.from("award_routes").select("*").eq("is_active", true),
    supabase.from("availability_cache").select("*"),
  ]);

  const input = buildEngineInput({
    userCards: userCards ?? [],
    profile: profile ?? null,
    goal,
    goalLegs,
    currencies: currencies ?? [],
    cards: cards ?? [],
    earningRates: earningRates ?? [],
    welcomeOffers: welcomeOffers ?? [],
    transferPartners: transferPartners ?? [],
    transferBonuses: transferBonuses ?? [],
    awardRoutes: awardRoutes ?? [],
    availability: availability ?? [],
    now: new Date(),
  });

  return generatePlan(input);
}

// Plans are cached in `plans` (goal_id unique). This is the only place a
// PlanResult is generated fresh — regeneratePlan below reuses computePlan but
// always overwrites, since the caller asked for a fresh run explicitly.
export async function getOrCreatePlan(
  supabase: SupabaseClient<Database>,
  userId: string,
  goal: GoalRow,
  goalLegs: GoalLegRow[]
): Promise<PlanWithMeta> {
  const { data: existing } = await supabase
    .from("plans")
    .select("strategies, generated_at")
    .eq("goal_id", goal.id)
    .maybeSingle();
  if (existing) {
    return {
      result: planResultSchema.parse(existing.strategies),
      generatedAt: existing.generated_at,
    };
  }

  const result = await computePlan(supabase, goal, goalLegs);
  const generatedAt = new Date().toISOString();

  // Best-effort cache write: if it fails (e.g. a race with another request
  // generating the same plan), the computed result is still returned —
  // rendering never depends on the insert succeeding.
  const { data: inserted } = await supabase
    .from("plans")
    .insert({
      goal_id: goal.id,
      user_id: userId,
      strategies: result,
      generated_at: generatedAt,
    })
    .select("generated_at")
    .maybeSingle();

  return { result, generatedAt: inserted?.generated_at ?? generatedAt };
}

// Explicit "Update this plan" path (a goal's wallet/spend can change after
// the plan was first generated, and the plan does not auto-refresh — see
// page.tsx). Re-runs the engine and overwrites the cached row.
export async function regeneratePlan(
  supabase: SupabaseClient<Database>,
  userId: string,
  goal: GoalRow,
  goalLegs: GoalLegRow[]
): Promise<PlanWithMeta> {
  const result = await computePlan(supabase, goal, goalLegs);
  const generatedAt = new Date().toISOString();

  const { data: upserted } = await supabase
    .from("plans")
    .upsert(
      {
        goal_id: goal.id,
        user_id: userId,
        strategies: result,
        generated_at: generatedAt,
      },
      { onConflict: "goal_id" }
    )
    .select("generated_at")
    .maybeSingle();

  return { result, generatedAt: upserted?.generated_at ?? generatedAt };
}
