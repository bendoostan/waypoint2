import { describe, expect, it } from "vitest";

import { buildEngineInput } from "./from-db";
import { cardByName, seedReferenceData } from "./test-fixtures";
import type { GoalRow } from "./types";

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
    expect(input.legs).toBe(2); // caller default: round trip
    expect(input.goal.num_travelers).toBe(2);
  });

  it("handles a missing profile and explicit legs", () => {
    const input = buildEngineInput({
      userCards: [],
      profile: null,
      goal,
      ...seedReferenceData,
      availability: [],
      legs: 1,
      now: new Date("2026-08-01T00:00:00Z"),
    });
    expect(input.monthlySpend).toEqual({});
    expect(input.legs).toBe(1);
  });
});
