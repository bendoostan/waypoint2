import { z } from "zod";

import {
  TABLE_SCHEMAS,
  isWhitelistedTable,
  type WhitelistedTable,
} from "./tables";

export * from "./tables";

export type ValidationResult =
  { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

/**
 * Validate a staging change's `proposed` payload against its table schema
 * before calling apply_staging_change. For updates we validate the RESULTING
 * row (existing merged with proposed), so a partial proposal is fine and the
 * refinements (ratio parts, bonus window) still hold on the final record.
 */
export function validateProposed(
  table: string,
  proposed: unknown,
  existingRow?: Record<string, unknown> | null
): ValidationResult {
  if (!isWhitelistedTable(table)) {
    return { ok: false, error: `table "${table}" is not whitelisted` };
  }
  const schema = TABLE_SCHEMAS[table];
  const candidate =
    existingRow && typeof proposed === "object" && proposed !== null
      ? { ...existingRow, ...(proposed as Record<string, unknown>) }
      : proposed;

  const parsed = schema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, error: formatZodError(parsed.error) };
  }
  return { ok: true, data: parsed.data as Record<string, unknown> };
}

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((i) => {
      const path = i.path.join(".");
      return path ? `${path}: ${i.message}` : i.message;
    })
    .join("; ");
}

export function schemaFor(table: WhitelistedTable) {
  return TABLE_SCHEMAS[table];
}
