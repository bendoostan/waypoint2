"use client";

import * as React from "react";

import { removeCard } from "./actions";

// A quiet remove control on each held card. Confirms, then deletes (RLS makes
// sure it's the user's own row) and lets the revalidated page refresh.
export function RemoveCardButton({ id, label }: { id: string; label: string }) {
  const [pending, start] = React.useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Remove ${label} from your wallet?`)) return;
        start(() => {
          void removeCard(id);
        });
      }}
      className="text-wp-muted hover:text-destructive focus-visible:ring-ring rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
      aria-label={`Remove ${label}`}
    >
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}
