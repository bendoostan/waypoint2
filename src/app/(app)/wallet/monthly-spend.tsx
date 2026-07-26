"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveMonthlySpend } from "./actions";

function categoryLabel(c: string): string {
  const s = c.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type SaveState = "idle" | "saving" | "saved" | "error";

// Nine (whatever the seed carries) spend categories, autosaving to the profile's
// one jsonb column. Optimistic: the inputs are the source of truth on screen;
// we debounce a write and show a quiet status. No localStorage.
export function MonthlySpend({
  categories,
  initial,
}: {
  categories: string[];
  initial: Record<string, number>;
}) {
  const [spend, setSpend] = React.useState<Record<string, string>>(() => {
    const s: Record<string, string> = {};
    for (const c of categories) {
      s[c] = initial[c] ? String(initial[c]) : "";
    }
    return s;
  });
  const [status, setStatus] = React.useState<SaveState>("idle");
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  const persist = React.useCallback((next: Record<string, string>) => {
    const payload: Record<string, number> = {};
    for (const [k, v] of Object.entries(next)) {
      const n = Number(v);
      if (v !== "" && Number.isFinite(n) && n > 0) payload[k] = n;
    }
    setStatus("saving");
    saveMonthlySpend(payload)
      .then((res) => {
        setStatus(res.ok ? "saved" : "error");
        if (res.ok) {
          if (savedTimer.current) clearTimeout(savedTimer.current);
          savedTimer.current = setTimeout(() => setStatus("idle"), 1600);
        }
      })
      .catch(() => setStatus("error"));
  }, []);

  const onChange = (category: string, value: string) => {
    // digits only; optimistic local update
    const clean = value.replace(/[^\d]/g, "");
    const next = { ...spend, [category]: clean };
    setSpend(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(next), 600);
  };

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div>
          <div className="wp-eyebrow">Monthly spend</div>
          <p className="text-wp-muted mt-1 text-[13px]">
            Roughly what you put on cards each month — this is how we estimate
            how fast you earn.
          </p>
        </div>
        <span
          className={cn(
            "text-xs transition-opacity",
            status === "idle" ? "opacity-0" : "opacity-100",
            status === "error" ? "text-destructive" : "text-wp-muted"
          )}
          aria-live="polite"
        >
          {status === "saving"
            ? "Saving…"
            : status === "saved"
              ? "Saved"
              : status === "error"
                ? "Couldn't save"
                : ""}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        {categories.map((c) => (
          <div key={c} className="grid gap-1.5">
            <Label htmlFor={`spend-${c}`} className="text-wp-body">
              {categoryLabel(c)}
            </Label>
            <div className="relative">
              <span className="text-wp-muted-2 pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm">
                $
              </span>
              <Input
                id={`spend-${c}`}
                inputMode="numeric"
                value={spend[c] ?? ""}
                onChange={(e) => onChange(c, e.target.value)}
                placeholder="0"
                className="pl-6 tabular-nums"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
