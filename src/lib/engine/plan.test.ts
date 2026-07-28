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
  EngineLeg,
  WelcomeOffer,
} from "./types";

const NOW = new Date("2026-08-01T00:00:00Z");

// A round trip is two explicit legs whose endpoints reverse (SFO<->HND).
const japanLegs: EngineLeg[] = [
  {
    seq: 1,
    origin_airport: "SFO",
    destination_airport: "HND",
    destination_region: "Japan",
    cabin: "business",
    travel_month: null,
  },
  {
    seq: 2,
    origin_airport: "HND",
    destination_airport: "SFO",
    destination_region: "Japan",
    cabin: "business",
    travel_month: null,
  },
];

const japanGoal: EngineGoal = {
  num_travelers: 1,
  flexibility: "flexible_month",
  legs: japanLegs,
};

function input(overrides: Partial<EngineInput>): EngineInput {
  return {
    wallet: [],
    referenceData: seedReferenceData,
    goal: japanGoal,
    availability: [],
    monthlySpend: {},
    now: NOW,
    ...overrides,
  };
}

/** A round trip is two legs on ONE route (same program, one booking). */
function isRoundTrip(s: { legs: { route_id: string }[] }): boolean {
  return s.legs.length === 2 && s.legs[0]!.route_id === s.legs[1]!.route_id;
}

describe("generatePlan — Freedom unlock end to end", () => {
  it("prices the round trip as one ANA round-trip unit and shows the $800 unlock", () => {
    const result = generatePlan(
      input({ wallet: [walletCard(cardByName("Freedom Unlimited"), 80_000)] })
    );
    const ana = result.strategies.find((s) =>
      s.legs[0]!.route_name.includes("ANA")
    );
    expect(ana).toBeDefined();
    expect(isRoundTrip(ana!)).toBe(true); // both legs on the one ANA route
    expect(ana!.legs).toHaveLength(2);
    expect(ana!.points_needed_total).toBe(85_000); // 42,500 × 2 directions
    // Locked UR is not a transfer source, so nothing is reachable (case 7).
    expect(ana!.legs.every((l) => l.reachable_points === 0)).toBe(true);
    expect(ana!.gap_total).toBe(85_000);
    expect(ana!.legs.every((l) => l.pricing_mode === "fixed")).toBe(true);
    // The locked balance is exposed as an unlock opportunity, never reachable.
    expect(ana!.unlock_opportunities).toHaveLength(1);
    expect(ana!.unlock_opportunities[0]!.delta_usd).toBe(800);
    expect(ana!.months_to_goal).toBeNull(); // empty spend
    expect(ana!.rationale).toContain("$800");
  });

  it("opens transfer reachability once a Sapphire Preferred is held (one-way)", () => {
    // A one-way Hawaii leg: UR unlocks via Sapphire, UR->United reaches it.
    const hawaii = generatePlan(
      input({
        wallet: [
          walletCard(cardByName("Freedom Unlimited"), 80_000),
          walletCard(cardByName("Sapphire Preferred"), 0),
        ],
        goal: {
          num_travelers: 1,
          flexibility: "anytime",
          legs: [
            {
              seq: 1,
              origin_airport: "LAX",
              destination_airport: "HNL",
              destination_region: "Hawaii",
              cabin: "economy",
              travel_month: null,
            },
          ],
        },
      })
    ).strategies.find((s) => s.legs[0]!.route_name.includes("Hawaii"));

    expect(hawaii).toBeDefined();
    expect(hawaii!.legs).toHaveLength(1); // one-way goal, single leg
    expect(hawaii!.points_needed_total).toBe(22_500);
    expect(hawaii!.gap_total).toBe(0);
    expect(hawaii!.tier).toBe("bookable_now");
    expect(hawaii!.unlock_opportunities).toHaveLength(0);
  });
});

