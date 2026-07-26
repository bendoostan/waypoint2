"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/admin/form";
import type { AirportOption } from "@/lib/airports";

// Combobox lookup over public.airports. Returns [] when the table isn't loaded
// (the hosted deploy's known gap) — the field then accepts a raw IATA code.
export async function searchAirports(query: string): Promise<AirportOption[]> {
  const q = query.trim();
  if (q.length === 0) return [];
  const supabase = await createClient();
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const { data } = await supabase
    .from("airports")
    .select("iata, name, city")
    .or(`iata.ilike.${like},city.ilike.${like},name.ilike.${like}`)
    .limit(8);
  return (data ?? []).map((a) => ({
    iata: a.iata,
    name: a.name,
    city: a.city,
  }));
}

const CABINS = ["economy", "premium_economy", "business", "first"] as const;
const FLEX = ["exact", "flexible_month", "anytime"] as const;

const legSchema = z
  .object({
    seq: z.union([z.literal(1), z.literal(2)]),
    origin_airport: z.string().regex(/^[A-Z]{3}$/),
    destination_airport: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    destination_region: z.string().min(1).nullable(),
    cabin: z.enum(CABINS),
    travel_month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .nullable(),
  })
  .refine(
    (l) => l.destination_airport !== null || l.destination_region !== null,
    {
      message: "each leg needs a destination airport or region",
    }
  );

const createGoalSchema = z.object({
  title: z.string().trim().min(1).max(120),
  num_travelers: z.number().int().min(1).max(20),
  flexibility: z.enum(FLEX),
  legs: z.array(legSchema).min(1).max(2),
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;

export async function createGoal(input: CreateGoalInput): Promise<FormState> {
  const parsed = createGoalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  const { title, num_travelers, flexibility, legs } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not signed in" };

  const leg1 = legs[0]!;

  // goal_legs is the source of truth for the itinerary. The goals row still
  // carries origin_airport/destination_*/cabin/travel_month as NOT NULL columns
  // (frozen since migration 0002, and this phase adds no migration), so we MUST
  // populate them to insert at all — we mirror leg 1 into them purely to satisfy
  // those constraints. New code reads goal_legs, never these columns.
  const { data: goal, error: goalErr } = await supabase
    .from("goals")
    .insert({
      user_id: user.id,
      title,
      num_travelers,
      flexibility,
      origin_airport: leg1.origin_airport,
      destination_airport: leg1.destination_airport,
      destination_region: leg1.destination_region,
      cabin: leg1.cabin,
      travel_month: leg1.travel_month,
    })
    .select("id")
    .single();
  if (goalErr || !goal) {
    return { ok: false, error: goalErr?.message ?? "could not create goal" };
  }

  const { error: legsErr } = await supabase.from("goal_legs").insert(
    legs.map((l) => ({
      goal_id: goal.id,
      seq: l.seq,
      origin_airport: l.origin_airport,
      destination_airport: l.destination_airport,
      destination_region: l.destination_region,
      cabin: l.cabin,
      travel_month: l.travel_month,
    }))
  );
  if (legsErr) {
    // Roll back the parent so we never leave a goal with no legs.
    await supabase.from("goals").delete().eq("id", goal.id);
    return { ok: false, error: legsErr.message };
  }

  redirect(`/plans/${goal.id}`);
}
