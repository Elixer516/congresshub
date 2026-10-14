import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Store, mockClient } from "./mock-db";
import { buildDemoData } from "./demo-seed";

// CongressHub demo: there is no real database. Everything lives in memory, starts from
// invented sample data, and resets every day (or whenever the server restarts).
const RESET_AFTER_MS = 24 * 60 * 60 * 1000;

type Demo = { store: Store; client: SupabaseClient; at: number };
const holder = globalThis as unknown as { __congressHub?: Demo };

export function resetDemo() {
  const store = new Store(buildDemoData());
  holder.__congressHub = { store, client: mockClient(store) as unknown as SupabaseClient, at: Date.now() };
  return holder.__congressHub;
}

export function db(): SupabaseClient {
  const d = holder.__congressHub;
  if (!d || Date.now() - d.at > RESET_AFTER_MS) return resetDemo().client;
  return d.client;
}
