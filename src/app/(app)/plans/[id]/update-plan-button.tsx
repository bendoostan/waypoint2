"use client";

import * as React from "react";

import { IDLE } from "@/lib/admin/form";
import { Button } from "@/components/ui/button";
import { updatePlan } from "./actions";

// A goal's wallet or monthly spend can change after the plan was generated,
// and the plan never auto-refreshes (expensive, and would make the page
// nondeterministic) — this is the explicit escape hatch.
export function UpdatePlanButton({ goalId }: { goalId: string }) {
  const [state, formAction, pending] = React.useActionState(updatePlan, IDLE);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="goal_id" value={goalId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Updating…" : "Update this plan"}
      </Button>
      {state.error ? (
        <span role="alert" className="text-wp-danger text-[12.5px]">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
