// Stage 3 (PLAN.md §4.3): candidate award routes for a goal. Airport match
// beats region match; absence of availability rows means "unverified",
// never "unavailable".
import type { AvailabilityRow, AwardRoute, EngineGoal } from "./types";

export type RouteCandidate = {
  route: AwardRoute;
  match_type: "airport" | "region";
  availability: {
    verified: boolean;
    entries: { date: string; cabin: string; seats_available: number }[];
  };
};

function originMatches(route: AwardRoute, goal: EngineGoal): boolean {
  // Routes with an explicit origin list require the goal's airport in it;
  // region-level routes (null list) accept any origin airport.
  if (route.origin_airports === null) return true;
  return route.origin_airports.includes(goal.origin_airport);
}

function destinationMatch(
  route: AwardRoute,
  goal: EngineGoal
): "airport" | "region" | null {
  if (goal.destination_airport) {
    if (route.destination_airports?.includes(goal.destination_airport)) {
      return "airport";
    }
    // A specific goal airport can still fall inside a region-level route.
    if (
      route.destination_airports === null &&
      goal.destination_region !== null &&
      sameRegion(route.destination_region, goal.destination_region)
    ) {
      return "region";
    }
    return null;
  }
  if (
    goal.destination_region !== null &&
    sameRegion(route.destination_region, goal.destination_region)
  ) {
    return "region";
  }
  return null;
}

function sameRegion(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function matchRoutes(
  routes: AwardRoute[],
  goal: EngineGoal,
  availability: AvailabilityRow[]
): RouteCandidate[] {
  const candidates: RouteCandidate[] = [];

  for (const route of routes) {
    if (!route.is_active) continue;
    if (route.cabin !== goal.cabin) continue;
    if (!originMatches(route, goal)) continue;
    const match = destinationMatch(route, goal);
    if (match === null) continue;

    const entries = availability
      .filter((a) => a.award_route_id === route.id && a.cabin === goal.cabin)
      .map((a) => ({
        date: a.date,
        cabin: a.cabin,
        seats_available: a.seats_available,
      }))
      .sort((x, y) => x.date.localeCompare(y.date));

    candidates.push({
      route,
      match_type: match,
      availability: { verified: entries.length > 0, entries },
    });
  }

  // airport matches first, then stable by name for determinism
  return candidates.sort((a, b) => {
    if (a.match_type !== b.match_type) {
      return a.match_type === "airport" ? -1 : 1;
    }
    return a.route.name.localeCompare(b.route.name);
  });
}
