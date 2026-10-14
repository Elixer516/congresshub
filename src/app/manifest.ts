import type { MetadataRoute } from "next";
import { ORG_FULL_NAME } from "@/lib/config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CongressHub",
    short_name: "CongressHub",
    description: `Membership and attendance for the ${ORG_FULL_NAME}.`,
    start_url: "/admin",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbf6ee",
    theme_color: "#1e6b45",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
