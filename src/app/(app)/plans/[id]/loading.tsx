// Shown while the server component below fetches wallet/reference data and
// runs the engine on first load — an honest "we're solving this" moment
// rather than a blank screen (a plan can be a depth-2 graph search).
export default function PlanLoading() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="border-wp-border-2 bg-wp-panel shadow-wp-sm flex flex-col items-center rounded-2xl border px-8 py-16 text-center">
        <div className="wp-eyebrow">Building your plan</div>
        <h2 className="font-display text-wp-ink mt-2 max-w-md text-2xl font-semibold">
          Solving the cheapest path across your wallet
        </h2>
        <p className="text-wp-muted mt-3 max-w-md text-[15px] leading-relaxed">
          Checking every card, transfer partner, and route for this trip — this
          only takes a moment.
        </p>
      </div>
    </main>
  );
}
