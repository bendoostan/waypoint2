import { describe, expect, it } from "vitest";

import { generatePlan } from "./index";
import { deliverThrough, expandReachability } from "./reachability";
import type { PathQuote, Reachability } from "./reachability";
import { solveSplit } from "./trip";
import type {
  AwardRoute,
  CardCatalog,
  Currency,
  EffectiveCurrency,
  EngineGoal,
  EngineInput,
  EngineLeg,
  TransferPartner,
} from "./types";

// ---------------------------------------------------------------------------
// Synthetic, obviously-fake fixtures (no real currencies/ratios/routes).
// ---------------------------------------------------------------------------
const NOW = new Date("2026-08-01T00:00:00Z");

function mkCurrency(id: string, over: Partial<Currency> = {}): Currency {
  return {
    id,
    name: `C-${id.slice(-4)}`,
    kind: "bank",
    alliance: null,
    cashback_cpp: 1,
    transfer_cpp: 1,
    requires_unlock: false,
    is_active: true,
    notes: null,
    brand_color: null,
    logo_url: null,
    ...over,
  };
}

function mkEdge(
  id: string,
  from: string,
  to: string,
  over: Partial<TransferPartner> = {}
): TransferPartner {
  return {
    id,
    from_currency_id: from,
    to_currency_id: to,
    ratio_num: 1,
    ratio_den: 1,
    transfer_hours_est: 0,
    min_transfer: 1000,
    increment: 1000,
    is_active: true,
    notes: null,
    ...over,
  };
}

function firstEdgeStep(quote: PathQuote): number {
  if (quote.edges.length === 0) return 1;
  const inc = quote.edges[0]!.edge.increment;
  return inc && inc > 0 ? inc : 1;
}

/** Total points drawn from one currency across both legs of a split. */
function drawnFrom(
  split: {
    leg1: { allocations: { currency_id: string; points_used: number }[] };
    leg2: { allocations: { currency_id: string; points_used: number }[] };
  },
  currencyId: string
): number {
  return [...split.leg1.allocations, ...split.leg2.allocations]
    .filter((a) => a.currency_id === currencyId)
    .reduce((s, a) => s + a.points_used, 0);
}

/**
 * Independent brute force: enumerate EVERY increment-grid split of every
 * source's balance between the two destinations, and return the minimum total
 * opportunity cost that delivers >= n1 into d1 AND >= n2 into d2 (null if no
 * split covers both). This is the certifying oracle for solveSplit.
 */
function bruteForceSplit(
  n1: number,
  d1: string,
  n2: number,
  d2: string,
  reach: Reachability,
  entries: EffectiveCurrency[]
): number | null {
  const balances = new Map(entries.map((e) => [e.currency_id, e]));
  const idsD1 = reach.get(d1) ?? new Map<string, PathQuote>();
  const idsD2 = reach.get(d2) ?? new Map<string, PathQuote>();
  const allIds = new Set<string>([...idsD1.keys(), ...idsD2.keys()]);

  const sources: {
    cpp: number;
    balance: number;
    q1: PathQuote | null;
    q2: PathQuote | null;
  }[] = [];
  for (const id of allIds) {
    const e = balances.get(id);
    if (!e || !e.unlocked || e.balance <= 0) continue;
    sources.push({
      cpp: e.cpp,
      balance: e.balance,
      q1: idsD1.get(id) ?? null,
      q2: idsD2.get(id) ?? null,
    });
  }

  let best: number | null = null;
  const recurse = (
    i: number,
    del1: number,
    del2: number,
    cost: number
  ): void => {
    if (i === sources.length) {
      if (del1 >= n1 && del2 >= n2) {
        best = best === null ? cost : Math.min(best, cost);
      }
      return;
    }
    const s = sources[i]!;
    const step1 = s.q1 ? firstEdgeStep(s.q1) : 0;
    const step2 = s.q2 ? firstEdgeStep(s.q2) : 0;

    for (let sent1 = 0; sent1 <= s.balance; sent1 += step1 || s.balance + 1) {
      const r1 =
        s.q1 && sent1 > 0
          ? deliverThrough(s.q1.edges, sent1)
          : { sent: 0, delivered: 0, steps: [] };
      const used1 = r1.sent;
      if (used1 > s.balance) {
        if (step1 === 0) break;
        continue;
      }
      const room = s.balance - used1;
      for (let sent2 = 0; sent2 <= room; sent2 += step2 || s.balance + 1) {
        const r2 =
          s.q2 && sent2 > 0
            ? deliverThrough(s.q2.edges, sent2)
            : { sent: 0, delivered: 0, steps: [] };
        if (r2.sent > room) {
          if (step2 === 0) break;
          continue;
        }
        const c = (used1 * s.cpp) / 100 + (r2.sent * s.cpp) / 100;
        recurse(i + 1, del1 + r1.delivered, del2 + r2.delivered, cost + c);
        if (step2 === 0) break;
      }
      if (step1 === 0) break;
    }
  };
  recurse(0, 0, 0, 0);
  return best === null ? null : Math.round(best * 100) / 100;
}

