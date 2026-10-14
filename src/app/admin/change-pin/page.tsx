import type { Metadata } from "next";
import { requireAdmin } from "@/lib/server/auth";
import ChangePinForm from "./change-pin-form";

export const metadata: Metadata = { title: "Change your PIN" };

export default async function ChangePinPage() {
  const admin = await requireAdmin({ allowPinChange: true, transportation: true });
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold">Change your PIN</h1>
      <p className="mb-6 text-sm text-muted">
        {admin.pin_must_change
          ? "Your PIN was set by the head admin. Please choose your own 6-digit PIN before continuing."
          : "Choose a new 6-digit PIN. Don't use your birthday or repeated numbers."}
      </p>
      <ChangePinForm />
    </main>
  );
}
