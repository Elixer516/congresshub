import "server-only";

// Cleans search text for use inside a database "or" filter.
export function cleanSearch(q: unknown): string {
  return typeof q === "string" ? q.replace(/[,()%*\\:"'.]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) : "";
}

// One "or" group per word: every word must match at least one of the columns.
// Apply each group with its own .or(...) call.
export function wordFilters(q: string, columns: string[]): string[] {
  return q
    .split(" ")
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => columns.map((c) => `${c}.ilike.*${w}*`).join(","));
}

export function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function pageNum(v: unknown): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n < 10000 ? n : 1;
}

