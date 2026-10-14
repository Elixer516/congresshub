import type { Metadata } from "next";
import { BrandHeader, TribalBand } from "@/components/brand";
import StatusForm from "./status-form";

export const metadata: Metadata = { title: "Check my status" };

export default function StatusPage() {
  return (
    <div className="flex flex-1 flex-col">
      <BrandHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-16 pt-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-primary">Check my status</h1>
        <p className="mt-2 text-muted">Enter the reference number you got when you applied, and your birthday.</p>
        <StatusForm />
      </main>
      <TribalBand />
    </div>
  );
}
