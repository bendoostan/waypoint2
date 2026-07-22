"use client";

import * as React from "react";

import { IDLE, type FormState } from "@/lib/admin/form";
import { Button } from "@/components/ui/button";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

/**
 * A small confirm-then-submit delete control. `hidden` entries become hidden
 * inputs so the server action knows what to delete (and what to revalidate).
 */
export function DeleteButton({
  action,
  hidden,
  label = "Delete",
  confirm = "Delete this item?",
}: {
  action: Action;
  hidden: Record<string, string>;
  label?: string;
  confirm?: string;
}) {
  const [state, formAction, pending] = React.useActionState(action, IDLE);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pending}
        className="text-destructive hover:text-destructive"
        title={state.error ?? undefined}
      >
        {pending ? "…" : label}
      </Button>
    </form>
  );
}
