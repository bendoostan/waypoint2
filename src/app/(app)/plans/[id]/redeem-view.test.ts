import { describe, expect, it } from "vitest";

import { legRedeemViews, redeemFutureSources } from "./redeem-view";
import { strategySchema, type Strategy } from "@/lib/engine/schema";

const CURRENCY_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CURRENCY_B = "aaaaaaaa-0000-4000-8000-000000000002";
const CARD_ID = "aaaaaaaa-0000-4000-8000-000000000003";
const OFFER_ID = "aaaaaaaa-0000-4000-8000-000000000004";
const ROUTE_1 = "aaaaaaaa-0000-4000-8000-000000000005";
const ROUTE_2 = "aaaaaaaa-0000-4000-8000-000000000006";

// An open-jaw strategy where leg 1 is fully covered from the wallet and leg 2
// is entirely unreachable today (reachable_points: 0, so zero allocations) —
// the exact shape that used to render an empty Redeem block for leg 2, with
// no gap shown and no hint that a card + spend closes it.
function openJawStrategy(): Strategy {
  const strategy: Strategy = {
    legs: [
      {
        seq: 1,
        route_id: ROUTE_1,
        route_name: "SFO-HND business",
        program_currency_id: CURRENCY_A,
        program_currency_name: "Program A",
        cabin: "business",
        match_type: "airport",
        pricing_mode: "fixed",
        points_needed: 40_000,
        reachable_points: 40_000,
        gap: 0,
        taxes_fees_usd_est: 20,
        availability: { verified: false, entries: [] },
      },
      {
        seq: 2,
        route_id: ROUTE_2,
        route_name: "KIX-SFO business",
        program_currency_id: CURRENCY_B,
        program_currency_name: "Program B",
        cabin: "business",
        match_type: "airport",
        pricing_mode: "fixed",
        points_needed: 45_000,
        reachable_points: 0,
        gap: 45_000,
        taxes_fees_usd_est: 25,
        availability: { verified: false, entries: [] },
      },
    ],
    allocations: [
      {
        currency_id: CURRENCY_A,
        currency_name: "Program A",
        points_used: 40_000,
        points_delivered: 40_000,
        opportunity_cost_usd: 400,
        path: [],
        leg_seq: 1,
      },
    ],
    travelers: 1,
    points_needed_total: 85_000,
    gap_total: 45_000,
    taxes_fees_usd_est_total: 45,
    total_opportunity_cost_usd: 400,
    transfer_hops: 0,
    max_transfer_hours: 0,
    tier: "needs_card",
    recommended_card: {
      card_id: CARD_ID,
      card_name: "Test Card",
      issuer: "Test Bank",
      offer_id: OFFER_ID,
      offer_points: 60_000,
      delivered_points: 60_000,
      min_spend_usd: 4_000,
      window_months: 3,
      annual_fee: 0,
      score: 1,
    },
    earn_velocity: { held: null, with_recommended: 2_000 },
    months_to_goal: 12,
    unlock_opportunities: [],
    timeline: [
      {
        month: "2026-08",
        projected_balances: [
          { seq: 1, projected_balance: 40_000 },
          { seq: 2, projected_balance: 0 },
        ],
        projected_pct: 47,
        events: [],
      },
    ],
    rationale: "test rationale",
  };
  // Confirms the fixture is a realistic, schema-valid Strategy — not just a
  // TS-shaped object.
  return strategySchema.parse(strategy);
}

describe("legRedeemViews", () => {
  it("includes a leg with zero allocations instead of dropping it", () => {
    const views = legRedeemViews(openJawStrategy());

    expect(views).toHaveLength(2);

    const leg1 = views.find((v) => v.seq === 1)!;
    expect(leg1.allocations).toHaveLength(1);
    expect(leg1.gap).toBe(0);

    const leg2 = views.find((v) => v.seq === 2)!;
    expect(leg2.allocations).toEqual([]); // present, just empty — not missing
    expect(leg2.gap).toBe(45_000);
  });
});

describe("redeemFutureSources", () => {
  it("reports a future source when a card and earn velocity are available", () => {
    const { velocity, hasFutureSource } =
      redeemFutureSources(openJawStrategy());
    expect(hasFutureSource).toBe(true);
    expect(velocity).toBe(2_000); // with_recommended, since a card is recommended
  });

  it("reports no future source when neither a card nor spend is known", () => {
    const strategy = openJawStrategy();
    strategy.recommended_card = null;
    strategy.earn_velocity = { held: null, with_recommended: null };

    const { velocity, hasFutureSource } = redeemFutureSources(strategy);
    expect(hasFutureSource).toBe(false);
    expect(velocity).toBeNull();
  });
});
