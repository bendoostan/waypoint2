"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { str, type FormState } from "@/lib/admin/form";
import { regeneratePlan } from "./get-or-create-plan";

// Re-runs the engine against the goal's current wallet/spend and overwrites
// the cached `plans` row. Plans never auto-regenerate on load (see
// get-or-create-plan.ts), so this is the only way a stale plan gets fresh.
export async function updatePlan(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const parsed = z.string().uuid().safeParse(str(fd, "goal_id"));
  if (!parsed.success) return { ok: false, error: "invalid goal" };
  const goalId = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not signed in" };

  const [{ data: goal }, { data: goalLegs }] = await Promise.all([
    supabase.from("goals").select("*").eq("id", goalId).maybeSingle(),
    supabase
      .from("goal_legs")
      .select("*")
      .eq("goal_id", goalId)
      .order("seq", { ascending: true }),
  ]);
  if (!goal) return { ok: false, error: "goal not found" };

  await regeneratePlan(supabase, user.id, goal, goalLegs ?? []);

  revalidatePath(`/plans/${goalId}`);
  return { ok: true };
}
