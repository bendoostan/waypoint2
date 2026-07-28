import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <div className="wp-eyebrow">Points, demystified.</div>
        <h1 className="font-display text-wp-ink mt-1 text-3xl font-semibold tracking-tight">
          Waypoint
        </h1>
      </div>
      <p className="text-wp-body max-w-md text-center text-[15px] leading-relaxed">
        Tell us the trip you dream about. We&rsquo;ll plan the points.
      </p>
      <Button asChild>
        <Link href="/login">Sign in</Link>
      </Button>
    </main>
  );
}
