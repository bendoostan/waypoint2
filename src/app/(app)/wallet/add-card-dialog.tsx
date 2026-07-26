"use client";

import * as React from "react";

import { IDLE } from "@/lib/admin/form";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardMark } from "@/components/card-mark";
import { addCard } from "./actions";

export type CatalogCard = {
  id: string;
  name: string;
  issuer: string;
  brandColor: string | null;
  wordmark: string;
  currencyName: string;
};

export function AddCardDialog({ cards }: { cards: CatalogCard[] }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [state, formAction, pending] = React.useActionState(addCard, IDLE);

  React.useEffect(() => {
    if (state.ok) {
      setOpen(false);
    }
  }, [state.ok]);

  // Reset transient state each time the dialog opens.
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setQuery("");
      setSelectedId(null);
    }
  };

  const q = query.trim().toLowerCase();
  const filtered = q
    ? cards.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.issuer.toLowerCase().includes(q) ||
          c.currencyName.toLowerCase().includes(q)
      )
    : cards;
  const selected = cards.find((c) => c.id === selectedId) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon />
          Add card
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Add a card</DialogTitle>
          <DialogDescription>
            Pick the card you hold and tell us the balance. Brand color and
            wordmark only — no card art.
          </DialogDescription>
        </DialogHeader>

        <Input
          placeholder="Search by card, issuer, or program…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search cards"
          autoFocus
        />

        <div className="border-wp-border max-h-56 overflow-y-auto rounded-lg border">
          {filtered.length === 0 ? (
            <p className="text-wp-muted p-4 text-sm">No cards match.</p>
          ) : (
            <ul className="divide-wp-track divide-y">
              {filtered.map((c) => {
                const active = c.id === selectedId;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      aria-pressed={active}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                        active ? "bg-wp-surface-2" : "hover:bg-wp-track"
                      )}
                    >
                      <CardMark
                        brandColor={c.brandColor}
                        wordmark={c.wordmark}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="text-wp-ink block truncate text-sm font-semibold">
                          {c.name}
                        </span>
                        <span className="text-wp-muted block truncate text-xs">
                          {c.issuer} · {c.currencyName}
                        </span>
                      </span>
                      {active ? <CheckIcon /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="card_id" value={selectedId ?? ""} />
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="points_balance">Points balance</Label>
              <Input
                id="points_balance"
                name="points_balance"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                placeholder="0"
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="opened_at">Opened (optional)</Label>
              <Input id="opened_at" name="opened_at" type="date" />
            </div>
          </div>
          {selected ? (
            <p className="text-wp-muted text-xs">
              Adding{" "}
              <span className="text-wp-ink font-semibold">{selected.name}</span>
              .
            </p>
          ) : (
            <p className="text-wp-muted text-xs">Select a card above first.</p>
          )}
          {state.error ? (
            <p className="text-destructive text-sm">{state.error}</p>
          ) : null}
          <Button type="submit" disabled={pending || !selectedId}>
            {pending ? "Adding…" : "Add to wallet"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PlusIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--wp-accent-text)"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
