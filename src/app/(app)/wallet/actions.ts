"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { num, optStr, str, type FormState } from "@/lib/admin/form";

// All wallet writes go through the authenticated (RLS-gated) client; user_cards
// and profiles are owner-only, so a user can only ever touch their own rows.

const addCardSchema = z.object({
  card_id: z.string().uuid(),
  points_balance: z.number().int().min(0).max(100_000_000),
  opened_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});

export async function addCard(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const parsed = addCardSchema.safeParse({
    card_id: str(fd, "card_id"),
    points_balance: num(fd, "points_balance"),
    opened_at: optStr(fd, "opened_at"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not signed in" };

  const { error } = await supabase
    .from("user_cards")
    .insert({ ...parsed.data, user_id: user.id });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/wallet");
  return { ok: true };
}

export async function removeCard(id: string): Promise<FormState> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "invalid id" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_cards")
    .delete()
    .eq("id", parsed.data);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/wallet");
  return { ok: true };
}

// Monthly spend is one jsonb column on the profile — a map of category to a
// non-negative USD/month figure. The client sends the whole map (debounced);
// we validate, drop non-positive entries, and store it.
const spendSchema = z.record(
  z.string(),
  z.number().finite().min(0).max(1_000_000)
);

export async function saveMonthlySpend(
  spend: Record<string, number>
): Promise<FormState> {
  const parsed = spendSchema.safeParse(spend);
  if (!parsed.success) return { ok: false, error: "invalid spend" };

  const cleaned: Record<string, number> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v > 0) cleaned[k] = Math.round(v);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not signed in" };

  const { error } = await supabase
    .from("profiles")
    .update({ monthly_spend: cleaned })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/wallet");
  return { ok: true };
}
