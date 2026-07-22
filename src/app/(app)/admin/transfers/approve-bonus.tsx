"use client";

import * as React from "react";

import { IDLE } from "@/lib/admin/form";
import { Button } from "@/components/ui/button";

import { approveBonus } from "./actions";

export function ApproveBonusButton({ id }: { id: string }) {
  const [state, formAction, pending] = React.useActionState(approveBonus, IDLE);
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={pending}
        title={state.error ?? undefined}
      >
        {pending ? "…" : "Approve"}
      </Button>
    </form>
  );
}
