import { describe, expect, it } from "vitest";

import { generatePlan } from "./index";
import { planResultSchema } from "./schema";
import { cardByName, seedReferenceData, walletCard } from "./test-fixtures";
import type {
  AwardRoute,
  CardCatalog,
  Currency,
  EngineGoal,
  EngineInput,
  WelcomeOffer,
} from "./types";

const NOW = new Date("2026-08-01T00:00:00Z");

const japanGoal: EngineGoal = {
  origin_airport: "SFO",
  destination_airport: "HND",
  destination_region: "Japan",
  cabin: "business",
  travel_month: null,
  num_travelers: 1,
  flexibility: "flexible_month",
};

function input(overrides: Partial<EngineInput>): EngineInput {
  return {
    wallet: [],
    referenceData: seedReferenceData,
    goal: japanGoal,
    availability: [],
    monthlySpend: {},
    legs: 2,
    now: NOW,
    ...overrides,
  };
}

describe("generatePlan — Freedom unlock end to end", () => {
  it("shows zero reachability but a $800 unlock delta for locked UR", () => {
    const result = generatePlan(
      input({ wallet: [walletCard(cardByName("Freedom Unlimited"), 80_000)] })
    );
    const ana = result.strategies.find((s) => s.route_name.includes("ANA"));
    expect(ana).toBeDefined();
    expect(ana!.points_needed).toBe(85_000); // 42,500 × 2 legs
    expect(ana!.reachable_points).toBe(0); // locked UR is not a source
    expect(ana!.gap).toBe(85_000);
    expect(ana!.unlock_opportunities).toHaveLength(1);
    expect(ana!.unlock_opportunities[0]!.delta_usd).toBe(800);
    expect(ana!.months_to_goal).toBeNull(); // empty spend
    expect(ana!.rationale).toContain("$800");
  });

  it("opens transfer reachability once a Sapphire Preferred is held", () => {
    const result = generatePlan(
      input({
        wallet: [
          walletCard(cardByName("Freedom Unlimited"), 80_000),
          walletCard(cardByName("Sapphire Preferred"), 0),
        ],
      })
    );
    const ana = result.strategies.find((s) => s.route_name.includes("ANA"));
    // UR reaches ANA via UR→Aeroplan? No — reachability needs a path;
    // seed has no UR→ANA edge, so check the Hawaii route instead, where
    // UR→United is direct.
    const hawaii = generatePlan(
      input({
        wallet: [
          walletCard(cardByName("Freedom Unlimited"), 80_000),
          walletCard(cardByName("Sapphire Preferred"), 0),
        ],
        goal: {
          ...japanGoal,
          cabin: "economy",
          origin_airport: "LAX",
          destination_airport: "HNL",
          destination_region: "Hawaii",
        },
      })
    ).strategies.find((s) => s.route_name.includes("Hawaii"));

    expect(hawaii).toBeDefined();
    expect(hawaii!.points_needed).toBe(45_000);
    expect(hawaii!.gap).toBe(0);
    expect(hawaii!.tier).toBe("bookable_now");
    expect(ana!.unlock_opportunities).toHaveLength(0);
  });
});

