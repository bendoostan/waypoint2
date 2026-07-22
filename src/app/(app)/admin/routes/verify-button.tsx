"use client";

import * as React from "react";

import { IDLE } from "@/lib/admin/form";
import { Button } from "@/components/ui/button";

import { markRouteVerified } from "./actions";

export function VerifyButton({ id }: { id: string }) {
  const [state, formAction, pending] = React.useActionState(
    markRouteVerified,
    IDLE
  );
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={pending}
        title={state.error ?? undefined}
      >
        {pending ? "…" : "Mark verified"}
      </Button>
    </form>
  );
}
