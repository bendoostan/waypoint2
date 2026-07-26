// Airport-code helpers. The AirportField is a combobox over public.airports,
// but the hosted deploy may not have the ~4,000 airport rows loaded (see
// deploy/hosted-setup.sql's documented gap), so the field must ALWAYS accept a
// typed three-letter IATA code with no lookup available. These pure helpers are
// that no-table path — unit-tested directly, not treated as optional polish.

export const IATA_RE = /^[A-Z]{3}$/;

/** A validated, uppercased IATA code, or null if the input isn't one. */
export function normalizeIata(input: string): string | null {
  const code = input.trim().toUpperCase();
  return IATA_RE.test(code) ? code : null;
}

export function isValidIata(input: string): boolean {
  return normalizeIata(input) !== null;
}

export type AirportOption = {
  iata: string;
  name: string;
  city: string | null;
};

/**
 * A display label for an airport option or a bare code. Used by the combobox
 * and the goal summary; falls back to just the code when there's no lookup.
 */
export function airportLabel(
  option: AirportOption | null,
  code: string
): string {
  if (option && option.iata === code) {
    return option.city ? `${code} · ${option.city}` : code;
  }
  return code;
}
