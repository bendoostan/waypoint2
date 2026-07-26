import Link from "next/link";

import { TierBadge, type TierKey } from "@/components/tier-badge";
import { describeCabins, describeMonth, describeRoute } from "@/lib/format";

type Leg = {
  seq: number;
  origin_airport: string;
  destination_airport: string | null;
  destination_region: string | null;
  cabin: string;
  travel_month: string | null;
};

export type GoalSummary = {
  id: string;
  title: string;
  num_travelers: number;
  legs: Leg[];
  tier: TierKey;
};

// A goal on the dashboard: title, its route/cabin/when line, a status mark, and
// a link into the plan (built in 3b-ii; a loading state there is fine for now).
export function GoalCard({ goal }: { goal: GoalSummary }) {
  const route = describeRoute(goal.legs);
  const cabins = describeCabins(goal.legs);
  const month = describeMonth(goal.legs);
  const meta = [
    cabins,
    month,
    `${goal.num_travelers} ${goal.num_travelers === 1 ? "traveler" : "travelers"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={`/plans/${goal.id}`}
      className="group border-wp-border-2 bg-wp-panel shadow-wp-sm hover:shadow-wp-panel focus-visible:ring-ring block rounded-2xl border p-6 transition-shadow focus-visible:ring-2 focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-display text-wp-ink truncate text-xl font-semibold">
            {goal.title}
          </h3>
          {route ? (
            <p className="text-wp-body mt-1 text-sm tabular-nums">{route}</p>
          ) : null}
          {meta ? (
            <p className="text-wp-muted mt-1 text-[13px]">{meta}</p>
          ) : null}
        </div>
        <TierBadge tier={goal.tier} className="flex-none" />
      </div>
      <div className="text-wp-accent-text mt-4 text-[13px] font-semibold">
        {goal.tier === "not_planned" ? "Build the plan →" : "See the plan →"}
      </div>
    </Link>
  );
}