type Scenario = {
  name: string;
  currencies: Currency[];
  edges: TransferPartner[];
  entries: EffectiveCurrency[];
  d1: string;
  d2: string;
  n1: number;
  n2: number;
};

const D1 = "aaaaaaaa-0000-4000-8000-0000000000d1";
const D2 = "aaaaaaaa-0000-4000-8000-0000000000d2";
const S = "aaaaaaaa-0000-4000-8000-0000000000a9";
const A = "aaaaaaaa-0000-4000-8000-0000000000aa";
const B = "aaaaaaaa-0000-4000-8000-0000000000bb";
const S2 = "aaaaaaaa-0000-4000-8000-0000000000c2";

const scenarios: Scenario[] = [
  {
    // One shared cheap source S plus expensive dedicated A (→D1) and B (→D2).
    // Splitting S across both legs is strictly cheaper than any no-split plan.
    name: "shared source must split (1:1)",
    currencies: [
      mkCurrency(D1, { kind: "airline" }),
      mkCurrency(D2, { kind: "airline" }),
      mkCurrency(S, { transfer_cpp: 1.0 }),
      mkCurrency(A, { transfer_cpp: 2.0 }),
      mkCurrency(B, { transfer_cpp: 2.0 }),
    ],
    edges: [
      mkEdge("e1", S, D1),
      mkEdge("e2", S, D2),
      mkEdge("e3", A, D1),
      mkEdge("e4", B, D2),
    ],
    entries: [
      { currency_id: S, balance: 6000, unlocked: true, cpp: 1.0 },
      { currency_id: A, balance: 6000, unlocked: true, cpp: 2.0 },
      { currency_id: B, balance: 6000, unlocked: true, cpp: 2.0 },
    ],
    d1: D1,
    d2: D2,
    n1: 3000,
    n2: 3000,
  },
  {
    // Lossy 2:1 into D2 changes the delivery efficiency between legs.
    name: "shared source with a 2:1 hop into D2",
    currencies: [
      mkCurrency(D1, { kind: "airline" }),
      mkCurrency(D2, { kind: "airline" }),
      mkCurrency(S, { transfer_cpp: 1.0 }),
    ],
    edges: [
      mkEdge("e1", S, D1, { ratio_num: 1, ratio_den: 1 }),
      mkEdge("e2", S, D2, { ratio_num: 2, ratio_den: 1 }),
    ],
    entries: [{ currency_id: S, balance: 12000, unlocked: true, cpp: 1.0 }],
    d1: D1,
    d2: D2,
    n1: 3000,
    n2: 2000,
  },
  {
    // Two shared sources of different cpp — both may be split.
    name: "two shared sources",
    currencies: [
      mkCurrency(D1, { kind: "airline" }),
      mkCurrency(D2, { kind: "airline" }),
      mkCurrency(S, { transfer_cpp: 1.0 }),
      mkCurrency(S2, { transfer_cpp: 1.5 }),
    ],
    edges: [
      mkEdge("e1", S, D1),
      mkEdge("e2", S, D2),
      mkEdge("e3", S2, D1),
      mkEdge("e4", S2, D2),
    ],
    entries: [
      { currency_id: S, balance: 5000, unlocked: true, cpp: 1.0 },
      { currency_id: S2, balance: 5000, unlocked: true, cpp: 1.5 },
    ],
    d1: D1,
    d2: D2,
    n1: 4000,
    n2: 4000,
  },
  {
    // Increment/min-transfer rounding on a shared source.
    name: "coarse increment rounding",
    currencies: [
      mkCurrency(D1, { kind: "airline" }),
      mkCurrency(D2, { kind: "airline" }),
      mkCurrency(S, { transfer_cpp: 1.0 }),
      mkCurrency(A, { transfer_cpp: 3.0 }),
      mkCurrency(B, { transfer_cpp: 3.0 }),
    ],
    edges: [
      mkEdge("e1", S, D1, { min_transfer: 2000, increment: 2000 }),
      mkEdge("e2", S, D2, { min_transfer: 2000, increment: 2000 }),
      mkEdge("e3", A, D1),
      mkEdge("e4", B, D2),
    ],
    entries: [
      { currency_id: S, balance: 10000, unlocked: true, cpp: 1.0 },
      { currency_id: A, balance: 8000, unlocked: true, cpp: 3.0 },
      { currency_id: B, balance: 8000, unlocked: true, cpp: 3.0 },
    ],
    d1: D1,
    d2: D2,
    n1: 5000,
    n2: 5000,
  },
];

