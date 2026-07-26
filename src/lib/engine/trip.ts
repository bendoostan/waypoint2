// The joint, shared-wallet solve for a two-leg (split) trip — the exact core
// (PLAN.md §2.5: small graph, exact answers; a greedy per-leg fill is a bug,
// not a simplification).
//
// A split trip must deliver n1 into program D1 AND n2 into program D2 from ONE
// wallet: points spent toward one leg are gone for the other. The only real
// coupling is the SHARED sources (currencies that can reach both programs) —
// dedicated sources feed only their one leg. So we search, exhaustively on the
// per-source increment grid, how much of each shared balance is offered to
// leg 1 (the rest goes to leg 2). For each such split both legs become
// independent single-destination fills, solved by the existing solver.
//
// Exactness argument: at the true optimum a shared source i sends u1* to leg 1
// (a multiple of leg 1's first-edge increment g1) and u2* to leg 2, with
// u1*+u2* ≤ balance. Enumerating cap1_i over multiples of g1 up to S1 (the
// source points that alone deliver n1 — beyond that, extra D1 delivery is pure
// waste) includes cap1_i = u1*; there leg 2's budget is balance−u1* ≥ u2*, so
// each leg's independent min-cost fill costs ≤ the optimum's, and every
// enumerated point is a real, feasible allocation. Hence min over the grid
// equals the true optimum. The brute-force test in trip.test.ts certifies this.
import { minimalSentFor } from "./reachability";
import type { PathQuote, Reachability } from "./reachability";
import { solveCandidate } from "./solve";
import type { SolveResult } from "./solve";
import type { Currency, EffectiveCurrency } from "./types";

export type SplitSolution = {
  leg1: SolveResult;
  leg2: SolveResult;
  /** true only when BOTH legs are fully covered from the shared wallet. */
  feasible: boolean;
};

// Hard ceiling on the shared-source grid product. The production graph (~6 bank
// currencies transferring to airline programs at coarse 1,000-point increments)
// keeps this in the thousands; the ceiling only guards a pathological input
// (many shared sources with fine grids). It never trips on the seed graph — see
// the PR body for the standing note on the theoretical worst case.
const MAX_GRID_COMBOS = 2_000_000;

function firstEdgeStep(quote: PathQuote): number {
  if (quote.edges.length === 0) return 1; // empty path: balance already in D
  const inc = quote.edges[0]!.edge.increment;
  return inc && inc > 0 ? inc : 1;
}

/** cap1 grid for one shared source: multiples of its leg-1 step up to S1. */
function capGrid(step: number, top: number): number[] {
  const grid: number[] = [];
  for (let v = 0; v <= top; v += step) grid.push(v);
  return grid.length > 0 ? grid : [0];
}

/**
 * Conservation is an invariant, not an emergent property: the points drawn from
 * any currency across BOTH legs must never exceed its balance. An over-drawn
 * wallet is the most damaging bug this product could ship — every number on the
 * page is supposed to be reproducible — so we assert it on every solution.
 */
function assertConserves(
  solution: SplitSolution,
  entries: EffectiveCurrency[]
): SplitSolution {
  const drawn = new Map<string, number>();
  for (const leg of [solution.leg1, solution.leg2]) {
    for (const a of leg.allocations) {
      drawn.set(a.currency_id, (drawn.get(a.currency_id) ?? 0) + a.points_used);
    }
  }
  for (const e of entries) {
    const used = drawn.get(e.currency_id) ?? 0;
    if (used > e.balance) {
      throw new Error(
        `conservation violated: drew ${used} from ${e.currency_id} ` +
          `but balance is ${e.balance}`
      );
    }
  }
  return solution;
}

function sourcesReaching(
  destCurrencyId: string,
  reach: Reachability,
  balances: Map<string, EffectiveCurrency>
): Set<string> {
  const out = new Set<string>();
  for (const [sourceId, quote] of (
    reach.get(destCurrencyId) ?? new Map<string, PathQuote>()
  ).entries()) {
    const entry = balances.get(sourceId);
    if (!entry || !entry.unlocked || entry.balance <= 0) continue;
    if (quote.max_deliverable <= 0) continue;
    out.add(sourceId);
  }
  return out;
}

/**
 * Solve a split trip exactly. Returns both legs' fills and whether the whole
 * trip is coverable from the shared wallet. When it is NOT coverable it falls
 * back to a conservation-respecting report (leg 1 priority, leg 2 the
 * remainder) so the per-leg reachable/gap is honest AND no shared currency is
 * ever over-drawn; the trip is flagged not-bookable by its gap regardless.
 */
