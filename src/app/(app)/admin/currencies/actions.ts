"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { currencySchema } from "@/lib/validation";
import { bool, num, optStr, str, type FormState } from "@/lib/admin/form";

export async function upsertCurrency(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const id = optStr(fd, "id");
  const parsed = currencySchema.safeParse({
    name: str(fd, "name"),
    kind: str(fd, "kind"),
    alliance: optStr(fd, "alliance"),
    cashback_cpp: num(fd, "cashback_cpp"),
    transfer_cpp: num(fd, "transfer_cpp"),
    requires_unlock: bool(fd, "requires_unlock"),
    is_active: bool(fd, "is_active"),
    notes: optStr(fd, "notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" };
  }

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("currencies").update(parsed.data).eq("id", id)
    : await supabase.from("currencies").insert(parsed.data);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/currencies");
  return { ok: true };
}