describe("generatePlan — a card that unlocks a held balance gets credit for it (Phase 1.6)", () => {
  // Same wallet as the "$800 unlock" test above (80,000 locked Chase UR via
  // Freedom Unlimited, no Sapphire held, empty spend) — but this time reading
  // the Virgin Atlantic ANA route, which Chase UR CAN reach directly (unlike
  // the direct ANA route, which only Amex MR reaches — so that strategy
  // correctly sees no unlock benefit; this one is where the fix bites).
  it("Sapphire's recommendation credits the released UR balance, not just its own bonus", () => {
    const result = generatePlan(
      input({ wallet: [walletCard(cardByName("Freedom Unlimited"), 80_000)] })
    );
    const viaVirgin = result.strategies.find((s) =>
      s.legs[0]!.route_name.includes("Virgin Atlantic")
    );
    expect(viaVirgin).toBeDefined();

    // reachable_points is unaffected by the fix — it means "transferable with
    // the cards you hold today", and Sapphire isn't held.
    expect(viaVirgin!.legs.every((l) => l.reachable_points === 0)).toBe(true);
    expect(viaVirgin!.points_needed_total).toBe(45_000); // 22,500 × 2

    expect(viaVirgin!.recommended_card?.card_name).toBe("Sapphire Preferred");
    // The 45,000-point trip is entirely closeable by the released 80,000 UR
    // balance (capped at what's needed) — the welcome bonus adds nothing
    // beyond that, but the unlock alone gets the trip there.
    expect(viaVirgin!.recommended_card?.unlocked_points).toBe(45_000);
    expect(viaVirgin!.tier).toBe("needs_card");
    // Ready the month the card is approved — no spend, no waiting on a bonus.
    expect(viaVirgin!.months_to_goal).toBe(1);
    expect(viaVirgin!.rationale).toContain("releases");
  });

  it("places the unlock event at approval, before any welcome-bonus event, never assuming both legs got a shared balance", () => {
    const result = generatePlan(
      input({ wallet: [walletCard(cardByName("Freedom Unlimited"), 80_000)] })
    );
    const viaVirgin = result.strategies.find((s) =>
      s.legs[0]!.route_name.includes("Virgin Atlantic")
    );
    const timeline = viaVirgin!.timeline;

    // Month 1 (2026-09): the round trip's shared UR balance covers both legs
    // (22,500 needed each, 45,000 released — exact match), so it books then.
    expect(timeline).toHaveLength(2);
    expect(timeline[0]!.month).toBe("2026-08");
    expect(timeline[0]!.events).toHaveLength(0);
    expect(timeline[1]!.month).toBe("2026-09");
    expect(timeline[1]!.projected_pct).toBe(100);

    const types = timeline[1]!.events.map((e) => e.type);
    expect(types.filter((t) => t === "unlock")).toHaveLength(2); // one per leg
    // Every unlock event in the array precedes every book event — the
    // released balance is what makes the booking possible, in that order.
    const lastUnlockIdx = types.lastIndexOf("unlock");
    const firstBookIdx = types.indexOf("book");
    expect(lastUnlockIdx).toBeLessThan(firstBookIdx);
    // No welcome-bonus event at all: spend is unset in this fixture, so
    // bonus_month is null and the bonus never posts — the unlock alone
    // closes the trip, which is exactly the point of crediting it.
    expect(types).not.toContain("welcome_bonus_posts");
  });
});

describe("generatePlan — four tiers land and sort in order (single-leg)", () => {
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
      brand_color: null,
      logo_url: null,
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
    brand_color: null,
    logo_url: null,
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
    booking_unit: "one_way",
    pricing_mode: "fixed",
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
        num_travelers: 1,
        flexibility: "anytime",
        legs: [
          {
            seq: 1,
            origin_airport: "AAA",
            destination_airport: null,
            destination_region: "Testland",
            cabin: "economy",
            travel_month: null,
          },
        ],
      },
      monthlySpend: { dining: 2_000 },
    })
  );

  const byName = new Map(
    result.strategies.map((s) => [s.legs[0]!.route_name, s])
  );

  it("assigns all four tiers", () => {
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

  it("keeps timelines within 24 entries, gaps non-negative, pct in range", () => {
    for (const s of result.strategies) {
      expect(s.timeline.length).toBeLessThanOrEqual(24);
      expect(s.gap_total).toBeGreaterThanOrEqual(0);
      for (const t of s.timeline) {
        expect(t.projected_pct).toBeGreaterThanOrEqual(0);
        expect(t.projected_pct).toBeLessThanOrEqual(100);
        expect(t.projected_balances.map((b) => b.seq)).toEqual([1]);
      }
    }
  });
});

describe("generatePlan — determinism and schema", () => {
  const europeLeg: EngineLeg[] = [
    {
      seq: 1,
      origin_airport: "JFK",
      destination_airport: null,
      destination_region: "Europe",
      cabin: "economy",
      travel_month: null,
    },
  ];
  const deterministicInput = input({
    wallet: [
      walletCard(cardByName("Freedom Unlimited"), 80_000),
      walletCard(cardByName("Sapphire Preferred"), 20_000),
      walletCard(cardByName("Gold Card"), 40_000),
    ],
    goal: { num_travelers: 1, flexibility: "anytime", legs: europeLeg },
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
      s.legs[0]!.route_name.includes("Flying Blue")
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
      if (s.gap_total > 0) expect(s.months_to_goal).toBeNull();
    }
  });
});

