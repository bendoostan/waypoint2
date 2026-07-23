// Stage 3 (PLAN.md §4.3): candidate award routes, now matched PER LEG. Airport
// match beats region match; absence of availability rows means "unverified",
// never "unavailable".
//
// booking_unit splits the route pool in two:
//   - 'one_way' routes serve a single leg (matchLegRoutes). Two independent
//     one-way routes — possibly on different programs — cover a two-leg trip.
//   - 'round_trip' routes are priced per direction but MUST be booked as one
//     atomic round trip on ONE program (matchRoundTripRoutes). Such a route is
//     a candidate only when the two legs are exact reverses.
import type { AvailabilityRow, AwardRoute, EngineLeg } from "./types";

export type RouteCandidate = {
  route: AwardRoute;
  match_type: "airport" | "region";
  availability: {
    verified: boolean;
    entries: { date: string; cabin: string; seats_available: number }[];
  };
};

function originMatches(route: AwardRoute, leg: EngineLeg): boolean {
  // Routes with an explicit origin list require the leg's airport in it;
  // region-level routes (null list) accept any origin airport.
  if (route.origin_airports === null) return true;
  return route.origin_airports.includes(leg.origin_airport);
}

function sameRegion(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Pure O/D/cabin match for one leg — booking_unit is filtered separately. */
export function routeMatchesLeg(
  route: AwardRoute,
  leg: EngineLeg
): "airport" | "region" | null {
  if (route.cabin !== leg.cabin) return null;
  if (!originMatches(route, leg)) return null;

  if (leg.destination_airport) {
    if (route.destination_airports?.includes(leg.destination_airport)) {
      return "airport";
    }
    // A specific leg airport can still fall inside a region-level route.
    if (
      route.destination_airports === null &&
      leg.destination_region !== null &&
      sameRegion(route.destination_region, leg.destination_region)
    ) {
      return "region";
    }
    return null;
  }
  if (
    leg.destination_region !== null &&
    sameRegion(route.destination_region, leg.destination_region)
  ) {
    return "region";
  }
  return null;
}

function availabilityFor(
  route: AwardRoute,
  cabin: string,
  availability: AvailabilityRow[]
): RouteCandidate["availability"] {
  const entries = availability
    .filter((a) => a.award_route_id === route.id && a.cabin === cabin)
    .map((a) => ({
      date: a.date,
      cabin: a.cabin,
      seats_available: a.seats_available,
    }))
    .sort((x, y) => x.date.localeCompare(y.date));
  return { verified: entries.length > 0, entries };
}

function sortCandidates(candidates: RouteCandidate[]): RouteCandidate[] {
  // airport matches first, then stable by name for determinism
  return [...candidates].sort((a, b) => {
    if (a.match_type !== b.match_type) {
      return a.match_type === "airport" ? -1 : 1;
    }
    return a.route.name.localeCompare(b.route.name);
  });
}

/** one_way routes that serve a single leg. */
export function matchLegRoutes(
  routes: AwardRoute[],
  leg: EngineLeg,
  availability: AvailabilityRow[]
): RouteCandidate[] {
  const candidates: RouteCandidate[] = [];
  for (const route of routes) {
    if (!route.is_active) continue;
    if (route.booking_unit !== "one_way") continue;
    const match = routeMatchesLeg(route, leg);
    if (match === null) continue;
    candidates.push({
      route,
      match_type: match,
      availability: availabilityFor(route, leg.cabin, availability),
    });
  }
  return sortCandidates(candidates);
}

/**
 * Two legs are exact reverses when each leg's origin is the other's
 * destination, at the airport level, in the same cabin. Region-only
 * destinations cannot be proven reverse, so they never form a round-trip unit
 * (they fall through to two one-way legs instead).
 */
export function legsAreExactReverses(
  leg1: EngineLeg,
  leg2: EngineLeg
): boolean {
  return (
    leg1.cabin === leg2.cabin &&
    leg1.destination_airport !== null &&
    leg2.destination_airport !== null &&
    leg1.origin_airport === leg2.destination_airport &&
    leg1.destination_airport === leg2.origin_airport
  );
}

/**
 * round_trip routes that cover BOTH legs as one atomic redemption. Valid only
 * when the legs are exact reverses and the route matches leg 1 in the forward
 * direction. The caller prices it as points_oneway × 2 × travelers on the
 * route's single program — not splittable across programs.
 */
export function matchRoundTripRoutes(
  routes: AwardRoute[],
  leg1: EngineLeg,
  leg2: EngineLeg,
  availability: AvailabilityRow[]
): RouteCandidate[] {
  if (!legsAreExactReverses(leg1, leg2)) return [];
  const candidates: RouteCandidate[] = [];
  for (const route of routes) {
    if (!route.is_active) continue;
    if (route.booking_unit !== "round_trip") continue;
    const match = routeMatchesLeg(route, leg1);
    if (match === null) continue;
    candidates.push({
      route,
      match_type: match,
      availability: availabilityFor(route, leg1.cabin, availability),
    });
  }
  return sortCandidates(candidates);
}
