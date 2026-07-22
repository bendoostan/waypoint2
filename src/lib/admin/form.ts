// Shared helpers for admin form server actions: a common result shape and
// typed extraction from FormData (which is all strings) before zod validates.

export type FormState = { ok: boolean; error?: string };

export const IDLE: FormState = { ok: false };

export function str(fd: FormData, key: string): string {
  return (fd.get(key) ?? "").toString().trim();
}

export function optStr(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v === "" ? null : v;
}

export function num(fd: FormData, key: string): number {
  return Number(str(fd, key));
}

export function optNum(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  return v === "" ? null : Number(v);
}

export function bool(fd: FormData, key: string): boolean {
  const v = str(fd, key);
  return v === "on" || v === "true" || v === "1";
}

/** Comma/whitespace-separated IATA codes -> uppercase array (or null). */
export function iataList(fd: FormData, key: string): string[] | null {
  const v = str(fd, key);
  if (v === "") return null;
  const codes = v
    .split(/[\s,]+/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  return codes.length > 0 ? codes : null;
}