describe("generatePlan — cabin alternative (Task 4)", () => {
  const P = "eeeeeeee-0000-4000-8000-000000000001";
  const bank = "eeeeeeee-0000-4000-8000-000000000002";
  const cardId = "eeeeeeee-0000-4000-8000-000000000003";
  const currencies: Currency[] = [
    {
      id: P,
      name: "SkyPoints",
      kind: "airline",
      alliance: null,
      cashback_cpp: 0,
      transfer_cpp: 1.5,
      requires_unlock: false,
      is_active: true,
      notes: null,
      brand_color: null,
      logo_url: null,
    },
    {
      id: bank,
      name: "BankPoints",
      kind: "bank",
      alliance: null,
      cashback_cpp: 1,
      transfer_cpp: 1,
      requires_unlock: false,
      is_active: true,
      notes: null,
      brand_color: null,
      logo_url: null,
    },
  ];
  const card: CardCatalog = {
    id: cardId,
    name: "Bank Card",
    issuer: "TestBank",
    currency_id: bank,
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
  const edge = {
    id: "eeeeeeee-0000-4000-8000-000000000004",
    from_currency_id: bank,
    to_currency_id: P,
    ratio_num: 1,
    ratio_den: 1,
    transfer_hours_est: 0,
    min_transfer: 1000,
    increment: 1000,
    is_active: true,
    notes: null,
  };
  const mkRoute = (id: string, cabin: string, points: number): AwardRoute => ({
    id,
    name: `LAX-NRT ${cabin}`,
    program_currency_id: P,
    origin_region: "US",
    origin_airports: ["LAX"],
    destination_region: "Japan",
    destination_airports: ["NRT"],
    cabin,
    points_oneway: points,
    taxes_fees_usd_est: 20,
    booking_url: null,
    notes: null,
    is_active: true,
    last_verified_at: null,
    booking_unit: "one_way",
    pricing_mode: "fixed",
  });

  const ref = (routes: AwardRoute[]) => ({
    currencies,
    cards: [card],
    earningRates: [],
    welcomeOffers: [],
    transferPartners: [edge],
    transferBonuses: [],
    awardRoutes: routes,
  });

  const wallet = [
    {
      id: "eeeeeeee-0000-4000-8000-00000000000a",
      card_id: cardId,
      points_balance: 50_000, // covers premium economy (40k), not business (200k)
      opened_at: null,
      card,
    },
  ];

  const businessLeg: EngineLeg = {
    seq: 1,
    origin_airport: "LAX",
    destination_airport: "NRT",
    destination_region: "Japan",
    cabin: "business",
    travel_month: null,
  };

  it("surfaces a cheaper, bookable lower cabin (drop one cabin, need nothing new)", () => {
    const plan = generatePlan({
      wallet,
      referenceData: ref([
        mkRoute("eeeeeeee-0000-4000-8000-000000000100", "business", 200_000),
        mkRoute(
          "eeeeeeee-0000-4000-8000-000000000101",
          "premium_economy",
          40_000
        ),
      ]),
      goal: { num_travelers: 1, flexibility: "anytime", legs: [businessLeg] },
      availability: [],
      monthlySpend: {},
      now: NOW,
    });

    // Main business plan needs a new card (or is a stretch); the alternative
    // one cabin down is bookable now with nothing new.
    expect(plan.strategies[0]!.tier === "bookable_now").toBe(false);
    const alt = plan.cabin_alternative;
    expect(alt).not.toBeNull();
    expect(alt!.cabin).toBe("premium_economy");
    expect(alt!.points_needed_total).toBe(40_000);
    expect(alt!.tier).toBe("bookable_now");
    expect(alt!.requires_card).toBe(false);
  });

  it("is null at economy (no lower cabin exists)", () => {
    const plan = generatePlan({
      wallet,
      referenceData: ref([
        mkRoute("eeeeeeee-0000-4000-8000-000000000102", "economy", 20_000),
      ]),
      goal: {
        num_travelers: 1,
        flexibility: "anytime",
        legs: [{ ...businessLeg, cabin: "economy" }],
      },
      availability: [],
      monthlySpend: {},
      now: NOW,
    });
    expect(plan.cabin_alternative).toBeNull();
  });

  it("is null when no route exists at the lower cabin", () => {
    const plan = generatePlan({
      wallet,
      referenceData: ref([
        mkRoute("eeeeeeee-0000-4000-8000-000000000103", "business", 200_000),
      ]),
      goal: { num_travelers: 1, flexibility: "anytime", legs: [businessLeg] },
      availability: [],
      monthlySpend: {},
      now: NOW,
    });
    expect(plan.cabin_alternative).toBeNull();
  });
});
