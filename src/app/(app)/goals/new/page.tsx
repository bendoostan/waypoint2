import Link from "next/link";

import { GoalWizard } from "./goal-wizard";

export default function NewGoalPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link
        href="/dashboard"
        className="text-wp-muted hover:text-wp-ink text-[13px] font-medium"
      >
        ← Back to goals
      </Link>
      <div className="mt-4 mb-8">
        <h1 className="font-display text-wp-ink text-3xl font-semibold sm:text-4xl">
          Plan a trip
        </h1>
        <p className="text-wp-muted mt-2 max-w-xl text-[15px]">
          Give us the dream — one city or two, the same both ways or an
          open-jaw. We work backward from there.
        </p>
      </div>
      <GoalWizard />
    </main>
  );
}
