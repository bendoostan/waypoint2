"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { transferBonusSchema, transferPartnerSchema } from "@/lib/validation";
import {
  bool,
  num,
  optNum,
  optStr,
  str,
  type FormState,
} from "@/lib/admin/form";

export async function upsertPartner(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const id = optStr(fd, "id");
  const parsed = transferPartnerSchema.safeParse({
    from_currency_id: str(fd, "from_currency_id"),
    to_currency_id: str(fd, "to_currency_id"),
    ratio_num: num(fd, "ratio_num"),
    ratio_den: num(fd, "ratio_den"),
    transfer_hours_est: num(fd, "transfer_hours_est"),
    min_transfer: optNum(fd, "min_transfer"),
    increment: optNum(fd, "increment"),
    is_active: bool(fd, "is_active"),
    notes: optStr(fd, "notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" };
  }

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("transfer_partners").update(parsed.data).eq("id", id)
    : await supabase.from("transfer_partners").insert(parsed.data);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/transfers");
  return { ok: true };
}

export async function upsertBonus(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const id = optStr(fd, "id");
  const parsed = transferBonusSchema.safeParse({
    transfer_partner_id: str(fd, "transfer_partner_id"),
    bonus_pct: num(fd, "bonus_pct"),
    starts_at: str(fd, "starts_at"),
    ends_at: str(fd, "ends_at"),
    source_url: optStr(fd, "source_url"),
    status: str(fd, "status"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" };
  }

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("transfer_bonuses").update(parsed.data).eq("id", id)
    : await supabase.from("transfer_bonuses").insert(parsed.data);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/transfers");
  return { ok: true };
}

// Manual approve — the automated expiry sweeper is Phase 4.
export async function approveBonus(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const id = str(fd, "id");
  const supabase = await createClient();
  const { error } = await supabase
    .from("transfer_bonuses")
    .update({ status: "approved" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/transfers");
  return { ok: true };
}

export async function deleteBonus(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const id = str(fd, "id");
  const supabase = await createClient();
  const { error } = await supabase
    .from("transfer_bonuses")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/transfers");
  return { ok: true };
}
