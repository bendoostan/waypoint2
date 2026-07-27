import type { SupabaseClient } from "@supabase/supabase-js";

import { generatePlan } from "@/lib/engine";
import { buildEngineInput } from "@/lib/engine/from-db";
import { planResultSchema, type PlanResult } from "@/lib/engine/schema";
import type { Database } from "@/types/database";
import type { GoalLegRow, GoalRow } from "@/lib/engine/types";

// Plans are generated once and cached in `plans` (goal_id unique) — this is
// the only place PlanResult rows get written. A goal's legs never change
// after creation, so there is no regenerate path yet; that's later work.
export async function getOrCreatePlan(
  supabase: SupabaseClient<Database>,
  userId: string,
  goal: GoalRow,
  goalLegs: GoalLegRow[]
): Promise<PlanResult> {
  const { data: existing } = await supabase
    .from("plans")
    .select("strategies")
    .eq("goal_id", goal.id)
    .maybeSingle();
  if (existing) {
    return planResultSchema.parse(existing.strategies);
  }

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

  const result = generatePlan(input);

  // Best-effort cache write: if it fails (e.g. a race with another request
  // generating the same plan), the computed result is still returned —
  // rendering never depends on the insert succeeding.
  await supabase
    .from("plans")
    .insert({ goal_id: goal.id, user_id: userId, strategies: result })
    .select("id")
    .maybeSingle();

  return result;
}
