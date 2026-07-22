"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { IDLE } from "@/lib/admin/form";
import { Button } from "@/components/ui/button";

import { approveChange, rejectChange } from "./actions";

export function ReviewActions({ id }: { id: string }) {
  const router = useRouter();
  const [approveState, approve, approving] = React.useActionState(
    approveChange,
    IDLE
  );
  const [rejectState, reject, rejecting] = React.useActionState(
    rejectChange,
    IDLE
  );

  React.useEffect(() => {
    if (approveState.ok || rejectState.ok) {
      router.push("/admin/queue");
      router.refresh();
    }
  }, [approveState.ok, rejectState.ok, router]);

  const error = approveState.error ?? rejectState.error;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <form action={approve}>
          <input type="hidden" name="id" value={id} />
          <Button type="submit" disabled={approving || rejecting}>
            {approving ? "Applying…" : "Approve & apply"}
          </Button>
        </form>
        <form action={reject}>
          <input type="hidden" name="id" value={id} />
          <Button
            type="submit"
            variant="outline"
            disabled={approving || rejecting}
          >
            {rejecting ? "Rejecting…" : "Reject"}
          </Button>
        </form>
      </div>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  );
}
