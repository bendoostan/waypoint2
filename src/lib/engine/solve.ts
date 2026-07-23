// Stage 4 (PLAN.md §4.4): cheapest source combination by opportunity cost
// (points sent × source cpp). The currency count is tiny, so the solver
// enumerates every source subset — exact, no heuristics. Ties prefer fewer
// hops, then lower transfer hours.
import { deliverThrough, minimalSentFor } from "./reachability";
import type { PathQuote, Reachability } from "./reachability";
import type { Allocation } from "./schema";
import type { Currency, EffectiveCurrency } from "./types";

export type SolveResult = {
  allocations: Allocation[];
  reachable_points: number;
  gap: number;
  total_opportunity_cost_usd: number;
  transfer_hops: number;
  max_transfer_hours: number;
};

export type SourceOption = {
  quote: PathQuote;
  balance: number;
  cpp: number;
  max_deliverable: number;
  /** USD sacrificed per point delivered, for fill ordering */
  marginal_cost: number;
};

function cents(x: number): number {
  return Math.round(x * 100) / 100;
}

function toAllocation(
  option: SourceOption,
  sent: number,
  currencyName: (id: string) => string
): Allocation {
  const delivery = deliverThrough(option.quote.edges, sent);
  return {
    currency_id: option.quote.source_currency_id,
    currency_name: currencyName(option.quote.source_currency_id),
    points_used: delivery.sent,
    points_delivered: delivery.delivered,
    opportunity_cost_usd: cents((delivery.sent * option.cpp) / 100),
    path: delivery.steps.map((s) => ({
      ...s,
      from_currency_name: currencyName(s.from_currency_id),
      to_currency_name: currencyName(s.to_currency_id),
    })),
  };
}

export type Attempt = {
  allocations: Allocation[];
  cost: number;
  hops: number;
  max_hours: number;
  delivered: number;
};

function attemptFill(
  subset: SourceOption[],
  needed: number,
  currencyName: (id: string) => string
): Attempt | null {
  // Within a fixed subset, filling cheapest-per-delivered-point first is
  // optimal for linear costs; increment rounding is handled by
  // minimalSentFor on the edge grid.
  const ordered = [...subset].sort((a, b) => a.marginal_cost - b.marginal_cost);
  const allocations: Allocation[] = [];
  let remaining = needed;
  let cost = 0;
  let hops = 0;
  let maxHours = 0;

  for (const option of ordered) {
    if (remaining <= 0) return null; // redundant member — a smaller subset wins
    const target = Math.min(remaining, option.max_deliverable);
    const sent = minimalSentFor(option.quote.edges, target, option.balance);
    if (sent === null || sent <= 0) return null;
    const allocation = toAllocation(option, sent, currencyName);
    if (allocation.points_delivered <= 0) return null;
    allocations.push(allocation);
    remaining -= allocation.points_delivered;
    cost += allocation.opportunity_cost_usd;
    hops += allocation.path.length;
    for (const step of allocation.path) {
      maxHours = Math.max(maxHours, step.transfer_hours_est);
    }
  }

  if (remaining > 0) return null;
  return {
    allocations,
    cost: cents(cost),
    hops,
    max_hours: maxHours,
    delivered: needed - remaining,
  };
}

function betterAttempt(a: Attempt, b: Attempt): Attempt {
  if (a.cost !== b.cost) return a.cost < b.cost ? a : b;
  if (a.hops !== b.hops) return a.hops < b.hops ? a : b;
  return a.max_hours <= b.max_hours ? a : b;
}

/**
 * Build the per-source options for delivering into a destination. `caps`
 * (currency id -> max usable balance) lets the joint solver ration a shared
 * source between the two legs; an absent entry means the full balance is
 * available. Sources capped to 0 (or that cannot deliver a positive amount at
 * their cap) are dropped.
 */
export function buildSourceOptions(
  destCurrencyId: string,
  reach: Reachability,
  entries: EffectiveCurrency[],
  caps?: Map<string, number>
): SourceOption[] {
  const balances = new Map(entries.map((e) => [e.currency_id, e]));
  const options: SourceOption[] = [];
  for (const quote of (reach.get(destCurrencyId) ?? new Map()).values()) {
    const entry = balances.get(quote.source_currency_id);
    if (!entry || !entry.unlocked || entry.balance <= 0) continue;
    const cap = caps?.get(quote.source_currency_id);
    const balance =
      cap === undefined ? entry.balance : Math.min(entry.balance, cap);
    if (balance <= 0) continue;
    const atMax = deliverThrough(quote.edges, balance);
    if (atMax.delivered <= 0) continue;
    options.push({
      quote,
      balance,
      cpp: entry.cpp,
      max_deliverable: atMax.delivered,
      marginal_cost:
        atMax.delivered > 0
          ? (atMax.sent * entry.cpp) / 100 / atMax.delivered
          : Number.POSITIVE_INFINITY,
    });
  }
  // deterministic enumeration order
  options.sort((a, b) =>
    a.quote.source_currency_id.localeCompare(b.quote.source_currency_id)
  );
  return options;
}

/**
 * Exact min-cost fill of `needed` into one destination program from a fixed
 * option set (the shared machinery both legs reuse). Returns the best Attempt,
 * or null if the options cannot cover the need.
 */
export function bestAttempt(
  options: SourceOption[],
  needed: number,
  currencyName: (id: string) => string
): Attempt | null {
  let best: Attempt | null = null;
  const n = options.length;
  for (let mask = 1; mask < 1 << n; mask += 1) {
    const subset = options.filter((_, i) => (mask & (1 << i)) !== 0);
    const attempt = attemptFill(subset, needed, currencyName);
    if (attempt) best = best ? betterAttempt(best, attempt) : attempt;
  }
  return best;
}

export function solveCandidate(
  needed: number,
  destCurrencyId: string,
  reach: Reachability,
  entries: EffectiveCurrency[],
  currencies: Currency[],
  caps?: Map<string, number>
): SolveResult {
  const names = new Map(currencies.map((c) => [c.id, c.name]));
  const currencyName = (id: string) => names.get(id) ?? id;

  const options = buildSourceOptions(destCurrencyId, reach, entries, caps);

  const totalMax = options.reduce((s, o) => s + o.max_deliverable, 0);

  if (totalMax < needed) {
    // Cannot cover: use everything, report the gap.
    const allocations = options
      .map((o) => toAllocation(o, o.balance, currencyName))
      .filter((a) => a.points_delivered > 0);
    return summarize(allocations, needed);
  }

  const best = bestAttempt(options, needed, currencyName);

  // totalMax >= needed guarantees at least the full set covers.
  if (!best) {
    const allocations = options
      .map((o) => toAllocation(o, o.balance, currencyName))
      .filter((a) => a.points_delivered > 0);
    return summarize(allocations, needed);
  }
  return summarize(best.allocations, needed);
}

function summarize(allocations: Allocation[], needed: number): SolveResult {
  const delivered = allocations.reduce((s, a) => s + a.points_delivered, 0);
  const reachable = Math.min(needed, delivered);
  return {
    allocations,
    reachable_points: reachable,
    gap: Math.max(0, needed - delivered),
    total_opportunity_cost_usd: cents(
      allocations.reduce((s, a) => s + a.opportunity_cost_usd, 0)
    ),
    transfer_hops: allocations.reduce((s, a) => s + a.path.length, 0),
    max_transfer_hours: allocations.reduce(
      (m, a) => Math.max(m, ...a.path.map((p) => p.transfer_hours_est), 0),
      0
    ),
  };
}
