import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getOrCreatePlan, regeneratePlan } from "./get-or-create-plan";
import { cardByName, seedReferenceData } from "@/lib/engine/test-fixtures";
import type { Database } from "@/types/database";
import type { GoalRow } from "@/lib/engine/types";

// A minimal in-memory stand-in for the handful of query-builder methods
// get-or-create-plan.ts actually calls (select/eq/maybeSingle/insert/upsert),
// thenable so both `await x` and `await x.maybeSingle()` resolve.
type Row = Record<string, unknown>;

class FakeQuery implements PromiseLike<{ data: unknown; error: null }> {
  private eqFilters: Array<[string, unknown]> = [];
  private single = false;
  private insertRows: Row[] | null = null;
  private upsertRows: Row[] | null = null;
  private upsertConflictKey: string | null = null;

  constructor(
    private tables: Record<string, Row[]>,
    private table: string
  ) {}

  // cols/order args are accepted (to match the real query-builder shape) but
  // unused: the fake always returns every column and never sorts.
  select(...args: [cols?: string]) {
    void args;
    return this;
  }
  eq(col: string, val: unknown) {
    this.eqFilters.push([col, val]);
    return this;
  }
  order(...args: [col?: string, opts?: unknown]) {
    void args;
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }
  insert(row: Row) {
    this.insertRows = [row];
    return this;
  }
  upsert(row: Row, opts?: { onConflict?: string }) {
    this.upsertRows = [row];
    this.upsertConflictKey = opts?.onConflict ?? null;
    return this;
  }

  private resolve(): { data: unknown; error: null } {
    const table = this.tables[this.table] ?? (this.tables[this.table] = []);

    if (this.insertRows) {
      table.push(...this.insertRows);
      return {
        data: this.single ? this.insertRows[0] : this.insertRows,
        error: null,
      };
    }

    if (this.upsertRows) {
      for (const row of this.upsertRows) {
        const key = this.upsertConflictKey;
        const idx = key ? table.findIndex((r) => r[key] === row[key]) : -1;
        if (idx >= 0) table[idx] = { ...table[idx], ...row };
        else table.push(row);
      }
      return {
        data: this.single ? this.upsertRows[0] : this.upsertRows,
        error: null,
      };
    }

    const rows = table.filter((r) =>
      this.eqFilters.every(([k, v]) => r[k] === v)
    );
    return { data: this.single ? (rows[0] ?? null) : rows, error: null };
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?:
      | ((value: {
          data: unknown;
          error: null;
        }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.resolve()).then(onfulfilled, onrejected);
  }
}

function fakeSupabase(seed: Partial<Record<string, Row[]>> = {}) {
  const tables: Record<string, Row[]> = {
    plans: [],
    user_cards: [],
    profiles: [],
    currencies: seedReferenceData.currencies as unknown as Row[],
    card_catalog: seedReferenceData.cards as unknown as Row[],
    earning_rates: seedReferenceData.earningRates as unknown as Row[],
    welcome_offers: seedReferenceData.welcomeOffers as unknown as Row[],
    transfer_partners: seedReferenceData.transferPartners as unknown as Row[],
    transfer_bonuses: seedReferenceData.transferBonuses as unknown as Row[],
    award_routes: seedReferenceData.awardRoutes as unknown as Row[],
    availability_cache: [],
    ...seed,
  };
  return {
    client: {
      from(table: string) {
        return new FakeQuery(tables, table);
      },
    } as unknown as SupabaseClient<Database>,
    tables,
  };
}

const USER_ID = "abababab-0000-4000-8000-000000000099";

// One-way SFO -> HNL, matching the seeded "United economy to Hawaii" route —
// a legacy single-leg goal (no goal_legs rows), so buildEngineInput
// synthesizes the leg straight from the goals columns.
const hawaiiGoal: GoalRow = {
  id: "abababab-0000-4000-8000-000000000010",
  user_id: USER_ID,
  title: "Hawaii getaway",
  origin_airport: "SFO",
  destination_airport: "HNL",
  destination_region: "Hawaii",
  cabin: "economy",
  travel_month: null,
  num_travelers: 1,
  flexibility: "flexible_month",
  created_at: "2026-08-01T00:00:00Z",
};

describe("getOrCreatePlan", () => {
  it("caches on first generation and returns the same row on a second call", async () => {
    const { client, tables } = fakeSupabase();

    const first = await getOrCreatePlan(client, USER_ID, hawaiiGoal, []);
    expect(tables.plans).toHaveLength(1);

    const second = await getOrCreatePlan(client, USER_ID, hawaiiGoal, []);
    expect(tables.plans).toHaveLength(1); // no second insert
    expect(second.generatedAt).toBe(first.generatedAt);
    expect(second.result).toEqual(first.result);
  });

  it("fails loudly on a malformed stored plan instead of rendering partially", async () => {
    const { client } = fakeSupabase({
      plans: [
        {
          goal_id: hawaiiGoal.id,
          user_id: USER_ID,
          strategies: { not: "a valid PlanResult" },
          generated_at: "2026-01-01T00:00:00Z",
        },
      ],
    });

    await expect(
      getOrCreatePlan(client, USER_ID, hawaiiGoal, [])
    ).rejects.toThrow();
  });
});

describe("regeneratePlan", () => {
  it("overwrites the cached row and picks up wallet changes getOrCreatePlan alone would miss", async () => {
    const { client, tables } = fakeSupabase();

    const stale = await getOrCreatePlan(client, USER_ID, hawaiiGoal, []);
    const staleStrategy = stale.result.strategies[0]!;
    expect(staleStrategy.legs[0]!.reachable_points).toBe(0); // no cards held yet

    // The user adds a United Explorer card with more than enough points —
    // getOrCreatePlan would keep serving the stale cached row...
    const stillStale = await getOrCreatePlan(client, USER_ID, hawaiiGoal, []);
    expect(stillStale.result.strategies[0]!.legs[0]!.reachable_points).toBe(0);

    const unitedExplorer = cardByName("United Explorer");
    tables.user_cards!.push({
      id: "abababab-0000-4000-8000-000000000020",
      user_id: USER_ID,
      card_id: unitedExplorer.id,
      points_balance: 30_000,
      opened_at: null,
    });

    // ...until regeneratePlan is explicitly invoked.
    const fresh = await regeneratePlan(client, USER_ID, hawaiiGoal, []);
    expect(tables.plans).toHaveLength(1); // upsert, not a duplicate row
    expect(fresh.result.strategies[0]!.legs[0]!.reachable_points).toBe(22_500);
    expect(fresh.result.strategies[0]!.tier).toBe("bookable_now");

    // And the cache now serves the regenerated row.
    const afterRegenerate = await getOrCreatePlan(
      client,
      USER_ID,
      hawaiiGoal,
      []
    );
    expect(afterRegenerate.generatedAt).toBe(fresh.generatedAt);
    expect(afterRegenerate.result).toEqual(fresh.result);
  });
});