describe("solveSplit is exact (certified against brute force)", () => {
  for (const sc of scenarios) {
    it(sc.name, () => {
      const reach = expandReachability(
        sc.entries,
        sc.edges,
        [],
        sc.currencies,
        NOW
      );
      const brute = bruteForceSplit(
        sc.n1,
        sc.d1,
        sc.n2,
        sc.d2,
        reach,
        sc.entries
      );
      const split = solveSplit(
        sc.n1,
        sc.d1,
        sc.n2,
        sc.d2,
        reach,
        sc.entries,
        sc.currencies
      );

      // Conservation holds on every scenario: no source is ever over-drawn.
      for (const e of sc.entries) {
        expect(drawnFrom(split, e.currency_id)).toBeLessThanOrEqual(e.balance);
      }

      if (brute === null) {
        expect(split.feasible).toBe(false);
        return;
      }
      expect(split.feasible).toBe(true);
      expect(split.leg1.gap).toBe(0);
      expect(split.leg2.gap).toBe(0);
      const total =
        split.leg1.total_opportunity_cost_usd +
        split.leg2.total_opportunity_cost_usd;
      expect(total).toBe(brute);
    });
  }

  it("beats every dedicated-only (no-split) assignment strictly", () => {
    // The first scenario: S must be split. Compare the joint optimum to the
    // best plan that gives S wholly to one leg (never splitting it).
    const sc = scenarios[0]!;
    const reach = expandReachability(
      sc.entries,
      sc.edges,
      [],
      sc.currencies,
      NOW
    );
    const split = solveSplit(
      sc.n1,
      sc.d1,
      sc.n2,
      sc.d2,
      reach,
      sc.entries,
      sc.currencies
    );
    const jointCost =
      split.leg1.total_opportunity_cost_usd +
      split.leg2.total_opportunity_cost_usd;

    // Best no-split cost: enumerate the two whole-source assignments of S.
    const noSplit = (giveSTo: "d1" | "d2"): number | null => {
      const capBalances = sc.entries;
      // brute force but forbidding S from feeding the OTHER leg
      const filtered = new Map(reach);
      const clone = (destId: string, keep: boolean) => {
        const per = new Map(reach.get(destId) ?? new Map<string, PathQuote>());
        if (!keep) per.delete(S);
        filtered.set(destId, per);
      };
      clone(sc.d1, giveSTo === "d1");
      clone(sc.d2, giveSTo === "d2");
      return bruteForceSplit(sc.n1, sc.d1, sc.n2, sc.d2, filtered, capBalances);
    };
    const bestNoSplit = [noSplit("d1"), noSplit("d2")].filter(
      (c): c is number => c !== null
    );

    // Splitting S is feasible and cheaper than any no-split plan (here the
    // no-split plans are infeasible, so none survive at all).
    expect(split.feasible).toBe(true);
    for (const c of bestNoSplit) expect(jointCost).toBeLessThan(c);
  });
});

