"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { validateProposed } from "@/lib/validation";
import { fetchReferenceRow } from "@/lib/admin/reference";
import { str, type FormState } from "@/lib/admin/form";

// Approve = validate the proposal (the DB function is the last line of
// defense, not the only one), then call the security-definer RPC that
// applies it and marks the change approved in one transaction.
export async function approveChange(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const id = str(fd, "id");
  const supabase = await createClient();

  const { data: change, error: readErr } = await supabase
    .from("staging_changes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!change) return { ok: false, error: "change not found" };
  if (change.status !== "pending") {
    return { ok: false, error: `change is ${change.status}, not pending` };
  }

  const existing = change.target_id
    ? await fetchReferenceRow(supabase, change.target_table, change.target_id)
    : null;
  if (change.target_id && !existing) {
    return { ok: false, error: "target row no longer exists" };
  }

  const result = validateProposed(
    change.target_table,
    change.proposed,
    existing
  );
  if (!result.ok) {
    return { ok: false, error: `validation failed — ${result.error}` };
  }

  const { error } = await supabase.rpc("apply_staging_change", {
    change_id: id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/queue");
  revalidatePath(`/admin/queue/${id}`);
  return { ok: true };
}

export async function rejectChange(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const id = str(fd, "id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_staging_change", {
    change_id: id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/queue");
  revalidatePath(`/admin/queue/${id}`);
  return { ok: true };
}
