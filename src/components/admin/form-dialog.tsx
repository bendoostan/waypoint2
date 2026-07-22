"use client";

import * as React from "react";

import { IDLE, type FormState } from "@/lib/admin/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

// The form body lives inside DialogContent, which Radix unmounts when the
// dialog closes — so useActionState resets between opens for free.
function FormBody({
  action,
  onDone,
  submitLabel,
  children,
}: {
  action: Action;
  onDone: () => void;
  submitLabel: string;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = React.useActionState(action, IDLE);

  React.useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={formAction} className="grid gap-4">
      {children}
      {state.error ? (
        <p className="text-destructive text-sm">{state.error}</p>
      ) : null}
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function FormDialog({
  title,
  description,
  trigger,
  action,
  submitLabel = "Save",
  children,
}: {
  title: string;
  description?: string;
  trigger: React.ReactNode;
  action: Action;
  submitLabel?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <FormBody
          action={action}
          onDone={() => setOpen(false)}
          submitLabel={submitLabel}
        >
          {children}
        </FormBody>
      </DialogContent>
    </Dialog>
  );
}
