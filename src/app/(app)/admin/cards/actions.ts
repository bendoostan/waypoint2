"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  cardCatalogSchema,
  earningRateSchema,
  welcomeOfferSchema,
} from "@/lib/validation";
import {
  bool,
  num,
  optNum,
  optStr,
  str,
  type FormState,
} from "@/lib/admin/form";

function revalidate(cardId?: string | null) {
  revalidatePath("/admin/cards");
  if (cardId) revalidatePath(`/admin/cards/${cardId}`);
}

// The form does not manage the application_rules jsonb (Phase 2+), so omit
// it here — otherwise its unknown type is not assignable to the DB Json type.
const cardFormSchema = cardCatalogSchema.omit({ application_rules: true });

export async function upsertCard(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const id = optStr(fd, "id");
  const parsed = cardFormSchema.safeParse({
    name: str(fd, "name"),
    issuer: str(fd, "issuer"),
    currency_id: str(fd, "currency_id"),
    annual_fee: num(fd, "annual_fee"),
    unlocks_transfers: bool(fd, "unlocks_transfers"),
    affiliate_url: optStr(fd, "affiliate_url"),
    is_active: bool(fd, "is_active"),
    notes: optStr(fd, "notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" };
  }

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("card_catalog").update(parsed.data).eq("id", id)
    : await supabase.from("card_catalog").insert(parsed.data);
  if (error) return { ok: false, error: error.message };
  revalidate(id);
  return { ok: true };
}

export async function upsertEarningRate(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const id = optStr(fd, "id");
  const cardId = str(fd, "card_id");
  const parsed = earningRateSchema.safeParse({
    card_id: cardId,
    category: str(fd, "category"),
    rate: num(fd, "rate"),
    cap_monthly_usd: optNum(fd, "cap_monthly_usd"),
    notes: optStr(fd, "notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" };
  }

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("earning_rates").update(parsed.data).eq("id", id)
    : await supabase.from("earning_rates").insert(parsed.data);
  if (error) return { ok: false, error: error.message };
  revalidate(cardId);
  return { ok: true };
}

export async function deleteEarningRate(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const id = str(fd, "id");
  const cardId = str(fd, "card_id");
  const supabase = await createClient();
  const { error } = await supabase.from("earning_rates").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidate(cardId);
  return { ok: true };
}

export async function upsertWelcomeOffer(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const id = optStr(fd, "id");
  const cardId = str(fd, "card_id");
  const parsed = welcomeOfferSchema.safeParse({
    card_id: cardId,
    points: num(fd, "points"),
    min_spend_usd: num(fd, "min_spend_usd"),
    window_months: num(fd, "window_months"),
    ends_at: optStr(fd, "ends_at"),
    source_url: optStr(fd, "source_url"),
    is_active: bool(fd, "is_active"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" };
  }

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("welcome_offers").update(parsed.data).eq("id", id)
    : await supabase.from("welcome_offers").insert(parsed.data);
  if (error) return { ok: false, error: error.message };
  revalidate(cardId);
  return { ok: true };
}

export async function deleteWelcomeOffer(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const id = str(fd, "id");
  const cardId = str(fd, "card_id");
  const supabase = await createClient();
  const { error } = await supabase.from("welcome_offers").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidate(cardId);
  return { ok: true };
}
