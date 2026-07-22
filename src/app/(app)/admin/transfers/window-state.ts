// Display-only classification of a bonus window relative to now. The
// automated expiry sweeper is Phase 4; this is just for the admin badge.
export type WindowState = "live" | "upcoming" | "expired";

export function windowState(
  starts_at: string,
  ends_at: string,
  now: Date
): WindowState {
  const t = now.getTime();
  if (t < new Date(starts_at).getTime()) return "upcoming";
  if (t >= new Date(ends_at).getTime()) return "expired";
  return "live";
}
