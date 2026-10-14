import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/server/auth";
import { safeNext } from "@/lib/safe-redirect";
import { BrandHeader, TribalBand } from "@/components/brand";
import { Alert } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/config";
import { DEMO_ACCOUNTS, DEMO_PIN } from "@/lib/server/demo-seed";

export const metadata: Metadata = { title: "Try the demo", robots: { index: false, follow: false } };

// CongressHub demo: pick a rank and you're in. (The real system uses a PIN plus a two-step code.)
export default async function SignInPage({ searchParams }: PageProps<"/admin/sign-in">) {
  const { next, idle } = await searchParams;
  const target = safeNext(typeof next === "string" ? next : null);
  if (await currentAdmin()) redirect(target);

  return (
    <div className="flex flex-1 flex-col">
      <BrandHeader subtitle="Admin portal · demo" />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-10">
        <h1 className="text-center text-2xl font-extrabold text-primary">Try CongressHub</h1>
        <p className="mb-5 mt-1 text-center text-sm text-muted">
          Pick a role to look around. All people and numbers are made up, and the demo resets every day.
        </p>
        {idle ? (
          <Alert tone="info" className="mb-4">
            You were signed out because the app wasn&apos;t used for a while.
          </Alert>
        ) : null}
        <div className="space-y-2">
          {DEMO_ACCOUNTS.map((a) => (
            <form key={a.id} action="/api/demo/sign-in" method="post">
              <input type="hidden" name="account" value={a.login_id} />
              <input type="hidden" name="next" value={target} />
              <button className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left hover:border-primary hover:bg-primary-soft">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-fg">
                  {a.display_name
                    .split(" ")
                    .map((w) => w[0])
                    .join("")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">
                    {ROLE_LABELS[a.role]} <span className="font-normal text-muted">· {a.display_name}</span>
                  </span>
                  <span className="block text-sm text-muted">{a.blurb}</span>
                </span>
                <span aria-hidden className="text-primary">
                  →
                </span>
              </button>
            </form>
          ))}
        </div>
        <p className="mt-5 text-center text-xs text-muted">
          When an action asks for a PIN, use <b className="font-mono text-text">{DEMO_PIN}</b>. In the real system every account has its own PIN and a two-step code.
        </p>
      </main>
      <TribalBand />
    </div>
  );
}
