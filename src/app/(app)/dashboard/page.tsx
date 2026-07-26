import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { GoalCard, type GoalSummary } from "@/components/goal-card";
import { tierFromPlan, type TierKey } from "@/components/tier-badge";

// The tier of a goal's plan, or "not_planned" — we never guess a tier before
// the engine has run (plan generation is 3b-ii, so today this is always
// "not_planned", but the reader is honest if a plan row does exist).
function topTier(strategies: unknown): TierKey {
  if (Array.isArray(strategies) && strategies.length > 0) {
    const first = strategies[0];
    if (first && typeof first === "object" && "tier" in first) {
      return tierFromPlan((first as { tier?: string }).tier);
    }
  }
  return "not_planned";
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: goalRows } = await supabase
    .from("goals")
    .select(
      "id, title, num_travelers, created_at, goal_legs(seq, origin_airport, destination_airport, destination_region, cabin, travel_month)"
    )
    .order("created_at", { ascending: false });

  const { data: planRows } = await supabase
    .from("plans")
    .select("goal_id, strategies");

  const tierByGoal = new Map<string, TierKey>(
    (planRows ?? []).map((p) => [p.goal_id, topTier(p.strategies)])
  );

  const goals: GoalSummary[] = (goalRows ?? []).map((g) => ({
    id: g.id,
    title: g.title,
    num_travelers: g.num_travelers,
    legs: g.goal_legs ?? [],
    tier: tierByGoal.get(g.id) ?? "not_planned",
  }));

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-wp-ink text-3xl font-semibold sm:text-4xl">
            My goals
          </h1>
          <p className="text-wp-muted mt-2 text-[15px]">
            Tell us the trip; we work backward to the cheapest way there.
          </p>
        </div>
        {goals.length > 0 ? (
          <Button asChild>
            <Link href="/goals/new">Plan a trip</Link>
          </Button>
        ) : null}
      </div>

      <div className="mt-8">
        {goals.length === 0 ? (
          <EmptyState
            eyebrow="Your first trip"
            title="Where do you want to go?"
            description="Name a destination and cabin, and Waypoint works backward from the miles you already hold to the cheapest way to book it."
            actionHref="/goals/new"
            actionLabel="Plan a trip"
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {goals.map((goal) => (
              <GoalCard key={goal.id} goal={goal} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
