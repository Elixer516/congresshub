import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { ORG_FULL_NAME, ORG_NAME } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: ORG_NAME, template: `%s · ${ORG_NAME}` },
  description: `Membership and attendance for the ${ORG_FULL_NAME}.`,
  applicationName: ORG_NAME,
  appleWebApp: { capable: true, title: "CongressHub", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1e6b45",
  colorScheme: "only light",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Render every page per request so the security policy's nonce reaches Next.js scripts.
  await connection();
  return (
    <html lang="en" className="h-full antialiased" style={{ colorScheme: "only light" }}>
      <body className="min-h-full flex flex-col">
        {children}
        {/* CongressHub demo label: always visible, never blocks taps. */}
        <div className="no-print pointer-events-none fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-3 z-50 rounded-full bg-black/75 px-3 py-1 text-[11px] font-semibold text-white shadow md:bottom-3">
          Demo · sample data · resets daily
        </div>
      </body>
    </html>
  );
}
