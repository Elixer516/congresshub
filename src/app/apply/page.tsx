import type { Metadata } from "next";
import { BrandHeader, TribalBand } from "@/components/brand";
import ApplyForm from "./apply-form";

export const metadata: Metadata = { title: "Apply for membership" };

export default function ApplyPage() {
  return (
    <div className="flex flex-1 flex-col">
      <BrandHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16 pt-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-primary">Membership application</h1>
        <p className="mt-2 text-muted">
          Fill in every part marked <span className="text-danger">*</span>. It takes about 5 minutes. You&apos;ll get a reference number at the end — keep it to check your status.
        </p>
        <ApplyForm />
      </main>
      <TribalBand />
    </div>
  );
}
