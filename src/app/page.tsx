import Link from "next/link";
import { BrandHeader, TribalBand } from "@/components/brand";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <BrandHeader />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <p className="text-sm font-bold uppercase tracking-widest text-accent">Rooted in love, rising for mission</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-primary">Become a delegate</h1>
        <p className="mt-3 text-muted">
          Join the Youth Congress. Apply online, then check your application any time with your reference number.
        </p>
        <div className="mt-8 grid gap-3">
          <Link href="/apply" className="flex min-h-12 items-center justify-center rounded-lg bg-primary px-4 font-semibold text-primary-fg hover:bg-primary-hover">
            Apply for membership
          </Link>
          <Link href="/status" className="flex min-h-12 items-center justify-center rounded-lg border border-border bg-surface px-4 font-semibold hover:bg-surface-2">
            Check my application status
          </Link>
        </div>
      </main>
      <TribalBand />
    </div>
  );
}
