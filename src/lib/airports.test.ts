import { describe, expect, it } from "vitest";

import { airportLabel, isValidIata, normalizeIata } from "./airports";

// The no-airport-table path is a real hosted case, not an edge case: the
// AirportField must accept and validate a typed three-letter code with no
// lookup available. These tests pin exactly that.
describe("normalizeIata (raw-code fallback with no lookup)", () => {
  it("accepts a bare three-letter code, uppercasing it", () => {
    expect(normalizeIata("sfo")).toBe("SFO");
    expect(normalizeIata("HND")).toBe("HND");
    expect(normalizeIata("  kix  ")).toBe("KIX");
  });

  it("rejects anything that isn't three letters", () => {
    expect(normalizeIata("SF")).toBeNull();
    expect(normalizeIata("SFOO")).toBeNull();
    expect(normalizeIata("S1O")).toBeNull();
    expect(normalizeIata("")).toBeNull();
    expect(normalizeIata("San Francisco")).toBeNull();
  });

  it("isValidIata mirrors normalizeIata", () => {
    expect(isValidIata("lax")).toBe(true);
    expect(isValidIata("12")).toBe(false);
  });
});

describe("airportLabel", () => {
  it("labels a matched option with its city", () => {
    expect(
      airportLabel(
        { iata: "SFO", name: "San Francisco Intl", city: "San Francisco" },
        "SFO"
      )
    ).toBe("SFO · San Francisco");
  });

  it("falls back to the bare code when there is no matching lookup", () => {
    expect(airportLabel(null, "KIX")).toBe("KIX");
    // a stale option for a different code doesn't apply
    expect(
      airportLabel({ iata: "SFO", name: "x", city: "San Francisco" }, "KIX")
    ).toBe("KIX");
  });
});
