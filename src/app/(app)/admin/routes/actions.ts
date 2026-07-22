"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { awardRouteSchema } from "@/lib/validation";
import {
  bool,
  iataList,
  num,
  optStr,
  str,
  type FormState,
} from "@/lib/admin/form";

export async function upsertRoute(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const id = optStr(fd, "id");
  const parsed = awardRouteSchema.safeParse({
    name: str(fd, "name"),
    program_currency_id: str(fd, "program_currency_id"),
    origin_region: str(fd, "origin_region"),
    origin_airports: iataList(fd, "origin_airports"),
    destination_region: str(fd, "destination_region"),
    destination_airports: iataList(fd, "destination_airports"),
    cabin: str(fd, "cabin"),
    points_oneway: num(fd, "points_oneway"),
    taxes_fees_usd_est: num(fd, "taxes_fees_usd_est"),
    booking_url: optStr(fd, "booking_url"),
    notes: optStr(fd, "notes"),
    is_active: bool(fd, "is_active"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" };
  }

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("award_routes").update(parsed.data).eq("id", id)
    : await supabase.from("award_routes").insert(parsed.data);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/routes");
  return { ok: true };
}

export async function markRouteVerified(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const id = str(fd, "id");
  const supabase = await createClient();
  const { error } = await supabase
    .from("award_routes")
    .update({ last_verified_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/routes");
  return { ok: true };
}