export function solveSplit(
  n1: number,
  d1: string,
  n2: number,
  d2: string,
  reach: Reachability,
  entries: EffectiveCurrency[],
  currencies: Currency[]
): SplitSolution {
  const balances = new Map(entries.map((e) => [e.currency_id, e]));

  // Conservation-respecting split when the grid search finds no full-coverage
  // plan (an infeasible trip) OR when the legs share no source. Leg 1 (the
  // outbound) has priority; leg 2 draws only what leg 1 leaves, so a currency
  // both legs can reach is NEVER double-spent. When no source is shared this is
  // exactly the independent optimum (leg 1's draw touches none of leg 2's
  // sources); when the trip cannot be covered it is an honest per-leg report
  // that still respects every balance.
  const conserving = (): SplitSolution => {
    const leg1 = solveCandidate(n1, d1, reach, entries, currencies);
    const used = new Map<string, number>();
    for (const a of leg1.allocations) {
      used.set(a.currency_id, (used.get(a.currency_id) ?? 0) + a.points_used);
    }
    const caps2 = new Map<string, number>();
    for (const e of entries) {
      caps2.set(
        e.currency_id,
        Math.max(0, e.balance - (used.get(e.currency_id) ?? 0))
      );
    }
    const leg2 = solveCandidate(n2, d2, reach, entries, currencies, caps2);
    return { leg1, leg2, feasible: leg1.gap === 0 && leg2.gap === 0 };
  };

  const reach1 = sourcesReaching(d1, reach, balances);
  const reach2 = sourcesReaching(d2, reach, balances);
  const shared = [...reach1].filter((id) => reach2.has(id)).sort();

  // No coupling: the two legs are independent, so their separate optima ARE
  // the joint optimum.
  if (shared.length === 0) return assertConserves(conserving(), entries);

  // Build the cap1 grid for each shared source.
  const grids: { sourceId: string; balance: number; grid: number[] }[] = [];
  let combos = 1;
  for (const sourceId of shared) {
    const entry = balances.get(sourceId)!;
    const quote1 = reach.get(d1)!.get(sourceId)!;
    const step = firstEdgeStep(quote1);
    const s1 = minimalSentFor(quote1.edges, n1, entry.balance);
    const top = Math.min(entry.balance, s1 ?? entry.balance);
    const grid = capGrid(step, top);
    grids.push({ sourceId, balance: entry.balance, grid });
    combos *= grid.length;
    if (combos > MAX_GRID_COMBOS) {
      throw new Error(
        `joint split solve grid too large (${combos} combos) — ` +
          `too many shared sources with fine increments`
      );
    }
  }

  let best: SplitSolution | null = null;
  let bestTotal = Number.POSITIVE_INFINITY;
  let bestHops = Number.POSITIVE_INFINITY;
  let bestHours = Number.POSITIVE_INFINITY;

  const caps1 = new Map<string, number>();
  const caps2 = new Map<string, number>();

  const recurse = (i: number): void => {
    if (i === grids.length) {
      const leg1 = solveCandidate(n1, d1, reach, entries, currencies, caps1);
      if (leg1.gap !== 0) return;
      const leg2 = solveCandidate(n2, d2, reach, entries, currencies, caps2);
      if (leg2.gap !== 0) return;
      const total =
        leg1.total_opportunity_cost_usd + leg2.total_opportunity_cost_usd;
      const hops = leg1.transfer_hops + leg2.transfer_hops;
      const hours = Math.max(leg1.max_transfer_hours, leg2.max_transfer_hours);
      if (
        total < bestTotal ||
        (total === bestTotal && hops < bestHops) ||
        (total === bestTotal && hops === bestHops && hours < bestHours)
      ) {
        best = { leg1, leg2, feasible: true };
        bestTotal = total;
        bestHops = hops;
        bestHours = hours;
      }
      return;
    }
    const { sourceId, balance, grid } = grids[i]!;
    for (const cap1 of grid) {
      caps1.set(sourceId, cap1);
      caps2.set(sourceId, balance - cap1);
      recurse(i + 1);
    }
    caps1.delete(sourceId);
    caps2.delete(sourceId);
  };
  recurse(0);

  // Not jointly coverable: fall back to the conservation-respecting per-leg
  // report (leg 1 priority, leg 2 the remainder) — never an over-drawn wallet.
  return assertConserves(best ?? conserving(), entries);
}