describe("solveSplit conserves the wallet (never double-spends a shared source)", () => {
  it("caps a shared source at its balance when both legs want all of it", () => {
    // S can reach BOTH programs 1:1, but 30k can't cover 20k + 20k = 40k. A
    // naive per-leg fill would draw 20k for each (40k > 30k). Conservation must
    // hold: the total drawn from S never exceeds 30k.
    const currencies = [
      mkCurrency(D1, { kind: "airline" }),
      mkCurrency(D2, { kind: "airline" }),
      mkCurrency(S, { transfer_cpp: 1.0 }),
    ];
    const edges = [mkEdge("c1", S, D1), mkEdge("c2", S, D2)];
    const entries: EffectiveCurrency[] = [
      { currency_id: S, balance: 30000, unlocked: true, cpp: 1.0 },
    ];
    const reach = expandReachability(entries, edges, [], currencies, NOW);
    const split = solveSplit(20000, D1, 20000, D2, reach, entries, currencies);

    expect(split.feasible).toBe(false); // 40k wanted, 30k available
    expect(drawnFrom(split, S)).toBeLessThanOrEqual(30000);
    // Leg 1 (outbound) has priority and is covered; leg 2 gets the remainder.
    expect(split.leg1.gap).toBe(0);
    expect(split.leg2.gap).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// generatePlan-level trip option selection (new trip-level contract).
// ---------------------------------------------------------------------------
function mkCard(id: string, currencyId: string): CardCatalog {
  return {
    id,
    name: `Card ${id.slice(-2)}`,
    issuer: "TestBank",
    currency_id: currencyId,
    annual_fee: 0,
    unlocks_transfers: false,
    affiliate_url: null,
    application_rules: null,
    is_active: true,
    discontinued_at: null,
    notes: null,
    brand_color: null,
    logo_url: null,
  };
}

function mkRoute(
  over: Partial<AwardRoute> &
    Pick<
      AwardRoute,
      "id" | "name" | "program_currency_id" | "destination_airports"
    >
): AwardRoute {
  return {
    origin_region: "Origin",
    origin_airports: null,
    destination_region: "Dest",
    cabin: "business",
    points_oneway: 20000,
    taxes_fees_usd_est: 50,
    booking_url: null,
    notes: null,
    is_active: true,
    last_verified_at: null,
    booking_unit: "one_way",
    pricing_mode: "fixed",
    ...over,
  };
}

function leg(over: Partial<EngineLeg>): EngineLeg {
  return {
    seq: 1,
    origin_airport: "SFO",
    destination_airport: "HND",
    destination_region: "Dest",
    cabin: "business",
    travel_month: null,
    ...over,
  };
}

const goal = (legs: EngineLeg[]): EngineGoal => ({
  num_travelers: 1,
  flexibility: "anytime",
  legs,
});

/** A round trip is two legs on ONE route (same program, one booking). */
function isRoundTrip(s: { legs: { route_id: string }[] }): boolean {
  return s.legs.length === 2 && s.legs[0]!.route_id === s.legs[1]!.route_id;
}

describe("generatePlan — round-trip unit vs two one-ways (mixed program)", () => {
  const D = "bbbbbbbb-0000-4000-8000-0000000000d0";
  const PD1 = "bbbbbbbb-0000-4000-8000-0000000000d1";
  const PD2 = "bbbbbbbb-0000-4000-8000-0000000000d2";
  const bank = "bbbbbbbb-0000-4000-8000-0000000000b0";
  const cardId = "bbbbbbbb-0000-4000-8000-0000000000c0";

  const currencies: Currency[] = [
    mkCurrency(D, { kind: "airline", transfer_cpp: 1.5 }),
    mkCurrency(PD1, { kind: "airline", transfer_cpp: 1.5 }),
    mkCurrency(PD2, { kind: "airline", transfer_cpp: 1.5 }),
    mkCurrency(bank, { kind: "bank", transfer_cpp: 1.0 }),
  ];
  const cards = [mkCard(cardId, bank)];
  const edges = [
    mkEdge("re1", bank, D, { ratio_num: 1, ratio_den: 1 }),
    mkEdge("re2", bank, PD1, { ratio_num: 2, ratio_den: 1 }), // lossy 2:1
    mkEdge("re3", bank, PD2, { ratio_num: 2, ratio_den: 1 }), // lossy 2:1
  ];
  const routes: AwardRoute[] = [
    mkRoute({
      id: "bbbbbbbb-0000-4000-8000-000000000100",
      name: "RT unit on D",
      program_currency_id: D,
      destination_airports: ["HND"],
      origin_airports: ["SFO"],
      booking_unit: "round_trip",
    }),
    mkRoute({
      id: "bbbbbbbb-0000-4000-8000-000000000201",
      name: "Outbound on D1",
      program_currency_id: PD1,
      origin_airports: ["SFO"],
      destination_airports: ["HND"],
    }),
    mkRoute({
      id: "bbbbbbbb-0000-4000-8000-000000000202",
      name: "Return on D2",
      program_currency_id: PD2,
      origin_airports: ["HND"],
      destination_airports: ["SFO"],
    }),
    mkRoute({
      id: "bbbbbbbb-0000-4000-8000-000000000203",
      name: "Return to LAX on D2",
      program_currency_id: PD2,
      origin_airports: ["HND"],
      destination_airports: ["LAX"],
    }),
  ];

  const reference = {
    currencies,
    cards,
    earningRates: [],
    welcomeOffers: [],
    transferPartners: edges,
    transferBonuses: [],
    awardRoutes: routes,
  };

  const baseInput = (legs: EngineLeg[]): EngineInput => ({
    wallet: [
      {
        id: "bbbbbbbb-0000-4000-8000-0000000000w0",
        card_id: cardId,
        points_balance: 200000,
        opened_at: null,
        card: cards[0]!,
      },
    ],
    referenceData: reference,
    goal: goal(legs),
    availability: [],
    monthlySpend: {},
    now: NOW,
  });

  it("chooses the round-trip unit when it is cheaper than two one-ways", () => {
    const plan = generatePlan(
      baseInput([
        leg({ seq: 1, origin_airport: "SFO", destination_airport: "HND" }),
        leg({ seq: 2, origin_airport: "HND", destination_airport: "SFO" }),
      ])
    );
    // both are bookable_now; the RT unit (40k via 1:1) beats the split
    // (40k+40k source via 2:1), so it sorts first.
    const top = plan.strategies[0]!;
    expect(isRoundTrip(top)).toBe(true);
    expect(top.gap_total).toBe(0);
    expect(top.points_needed_total).toBe(40000); // 20k × 2 directions
    expect(top.legs.map((l) => l.seq)).toEqual([1, 2]);
    // the split option is still offered, and costs more
    const split = plan.strategies.find((s) => !isRoundTrip(s))!;
    expect(split.legs).toHaveLength(2);
    expect(top.total_opportunity_cost_usd).toBeLessThan(
      split.total_opportunity_cost_usd
    );
  });

  it("mixed-program split: out on one program, home on another", () => {
    const plan = generatePlan(
      baseInput([
        leg({ seq: 1, origin_airport: "SFO", destination_airport: "HND" }),
        leg({ seq: 2, origin_airport: "HND", destination_airport: "SFO" }),
      ])
    );
    const split = plan.strategies.find(
      (s) =>
        !isRoundTrip(s) &&
        s.legs[0]!.program_currency_id !== s.legs[1]!.program_currency_id
    );
    expect(split).toBeDefined();
    expect(split!.legs[0]!.program_currency_name).toBe("C-00d1");
    expect(split!.legs[1]!.program_currency_name).toBe("C-00d2");
    // a currency feeding both legs appears once per leg_seq
    expect(new Set(split!.allocations.map((a) => a.leg_seq))).toEqual(
      new Set([1, 2])
    );
  });

  it("open-jaw: no round-trip unit; solved as two one-ways", () => {
    const plan = generatePlan(
      baseInput([
        leg({ seq: 1, origin_airport: "SFO", destination_airport: "HND" }),
        // home from a DIFFERENT city — not the reverse of leg 1
        leg({ seq: 2, origin_airport: "HND", destination_airport: "LAX" }),
      ])
    );
    expect(plan.strategies.length).toBeGreaterThan(0);
    expect(plan.strategies.every((s) => !isRoundTrip(s))).toBe(true);
    expect(plan.strategies[0]!.legs).toHaveLength(2);
  });
});

describe("generatePlan — round-trip-only route is rejected for a one-way goal", () => {
  const D = "dddddddd-0000-4000-8000-0000000000d0";
  const bank = "dddddddd-0000-4000-8000-0000000000b0";
  const cardId = "dddddddd-0000-4000-8000-0000000000c0";
  const currencies = [
    mkCurrency(D, { kind: "airline", transfer_cpp: 1.5 }),
    mkCurrency(bank, { kind: "bank", transfer_cpp: 1.0 }),
  ];
  const cards = [mkCard(cardId, bank)];
  const edges = [mkEdge("oe1", bank, D)];
  const routes = [
    mkRoute({
      id: "dddddddd-0000-4000-8000-000000000100",
      name: "RT only on D",
      program_currency_id: D,
      origin_airports: ["SFO"],
      destination_airports: ["HND"],
      booking_unit: "round_trip",
    }),
  ];

  it("a one-way goal finds no strategy from a round_trip-only route", () => {
    const plan = generatePlan({
      wallet: [
        {
          id: "dddddddd-0000-4000-8000-0000000000w0",
          card_id: cardId,
          points_balance: 200000,
          opened_at: null,
          card: cards[0]!,
        },
      ],
      referenceData: {
        currencies,
        cards,
        earningRates: [],
        welcomeOffers: [],
        transferPartners: edges,
        transferBonuses: [],
        awardRoutes: routes,
      },
      goal: goal([
        leg({ seq: 1, origin_airport: "SFO", destination_airport: "HND" }),
      ]),
      availability: [],
      monthlySpend: {},
      now: NOW,
    });
    expect(plan.strategies).toHaveLength(0);
  });
});

describe("generatePlan — per-leg partial coverage", () => {
  const PD1 = "cccccccc-0000-4000-8000-0000000000d1";
  const PD2 = "cccccccc-0000-4000-8000-0000000000d2";
  const bank1 = "cccccccc-0000-4000-8000-0000000000b1";
  const bank2 = "cccccccc-0000-4000-8000-0000000000b2";
  const card1 = "cccccccc-0000-4000-8000-0000000000c1";
  const card2 = "cccccccc-0000-4000-8000-0000000000c2";

  // Two disjoint banks — one per leg — so this isolates the per-leg gap from
  // any shared-wallet contention.
  const currencies: Currency[] = [
    mkCurrency(PD1, { kind: "airline", transfer_cpp: 1.5 }),
    mkCurrency(PD2, { kind: "airline", transfer_cpp: 1.5 }),
    mkCurrency(bank1, { kind: "bank", transfer_cpp: 1.0 }),
    mkCurrency(bank2, { kind: "bank", transfer_cpp: 1.0 }),
  ];
  const cards = [mkCard(card1, bank1), mkCard(card2, bank2)];
  const edges = [mkEdge("pe1", bank1, PD1), mkEdge("pe2", bank2, PD2)];
  const routes: AwardRoute[] = [
    mkRoute({
      id: "cccccccc-0000-4000-8000-000000000201",
      name: "Outbound D1",
      program_currency_id: PD1,
      origin_airports: ["SFO"],
      destination_airports: ["HND"],
      points_oneway: 20000,
    }),
    mkRoute({
      id: "cccccccc-0000-4000-8000-000000000202",
      name: "Return D2",
      program_currency_id: PD2,
      origin_airports: ["HND"],
      destination_airports: ["SFO"],
      points_oneway: 50000,
    }),
  ];

  it("reports leg 1 bookable and leg 2 short; the worst leg drives the trip", () => {
    const plan = generatePlan({
      wallet: [
        {
          id: "cccccccc-0000-4000-8000-0000000000w1",
          card_id: card1,
          points_balance: 20000, // covers leg 1 (20k)
          opened_at: null,
          card: cards[0]!,
        },
        {
          id: "cccccccc-0000-4000-8000-0000000000w2",
          card_id: card2,
          points_balance: 20000, // short for leg 2 (50k)
          opened_at: null,
          card: cards[1]!,
        },
      ],
      referenceData: {
        currencies,
        cards,
        earningRates: [],
        welcomeOffers: [],
        transferPartners: edges,
        transferBonuses: [],
        awardRoutes: routes,
      },
      goal: goal([
        leg({ seq: 1, origin_airport: "SFO", destination_airport: "HND" }),
        leg({ seq: 2, origin_airport: "HND", destination_airport: "SFO" }),
      ]),
      availability: [],
      monthlySpend: {},
      now: NOW,
    });

    expect(plan.strategies).toHaveLength(1);
    const trip = plan.strategies[0]!;
    expect(trip.legs).toHaveLength(2);
    const leg1 = trip.legs.find((l) => l.seq === 1)!;
    const leg2 = trip.legs.find((l) => l.seq === 2)!;
    expect(leg1.gap).toBe(0); // bookable
    expect(leg2.gap).toBe(30000); // 50k need − 20k reachable
    expect(trip.gap_total).toBe(30000);
    expect(trip.tier).not.toBe("bookable_now"); // worst leg drives the tier
    expect(trip.months_to_goal).toBeNull(); // no spend → undatable gap
  });
});
