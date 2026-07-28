// UI formatters. Presentation only — no engine logic, no ratios computed here.

export function fmtInt(n: number): string {
  return n.toLocaleString("en-US");
}

// Short wordmarks for the brand tiles (brand color + wordmark, never a logo).
const ISSUER_WORDMARKS: Record<string, string> = {
  Chase: "Chase",
  "American Express": "Amex",
  "Capital One": "C1",
};

export function issuerWordmark(issuer: string): string {
  return ISSUER_WORDMARKS[issuer] ?? issuer.split(/\s+/)[0] ?? issuer;
}

/** A program's short mark, e.g. "Chase Ultimate Rewards" -> "Chase". */
export function programWordmark(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}

/** 'plans.generated_at' timestamptz -> "Jul 28, 2026, 3:04 PM". */
export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// A plain (non-affiliate) landing page per issuer — the honest fallback when
// card_catalog.affiliate_url is null (the common case at launch). Only the
// three issuers actually seeded exist here; an unlisted issuer renders no
// link at all rather than a guessed URL (DESIGN.md: never a broken CTA).
const ISSUER_APPLY_URLS: Record<string, string> = {
  Chase: "https://creditcards.chase.com",
  "American Express": "https://www.americanexpress.com/en-us/credit-cards/",
  "Capital One": "https://www.capitalone.com/credit-cards/",
};

export function issuerApplyUrl(issuer: string): string | null {
  return ISSUER_APPLY_URLS[issuer] ?? null;
}

export function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

const CABINS: Record<string, string> = {
  economy: "Economy",
  premium_economy: "Premium economy",
  business: "Business",
  first: "First",
};

export function cabinLabel(cabin: string): string {
  return CABINS[cabin] ?? cabin;
}

/** 'YYYY-MM' -> 'March 2026'. Returns null for empty/malformed input. */
export function monthLabel(ym: string | null): string | null {
  if (!ym || !/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) return null;
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1, 1));
  return d.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

type LegLike = {
  seq: number;
  origin_airport: string;
  destination_airport: string | null;
  destination_region: string | null;
  cabin: string;
  travel_month: string | null;
};

/** A leg's destination as a label: airport code, else region name. */
export function legDestination(leg: LegLike): string {
  return leg.destination_airport ?? leg.destination_region ?? "—";
}

/**
 * A compact human route across legs. A round trip (leg 2 reverses leg 1) reads
 * "SFO → HND → SFO"; an open-jaw reads "SFO → HND · KIX → SFO"; one leg reads
 * "SFO → HND".
 */
export function describeRoute(legs: LegLike[]): string {
  const ordered = [...legs].sort((a, b) => a.seq - b.seq);
  if (ordered.length === 0) return "";
  const l1 = ordered[0]!;
  if (ordered.length === 1) {
    return `${l1.origin_airport} → ${legDestination(l1)}`;
  }
  const l2 = ordered[1]!;
  const isRoundTrip =
    l2.origin_airport === l1.destination_airport &&
    l2.destination_airport === l1.origin_airport;
  if (isRoundTrip) {
    return `${l1.origin_airport} → ${legDestination(l1)} → ${legDestination(l2)}`;
  }
  return `${l1.origin_airport} → ${legDestination(l1)} · ${l2.origin_airport} → ${legDestination(l2)}`;
}

/** One cabin label if every leg shares it, else the distinct set joined. */
export function describeCabins(legs: LegLike[]): string {
  const distinct = [...new Set(legs.map((l) => l.cabin))];
  return distinct.map(cabinLabel).join(" / ");
}

/** The earliest travel month across legs, as a label, or null. */
export function describeMonth(legs: LegLike[]): string | null {
  const months = legs
    .map((l) => l.travel_month)
    .filter((m): m is string => !!m)
    .sort();
  return months.length ? monthLabel(months[0]!) : null;
}