describe("generatePlan — four tiers land and sort in order", () => {
  const P = "ffffffff-0000-4000-8000-000000000001";
  const currencies: Currency[] = [
    {
      id: P,
      name: "TestPoints",
      kind: "airline",
      alliance: null,
      cashback_cpp: 0,
      transfer_cpp: 1.5,
      requires_unlock: false,
      is_active: true,
      notes: null,
    },
  ];
  const heldCard: CardCatalog = {
    id: "ffffffff-0000-4000-8000-000000000002",
    name: "Held Card",
    issuer: "TestBank",
    currency_id: P,
    annual_fee: 0,
    unlocks_transfers: false,
    affiliate_url: null,
    application_rules: null,
    is_active: true,
    discontinued_at: null,
    notes: null,
  };
  const offerCard: CardCatalog = {
    ...heldCard,
    id: "ffffffff-0000-4000-8000-000000000003",
    name: "Offer Card",
  };
  const offer: WelcomeOffer = {
    id: "ffffffff-0000-4000-8000-000000000004",
    card_id: offerCard.id,
    points: 100_000,
    min_spend_usd: 4_000,
    window_months: 3,
    ends_at: null,
    source_url: null,
    is_active: true,
  };
  const route = (id: string, name: string, points: number): AwardRoute => ({
    id,
    name,
    program_currency_id: P,
    origin_region: "Testland",
    origin_airports: null,
    destination_region: "Testland",
    destination_airports: null,
    cabin: "economy",
    points_oneway: points,
    taxes_fees_usd_est: 10,
    booking_url: null,
    notes: null,
    is_active: true,
    last_verified_at: null,
  });

  const result = generatePlan(
    input({
      wallet: [
        {
          id: "ffffffff-0000-4000-8000-000000000005",
          card_id: heldCard.id,
          points_balance: 60_000,
          opened_at: null,
          card: heldCard,
        },
      ],
      referenceData: {
        currencies,
        cards: [heldCard, offerCard],
        earningRates: [
          {
            id: "ffffffff-0000-4000-8000-000000000006",
            card_id: heldCard.id,
            category: "dining",
            rate: 2,
            cap_monthly_usd: null,
            notes: null,
          },
        ],
        welcomeOffers: [offer],
        transferPartners: [],
        transferBonuses: [],
        awardRoutes: [
          route("ffffffff-0000-4000-8000-00000000000a", "R bookable", 50_000),
          route("ffffffff-0000-4000-8000-00000000000b", "R reachable", 100_000),
          route(
            "ffffffff-0000-4000-8000-00000000000c",
            "R needs card",
            200_000
          ),
          route("ffffffff-0000-4000-8000-00000000000d", "R stretch", 800_000),
        ],
      },
      goal: {
        origin_airport: "AAA",
        destination_airport: null,
        destination_region: "Testland",
        cabin: "economy",
        travel_month: null,
        num_travelers: 1,
        flexibility: "anytime",
      },
      monthlySpend: { dining: 2_000 },
      legs: 1,
    })
  );

  it("assigns all four tiers", () => {
    const byName = new Map(result.strategies.map((s) => [s.route_name, s]));
    expect(byName.get("R bookable")?.tier).toBe("bookable_now");
    expect(byName.get("R reachable")?.tier).toBe("reachable");
    expect(byName.get("R needs card")?.tier).toBe("needs_card");
    expect(byName.get("R stretch")?.tier).toBe("stretch");
  });

  it("sorts strategies by tier", () => {
    expect(result.strategies.map((s) => s.tier)).toEqual([
      "bookable_now",
      "reachable",
      "needs_card",
      "stretch",
    ]);
  });

  it("computes months_to_goal from spend pace and bonus posting", () => {
    const byName = new Map(result.strategies.map((s) => [s.route_name, s]));
    expect(byName.get("R reachable")?.months_to_goal).toBe(10); // 40k gap / 4k
    // 140k gap: bonus (100k) posts month 2 at $2k/mo pace; 4k/mo velocity
    expect(byName.get("R needs card")?.months_to_goal).toBe(10);
    const needsTimeline = byName.get("R needs card")!.timeline;
    expect(
      needsTimeline.some((t) =>
        t.events.some((e) => e.type === "welcome_bonus_posts")
      )
    ).toBe(true);
    expect(needsTimeline.at(-1)!.events.some((e) => e.type === "book")).toBe(
      true
    );
  });

  it("keeps timelines within 24 entries and gaps non-negative", () => {
    for (const s of result.strategies) {
      expect(s.timeline.length).toBeLessThanOrEqual(24);
      expect(s.gap).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("generatePlan — determinism and schema", () => {
  const deterministicInput = input({
    wallet: [
      walletCard(cardByName("Freedom Unlimited"), 80_000),
      walletCard(cardByName("Sapphire Preferred"), 20_000),
      walletCard(cardByName("Gold Card"), 40_000),
    ],
    goal: {
      ...japanGoal,
      cabin: "economy",
      origin_airport: "JFK",
      destination_airport: null,
      destination_region: "Europe",
    },
    monthlySpend: { dining: 800, groceries: 600 },
  });

  it("returns deeply equal output for identical input (same now)", () => {
    const a = generatePlan(deterministicInput);
    const b = generatePlan(deterministicInput);
    expect(a).toEqual(b);
  });

  it("applies the seeded Flying Blue bonus inside the window", () => {
    const plan = generatePlan(deterministicInput);
    const fb = plan.strategies.find((s) =>
      s.route_name.includes("Flying Blue")
    );
    expect(fb).toBeDefined();
    const bonusStep = fb!.allocations
      .flatMap((a) => a.path)
      .find((p) => p.bonus_pct === 25);
    expect(bonusStep).toBeDefined();
    expect(fb!.rationale).toContain("25% transfer bonus");
  });

  it("every PlanResult in this suite passes the zod contract", () => {
    for (const candidate of [
      generatePlan(deterministicInput),
      generatePlan(input({})),
      generatePlan(
        input({ wallet: [walletCard(cardByName("United Explorer"), 5_000)] })
      ),
    ]) {
      expect(() => planResultSchema.parse(candidate)).not.toThrow();
    }
  });

  it("yields months_to_goal null with empty spend whenever a gap exists", () => {
    const plan = generatePlan(
      input({ wallet: [walletCard(cardByName("Gold Card"), 10_000)] })
    );
    for (const s of plan.strategies) {
      if (s.gap > 0) expect(s.months_to_goal).toBeNull();
    }
  });
});
