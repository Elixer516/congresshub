import Image from "next/image";
import { ORG_NAME } from "@/lib/config";
import { cx } from "./ui";

// A woven band of diamonds and zigzags in flame colors, echoing the
// indigenous patterns on the MSPC Youth Congress 2026 artwork.
export function TribalBand({ className, height = 14 }: { className?: string; height?: number }) {
  const id = "tribal-band";
  return (
    <svg className={cx("block w-full", className)} height={height} aria-hidden preserveAspectRatio="none">
      <defs>
        <pattern id={id} width="28" height="14" patternUnits="userSpaceOnUse">
          <rect width="28" height="14" fill="var(--gold)" />
          <path d="M0 7 L7 0 L14 7 L7 14 Z" fill="var(--accent)" />
          <path d="M14 7 L21 0 L28 7 L21 14 Z" fill="var(--flame-red)" />
          <path d="M5 7 L7 5 L9 7 L7 9 Z M19 7 L21 5 L23 7 L21 9 Z" fill="var(--gold)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

// The official MSPC Youth logo.
export function Mark({ className }: { className?: string }) {
  return <Image src="/brand/logo-128.png" alt="CongressHub logo" width={124} height={128} className={cx("shrink-0 object-contain", className)} priority />;
}

export function BrandHeader({ subtitle }: { subtitle?: string }) {
  return (
    <header>
      <TribalBand />
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-4">
        <Mark className="size-10" />
        <div className="leading-tight">
          <p className="font-extrabold tracking-tight text-primary">{ORG_NAME}</p>
          <p className="text-xs text-muted">{subtitle ?? "Youth Congress Management"}</p>
        </div>
      </div>
    </header>
  );
}
