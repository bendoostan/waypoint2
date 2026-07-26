import { describe, expect, it } from "vitest";

import { buildEngineInput } from "./from-db";
import { cardByName, seedReferenceData } from "./test-fixtures";
import type { GoalLegRow, GoalRow } from "./types";

const goal: GoalRow = {
  id: "abababab-0000-4000-8000-000000000001",
  user_id: "abababab-0000-4000-8000-000000000002",
  title: "Tokyo in business",
  origin_airport: "SFO",
  destination_airport: "HND",
  destination_region: "Japan",
  cabin: "business",
  travel_month: "2027-03",
  num_travelers: 2,
  flexibility: "flexible_month",
  created_at: "2026-08-01T00:00:00Z",
};

describe("buildEngineInput", () => {
  const freedom = cardByName("Freedom Unlimited");

  it("joins user cards to the catalog and drops unknown card ids", () => {
    const input = buildEngineInput({
      userCards: [
        {
          id: "abababab-0000-4000-8000-000000000003",
          user_id: goal.user_id,
          card_id: freedom.id,
          points_balance: 12_000,
          opened_at: null,
        },
        {
          id: "abababab-0000-4000-8000-000000000004",
          user_id: goal.user_id,
          card_id: "abababab-0000-4000-8000-00000000dead",
          points_balance: 99_999,
          opened_at: null,
        },
      ],
      profile: { monthly_spend: { dining: 500, junk: "nope", zero: 0 } },
      goal,
      ...seedReferenceData,
      availability: [],
      now: new Date("2026-08-01T00:00:00Z"),
    });

    expect(input.wallet).toHaveLength(1);
    expect(input.wallet[0]!.card.name).toBe("Freedom Unlimited");
    expect(input.monthlySpend).toEqual({ dining: 500 });
    expect(input.goal.num_travelers).toBe(2);
  });

  it("falls back to a single leg synthesized from the goal columns", () => {
    const input = buildEngineInput({
      userCards: [],
      profile: null,
      goal,
      ...seedReferenceData,
      availability: [],
      now: new Date("2026-08-01T00:00:00Z"),
    });
    expect(input.goal.legs).toHaveLength(1);
    expect(input.goal.legs[0]).toEqual({
      seq: 1,
      origin_airport: "SFO",
      destination_airport: "HND",
      destination_region: "Japan",
      cabin: "business",
      travel_month: "2027-03",
    });
  });

  it("builds legs from goal_legs, ordered by seq", () => {
    const goalLegs: GoalLegRow[] = [
      {
        id: "cccc0000-0000-4000-8000-000000000002",
        goal_id: goal.id,
        seq: 2,
        origin_airport: "HND",
        destination_airport: "SFO",
        destination_region: null,
        cabin: "business",
        travel_month: "2027-03",
      },
      {
        id: "cccc0000-0000-4000-8000-000000000001",
        goal_id: goal.id,
        seq: 1,
        origin_airport: "SFO",
        destination_airport: "HND",
        destination_region: null,
        cabin: "business",
        travel_month: "2027-03",
      },
    ];
    const input = buildEngineInput({
      userCards: [],
      profile: null,
      goal,
      goalLegs,
      ...seedReferenceData,
      availability: [],
      now: new Date("2026-08-01T00:00:00Z"),
    });
    expect(input.goal.legs.map((l) => l.seq)).toEqual([1, 2]);
    expect(input.goal.legs[0]!.origin_airport).toBe("SFO");
    expect(input.goal.legs[1]!.origin_airport).toBe("HND");
    expect(input.goal.legs[1]!.destination_airport).toBe("SFO");
  });
});
