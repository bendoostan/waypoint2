import { describe, expect, it } from "vitest";

import { expandReachability } from "./reachability";
import { matchLegRoutes, matchRoundTripRoutes } from "./routes";
import { solveCandidate } from "./solve";
import { seedAwardRoutes } from "./test-fixtures";
import type {
  Currency,
  EffectiveCurrency,
  EngineLeg,
  TransferPartner,
} from "./types";

const P = "cccccccc-0000-4000-8000-00000000000f"; // target program
const X = "cccccccc-0000-4000-8000-00000000000a"; // pricey bank points
const Y = "cccccccc-0000-4000-8000-00000000000b"; // cheap bank points

function mkCurrency(
  id: string,
  name: string,
  over: Partial<Currency> = {}
): Currency {
  return {
    id,
    name,
    kind: "bank",
    alliance: null,
    cashback_cpp: 1,
    transfer_cpp: 1,
    requires_unlock: false,
    is_active: true,
    notes: null,
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
    min_transfer: null,
    increment: null,
    is_active: true,
    notes: null,
    ...over,
  };
}

const NOW = new Date("2026-08-01T00:00:00Z");

describe("solveCandidate is exact, not greedy", () => {
  // Greedy-by-biggest-balance drains X (100k @ 2.0cpp) first. The optimal
  // answer sources everything from the smaller but cheaper Y (1.0cpp).
  const currencies = [
    mkCurrency(P, "Program", { kind: "airline" }),
    mkCurrency(X, "Pricey", { transfer_cpp: 2.0 }),
    mkCurrency(Y, "Cheap", { transfer_cpp: 1.0 }),
  ];
  const edges = [
    mkEdge("dddddddd-0000-4000-8000-000000000001", X, P),
    mkEdge("dddddddd-0000-4000-8000-000000000002", Y, P),
  ];
  const entries: EffectiveCurrency[] = [
    { currency_id: X, balance: 100_000, unlocked: true, cpp: 2.0 },
    { currency_id: Y, balance: 60_000, unlocked: true, cpp: 1.0 },
  ];
  const reach = expandReachability(entries, edges, [], currencies, NOW);

  it("sources the whole need from the cheaper currency", () => {
    const result = solveCandidate(60_000, P, reach, entries, currencies);
    expect(result.gap).toBe(0);
    expect(result.reachable_points).toBe(60_000);
    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0]!.currency_id).toBe(Y);
    expect(result.total_opportunity_cost_usd).toBe(600); // not $1,200
  });

  it("splits across sources when one cannot cover alone", () => {
    const result = solveCandidate(100_000, P, reach, entries, currencies);
    expect(result.gap).toBe(0);
    const byId = new Map(result.allocations.map((a) => [a.currency_id, a]));
    expect(byId.get(Y)?.points_delivered).toBe(60_000);
    expect(byId.get(X)?.points_delivered).toBe(40_000);
    expect(result.total_opportunity_cost_usd).toBe(600 + 800);
  });

  it("reports a non-negative gap when everything falls short", () => {
    const result = solveCandidate(500_000, P, reach, entries, currencies);
    expect(result.gap).toBe(500_000 - 160_000);
    expect(result.reachable_points).toBe(160_000);
    expect(result.gap).toBeGreaterThanOrEqual(0);
  });

  it("prefers fewer hops on equal cost", () => {
    const Z = "cccccccc-0000-4000-8000-00000000000e";
    const mid = "cccccccc-0000-4000-8000-00000000000d";
    const cs = [
      mkCurrency(P, "Program", { kind: "airline" }),
      mkCurrency(Z, "Direct", { transfer_cpp: 1.0 }),
      mkCurrency(mid, "Mid"),
    ];
    // Z→P direct AND Z→mid→P two-hop, same total ratio and cost
    const es = [
      mkEdge("dddddddd-0000-4000-8000-000000000003", Z, P),
      mkEdge("dddddddd-0000-4000-8000-000000000004", Z, mid),
      mkEdge("dddddddd-0000-4000-8000-000000000005", mid, P),
    ];
    const en: EffectiveCurrency[] = [
      { currency_id: Z, balance: 50_000, unlocked: true, cpp: 1.0 },
    ];
    const r = expandReachability(en, es, [], cs, NOW);
    const result = solveCandidate(30_000, P, r, en, cs);
    expect(result.allocations[0]!.path).toHaveLength(1); // direct beats 2-hop
  });
});

function leg(over: Partial<EngineLeg> = {}): EngineLeg {
  return {
    leg_index: 1,
    origin_airport: "JFK",
    destination_airport: null,
    destination_region: null,
    cabin: "economy",
    ...over,
  };
}

describe("matchLegRoutes (one_way routes serve a single leg)", () => {
  it("prefers airport matches over region matches", () => {
    // A specific CDG airport goal matches the Flying Blue route by airport.
    const candidates = matchLegRoutes(
      seedAwardRoutes,
      leg({ destination_airport: "CDG", destination_region: "Europe" }),
      []
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.route.name).toContain("Flying Blue");
    expect(candidates[0]!.match_type).toBe("airport");
  });

  it("matches on region when the leg has no airport", () => {
    const candidates = matchLegRoutes(
      seedAwardRoutes,
      leg({ destination_region: "Europe" }),
      []
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.match_type).toBe("region");
  });

  it("filters on cabin", () => {
    const candidates = matchLegRoutes(
      seedAwardRoutes,
      leg({ destination_region: "Europe", cabin: "business" }),
      []
    );
    expect(candidates).toHaveLength(0);
  });

  it("rejects origins outside the route's airport list", () => {
    const candidates = matchLegRoutes(
      seedAwardRoutes,
      leg({ origin_airport: "MIA", destination_airport: "CDG" }),
      []
    );
    expect(candidates).toHaveLength(0);
  });

  it("never surfaces a round_trip route as a one-way leg", () => {
    // The ANA route is booking_unit=round_trip, so it is not a leg candidate.
    const candidates = matchLegRoutes(
      seedAwardRoutes,
      leg({
        origin_airport: "SFO",
        destination_airport: "HND",
        cabin: "business",
      }),
      []
    );
    expect(candidates).toHaveLength(0);
  });
});

describe("matchRoundTripRoutes (round_trip routes cover both legs)", () => {
  const out = leg({
    origin_airport: "SFO",
    destination_airport: "HND",
    cabin: "business",
  });
  const back = leg({
    leg_index: 2,
    origin_airport: "HND",
    destination_airport: "SFO",
    cabin: "business",
  });

  it("matches ANA when the two legs are exact reverses", () => {
    const candidates = matchRoundTripRoutes(seedAwardRoutes, out, back, []);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.route.name).toContain("ANA");
    expect(candidates[0]!.match_type).toBe("airport");
  });

  it("rejects legs that are not exact reverses", () => {
    const notReverse = leg({
      leg_index: 2,
      origin_airport: "SFO",
      destination_airport: "HND",
      cabin: "business",
    });
    expect(
      matchRoundTripRoutes(seedAwardRoutes, out, notReverse, [])
    ).toHaveLength(0);
  });

  it("treats missing availability as unverified, not unavailable", () => {
    const candidates = matchRoundTripRoutes(seedAwardRoutes, out, back, []);
    expect(candidates[0]!.availability.verified).toBe(false);
    expect(candidates[0]!.availability.entries).toHaveLength(0);
  });
});
