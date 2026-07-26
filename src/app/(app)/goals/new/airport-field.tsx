"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { normalizeIata, type AirportOption } from "@/lib/airports";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchAirports } from "./actions";

// A combobox over public.airports that ALWAYS accepts a typed three-letter
// code, even when the airport table isn't loaded (the hosted gap): whenever the
// text is a valid IATA code, a "Use CODE" option is offered directly. The
// committed value is always an uppercase IATA code.
export function AirportField({
  id,
  label,
  value,
  onChange,
  placeholder = "City or airport code",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = React.useState(value);
  const [options, setOptions] = React.useState<AirportOption[]>([]);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = React.useRef<HTMLDivElement>(null);

  // Keep the text in sync when the committed value changes from outside
  // (e.g. a mirrored round-trip leg).
  React.useEffect(() => {
    setQuery(value);
  }, [value]);

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const runSearch = React.useCallback((q: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 1) {
      setOptions([]);
      return;
    }
    timer.current = setTimeout(() => {
      void searchAirports(q).then((res) => setOptions(res));
    }, 200);
  }, []);

  const rawCode = normalizeIata(query);
  // The raw-code fallback: offer "Use CODE" whenever the text is a valid IATA
  // code that isn't already the first lookup hit.
  const showRaw = rawCode !== null && options[0]?.iata !== rawCode;

  type Row =
    { kind: "raw"; code: string } | { kind: "option"; option: AirportOption };
  const rows: Row[] = [
    ...(showRaw ? [{ kind: "raw" as const, code: rawCode! }] : []),
    ...options.map((option) => ({ kind: "option" as const, option })),
  ];

  const commit = (code: string, text: string) => {
    onChange(code);
    setQuery(text);
    setOpen(false);
  };

  const commitRow = (row: Row) => {
    if (row.kind === "raw") commit(row.code, row.code);
    else
      commit(
        row.option.iata,
        row.option.city
          ? `${row.option.iata} · ${row.option.city}`
          : row.option.iata
      );
  };

  return (
    <div className="grid gap-1.5" ref={boxRef}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          value={query}
          autoComplete="off"
          placeholder={placeholder}
          aria-expanded={open}
          role="combobox"
          className="uppercase"
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            setActive(0);
            setOpen(true);
            runSearch(v);
            // clear the committed value while the text is not yet a valid code
            if (normalizeIata(v) === null) onChange("");
            else onChange(normalizeIata(v)!);
          }}
          onFocus={() => query.trim() && setOpen(true)}
          onKeyDown={(e) => {
            if (!open) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, rows.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              const row = rows[active];
              if (row) {
                e.preventDefault();
                commitRow(row);
              }
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {open && rows.length > 0 ? (
          <ul className="border-wp-border-2 bg-wp-panel shadow-wp-panel absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border py-1">
            {rows.map((row, i) => {
              const isActive = i === active;
              if (row.kind === "raw") {
                return (
                  <li key="raw">
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => commitRow(row)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                        isActive ? "bg-wp-surface-2" : "hover:bg-wp-track"
                      )}
                    >
                      <span className="text-wp-ink font-semibold">
                        Use “{row.code}”
                      </span>
                      <span className="text-wp-muted text-xs">
                        exact airport code
                      </span>
                    </button>
                  </li>
                );
              }
              return (
                <li key={row.option.iata}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => commitRow(row)}
                    className={cn(
                      "flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm",
                      isActive ? "bg-wp-surface-2" : "hover:bg-wp-track"
                    )}
                  >
                    <span className="text-wp-ink font-semibold tabular-nums">
                      {row.option.iata}
                    </span>
                    <span className="text-wp-muted truncate">
                      {row.option.city ?? row.option.name}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
