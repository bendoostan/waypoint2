// Stage 2 (PLAN.md §4.2): from each UNLOCKED currency, walk active transfer
// edges to depth ≤ 2. Locked currencies are never sources. Bonuses apply
// only when approved AND starts_at ≤ now < ends_at.
import type { TransferStep } from "./schema";
import type {
  Currency,
  EffectiveCurrency,
  TransferBonus,
  TransferPartner,
} from "./types";

export type EdgeUse = {
  edge: TransferPartner;
  bonus_pct: number | null;
};

/** Best known way to move points from one source currency into a program. */
export type PathQuote = {
  source_currency_id: string;
  dest_currency_id: string;
  /** empty = points already live in the destination program */
  edges: EdgeUse[];
  hops: number;
  total_hours: number;
  /** delivered points if the source's full balance is pushed through */
  max_deliverable: number;
};

/** dest currency id -> (source currency id -> best quote) */
export type Reachability = Map<string, Map<string, PathQuote>>;

export function bonusPctForEdge(
  edge: TransferPartner,
  bonuses: TransferBonus[],
  now: Date
): number | null {
  let best: number | null = null;
  for (const b of bonuses) {
    if (b.transfer_partner_id !== edge.id) continue;
    if (b.status !== "approved") continue;
    const starts = new Date(b.starts_at).getTime();
    const ends = new Date(b.ends_at).getTime();
    if (!(starts <= now.getTime() && now.getTime() < ends)) continue;
    if (best === null || b.bonus_pct > best) best = b.bonus_pct;
  }
  return best;
}

/** Round an amount down to what the edge will actually accept. */
function usableOnEdge(amount: number, edge: TransferPartner): number {
  if (edge.min_transfer !== null && amount < edge.min_transfer) return 0;
  if (edge.increment !== null && edge.increment > 0) {
    return Math.floor(amount / edge.increment) * edge.increment;
  }
  return Math.floor(amount);
}

export type DeliveryResult = {
  /** points consumed from the source (first-edge usable amount) */
  sent: number;
  /** points arriving in the destination program */
  delivered: number;
  steps: Omit<TransferStep, "from_currency_name" | "to_currency_name">[];
};

/**
 * Push `sourcePoints` through a path, applying min_transfer/increment
 * rounding on every hop and any active bonus on the destination side.
 */
export function deliverThrough(
  edges: EdgeUse[],
  sourcePoints: number
): DeliveryResult {
  if (edges.length === 0) {
    const amount = Math.max(0, Math.floor(sourcePoints));
    return { sent: amount, delivered: amount, steps: [] };
  }

  const steps: DeliveryResult["steps"] = [];
  let sent = 0;
  let amount = Math.max(0, Math.floor(sourcePoints));

  for (const [i, { edge, bonus_pct }] of edges.entries()) {
    const usable = usableOnEdge(amount, edge);
    if (usable <= 0) {
      return { sent: 0, delivered: 0, steps: [] };
    }
    if (i === 0) sent = usable;
    const base = (usable * edge.ratio_den) / edge.ratio_num;
    const delivered = Math.floor(base * (1 + (bonus_pct ?? 0) / 100));
    steps.push({
      from_currency_id: edge.from_currency_id,
      to_currency_id: edge.to_currency_id,
      points_sent: usable,
      points_delivered: delivered,
      bonus_pct,
      transfer_hours_est: edge.transfer_hours_est,
    });
    amount = delivered;
  }

  return { sent, delivered: amount, steps };
}

/**
 * Smallest source amount whose delivery is >= target, or null if even the
 * full balance falls short. Monotonicity of deliverThrough makes binary
 * search valid; the first edge's increment defines the search grid.
 */
export function minimalSentFor(
  edges: EdgeUse[],
  target: number,
  maxSource: number
): number | null {
  if (target <= 0) return 0;
  if (edges.length === 0) {
    return target <= maxSource ? target : null;
  }
  if (deliverThrough(edges, maxSource).delivered < target) return null;

  const first = edges[0]!.edge;
  const step = first.increment && first.increment > 0 ? first.increment : 1;
  let lo = 0;
  let hi = Math.floor(maxSource / step);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (deliverThrough(edges, mid * step).delivered >= target) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo * step;
}

function betterQuote(a: PathQuote, b: PathQuote): PathQuote {
  if (a.max_deliverable !== b.max_deliverable) {
    return a.max_deliverable > b.max_deliverable ? a : b;
  }
  if (a.hops !== b.hops) return a.hops < b.hops ? a : b;
  return a.total_hours <= b.total_hours ? a : b;
}

export function expandReachability(
  entries: EffectiveCurrency[],
  partners: TransferPartner[],
  bonuses: TransferBonus[],
  currencies: Currency[],
  now: Date
): Reachability {
  const activeCurrencyIds = new Set(
    currencies.filter((c) => c.is_active).map((c) => c.id)
  );
  const activeEdges = partners.filter(
    (p) =>
      p.is_active &&
      activeCurrencyIds.has(p.from_currency_id) &&
      activeCurrencyIds.has(p.to_currency_id)
  );
  const edgesFrom = new Map<string, TransferPartner[]>();
  for (const e of activeEdges) {
    const list = edgesFrom.get(e.from_currency_id) ?? [];
    list.push(e);
    edgesFrom.set(e.from_currency_id, list);
  }

  const reach: Reachability = new Map();
  const add = (quote: PathQuote) => {
    if (quote.max_deliverable <= 0) return;
    const perSource = reach.get(quote.dest_currency_id) ?? new Map();
    const existing = perSource.get(quote.source_currency_id);
    perSource.set(
      quote.source_currency_id,
      existing ? betterQuote(existing, quote) : quote
    );
    reach.set(quote.dest_currency_id, perSource);
  };

  // Locked currencies never appear as transfer sources.
  const sources = entries.filter((e) => e.unlocked && e.balance > 0);

  for (const source of sources) {
    const quoteFor = (edges: EdgeUse[], dest: string): PathQuote => ({
      source_currency_id: source.currency_id,
      dest_currency_id: dest,
      edges,
      hops: edges.length,
      total_hours: edges.reduce((h, e) => h + e.edge.transfer_hours_est, 0),
      max_deliverable: deliverThrough(edges, source.balance).delivered,
    });

    // depth 0: the balance already lives in this program
    add(quoteFor([], source.currency_id));

    for (const e1 of edgesFrom.get(source.currency_id) ?? []) {
      const use1: EdgeUse = {
        edge: e1,
        bonus_pct: bonusPctForEdge(e1, bonuses, now),
      };
      add(quoteFor([use1], e1.to_currency_id));

      // depth 2 and no further — PLAN.md §2.5: exact answers on a small graph
      for (const e2 of edgesFrom.get(e1.to_currency_id) ?? []) {
        if (e2.to_currency_id === source.currency_id) continue;
        const use2: EdgeUse = {
          edge: e2,
          bonus_pct: bonusPctForEdge(e2, bonuses, now),
        };
        add(quoteFor([use1, use2], e2.to_currency_id));
      }
    }
  }

  return reach;
}
